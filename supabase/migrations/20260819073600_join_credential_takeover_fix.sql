-- Prevent a caller from taking over an existing participant by reusing the
-- participant's public guest_id with a different browser secret.
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

  SELECT p.guest_secret_hash INTO v_existing_hash
  FROM public.participants p
  WHERE p.lobby_id = v_lobby.id AND p.guest_id = p_guest_id;

  IF FOUND THEN
    IF v_existing_hash <> v_hash THEN
      out_ok := false; out_reason := 'Guest credential mismatch.'; out_code := null; out_game := null;
      RETURN NEXT; RETURN;
    END IF;

    UPDATE public.participants p
    SET nickname = p_nickname,
        team = p_team,
        last_seen_at = now()
    WHERE p.lobby_id = v_lobby.id AND p.guest_id = p_guest_id;
  ELSE
    INSERT INTO public.participants
      (lobby_id, guest_id, guest_secret_hash, nickname, team, last_seen_at)
    VALUES
      (v_lobby.id, p_guest_id, v_hash, p_nickname, p_team, now());
  END IF;

  UPDATE public.lobbies
  SET last_activity_at = now()
  WHERE id = v_lobby.id;

  out_ok := true; out_reason := null; out_code := v_lobby.code; out_game := v_lobby.game;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby(text, text, text, text, text) TO anon, service_role;
