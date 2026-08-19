-- Move guest credential hashes out of the exposed public schema entirely.
-- Public participants keeps only lobby display/presence data.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.participant_credentials (
  lobby_id uuid NOT NULL,
  guest_id text NOT NULL,
  guest_secret_hash text NOT NULL,
  PRIMARY KEY (lobby_id, guest_id),
  CONSTRAINT participant_credentials_participant_fkey
    FOREIGN KEY (lobby_id, guest_id)
    REFERENCES public.participants (lobby_id, guest_id)
    ON DELETE CASCADE
);

REVOKE ALL ON TABLE private.participant_credentials FROM PUBLIC, anon, authenticated;

-- Preserve every existing browser credential before removing the public column.
INSERT INTO private.participant_credentials (lobby_id, guest_id, guest_secret_hash)
SELECT lobby_id, guest_id, guest_secret_hash
FROM public.participants
WHERE guest_secret_hash IS NOT NULL
ON CONFLICT (lobby_id, guest_id) DO UPDATE
SET guest_secret_hash = EXCLUDED.guest_secret_hash;

CREATE OR REPLACE FUNCTION private.guest_secret_matches(
  p_lobby_id uuid,
  p_guest_id text,
  p_guest_secret text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.participant_credentials pc
    WHERE pc.lobby_id = p_lobby_id
      AND pc.guest_id = p_guest_id
      AND pc.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex')
  );
$$;

