-- EZNOOBS lobby identity hardening.
-- Active participants in the same lobby may not share the same in-game username.
-- Comparison is case-insensitive and ignores surrounding whitespace.
-- A per-lobby advisory lock prevents simultaneous joins from claiming the same name.

CREATE OR REPLACE FUNCTION public.join_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(out_ok boolean,out_reason text,out_code text,out_game text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby record;
  v_hash text;
  v_existing_hash text;
  v_active_count integer;
  v_mod RECORD;
  v_nickname text := btrim(p_nickname);
  v_existing_guest boolean := false;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok:=false;out_reason:='Invalid room code.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;
  IF char_length(v_nickname)<2 OR char_length(v_nickname)>20 THEN
    out_ok:=false;out_reason:='Username must be 2-20 characters.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;
  IF p_team NOT IN ('blue','red','spectator') THEN
    out_ok:=false;out_reason:='Invalid team.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;
  IF char_length(p_guest_id)<8 OR char_length(p_guest_id)>64 OR char_length(p_guest_secret)<20 OR char_length(p_guest_secret)>100 THEN
    out_ok:=false;out_reason:='Invalid guest credential.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  IF NOT private.consume_rate_limit(p_guest_id,'join_lobby',60,15,600,50) THEN
    out_ok:=false;out_reason:='Slow down — too many join attempts.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  SELECT * INTO v_mod FROM private.moderate_text(v_nickname);
  IF NOT v_mod.out_allowed THEN
    PERFORM private.record_moderation_block(p_guest_id,p_code,'nickname',v_mod.out_category,v_nickname);
    out_ok:=false;out_reason:=private.moderation_reason(v_mod.out_category);out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN
    out_ok:=false;out_reason:='This lobby does not exist.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;
  IF v_lobby.expires_at<=now() THEN
    out_ok:=false;out_reason:='This lobby has expired.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  v_hash:=encode(extensions.digest(p_guest_secret,'sha256'),'hex');
  SELECT pc.guest_secret_hash INTO v_existing_hash
  FROM public.participants p
  LEFT JOIN private.participant_credentials pc
    ON pc.lobby_id=p.lobby_id AND pc.guest_id=p.guest_id
  WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;

  IF FOUND THEN
    v_existing_guest := true;
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      out_ok:=false;out_reason:='Guest credential mismatch.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
    END IF;
  END IF;

  -- Serialize username claims inside one lobby so two simultaneous joins cannot
  -- both pass the availability check before either participant row is written.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_lobby.id::text),
    pg_catalog.hashtext('eznoobs_username_claim')
  );

  IF EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.lobby_id=v_lobby.id
      AND p.guest_id<>p_guest_id
      AND p.last_seen_at>now()-interval '3 minutes'
      AND lower(btrim(p.nickname))=lower(v_nickname)
  ) THEN
    out_ok:=false;
    out_reason:='That in-game username is already taken in this lobby.';
    out_code:=null;
    out_game:=null;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_existing_guest THEN
    UPDATE public.participants p
    SET nickname=v_nickname,team=p_team,last_seen_at=now()
    WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;
  ELSE
    SELECT count(*)::integer INTO v_active_count
    FROM public.participants p
    WHERE p.lobby_id=v_lobby.id AND p.last_seen_at>now()-interval '3 minutes';

    IF v_active_count>=v_lobby.max_players THEN
      out_ok:=false;out_reason:='This lobby is full.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
    END IF;

    INSERT INTO public.participants(lobby_id,guest_id,nickname,team,last_seen_at)
    VALUES(v_lobby.id,p_guest_id,v_nickname,p_team,now());
    INSERT INTO private.participant_credentials(lobby_id,guest_id,guest_secret_hash)
    VALUES(v_lobby.id,p_guest_id,v_hash);
  END IF;

  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby.id;
  out_ok:=true;out_reason:=null;out_code:=v_lobby.code;out_game:=v_lobby.game;RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_lobby(text,text,text,text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby(text,text,text,text,text) TO anon;
