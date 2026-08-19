-- Fix the privacy cutover without restoring direct anonymous table SELECTs.
-- Room metadata is loaded through a code-scoped RPC, while full room state
-- requires the participant's guest credential.

CREATE OR REPLACE FUNCTION public.get_lobby_entry(
  p_code text,
  p_guest_id text DEFAULT NULL,
  p_guest_secret text DEFAULT NULL
)
RETURNS TABLE(
  out_id uuid,
  out_code text,
  out_game text,
  out_created_at timestamptz,
  out_expires_at timestamptz,
  out_last_activity_at timestamptz,
  out_joined boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    RETURN;
  END IF;

  SELECT l.id, l.code, l.game, l.created_at, l.expires_at, l.last_activity_at
  INTO out_id, out_code, out_game, out_created_at, out_expires_at, out_last_activity_at
  FROM public.lobbies l
  WHERE l.code = p_code AND l.expires_at > now();

  IF NOT FOUND THEN RETURN; END IF;

  out_joined := false;
  IF p_guest_id IS NOT NULL AND p_guest_secret IS NOT NULL
     AND char_length(p_guest_id) BETWEEN 8 AND 64
     AND char_length(p_guest_secret) BETWEEN 20 AND 100 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.lobby_id = out_id
        AND p.guest_id = p_guest_id
        AND p.last_seen_at > now() - interval '3 minutes'
        AND private.guest_secret_matches(out_id, p_guest_id, p_guest_secret)
    ) INTO out_joined;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text) TO anon;

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

  SELECT l.id, l.code, l.game, l.expires_at, l.last_activity_at
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

  SELECT jsonb_build_object(
    'lobby', jsonb_build_object(
      'id', v_lobby.id,
      'code', v_lobby.code,
      'game', v_lobby.game,
      'expires_at', v_lobby.expires_at,
      'last_activity_at', v_lobby.last_activity_at
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
