-- EZNOOBS pre-beta moderation operations.
-- Adds a review lifecycle for user reports plus credentialed moderator sessions.
-- This migration does NOT automatically punish reported users; enforcement is P1 #8.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_review_status_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_review_status_check
  CHECK (review_status IN ('pending', 'dismissed', 'confirmed', 'serious'));

CREATE INDEX IF NOT EXISTS reports_review_status_created_idx
  ON public.reports (review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS private.moderator_credentials (
  moderator_id uuid PRIMARY KEY,
  secret_hash text NOT NULL,
  label text NOT NULL DEFAULT 'EZNOOBS moderator',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
REVOKE ALL ON TABLE private.moderator_credentials FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.moderator_sessions (
  token_hash text PRIMARY KEY,
  moderator_id uuid NOT NULL REFERENCES private.moderator_credentials(moderator_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderator_sessions_expiry_idx
  ON private.moderator_sessions (expires_at);
REVOKE ALL ON TABLE private.moderator_sessions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.report_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  moderator_id uuid REFERENCES private.moderator_credentials(moderator_id) ON DELETE SET NULL,
  review_status text NOT NULL CHECK (review_status IN ('pending', 'dismissed', 'confirmed', 'serious')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_review_events_report_created_idx
  ON private.report_review_events (report_id, created_at DESC);
REVOKE ALL ON TABLE private.report_review_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.moderator_session_owner(p_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.moderator_id
  FROM private.moderator_sessions s
  JOIN private.moderator_credentials c ON c.moderator_id = s.moderator_id
  WHERE s.token_hash = encode(extensions.digest(COALESCE(p_token, ''), 'sha256'), 'hex')
    AND s.expires_at > now()
    AND c.revoked_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.moderator_session_owner(text)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.moderator_login(
  p_moderator_id uuid,
  p_secret text
)
RETURNS TABLE(out_ok boolean, out_token text, out_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_hash text;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  out_ok := false;
  out_token := NULL;
  out_expires_at := NULL;

  IF p_moderator_id IS NULL OR char_length(COALESCE(p_secret, '')) < 24 THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- The moderator id is itself random/high entropy. Rate limiting by id keeps failed
  -- guesses cheap while avoiding any user/IP tracking in this beta implementation.
  IF NOT private.consume_rate_limit(
    'moderator:' || p_moderator_id::text,
    'moderator_login',
    60, 5,
    900, 15
  ) THEN
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT c.secret_hash INTO v_expected_hash
  FROM private.moderator_credentials c
  WHERE c.moderator_id = p_moderator_id
    AND c.revoked_at IS NULL;

  IF v_expected_hash IS NULL
     OR v_expected_hash <> encode(extensions.digest(p_secret, 'sha256'), 'hex') THEN
    RETURN NEXT;
    RETURN;
  END IF;

  DELETE FROM private.moderator_sessions WHERE expires_at <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '8 hours';

  INSERT INTO private.moderator_sessions(token_hash, moderator_id, expires_at)
  VALUES(
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_moderator_id,
    v_expires_at
  );

  out_ok := true;
  out_token := v_token;
  out_expires_at := v_expires_at;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderator_login(uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.moderator_login(uuid, text) TO anon;

CREATE OR REPLACE FUNCTION public.get_moderation_queue(
  p_session_token text,
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  out_id uuid,
  out_lobby_code text,
  out_reporter_guest_id text,
  out_reported_guest_id text,
  out_reason text,
  out_message_body text,
  out_message_nickname text,
  out_message_team text,
  out_created_at timestamptz,
  out_expires_at timestamptz,
  out_review_status text,
  out_reviewed_at timestamptz,
  out_review_note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_status text;
  v_limit integer;
BEGIN
  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN
    RETURN;
  END IF;

  v_status := lower(COALESCE(p_status, 'pending'));
  IF v_status NOT IN ('pending', 'dismissed', 'confirmed', 'serious', 'all') THEN
    v_status := 'pending';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  UPDATE private.moderator_sessions
  SET last_seen_at = now()
  WHERE token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    r.id,
    r.lobby_code,
    r.reporter_guest_id,
    r.reported_guest_id,
    r.reason,
    r.message_body,
    r.message_nickname,
    r.message_team,
    r.created_at,
    r.expires_at,
    r.review_status,
    r.reviewed_at,
    r.review_note
  FROM public.reports r
  WHERE r.expires_at > now()
    AND (v_status = 'all' OR r.review_status = v_status)
  ORDER BY
    CASE r.review_status WHEN 'serious' THEN 0 WHEN 'pending' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END,
    r.created_at DESC
  LIMIT v_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_moderation_queue(text, text, integer)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_moderation_queue(text, text, integer) TO anon;

CREATE OR REPLACE FUNCTION public.review_report(
  p_session_token text,
  p_report_id uuid,
  p_review_status text,
  p_note text DEFAULT NULL
)
RETURNS TABLE(out_ok boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_status text;
  v_note text;
BEGIN
  out_ok := false;
  out_reason := 'Moderator session invalid or expired.';

  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  v_status := lower(COALESCE(p_review_status, ''));
  IF v_status NOT IN ('pending', 'dismissed', 'confirmed', 'serious') THEN
    out_reason := 'Invalid review status.';
    RETURN NEXT;
    RETURN;
  END IF;

  v_note := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');

  UPDATE public.reports
  SET
    review_status = v_status,
    reviewed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE now() END,
    review_note = v_note
  WHERE id = p_report_id
    AND expires_at > now();

  IF NOT FOUND THEN
    out_reason := 'Report not found or already expired.';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO private.report_review_events(report_id, moderator_id, review_status, note)
  VALUES(p_report_id, v_moderator_id, v_status, v_note);

  UPDATE private.moderator_sessions
  SET last_seen_at = now()
  WHERE token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  out_ok := true;
  out_reason := NULL;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.review_report(text, uuid, text, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.review_report(text, uuid, text, text) TO anon;

CREATE OR REPLACE FUNCTION public.moderator_logout(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM private.moderator_sessions
  WHERE token_hash = encode(extensions.digest(COALESCE(p_session_token, ''), 'sha256'), 'hex');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderator_logout(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.moderator_logout(text) TO anon;