REVOKE ALL ON FUNCTION private.guest_secret_matches(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_participant(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_joined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  out_joined := false;

  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     OR char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    RETURN NEXT; RETURN;
  END IF;

  SELECT id INTO v_lobby_id
  FROM public.lobbies
  WHERE code = p_code AND expires_at > now();

  IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.lobby_id = v_lobby_id
      AND p.guest_id = p_guest_id
      AND p.last_seen_at > now() - interval '3 minutes'
      AND private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret)
  ) INTO out_joined;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_lobby(
  p_game text,
  p_guest_id text,
  p_guest_secret text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(out_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_lobby_id uuid;
  v_attempt int;
  v_hash text;
BEGIN
  IF char_length(p_game) < 2 OR char_length(p_game) > 40 THEN RAISE EXCEPTION 'Invalid game name'; END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN RAISE EXCEPTION 'Nickname must be 2-20 characters'; END IF;
  IF p_team NOT IN ('blue', 'red', 'spectator') THEN RAISE EXCEPTION 'Invalid team'; END IF;
  IF char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64 THEN RAISE EXCEPTION 'Invalid guest ID'; END IF;
  IF char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN RAISE EXCEPTION 'Invalid guest credential'; END IF;

  v_hash := encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');

  FOR v_attempt IN 1..8 LOOP
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies (code, game)
      VALUES (v_code, p_game)
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants (lobby_id, guest_id, nickname, team)
      VALUES (v_lobby_id, p_guest_id, p_nickname, p_team);

      INSERT INTO private.participant_credentials (lobby_id, guest_id, guest_secret_hash)
      VALUES (v_lobby_id, p_guest_id, v_hash);

      out_code := v_code;
      RETURN NEXT; RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a lobby code, try again.';
END;
$$;

CREATE OR REPLACE FUNCTION public.join_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_code text, out_game text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby RECORD;
  v_hash text;
  v_existing_hash text;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok := false; out_reason := 'Invalid room code.'; out_code := null; out_game := null; RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN
    out_ok := false; out_reason := 'Nickname must be 2-20 characters.'; out_code := null; out_game := null; RETURN NEXT; RETURN;
  END IF;
  IF p_team NOT IN ('blue', 'red', 'spectator') THEN
    out_ok := false; out_reason := 'Invalid team.'; out_code := null; out_game := null; RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    out_ok := false; out_reason := 'Invalid guest credential.'; out_code := null; out_game := null; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; out_reason := 'This lobby does not exist.'; out_code := null; out_game := null; RETURN NEXT; RETURN; END IF;
  IF v_lobby.expires_at < now() THEN out_ok := false; out_reason := 'This lobby has expired.'; out_code := null; out_game := null; RETURN NEXT; RETURN; END IF;

  v_hash := encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');

  SELECT pc.guest_secret_hash INTO v_existing_hash
  FROM public.participants p
  LEFT JOIN private.participant_credentials pc
    ON pc.lobby_id = p.lobby_id AND pc.guest_id = p.guest_id
  WHERE p.lobby_id = v_lobby.id AND p.guest_id = p_guest_id;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      out_ok := false; out_reason := 'Guest credential mismatch.'; out_code := null; out_game := null; RETURN NEXT; RETURN;
    END IF;
    UPDATE public.participants p
    SET nickname = p_nickname, team = p_team, last_seen_at = now()
    WHERE p.lobby_id = v_lobby.id AND p.guest_id = p_guest_id;
  ELSE
    INSERT INTO public.participants (lobby_id, guest_id, nickname, team, last_seen_at)
    VALUES (v_lobby.id, p_guest_id, p_nickname, p_team, now());
    INSERT INTO private.participant_credentials (lobby_id, guest_id, guest_secret_hash)
    VALUES (v_lobby.id, p_guest_id, v_hash);
  END IF;

  UPDATE public.lobbies SET last_activity_at = now() WHERE id = v_lobby.id;
  out_ok := true; out_reason := null; out_code := v_lobby.code; out_game := v_lobby.game; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_body text
)
RETURNS TABLE(out_ok boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires_at timestamptz;
  v_nickname text;
  v_team text;
  v_msg_count int;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN out_ok := false; out_reason := 'Invalid room code.'; RETURN NEXT; RETURN; END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 500 THEN out_ok := false; out_reason := 'Message must be 1-500 characters.'; RETURN NEXT; RETURN; END IF;

  SELECT id, expires_at INTO v_lobby_id, v_expires_at FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Lobby not found.'; RETURN NEXT; RETURN; END IF;
  IF v_expires_at < now() THEN out_ok := false; out_reason := 'Lobby expired.'; RETURN NEXT; RETURN; END IF;

  SELECT p.nickname, p.team INTO v_nickname, v_team
  FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret);
  IF NOT FOUND THEN out_ok := false; out_reason := 'Join the lobby before chatting.'; RETURN NEXT; RETURN; END IF;

  SELECT count(*) INTO v_msg_count
  FROM public.messages m
  WHERE m.lobby_id = v_lobby_id
    AND m.guest_id = p_guest_id
    AND m.created_at >= now() - interval '10 seconds';
  IF v_msg_count >= 8 THEN out_ok := false; out_reason := 'Slow down — too many messages.'; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.messages (lobby_id, guest_id, nickname, team, body)
  VALUES (v_lobby_id, p_guest_id, v_nickname, v_team, p_body);

  UPDATE public.lobbies SET last_activity_at = now(), expires_at = now() + interval '3 hours' WHERE id = v_lobby_id;
  UPDATE public.participants SET last_seen_at = now() WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_message(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_message_id uuid,
  p_reason text
)
RETURNS TABLE(out_ok boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_msg RECORD;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = p_code AND expires_at > now();
  IF NOT FOUND THEN out_ok := false; out_reason := 'Lobby not found.'; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; out_reason := 'Join the lobby first.'; RETURN NEXT; RETURN;
  END IF;

  SELECT id, guest_id INTO v_msg FROM public.messages m WHERE m.id = p_message_id AND m.lobby_id = v_lobby_id;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Message not found.'; RETURN NEXT; RETURN; END IF;

  BEGIN
    INSERT INTO public.reports (lobby_id, message_id, reporter_guest_id, reported_guest_id, reason)
    VALUES (v_lobby_id, v_msg.id, p_guest_id, v_msg.guest_id, left(p_reason, 200));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_presence(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = p_code AND expires_at > now();
  IF NOT FOUND THEN out_ok := false; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.participants p
  SET last_seen_at = now()
  WHERE p.lobby_id = v_lobby_id AND p.guest_id = p_guest_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  out_ok := v_rows = 1; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_message_id uuid,
  p_emoji text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires timestamptz;
  v_exists uuid;
BEGIN
  IF p_emoji NOT IN ('GG','skull','salt','clown') THEN out_ok := false; out_reason := 'Invalid reaction.'; out_active := false; RETURN NEXT; RETURN; END IF;

  SELECT id, expires_at INTO v_lobby_id, v_expires FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Lobby not found.'; out_active := false; RETURN NEXT; RETURN; END IF;
  IF v_expires < now() THEN out_ok := false; out_reason := 'Lobby expired.'; out_active := false; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; RETURN NEXT; RETURN;
  END IF;

  PERFORM 1 FROM public.messages m WHERE m.id = p_message_id AND m.lobby_id = v_lobby_id;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Message not in this lobby.'; out_active := false; RETURN NEXT; RETURN; END IF;

  SELECT id INTO v_exists FROM public.reactions r
  WHERE r.message_id = p_message_id AND r.guest_id = p_guest_id AND r.emoji = p_emoji;

  IF FOUND THEN
    DELETE FROM public.reactions WHERE id = v_exists;
    out_active := false;
  ELSE
    INSERT INTO public.reactions (lobby_id, message_id, guest_id, emoji)
    VALUES (v_lobby_id, p_message_id, p_guest_id, p_emoji);
    out_active := true;
  END IF;

  UPDATE public.participants SET last_seen_at = now() WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  UPDATE public.lobbies SET last_activity_at = now(), expires_at = now() + interval '3 hours' WHERE id = v_lobby_id;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_rematch_vote(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_active boolean, out_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires timestamptz;
  v_exists uuid;
  v_count int;
BEGIN
  SELECT id, expires_at INTO v_lobby_id, v_expires FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Lobby not found.'; out_active := false; out_count := 0; RETURN NEXT; RETURN; END IF;
  IF v_expires < now() THEN out_ok := false; out_reason := 'Lobby expired.'; out_active := false; out_count := 0; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; out_count := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT id INTO v_exists FROM public.rematch_votes r WHERE r.lobby_id = v_lobby_id AND r.guest_id = p_guest_id;
  IF FOUND THEN
    DELETE FROM public.rematch_votes WHERE id = v_exists;
    out_active := false;
  ELSE
    INSERT INTO public.rematch_votes (lobby_id, guest_id) VALUES (v_lobby_id, p_guest_id);
    out_active := true;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.rematch_votes WHERE lobby_id = v_lobby_id;
  UPDATE public.participants SET last_seen_at = now() WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  UPDATE public.lobbies SET last_activity_at = now(), expires_at = now() + interval '3 hours' WHERE id = v_lobby_id;

  out_ok := true; out_reason := null; out_count := v_count; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; RETURN NEXT; RETURN;
  END IF;

  DELETE FROM public.rematch_votes WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  DELETE FROM public.participants WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;

  out_ok := true; RETURN NEXT;
END;
$$;

-- The credential is no longer part of any exposed public table.
ALTER TABLE public.participants DROP COLUMN IF EXISTS guest_secret_hash;

-- The whole participants table is safe to read now; RLS still controls row access.
REVOKE SELECT ON TABLE public.participants FROM anon, authenticated;
GRANT SELECT ON TABLE public.participants TO anon, authenticated;

-- Keep only the anonymous role required by the no-account MVP on public RPCs.
REVOKE EXECUTE ON FUNCTION public.check_participant(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_lobby(text, text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_message(text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_presence(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_reaction(text, text, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_rematch_vote(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_lobby(text, text, text) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.check_participant(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_lobby(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.send_message(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(text, text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_rematch_vote(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.leave_lobby(text, text, text) TO anon;
