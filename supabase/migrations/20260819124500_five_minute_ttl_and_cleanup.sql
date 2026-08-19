-- EZNOOBS temporary-room lifecycle.
-- Active conversation resets the room to five minutes. Passive presence heartbeats do not.
-- Expired lobby data is hard-deleted automatically; moderation snapshots survive deletion.

ALTER TABLE public.lobbies
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '5 minutes');

-- Enforce one TTL rule even if an older RPC still tries to write a longer expires_at.
CREATE OR REPLACE FUNCTION private.enforce_five_minute_lobby_ttl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_activity_at := COALESCE(NEW.last_activity_at, now());
    NEW.expires_at := NEW.last_activity_at + interval '5 minutes';
  ELSIF NEW.last_activity_at IS DISTINCT FROM OLD.last_activity_at THEN
    NEW.expires_at := NEW.last_activity_at + interval '5 minutes';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_five_minute_lobby_ttl()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_five_minute_ttl ON public.lobbies;
CREATE TRIGGER eznoobs_five_minute_ttl
BEFORE INSERT OR UPDATE ON public.lobbies
FOR EACH ROW EXECUTE FUNCTION private.enforce_five_minute_lobby_ttl();

-- Bring currently active development rooms onto the new TTL without reviving expired rooms.
UPDATE public.lobbies
SET expires_at = LEAST(expires_at, last_activity_at + interval '5 minutes')
WHERE expires_at > now();

-- Reports are moderation evidence, not ordinary temporary chat data. Snapshot the relevant
-- content and detach the report from lobby/message deletion so it can be reviewed later.
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS lobby_code text,
  ADD COLUMN IF NOT EXISTS message_body text,
  ADD COLUMN IF NOT EXISTS message_nickname text,
  ADD COLUMN IF NOT EXISTS message_team text;

UPDATE public.reports r
SET
  lobby_code = COALESCE(r.lobby_code, l.code),
  message_body = COALESCE(r.message_body, m.body),
  message_nickname = COALESCE(r.message_nickname, m.nickname),
  message_team = COALESCE(r.message_team, m.team)
FROM public.lobbies l
LEFT JOIN public.messages m ON m.id = r.message_id
WHERE l.id = r.lobby_id;

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_lobby_id_fkey;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_message_id_fkey;
ALTER TABLE public.reports ALTER COLUMN lobby_id DROP NOT NULL;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_lobby_id_fkey
  FOREIGN KEY (lobby_id) REFERENCES public.lobbies(id) ON DELETE SET NULL;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_message_id_fkey
  FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

-- Recreate reporting so every future report captures enough evidence before the room expires.
CREATE OR REPLACE FUNCTION public.report_message(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
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
  SELECT id INTO v_lobby_id
  FROM public.lobbies
  WHERE code = p_code AND expires_at > now();

  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.'; RETURN NEXT; RETURN;
  END IF;

  IF NOT private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret) THEN
    out_ok := false; out_reason := 'Join the lobby first.'; RETURN NEXT; RETURN;
  END IF;

  SELECT id, guest_id, nickname, team, body INTO v_msg
  FROM public.messages m
  WHERE m.id = p_message_id AND m.lobby_id = v_lobby_id;

  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Message not found.'; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.reports (
      lobby_id,
      message_id,
      reporter_guest_id,
      reported_guest_id,
      reason,
      lobby_code,
      message_body,
      message_nickname,
      message_team
    ) VALUES (
      v_lobby_id,
      v_msg.id,
      p_guest_id,
      v_msg.guest_id,
      left(p_reason, 200),
      p_code,
      v_msg.body,
      v_msg.nickname,
      v_msg.team
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.report_message(text, text, text, uuid, text) TO anon;

CREATE OR REPLACE FUNCTION private.purge_expired_lobbies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.lobbies
    WHERE expires_at <= now()
    RETURNING id
  )
  SELECT count(*)::integer INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_expired_lobbies()
FROM PUBLIC, anon, authenticated;

-- Supabase Cron runs the cleanup inside Postgres with no external worker required.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'eznoobs-purge-expired-lobbies',
  '* * * * *',
  'SELECT private.purge_expired_lobbies();'
);
