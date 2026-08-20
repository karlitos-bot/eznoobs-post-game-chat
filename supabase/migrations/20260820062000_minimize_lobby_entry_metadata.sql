-- P0 privacy minimization: unauthenticated room lookup should expose only the metadata
-- required to render the join gate. Keep the existing RPC signature for compatibility,
-- but never return internal lobby UUID, creation time, or last activity time.

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
DECLARE
  v_lobby_id uuid;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    RETURN;
  END IF;

  SELECT l.id, l.code, l.game, l.expires_at
  INTO v_lobby_id, out_code, out_game, out_expires_at
  FROM public.lobbies l
  WHERE l.code = p_code AND l.expires_at > now();

  IF NOT FOUND THEN RETURN; END IF;

  -- Explicitly withhold internal-only metadata from the anonymous lookup surface.
  out_id := NULL;
  out_created_at := NULL;
  out_last_activity_at := NULL;
  out_joined := false;

  IF p_guest_id IS NOT NULL AND p_guest_secret IS NOT NULL
     AND char_length(p_guest_id) BETWEEN 8 AND 64
     AND char_length(p_guest_secret) BETWEEN 20 AND 100 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.participants p
      WHERE p.lobby_id = v_lobby_id
        AND p.guest_id = p_guest_id
        AND p.last_seen_at > now() - interval '3 minutes'
        AND private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret)
    ) INTO out_joined;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text) TO anon;
