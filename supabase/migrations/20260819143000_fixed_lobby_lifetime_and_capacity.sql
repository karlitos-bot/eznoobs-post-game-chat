-- EZNOOBS fixed temporary-room lifetime + game-based capacity.
-- A room's expiry is anchored to creation time and never extends from activity.
-- Change private.app_settings.lobby_duration_minutes from 5 to 7 later if testing says 5 minutes is too short.

CREATE TABLE IF NOT EXISTS private.app_settings (
  key text PRIMARY KEY,
  int_value integer NOT NULL CHECK (int_value BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.app_settings FROM PUBLIC, anon, authenticated;

INSERT INTO private.app_settings(key, int_value)
VALUES ('lobby_duration_minutes', 5)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.lobby_duration_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_duration_minutes'),
    5
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_duration_minutes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_five_minute_ttl ON public.lobbies;
DROP TRIGGER IF EXISTS eznoobs_fixed_lobby_ttl ON public.lobbies;
DROP FUNCTION IF EXISTS private.enforce_five_minute_lobby_ttl();
DROP FUNCTION IF EXISTS private.enforce_fixed_lobby_ttl();

ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 20 CHECK (max_players BETWEEN 2 AND 50);

CREATE OR REPLACE FUNCTION private.default_lobby_capacity(p_game text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_game
    WHEN 'Counter-Strike 2' THEN 12
    WHEN 'League of Legends' THEN 12
    WHEN 'Valorant' THEN 12
    WHEN 'Rocket League' THEN 8
    WHEN 'Overwatch 2' THEN 12
    WHEN 'Marvel Rivals' THEN 14
    ELSE 20
  END;
$$;
REVOKE ALL ON FUNCTION private.default_lobby_capacity(text) FROM PUBLIC, anon, authenticated;

-- Existing dev/test rooms obey the same fixed lifetime and capacity mapping.
UPDATE public.lobbies
SET
  expires_at = created_at + make_interval(mins => private.lobby_duration_minutes()),
  max_players = private.default_lobby_capacity(game);

CREATE OR REPLACE FUNCTION private.enforce_fixed_lobby_ttl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.expires_at := NEW.created_at + make_interval(mins => private.lobby_duration_minutes());
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.expires_at := OLD.expires_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_fixed_lobby_ttl() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER eznoobs_fixed_lobby_ttl
BEFORE INSERT OR UPDATE ON public.lobbies
FOR EACH ROW EXECUTE FUNCTION private.enforce_fixed_lobby_ttl();

CREATE OR REPLACE FUNCTION public.create_lobby(
  p_game text, p_guest_id text, p_guest_secret text, p_nickname text, p_team text
)
RETURNS TABLE(out_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_lobby_id uuid;
  v_attempt int;
  v_hash text;
BEGIN
  IF char_length(p_game) < 2 OR char_length(p_game) > 40 THEN RAISE EXCEPTION 'Invalid game name'; END IF;
  IF char_length(p_nickname) < 2 OR char_length(p_nickname) > 20 THEN RAISE EXCEPTION 'Nickname must be 2-20 characters'; END IF;
  IF p_team NOT IN ('blue','red','spectator') THEN RAISE EXCEPTION 'Invalid team'; END IF;
  IF char_length(p_guest_id) < 8 OR char_length(p_guest_id) > 64 THEN RAISE EXCEPTION 'Invalid guest ID'; END IF;
  IF char_length(p_guest_secret) < 20 OR char_length(p_guest_secret) > 100 THEN RAISE EXCEPTION 'Invalid guest credential'; END IF;

  v_hash := encode(extensions.digest(p_guest_secret,'sha256'),'hex');
  FOR v_attempt IN 1..8 LOOP
    v_code := public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies(code, game, max_players)
      VALUES(v_code, p_game, private.default_lobby_capacity(p_game))
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants(lobby_id, guest_id, nickname, team)
      VALUES(v_lobby_id, p_guest_id, p_nickname, p_team);
      INSERT INTO private.participant_credentials(lobby_id, guest_id, guest_secret_hash)
      VALUES(v_lobby_id, p_guest_id, v_hash);

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

CREATE OR REPLACE FUNCTION public.join_lobby(
  p_code text, p_guest_id text, p_guest_secret text, p_nickname text, p_team text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_code text, out_game text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_lobby record;
  v_hash text;
  v_existing_hash text;
  v_active_count integer;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok:=false; out_reason:='Invalid room code.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_nickname)<2 OR char_length(p_nickname)>20 THEN
    out_ok:=false; out_reason:='Nickname must be 2-20 characters.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;
  IF p_team NOT IN ('blue','red','spectator') THEN
    out_ok:=false; out_reason:='Invalid team.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;
  IF char_length(p_guest_id)<8 OR char_length(p_guest_id)>64 OR char_length(p_guest_secret)<20 OR char_length(p_guest_secret)>100 THEN
    out_ok:=false; out_reason:='Invalid guest credential.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN
    out_ok:=false; out_reason:='This lobby does not exist.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;
  IF v_lobby.expires_at <= now() THEN
    out_ok:=false; out_reason:='This lobby has expired.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_guest_secret,'sha256'),'hex');
  SELECT pc.guest_secret_hash INTO v_existing_hash
  FROM public.participants p
  LEFT JOIN private.participant_credentials pc
    ON pc.lobby_id=p.lobby_id AND pc.guest_id=p.guest_id
  WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      out_ok:=false; out_reason:='Guest credential mismatch.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
    END IF;
    UPDATE public.participants p
    SET nickname=p_nickname, team=p_team, last_seen_at=now()
    WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;
  ELSE
    SELECT count(*)::integer INTO v_active_count
    FROM public.participants p
    WHERE p.lobby_id=v_lobby.id
      AND p.last_seen_at > now() - interval '3 minutes';

    IF v_active_count >= v_lobby.max_players THEN
      out_ok:=false; out_reason:='This lobby is full.'; out_code:=null; out_game:=null; RETURN NEXT; RETURN;
    END IF;

    INSERT INTO public.participants(lobby_id,guest_id,nickname,team,last_seen_at)
    VALUES(v_lobby.id,p_guest_id,p_nickname,p_team,now());
    INSERT INTO private.participant_credentials(lobby_id,guest_id,guest_secret_hash)
    VALUES(v_lobby.id,p_guest_id,v_hash);
  END IF;

  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby.id;
  out_ok:=true; out_reason:=null; out_code:=v_lobby.code; out_game:=v_lobby.game; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lobby_snapshot(p_code text, p_guest_id text, p_guest_secret text)
RETURNS TABLE(out_snapshot jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
    SELECT 1 FROM public.participants p
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
      'last_activity_at', v_lobby.last_activity_at,
      'max_players', v_lobby.max_players
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at)
      FROM (
        SELECT id, guest_id, nickname, team, body, created_at
        FROM public.messages WHERE lobby_id = v_lobby.id
        ORDER BY created_at ASC LIMIT 200
      ) m
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(to_jsonb(p))
      FROM (
        SELECT id, guest_id, nickname, team, last_seen_at
        FROM public.participants WHERE lobby_id = v_lobby.id
      ) p
    ), '[]'::jsonb),
    'reactions', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT id, message_id, guest_id, emoji, created_at
        FROM public.reactions WHERE lobby_id = v_lobby.id
      ) r
    ), '[]'::jsonb),
    'rematchVotes', COALESCE((
      SELECT jsonb_agg(to_jsonb(rv))
      FROM (
        SELECT id, guest_id FROM public.rematch_votes WHERE lobby_id = v_lobby.id
      ) rv
    ), '[]'::jsonb),
    'syncedAt', now()
  ) INTO out_snapshot;
  RETURN NEXT;
END;
$$;
