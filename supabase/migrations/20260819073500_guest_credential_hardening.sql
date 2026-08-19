-- EZNOOBS security hardening: public guest IDs are identifiers, not credentials.
-- Every write now also requires a browser-local secret whose SHA-256 hash is stored here.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS guest_secret_hash text;

-- Invalidate all pre-hardening guest sessions. Existing test users will simply rejoin.
UPDATE public.participants
SET guest_secret_hash = encode(extensions.gen_random_bytes(32), 'hex')
WHERE guest_secret_hash IS NULL;

ALTER TABLE public.participants
  ALTER COLUMN guest_secret_hash SET NOT NULL;

-- Remove the old insecure overloads before creating secret-aware versions.
DROP FUNCTION IF EXISTS public.create_lobby(text, text, text, text);
DROP FUNCTION IF EXISTS public.join_lobby(text, text, text, text);
DROP FUNCTION IF EXISTS public.send_message(text, text, text);
DROP FUNCTION IF EXISTS public.report_message(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.touch_presence(text, text);
DROP FUNCTION IF EXISTS public.toggle_reaction(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.toggle_rematch_vote(text, text);
DROP FUNCTION IF EXISTS public.leave_lobby(text, text);
DROP FUNCTION IF EXISTS public.generate_room_code();

CREATE FUNCTION public.generate_room_code()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      1 + floor(random() * 32)::int,
      1),
    ''
  ) FROM generate_series(1, 5);
$$;

