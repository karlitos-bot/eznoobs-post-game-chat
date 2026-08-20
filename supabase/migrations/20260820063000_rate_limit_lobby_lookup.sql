-- P0 anti-enumeration hardening for the public join-gate lookup.
-- The real app always has a browser-local guest credential before opening a room.
-- Require that credential and throttle repeated code probes per guest identity.
-- This is defense-in-depth; infrastructure/IP rate limiting is still recommended before scale.

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

  -- A lobby lookup is only valid for a browser that has generated an EZNOOBS
  -- guest credential. Attackers can still rotate identities, so this complements
  -- (rather than replaces) future edge/IP rate limiting.
  IF p_guest_id IS NULL OR p_guest_secret IS NULL
     OR p_guest_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_guest_secret !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;

  IF NOT private.consume_rate_limit(p_guest_id, 'lobby_lookup', 60, 30, 600, 120) THEN
    RETURN;
  END IF;

  SELECT l.id, l.code, l.game, l.expires_at
  INTO v_lobby_id, out_code, out_game, out_expires_at
  FROM public.lobbies l
  WHERE l.code = p_code AND l.expires_at > now();

  IF NOT FOUND THEN RETURN; END IF;

  -- Keep internal metadata private even when the code is valid.
  out_id := NULL;
  out_created_at := NULL;
  out_last_activity_at := NULL;

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

REVOKE EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lobby_entry(text, text, text) TO anon;
