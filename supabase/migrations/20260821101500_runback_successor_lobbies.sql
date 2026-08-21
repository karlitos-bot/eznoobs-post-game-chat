-- EZNOOBS Phase A Batch 3: secure temporary Runback successor rooms.
-- A locked Runback can create exactly one successor lobby. The link disappears
-- naturally when either temporary lobby is purged; it is not permanent history.

CREATE TABLE IF NOT EXISTS private.runback_links (
  old_lobby_id uuid PRIMARY KEY REFERENCES public.lobbies(id) ON DELETE CASCADE,
  new_lobby_id uuid NOT NULL UNIQUE REFERENCES public.lobbies(id) ON DELETE CASCADE,
  created_by_guest_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.runback_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.runback_links TO service_role;

CREATE OR REPLACE FUNCTION public.create_runback_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_lobby RECORD;
  v_creator RECORD;
  v_existing_code text;
  v_active_players integer;
  v_vote_count integer;
  v_target integer;
  v_new_code text;
  v_new_lobby_id uuid;
  v_attempt integer;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     OR char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    out_ok := false;
    out_reason := 'Invalid Runback request.';
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Row lock makes concurrent CREATE RUNBACK clicks serialize per source room.
  SELECT l.id, l.code, l.game, l.expires_at
  INTO v_old_lobby
  FROM public.lobbies l
  WHERE l.code = p_code
  FOR UPDATE;

  IF NOT FOUND OR v_old_lobby.expires_at <= now() THEN
    out_ok := false;
    out_reason := 'This lobby is no longer active.';
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT private.guest_secret_matches(v_old_lobby.id, p_guest_id, p_guest_secret) THEN
    out_ok := false;
    out_reason := 'Join the lobby before creating a Runback.';
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT private.consume_rate_limit(p_guest_id, 'create_runback', 10, 3, 600, 8) THEN
    out_ok := false;
    out_reason := 'Slow down — too many Runback attempts.';
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT l.code
  INTO v_existing_code
  FROM private.runback_links rl
  JOIN public.lobbies l ON l.id = rl.new_lobby_id
  WHERE rl.old_lobby_id = v_old_lobby.id
    AND l.expires_at > now();

  IF FOUND THEN
    out_ok := true;
    out_reason := NULL;
    out_code := v_existing_code;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_active_players
  FROM public.participants p
  WHERE p.lobby_id = v_old_lobby.id
    AND p.last_seen_at > now() - interval '150 seconds';

  SELECT count(*)::integer
  INTO v_vote_count
  FROM public.rematch_votes rv
  JOIN public.participants p
    ON p.lobby_id = rv.lobby_id
   AND p.guest_id = rv.guest_id
  WHERE rv.lobby_id = v_old_lobby.id
    AND p.last_seen_at > now() - interval '150 seconds';

  v_target := GREATEST(2, CEIL(GREATEST(v_active_players, 2) / 2.0)::integer);

  IF v_vote_count < v_target THEN
    out_ok := false;
    out_reason := format('Runback is not locked yet (%s/%s).', v_vote_count, v_target);
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT p.nickname, p.team
  INTO v_creator
  FROM public.participants p
  WHERE p.lobby_id = v_old_lobby.id
    AND p.guest_id = p_guest_id
    AND private.guest_secret_matches(v_old_lobby.id, p_guest_id, p_guest_secret);

  IF NOT FOUND THEN
    out_ok := false;
    out_reason := 'Runback creator is no longer in the lobby.';
    out_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_attempt IN 1..8 LOOP
    v_new_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies (code, game, max_players)
      VALUES (v_new_code, v_old_lobby.game, private.default_lobby_capacity(v_old_lobby.game))
      RETURNING id INTO v_new_lobby_id;

      -- Only the creator is pre-joined. Other players keep their own browser secret
      -- and join the successor normally, so enforcement checks remain intact.
      INSERT INTO public.participants
        (lobby_id, guest_id, nickname, team, last_seen_at)
      VALUES
        (v_new_lobby_id, p_guest_id, v_creator.nickname, v_creator.team, now());

      INSERT INTO private.participant_credentials
        (lobby_id, guest_id, guest_secret_hash)
      VALUES
        (
          v_new_lobby_id,
          p_guest_id,
          encode(extensions.digest(p_guest_secret, 'sha256'), 'hex')
        );

      INSERT INTO private.runback_links
        (old_lobby_id, new_lobby_id, created_by_guest_id)
      VALUES
        (v_old_lobby.id, v_new_lobby_id, p_guest_id);

      out_ok := true;
      out_reason := NULL;
      out_code := v_new_code;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- Room code collision: retry. If the old-lobby link somehow won a race,
      -- return the already-created successor instead of creating duplicates.
      SELECT l.code
      INTO v_existing_code
      FROM private.runback_links rl
      JOIN public.lobbies l ON l.id = rl.new_lobby_id
      WHERE rl.old_lobby_id = v_old_lobby.id
        AND l.expires_at > now();

      IF FOUND THEN
        out_ok := true;
        out_reason := NULL;
        out_code := v_existing_code;
        RETURN NEXT;
        RETURN;
      END IF;
    END;
  END LOOP;

  out_ok := false;
  out_reason := 'Could not create the Runback room. Try again.';
  out_code := NULL;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_runback_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_lobby_id uuid;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     OR char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    RETURN;
  END IF;

  SELECT l.id
  INTO v_old_lobby_id
  FROM public.lobbies l
  WHERE l.code = p_code;

  IF NOT FOUND OR NOT private.guest_secret_matches(v_old_lobby_id, p_guest_id, p_guest_secret) THEN
    RETURN;
  END IF;

  IF NOT private.consume_rate_limit(p_guest_id, 'runback_lookup', 10, 10, 60, 60) THEN
    RETURN;
  END IF;

  SELECT l.code
  INTO out_code
  FROM private.runback_links rl
  JOIN public.lobbies l ON l.id = rl.new_lobby_id
  WHERE rl.old_lobby_id = v_old_lobby_id
    AND l.expires_at > now();

  IF out_code IS NOT NULL THEN
    RETURN NEXT;
  END IF;
END;
$$;

-- The app server deliberately uses the publishable/anon key. These SECURITY DEFINER
-- RPCs therefore allow anon execution but remain protected by the full browser guest
-- credential, membership checks, Runback threshold checks and server-side rate limits.
REVOKE EXECUTE ON FUNCTION public.create_runback_lobby(text, text, text)
FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_runback_lobby(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_runback_lobby(text, text, text) TO anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_runback_lobby(text, text, text) TO anon, service_role;
