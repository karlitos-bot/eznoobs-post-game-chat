-- EZNOOBS v0.9 beta hardening.
-- Throttle credential-authenticated read/heartbeat RPCs so a legitimate joined
-- browser cannot hammer expensive snapshot/token/presence paths indefinitely.
-- Limits are deliberately generous relative to normal app traffic.

CREATE OR REPLACE FUNCTION public.get_lobby_snapshot(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_snapshot jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby RECORD;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     OR char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    RETURN;
  END IF;

  SELECT l.id, l.code, l.game, l.expires_at, l.last_activity_at, l.max_players
  INTO v_lobby
  FROM public.lobbies l
  WHERE l.code = p_code AND l.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.lobby_id = v_lobby.id
      AND p.guest_id = p_guest_id
      AND private.guest_secret_matches(v_lobby.id, p_guest_id, p_guest_secret)
  ) THEN
    RAISE EXCEPTION 'Join the lobby first.';
  END IF;

  -- Normal fallback refresh is once every 10s; realtime bursts can refresh faster.
  -- This leaves ample headroom while stopping sustained snapshot hammering.
  IF NOT private.consume_rate_limit(p_guest_id, 'snapshot', 10, 40, 60, 180) THEN
    RAISE EXCEPTION 'Snapshot refresh rate exceeded.';
  END IF;

  SELECT jsonb_build_object(
    'lobby', jsonb_build_object(
      'id', v_lobby.id,
      'code', v_lobby.code,
      'game', v_lobby.game,
      'expires_at', v_lobby.expires_at,
      'last_activity_at', v_lobby.last_activity_at,
      'max_players', v_lobby.max_players
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at)
      FROM (
        SELECT id, guest_id, nickname, team, body, created_at
        FROM public.messages
        WHERE lobby_id = v_lobby.id
        ORDER BY created_at ASC
        LIMIT 200
      ) m
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM (
        SELECT id, guest_id, nickname, team, last_seen_at
        FROM public.participants
        WHERE lobby_id = v_lobby.id
      ) p
    ), '[]'::jsonb),
    'reactions', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT id, message_id, guest_id, emoji, created_at
        FROM public.reactions
        WHERE lobby_id = v_lobby.id
      ) r
    ), '[]'::jsonb),
    'rematchVotes', COALESCE((
      SELECT jsonb_agg(to_jsonb(rv))
      FROM (
        SELECT id, guest_id
        FROM public.rematch_votes
        WHERE lobby_id = v_lobby.id
      ) rv
    ), '[]'::jsonb),
    'syncedAt', now()
  ) INTO out_snapshot;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lobby_snapshot(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lobby_snapshot(text, text, text) TO anon;


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
  v_rows integer;
BEGIN
  SELECT id INTO v_lobby_id
  FROM public.lobbies
  WHERE code = p_code AND expires_at > now();
  IF NOT FOUND THEN out_ok := false; RETURN NEXT; RETURN; END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; RETURN NEXT; RETURN;
  END IF;

  -- The app pings once per minute. Ten per minute allows reconnect/tab churn
  -- without allowing an authenticated guest to hammer the write path.
  IF NOT private.consume_rate_limit(p_guest_id, 'presence', 60, 10, 3600, 60) THEN
    out_ok := false; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.participants p
  SET last_seen_at = now()
  WHERE p.lobby_id = v_lobby_id AND p.guest_id = p_guest_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  out_ok := v_rows = 1;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_presence(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_presence(text, text, text) TO anon;


CREATE OR REPLACE FUNCTION public.get_lobby_realtime_token(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(out_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_token uuid;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     OR char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64
     OR char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN
    RETURN;
  END IF;

  SELECT l.id INTO v_lobby_id
  FROM public.lobbies l
  WHERE l.code = p_code AND l.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.lobby_id = v_lobby_id
      AND p.guest_id = p_guest_id
      AND private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret)
  ) THEN
    RETURN;
  END IF;

  -- SecureRealtimeLayer may retry up to eight times during a reconnect, so keep
  -- the short window above that while stopping scripted token harvesting loops.
  IF NOT private.consume_rate_limit(p_guest_id, 'realtime_token', 10, 10, 600, 30) THEN
    RETURN;
  END IF;

  SELECT rt.token INTO v_token
  FROM private.lobby_realtime_tokens rt
  WHERE rt.lobby_id = v_lobby_id;

  IF v_token IS NULL THEN RETURN; END IF;
  out_token := v_token::text;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lobby_realtime_token(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lobby_realtime_token(text, text, text) TO anon;
