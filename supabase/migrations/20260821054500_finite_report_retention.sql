-- EZNOOBS pre-beta moderation retention.
-- Ordinary room/chat data remains temporary. Report snapshots are retained for a
-- finite review window, then hard-deleted automatically.

INSERT INTO private.app_settings(key, int_value)
VALUES ('report_retention_days', 30)
ON CONFLICT (key) DO UPDATE
SET int_value = excluded.int_value,
    updated_at = now();

CREATE OR REPLACE FUNCTION private.report_retention_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(
    1,
    COALESCE(
      (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'report_retention_days'),
      30
    )
  );
$$;
REVOKE ALL ON FUNCTION private.report_retention_days()
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.reports
SET expires_at = created_at + make_interval(days => private.report_retention_days())
WHERE expires_at IS NULL;

ALTER TABLE public.reports
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS reports_expires_at_idx
  ON public.reports (expires_at);

CREATE OR REPLACE FUNCTION private.set_report_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.expires_at := COALESCE(
      NEW.expires_at,
      now() + make_interval(days => private.report_retention_days())
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.set_report_expiry()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_report_expiry ON public.reports;
CREATE TRIGGER eznoobs_report_expiry
BEFORE INSERT ON public.reports
FOR EACH ROW EXECUTE FUNCTION private.set_report_expiry();

CREATE OR REPLACE FUNCTION private.purge_expired_moderation_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reports integer := 0;
  v_blocks integer := 0;
  v_rate_limits integer := 0;
BEGIN
  DELETE FROM public.reports
  WHERE expires_at <= now();
  GET DIAGNOSTICS v_reports = ROW_COUNT;

  DELETE FROM private.moderation_events
  WHERE expires_at <= now();
  GET DIAGNOSTICS v_blocks = ROW_COUNT;

  DELETE FROM private.rate_limit_events
  WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_rate_limits = ROW_COUNT;

  RETURN v_reports + v_blocks + v_rate_limits;
END;
$$;
REVOKE ALL ON FUNCTION private.purge_expired_moderation_data()
FROM PUBLIC, anon, authenticated;

-- Run hourly. Replace the named job if a previous development run created it.
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'eznoobs-purge-moderation-retention'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;

SELECT cron.schedule(
  'eznoobs-purge-moderation-retention',
  '17 * * * *',
  'SELECT private.purge_expired_moderation_data();'
);
