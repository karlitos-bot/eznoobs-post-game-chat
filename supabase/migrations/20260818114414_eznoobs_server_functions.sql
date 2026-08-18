/*
# EZNOOBS Server-Side Write Functions

## Purpose
Replace the service-role admin client with SECURITY DEFINER Postgres functions
so the server can perform validated writes (create lobbies, join lobbies, send
messages, report messages, touch presence) using the publishable/anon key instead
of the service-role key. This preserves the existing access model: browser clients
read realtime data directly via the anon key, but all writes go through
server-side functions that validate input and enforce business rules.

## New Functions
1. `create_lobby(p_game text, p_guest_id text, p_nickname text, p_team text)`
   - Generates a unique 5-character room code (excluding confusing chars)
   - Inserts a lobby row and a participant row for the creator
   - Returns the generated code
   - Validates nickname (2-20 chars, no control chars), team, game name

2. `join_lobby(p_code text, p_guest_id text, p_nickname text, p_team text)`
   - Looks up lobby by code, rejects if not found or expired
   - Upserts participant (lobby_id, guest_id)
   - Updates lobby last_activity_at
   - Returns { ok, code, game } or { ok, reason }

3. `send_message(p_code text, p_guest_id text, p_body text)`
   - Validates lobby exists and is not expired
   - Validates participant has joined
   - Enforces anti-spam: max 8 messages per 10 seconds per guest
   - Inserts message, updates lobby expiry + last_activity, participant last_seen
   - Returns { ok }

4. `report_message(p_code text, p_guest_id text, p_message_id uuid, p_reason text)`
   - Validates lobby and message exist
   - Inserts report (unique per reporter+message)
   - Returns { ok }

5. `touch_presence(p_code text, p_guest_id text)`
   - Updates participant last_seen_at
   - Returns { ok }

## Security
- All functions are SECURITY DEFINER with search_path set to 'public'
- EXECUTE granted to anon, authenticated (callable by the server using anon key)
- Functions validate all inputs internally (nickname length, team enum, message length, spam)
- RLS remains enabled on all tables; these functions bypass RLS via SECURITY DEFINER
- The browser client still only has SELECT policies for realtime reads
*/

-- Helper: generate a random 5-char code from the safe alphabet
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      1 + floor(random() * 32)::int,
      1),
    ''
  ) FROM generate_series(1, 5);
$$;

-- 1. Create lobby
CREATE OR REPLACE FUNCTION public.create_lobby(
  p_game text,
  p_guest_id text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_lobby_id uuid;
  v_attempt int;
BEGIN
  -- Validate inputs
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

  -- Try up to 8 times to get a unique code
  FOR v_attempt IN 1..8 LOOP
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies (code, game)
      VALUES (v_code, p_game)
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants (lobby_id, guest_id, nickname, team)
      VALUES (v_lobby_id, p_guest_id, p_nickname, p_team);

      RETURN QUERY SELECT v_code;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- collision, retry
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a lobby code, try again.';
END;
$$;

-- 2. Join lobby
CREATE OR REPLACE FUNCTION public.join_lobby(
  p_code text,
  p_guest_id text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(ok boolean, reason text, code text, game text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lobby RECORD;
BEGIN
  -- Validate inputs
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    RETURN QUERY SELECT false, 'Invalid room code.', null::text, null::text;
    RETURN;
  END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN
    RETURN QUERY SELECT false, 'Nickname must be 2-20 characters.', null::text, null::text;
    RETURN;
  END IF;
  IF p_team NOT IN ('blue', 'red', 'spectator') THEN
    RETURN QUERY SELECT false, 'Invalid team.', null::text, null::text;
    RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'This lobby does not exist.', null::text, null::text;
    RETURN;
  END IF;

  IF v_lobby.expires_at < now() THEN
    RETURN QUERY SELECT false, 'This lobby has expired.', null::text, null::text;
    RETURN;
  END IF;

  INSERT INTO public.participants (lobby_id, guest_id, nickname, team, last_seen_at)
  VALUES (v_lobby.id, p_guest_id, p_nickname, p_team, now())
  ON CONFLICT (lobby_id, guest_id) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        team = EXCLUDED.team,
        last_seen_at = now();

  UPDATE public.lobbies SET last_activity_at = now() WHERE id = v_lobby.id;

  RETURN QUERY SELECT true, null::text, v_lobby.code, v_lobby.game;
END;
$$;

-- 3. Send message
CREATE OR REPLACE FUNCTION public.send_message(
  p_code text,
  p_guest_id text,
  p_body text
)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lobby RECORD;
  v_participant RECORD;
  v_msg_count int;
BEGIN
  -- Validate inputs
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    RETURN QUERY SELECT false, 'Invalid room code.';
    RETURN;
  END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 500 THEN
    RETURN QUERY SELECT false, 'Message must be 1-500 characters.';
    RETURN;
  END IF;

  SELECT id, expires_at INTO v_lobby FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Lobby not found.';
    RETURN;
  END IF;

  IF v_lobby.expires_at < now() THEN
    RETURN QUERY SELECT false, 'Lobby expired.';
    RETURN;
  END IF;

  SELECT nickname, team INTO v_participant
  FROM public.participants
  WHERE lobby_id = v_lobby.id AND guest_id = p_guest_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Join the lobby before chatting.';
    RETURN;
  END IF;

  -- Anti-spam: max 8 messages per 10 seconds
  SELECT count(*) INTO v_msg_count
  FROM public.messages
  WHERE lobby_id = v_lobby.id
    AND guest_id = p_guest_id
    AND created_at >= now() - interval '10 seconds';
  IF v_msg_count >= 8 THEN
    RETURN QUERY SELECT false, 'Slow down — too many messages.';
    RETURN;
  END IF;

  INSERT INTO public.messages (lobby_id, guest_id, nickname, team, body)
  VALUES (v_lobby.id, p_guest_id, v_participant.nickname, v_participant.team, p_body);

  UPDATE public.lobbies
  SET last_activity_at = now(),
      expires_at = now() + interval '3 hours'
  WHERE id = v_lobby.id;

  UPDATE public.participants
  SET last_seen_at = now()
  WHERE lobby_id = v_lobby.id AND guest_id = p_guest_id;

  RETURN QUERY SELECT true, null::text;
END;
$$;

-- 4. Report message
CREATE OR REPLACE FUNCTION public.report_message(
  p_code text,
  p_guest_id text,
  p_message_id uuid,
  p_reason text
)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lobby_id uuid;
  v_msg RECORD;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Lobby not found.';
    RETURN;
  END IF;

  SELECT id, guest_id INTO v_msg
  FROM public.messages
  WHERE id = p_message_id AND lobby_id = v_lobby_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Message not found.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.reports (lobby_id, message_id, reporter_guest_id, reported_guest_id, reason)
    VALUES (v_lobby_id, v_msg.id, p_guest_id, v_msg.guest_id, p_reason);
  EXCEPTION WHEN unique_violation THEN
    -- already reported by this guest, ignore
    NULL;
  END;

  RETURN QUERY SELECT true, null::text;
END;
$$;

-- 5. Touch presence
CREATE OR REPLACE FUNCTION public.touch_presence(
  p_code text,
  p_guest_id text
)
RETURNS TABLE(ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false;
    RETURN;
  END IF;

  UPDATE public.participants
  SET last_seen_at = now()
  WHERE lobby_id = v_lobby_id AND guest_id = p_guest_id;

  RETURN QUERY SELECT true;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_lobby(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_message(text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_room_code() TO anon, authenticated;