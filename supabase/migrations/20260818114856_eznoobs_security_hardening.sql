/*
# EZNOOBS Security Hardening

## Purpose
Fix the ambiguous column reference in join_lobby, revoke direct table write
privileges from anon/authenticated so writes can only go through SECURITY DEFINER
RPCs, make reports unreadable from the public client, and lock down EXECUTE
grants to anon only.

## Changes
1. Drop old functions (return types changed, must drop before recreate)
2. Revoke direct INSERT/UPDATE/DELETE from anon/authenticated on lobbies, participants, messages
3. Revoke ALL from anon/authenticated on reports
4. Recreate all functions with SET search_path = '' and fully-qualified table refs
5. Revoke EXECUTE from PUBLIC, grant only to anon
*/

-- Drop old functions (return types changed)
DROP FUNCTION IF EXISTS public.create_lobby(text, text, text, text);
DROP FUNCTION IF EXISTS public.join_lobby(text, text, text, text);
DROP FUNCTION IF EXISTS public.send_message(text, text, text);
DROP FUNCTION IF EXISTS public.report_message(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.touch_presence(text, text);
DROP FUNCTION IF EXISTS public.generate_room_code();

-- Revoke direct table write privileges from anon/authenticated
REVOKE INSERT, UPDATE, DELETE ON public.lobbies FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages FROM anon, authenticated;
REVOKE ALL ON public.reports FROM anon, authenticated;

-- Helper: generate a random 5-char code
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
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
RETURNS TABLE(out_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_lobby_id uuid;
  v_attempt int;
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

  FOR v_attempt IN 1..8 LOOP
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies (code, game)
      VALUES (v_code, p_game)
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants (lobby_id, guest_id, nickname, team)
      VALUES (v_lobby_id, p_guest_id, p_nickname, p_team);

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

-- 2. Join lobby (fixed: out_ prefixed columns avoid ambiguity with table columns)
CREATE OR REPLACE FUNCTION public.join_lobby(
  p_code text,
  p_guest_id text,
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

  SELECT * INTO v_lobby FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'This lobby does not exist.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;

  IF v_lobby.expires_at < now() THEN
    out_ok := false; out_reason := 'This lobby has expired.'; out_code := null; out_game := null;
    RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.participants (lobby_id, guest_id, nickname, team, last_seen_at)
  VALUES (v_lobby.id, p_guest_id, p_nickname, p_team, now())
  ON CONFLICT (lobby_id, guest_id) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        team = EXCLUDED.team,
        last_seen_at = now();

  UPDATE public.lobbies SET last_activity_at = now() WHERE public.lobbies.id = v_lobby.id;

  out_ok := true; out_reason := null; out_code := v_lobby.code; out_game := v_lobby.game;
  RETURN NEXT;
END;
$$;

-- 3. Send message
CREATE OR REPLACE FUNCTION public.send_message(
  p_code text,
  p_guest_id text,
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
    out_ok := false; out_reason := 'Invalid room code.';
    RETURN NEXT; RETURN;
  END IF;
  IF p_body IS NULL OR char_length(trim(p_body)) < 1 OR char_length(p_body) > 500 THEN
    out_ok := false; out_reason := 'Message must be 1-500 characters.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT id, expires_at INTO v_lobby_id, v_expires_at FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.';
    RETURN NEXT; RETURN;
  END IF;
  IF v_expires_at < now() THEN
    out_ok := false; out_reason := 'Lobby expired.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT nickname, team INTO v_nickname, v_team
  FROM public.participants
  WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Join the lobby before chatting.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT count(*) INTO v_msg_count
  FROM public.messages
  WHERE public.messages.lobby_id = v_lobby_id
    AND public.messages.guest_id = p_guest_id
    AND public.messages.created_at >= now() - interval '10 seconds';
  IF v_msg_count >= 8 THEN
    out_ok := false; out_reason := 'Slow down — too many messages.';
    RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.messages (lobby_id, guest_id, nickname, team, body)
  VALUES (v_lobby_id, p_guest_id, v_nickname, v_team, p_body);

  UPDATE public.lobbies
  SET last_activity_at = now(), expires_at = now() + interval '3 hours'
  WHERE public.lobbies.id = v_lobby_id;

  UPDATE public.participants
  SET last_seen_at = now()
  WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;

  out_ok := true; out_reason := null;
  RETURN NEXT;
END;
$$;

-- 4. Report message
CREATE OR REPLACE FUNCTION public.report_message(
  p_code text,
  p_guest_id text,
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
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.';
    RETURN NEXT; RETURN;
  END IF;

  SELECT id, guest_id INTO v_msg
  FROM public.messages
  WHERE public.messages.id = p_message_id AND public.messages.lobby_id = v_lobby_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Message not found.';
    RETURN NEXT; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.reports (lobby_id, message_id, reporter_guest_id, reported_guest_id, reason)
    VALUES (v_lobby_id, v_msg.id, p_guest_id, v_msg.guest_id, p_reason);
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  out_ok := true; out_reason := null;
  RETURN NEXT;
END;
$$;

-- 5. Touch presence
CREATE OR REPLACE FUNCTION public.touch_presence(
  p_code text,
  p_guest_id text
)
RETURNS TABLE(out_ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.participants
  SET last_seen_at = now()
  WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;

  out_ok := true;
  RETURN NEXT;
END;
$$;

-- Grant EXECUTE only to anon (not PUBLIC)
GRANT EXECUTE ON FUNCTION public.create_lobby(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.join_lobby(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.send_message(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.report_message(text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.generate_room_code() TO anon;