CREATE FUNCTION public.check_participant(
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
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT id INTO v_lobby_id
  FROM public.lobbies
  WHERE code = p_code AND expires_at > now();

  IF NOT FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.lobby_id = v_lobby_id
      AND p.guest_id = p_guest_id
      AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex')
      AND p.last_seen_at > now() - interval '3 minutes'
  ) INTO out_joined;

  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.create_lobby(
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
  IF char_length(p_game) < 2 OR char_length(p_game) > 40 THEN
    RAISE EXCEPTION 'Invalid game name';
  END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN
    RAISE EXCEPTION 'Nickname must be 2-20 characters';
  END IF;
  IF p_team NOT IN ('blue', 'red', 'spectator') THEN
    RAISE EXCEPTION 'Invalid team';
  END IF;
  IF char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64 THEN
    RAISE EXCEPTION 'Invalid guest ID';
  END IF;
  IF char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    RAISE EXCEPTION 'Invalid guest credential';
  END IF;

  v_hash := encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');

  FOR v_attempt IN 1..8 LOOP
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies (code, game)
      VALUES (v_code, p_game)
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants
        (lobby_id, guest_id, guest_secret_hash, nickname, team)
      VALUES
        (v_lobby_id, p_guest_id, v_hash, p_nickname, p_team);

      out_code := v_code;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a lobby code, try again.';
END;
$$;

CREATE FUNCTION public.join_lobby(
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
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok := false; out_reason := 'Invalid room code.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN
    out_ok := false; out_reason := 'Nickname must be 2-20 characters.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;
  IF p_team NOT IN ('blue', 'red', 'spectator') THEN
    out_ok := false; out_reason := 'Invalid team.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    out_ok := false; out_reason := 'Invalid guest credential.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'This lobby does not exist.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;
  IF v_lobby.expires_at < now() THEN
    out_ok := false; out_reason := 'This lobby has expired.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');

  INSERT INTO public.participants
    (lobby_id, guest_id, guest_secret_hash, nickname, team, last_seen_at)
  VALUES
    (v_lobby.id, p_guest_id, v_hash, p_nickname, p_team, now())
  ON CONFLICT (lobby_id, guest_id) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        team = EXCLUDED.team,
        guest_secret_hash = EXCLUDED.guest_secret_hash,
        last_seen_at = now();

  UPDATE public.lobbies
  SET last_activity_at = now()
  WHERE id = v_lobby.id;

  out_ok := true; out_reason := null; out_code := v_lobby.code; out_game := v_lobby.game;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.send_message(
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
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok := false; out_reason := 'Invalid room code.'; RETURN NEXT; RETURN;
  END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 500 THEN
    out_ok := false; out_reason := 'Message must be 1-500 characters.'; RETURN NEXT; RETURN;
  END IF;

  SELECT id, expires_at INTO v_lobby_id, v_expires_at
  FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.'; RETURN NEXT; RETURN;
  END IF;
  IF v_expires_at < now() THEN
    out_ok := false; out_reason := 'Lobby expired.'; RETURN NEXT; RETURN;
  END IF;

  SELECT nickname, team INTO v_nickname, v_team
  FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Join the lobby before chatting.'; RETURN NEXT; RETURN;
  END IF;

  SELECT count(*) INTO v_msg_count
  FROM public.messages m
  WHERE m.lobby_id = v_lobby_id
    AND m.guest_id = p_guest_id
    AND m.created_at >= now() - interval '10 seconds';
  IF v_msg_count >= 8 THEN
    out_ok := false; out_reason := 'Slow down — too many messages.'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.messages (lobby_id, guest_id, nickname, team, body)
  VALUES (v_lobby_id, p_guest_id, v_nickname, v_team, p_body);

  UPDATE public.lobbies
  SET last_activity_at = now(), expires_at = now() + interval '3 hours'
  WHERE id = v_lobby_id;

  UPDATE public.participants
  SET last_seen_at = now()
  WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE FUNCTION public.report_message(
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
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.'; RETURN NEXT; RETURN;
  END IF;

  PERFORM 1 FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Join the lobby first.'; RETURN NEXT; RETURN;
  END IF;

  SELECT id, guest_id INTO v_msg
  FROM public.messages m
  WHERE m.id = p_message_id AND m.lobby_id = v_lobby_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Message not found.'; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.reports
      (lobby_id, message_id, reporter_guest_id, reported_guest_id, reason)
    VALUES
      (v_lobby_id, v_msg.id, p_guest_id, v_msg.guest_id, left(p_reason, 200));
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE FUNCTION public.touch_presence(
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

  UPDATE public.participants p
  SET last_seen_at = now()
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_ok := v_rows = 1;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.toggle_reaction(
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
  IF p_emoji NOT IN ('GG','skull','salt','clown') THEN
    out_ok := false; out_reason := 'Invalid reaction.'; out_active := false; RETURN NEXT; RETURN;
  END IF;

  SELECT id, expires_at INTO v_lobby_id, v_expires FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN out_ok := false; out_reason := 'Lobby not found.'; out_active := false; RETURN NEXT; RETURN; END IF;
  IF v_expires < now() THEN out_ok := false; out_reason := 'Lobby expired.'; out_active := false; RETURN NEXT; RETURN; END IF;

  PERFORM 1 FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');
  IF NOT FOUND THEN out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; RETURN NEXT; RETURN; END IF;

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

  UPDATE public.participants SET last_seen_at = now()
  WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  UPDATE public.lobbies SET last_activity_at = now(), expires_at = now() + interval '3 hours'
  WHERE id = v_lobby_id;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

CREATE FUNCTION public.toggle_rematch_vote(
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

  PERFORM 1 FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');
  IF NOT FOUND THEN out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; out_count := 0; RETURN NEXT; RETURN; END IF;

  SELECT id INTO v_exists FROM public.rematch_votes r
  WHERE r.lobby_id = v_lobby_id AND r.guest_id = p_guest_id;

  IF FOUND THEN
    DELETE FROM public.rematch_votes WHERE id = v_exists;
    out_active := false;
  ELSE
    INSERT INTO public.rematch_votes (lobby_id, guest_id) VALUES (v_lobby_id, p_guest_id);
    out_active := true;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.rematch_votes WHERE lobby_id = v_lobby_id;
  UPDATE public.participants SET last_seen_at = now()
  WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  UPDATE public.lobbies SET last_activity_at = now(), expires_at = now() + interval '3 hours'
  WHERE id = v_lobby_id;

  out_ok := true; out_reason := null; out_count := v_count; RETURN NEXT;
END;
$$;

CREATE FUNCTION public.leave_lobby(
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

  PERFORM 1 FROM public.participants p
  WHERE p.lobby_id = v_lobby_id
    AND p.guest_id = p_guest_id
    AND p.guest_secret_hash = encode(extensions.digest(p_guest_secret, 'sha256'), 'hex');
  IF NOT FOUND THEN out_ok := false; RETURN NEXT; RETURN; END IF;

  DELETE FROM public.rematch_votes WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;
  DELETE FROM public.participants WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;

  out_ok := true; RETURN NEXT;
END;
$$;

-- Functions are never executable through the broad PUBLIC or authenticated roles.
REVOKE EXECUTE ON FUNCTION public.generate_room_code() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_participant(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_lobby(text, text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_message(text, text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_presence(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_reaction(text, text, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_rematch_vote(text, text, text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_lobby(text, text, text) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.check_participant(text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_lobby(text, text, text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_message(text, text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(text, text, text, uuid, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_rematch_vote(text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.leave_lobby(text, text, text) TO anon, service_role;

-- Make future function exposure opt-in instead of implicit.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
