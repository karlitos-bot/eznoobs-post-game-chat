-- EZNOOBS v0.95 activity extension pacing.
-- Prevent rapid actions in the final seconds from banking multiple minutes at once.
-- A room may earn at most one activity-based extension per 60 seconds.

ALTER TABLE public.lobbies
  ADD COLUMN IF NOT EXISTS last_extended_at timestamptz;

INSERT INTO private.app_settings(key, int_value)
VALUES ('lobby_activity_extension_cooldown_seconds', 60)
ON CONFLICT (key) DO UPDATE
SET int_value = excluded.int_value,
    updated_at = now();

CREATE OR REPLACE FUNCTION private.lobby_activity_extension_cooldown_seconds()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_activity_extension_cooldown_seconds'),
    60
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_activity_extension_cooldown_seconds()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_meaningful_lobby_activity(p_lobby_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby RECORD;
  v_max_expires_at timestamptz;
  v_target_expires_at timestamptz;
  v_extended boolean := false;
BEGIN
  SELECT l.id, l.created_at, l.expires_at, l.last_extended_at
  INTO v_lobby
  FROM public.lobbies l
  WHERE l.id = p_lobby_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_max_expires_at := v_lobby.created_at
    + make_interval(mins => private.lobby_max_duration_minutes());
  v_target_expires_at := v_lobby.expires_at;

  IF v_lobby.expires_at > now()
     AND v_lobby.expires_at < v_max_expires_at
     AND v_lobby.expires_at - now()
       <= make_interval(mins => private.lobby_activity_extension_window_minutes())
     AND (
       v_lobby.last_extended_at IS NULL
       OR v_lobby.last_extended_at
         <= now() - make_interval(secs => private.lobby_activity_extension_cooldown_seconds())
     ) THEN
    v_target_expires_at := LEAST(
      v_max_expires_at,
      v_lobby.expires_at + make_interval(mins => private.lobby_activity_extension_minutes())
    );
    v_extended := v_target_expires_at > v_lobby.expires_at;
  END IF;

  UPDATE public.lobbies
  SET last_activity_at = now(),
      expires_at = v_target_expires_at,
      last_extended_at = CASE WHEN v_extended THEN now() ELSE last_extended_at END
  WHERE id = p_lobby_id
  RETURNING expires_at INTO v_target_expires_at;

  RETURN v_target_expires_at;
END;
$$;
REVOKE ALL ON FUNCTION private.record_meaningful_lobby_activity(uuid)
FROM PUBLIC, anon, authenticated;
