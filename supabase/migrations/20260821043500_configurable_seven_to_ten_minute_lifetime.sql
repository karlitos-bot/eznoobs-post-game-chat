-- EZNOOBS v0.95 lobby lifetime polish.
-- Default room lifetime is 7 minutes. Joined players may extend the room once
-- toward an absolute 10-minute lifetime cap. Normal activity never resets expiry.

INSERT INTO private.app_settings(key, int_value)
VALUES
  ('lobby_duration_minutes', 7),
  ('lobby_max_duration_minutes', 10)
ON CONFLICT (key) DO UPDATE
SET int_value = excluded.int_value,
    updated_at = now();

CREATE OR REPLACE FUNCTION private.lobby_duration_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_duration_minutes'),
    7
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_duration_minutes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.lobby_max_duration_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(
    private.lobby_duration_minutes(),
    COALESCE(
      (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_max_duration_minutes'),
      10
    )
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_max_duration_minutes() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.lobbies
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 minutes');

-- Keep creation anchored to the configurable base lifetime. Updates cannot reset the
-- clock through activity; the only permitted increase is an explicit expiry update,
-- clamped to the room's absolute max lifetime.
CREATE OR REPLACE FUNCTION private.enforce_fixed_lobby_ttl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_expires_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.expires_at := NEW.created_at + make_interval(mins => private.lobby_duration_minutes());
  ELSE
    NEW.created_at := OLD.created_at;
    v_max_expires_at := OLD.created_at + make_interval(mins => private.lobby_max_duration_minutes());

    -- Ordinary UPDATE statements inherit OLD.expires_at, so chat/presence activity
    -- still cannot reset the clock. An explicit extension may only move forward and
    -- can never exceed the configured room lifetime cap.
    NEW.expires_at := LEAST(
      v_max_expires_at,
      GREATEST(OLD.expires_at, COALESCE(NEW.expires_at, OLD.expires_at))
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_fixed_lobby_ttl() FROM PUBLIC, anon, authenticated;

-- Bring currently-active development rooms onto the 7-minute base without ever
-- exceeding the new 10-minute cap or reviving an already-expired room.
UPDATE public.lobbies
SET expires_at = LEAST(
  created_at + make_interval(mins => private.lobby_duration_minutes()),
  created_at + make_interval(mins => private.lobby_max_duration_minutes())
)
WHERE expires_at > now();

CREATE OR REPLACE FUNCTION public.extend_lobby(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
RETURNS TABLE(
  out_ok boolean,
  out_reason text,
  out_expires_at timestamptz,
  out_extended boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby RECORD;
  v_max_expires_at timestamptz;
  v_target_expires_at timestamptz;
  v_extension_minutes integer;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok := false;
    out_reason := 'Invalid room code.';
    out_expires_at := NULL;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT l.id, l.created_at, l.expires_at
  INTO v_lobby
  FROM public.lobbies l
  WHERE l.code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    out_ok := false;
    out_reason := 'Lobby not found.';
    out_expires_at := NULL;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lobby.expires_at <= now() THEN
    out_ok := false;
    out_reason := 'Lobby expired.';
    out_expires_at := v_lobby.expires_at;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT private.guest_secret_matches(v_lobby.id, p_guest_id, p_guest_secret) THEN
    out_ok := false;
    out_reason := 'Join the lobby first.';
    out_expires_at := v_lobby.expires_at;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT private.consume_rate_limit(p_guest_id, 'extend_lobby', 10, 3, 600, 10) THEN
    out_ok := false;
    out_reason := 'Slow down — too many extension attempts.';
    out_expires_at := v_lobby.expires_at;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  v_max_expires_at := v_lobby.created_at
    + make_interval(mins => private.lobby_max_duration_minutes());
  v_extension_minutes := GREATEST(
    private.lobby_max_duration_minutes() - private.lobby_duration_minutes(),
    0
  );

  IF v_extension_minutes = 0 OR v_lobby.expires_at >= v_max_expires_at THEN
    out_ok := true;
    out_reason := 'Lobby is already at the time limit.';
    out_expires_at := v_lobby.expires_at;
    out_extended := false;
    RETURN NEXT;
    RETURN;
  END IF;

  v_target_expires_at := LEAST(
    v_max_expires_at,
    v_lobby.expires_at + make_interval(mins => v_extension_minutes)
  );

  UPDATE public.lobbies
  SET expires_at = v_target_expires_at
  WHERE id = v_lobby.id
  RETURNING expires_at INTO out_expires_at;

  out_ok := true;
  out_reason := NULL;
  out_extended := out_expires_at > v_lobby.expires_at;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.extend_lobby(text, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_lobby(text, text, text) TO anon;

-- Snapshot stays credential-protected and rate-limited, but now exposes only the
-- derived client capability needed by the UI: whether this room can still extend.
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

  SELECT l.id, l.code, l.game, l.created_at, l.expires_at, l.last_activity_at, l.max_players
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
      'max_players', v_lobby.max_players,
      'can_extend', v_lobby.expires_at < (
        v_lobby.created_at + make_interval(mins => private.lobby_max_duration_minutes())
      )
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
