-- EZNOOBS P1 #8: privacy-conscious abuse enforcement.
-- Restrictions are moderator-applied only. Reports never auto-ban or auto-suspend.
-- Browser guest public IDs are hashed before entering enforcement storage.

CREATE TABLE IF NOT EXISTS private.guest_restrictions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subject_hash text NOT NULL UNIQUE,
  restriction_type text NOT NULL CHECK (restriction_type IN ('chat_mute', 'cooldown', 'suspension')),
  source_report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  moderator_id uuid REFERENCES private.moderator_credentials(moderator_id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_restrictions_expiry_idx
  ON private.guest_restrictions (expires_at);
REVOKE ALL ON TABLE private.guest_restrictions FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.enforcement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restriction_id uuid,
  subject_hash text NOT NULL,
  source_report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  moderator_id uuid REFERENCES private.moderator_credentials(moderator_id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('chat_mute', 'cooldown', 'suspension', 'lift')),
  duration_minutes integer,
  reason text,
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  audit_expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS enforcement_events_subject_created_idx
  ON private.enforcement_events (subject_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS enforcement_events_audit_expiry_idx
  ON private.enforcement_events (audit_expires_at);
REVOKE ALL ON TABLE private.enforcement_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guest_subject_hash(p_guest_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT encode(extensions.digest('eznoobs-guest:' || COALESCE(p_guest_id, ''), 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION private.guest_subject_hash(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.current_guest_restriction(p_guest_id text)
RETURNS TABLE(out_type text, out_expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.restriction_type, r.expires_at
  FROM private.guest_restrictions r
  WHERE r.subject_hash = private.guest_subject_hash(p_guest_id)
    AND r.expires_at > now()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION private.current_guest_restriction(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_participant_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restriction record;
BEGIN
  SELECT * INTO v_restriction FROM private.current_guest_restriction(NEW.guest_id);
  IF FOUND AND v_restriction.out_type = 'cooldown' THEN
    RAISE EXCEPTION 'EZNOOBS_RESTRICTION_COOLDOWN';
  ELSIF FOUND AND v_restriction.out_type = 'suspension' THEN
    RAISE EXCEPTION 'EZNOOBS_RESTRICTION_SUSPENSION';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_participant_restriction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_enforce_participant_restriction ON public.participants;
CREATE TRIGGER eznoobs_enforce_participant_restriction
BEFORE INSERT ON public.participants
FOR EACH ROW EXECUTE FUNCTION private.enforce_participant_restriction();

CREATE OR REPLACE FUNCTION private.enforce_interaction_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restriction record;
BEGIN
  SELECT * INTO v_restriction FROM private.current_guest_restriction(NEW.guest_id);
  IF FOUND AND v_restriction.out_type = 'chat_mute' THEN
    RAISE EXCEPTION 'EZNOOBS_RESTRICTION_CHAT_MUTE';
  ELSIF FOUND AND v_restriction.out_type = 'cooldown' THEN
    RAISE EXCEPTION 'EZNOOBS_RESTRICTION_COOLDOWN';
  ELSIF FOUND AND v_restriction.out_type = 'suspension' THEN
    RAISE EXCEPTION 'EZNOOBS_RESTRICTION_SUSPENSION';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_interaction_restriction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_enforce_message_restriction ON public.messages;
CREATE TRIGGER eznoobs_enforce_message_restriction
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.enforce_interaction_restriction();

DROP TRIGGER IF EXISTS eznoobs_enforce_reaction_restriction ON public.reactions;
CREATE TRIGGER eznoobs_enforce_reaction_restriction
BEFORE INSERT ON public.reactions
FOR EACH ROW EXECUTE FUNCTION private.enforce_interaction_restriction();

DROP TRIGGER IF EXISTS eznoobs_enforce_rematch_restriction ON public.rematch_votes;
CREATE TRIGGER eznoobs_enforce_rematch_restriction
BEFORE INSERT ON public.rematch_votes
FOR EACH ROW EXECUTE FUNCTION private.enforce_interaction_restriction();

CREATE OR REPLACE FUNCTION public.get_enforcement_candidates(
  p_session_token text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  out_report_id uuid,
  out_lobby_code text,
  out_reason text,
  out_message_body text,
  out_message_nickname text,
  out_message_team text,
  out_review_status text,
  out_reviewed_at timestamptz,
  out_prior_enforcements integer,
  out_active_restriction text,
  out_active_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_limit integer;
BEGIN
  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  UPDATE private.moderator_sessions
  SET last_seen_at = now()
  WHERE token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex');

  RETURN QUERY
  SELECT
    r.id,
    r.lobby_code,
    r.reason,
    r.message_body,
    r.message_nickname,
    r.message_team,
    r.review_status,
    r.reviewed_at,
    COALESCE((
      SELECT count(*)::integer
      FROM private.enforcement_events e
      WHERE e.subject_hash = private.guest_subject_hash(r.reported_guest_id)
        AND e.action_type <> 'lift'
        AND e.created_at >= now() - interval '30 days'
    ), 0),
    gr.restriction_type,
    gr.expires_at
  FROM public.reports r
  LEFT JOIN private.guest_restrictions gr
    ON gr.subject_hash = private.guest_subject_hash(r.reported_guest_id)
   AND gr.expires_at > now()
  WHERE r.expires_at > now()
    AND r.review_status IN ('confirmed', 'serious')
  ORDER BY
    CASE r.review_status WHEN 'serious' THEN 0 ELSE 1 END,
    r.reviewed_at DESC NULLS LAST,
    r.created_at DESC
  LIMIT v_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_enforcement_candidates(text, integer)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_enforcement_candidates(text, integer) TO anon;

CREATE OR REPLACE FUNCTION public.apply_guest_restriction(
  p_session_token text,
  p_report_id uuid,
  p_restriction_type text,
  p_duration_minutes integer,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(out_ok boolean, out_reason text, out_restriction_id uuid, out_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_report record;
  v_type text;
  v_duration integer;
  v_reason text;
  v_subject_hash text;
  v_expires_at timestamptz;
  v_restriction_id uuid;
BEGIN
  out_ok := false;
  out_reason := 'Moderator session invalid or expired.';
  out_restriction_id := NULL;
  out_expires_at := NULL;

  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN RETURN NEXT; RETURN; END IF;

  SELECT * INTO v_report
  FROM public.reports r
  WHERE r.id = p_report_id
    AND r.expires_at > now();
  IF NOT FOUND THEN
    out_reason := 'Report not found or already expired.';
    RETURN NEXT; RETURN;
  END IF;

  IF v_report.review_status NOT IN ('confirmed', 'serious') THEN
    out_reason := 'Confirm the report before applying enforcement.';
    RETURN NEXT; RETURN;
  END IF;

  v_type := lower(COALESCE(p_restriction_type, ''));
  v_duration := COALESCE(p_duration_minutes, 0);
  IF v_type = 'chat_mute' AND (v_duration < 5 OR v_duration > 1440) THEN
    out_reason := 'Chat mute duration must be 5 minutes to 24 hours.';
    RETURN NEXT; RETURN;
  ELSIF v_type = 'cooldown' AND (v_duration < 10 OR v_duration > 10080) THEN
    out_reason := 'Cooldown duration must be 10 minutes to 7 days.';
    RETURN NEXT; RETURN;
  ELSIF v_type = 'suspension' AND (v_duration < 60 OR v_duration > 43200) THEN
    out_reason := 'Suspension duration must be 1 hour to 30 days.';
    RETURN NEXT; RETURN;
  ELSIF v_type NOT IN ('chat_mute', 'cooldown', 'suspension') THEN
    out_reason := 'Invalid restriction type.';
    RETURN NEXT; RETURN;
  END IF;

  v_reason := NULLIF(left(btrim(COALESCE(p_reason, '')), 500), '');
  v_subject_hash := private.guest_subject_hash(v_report.reported_guest_id);
  v_expires_at := now() + make_interval(mins => v_duration);

  INSERT INTO private.guest_restrictions(
    subject_hash, restriction_type, source_report_id, moderator_id, reason, expires_at
  ) VALUES (
    v_subject_hash, v_type, v_report.id, v_moderator_id, v_reason, v_expires_at
  )
  ON CONFLICT (subject_hash) DO UPDATE
  SET restriction_type = excluded.restriction_type,
      source_report_id = excluded.source_report_id,
      moderator_id = excluded.moderator_id,
      reason = excluded.reason,
      updated_at = now(),
      expires_at = excluded.expires_at
  RETURNING id INTO v_restriction_id;

  INSERT INTO private.enforcement_events(
    restriction_id, subject_hash, source_report_id, moderator_id, action_type,
    duration_minutes, reason, effective_until, audit_expires_at
  ) VALUES (
    v_restriction_id, v_subject_hash, v_report.id, v_moderator_id, v_type,
    v_duration, v_reason, v_expires_at, v_expires_at + interval '30 days'
  );

  out_ok := true;
  out_reason := NULL;
  out_restriction_id := v_restriction_id;
  out_expires_at := v_expires_at;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_guest_restriction(text, uuid, text, integer, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_guest_restriction(text, uuid, text, integer, text) TO anon;

CREATE OR REPLACE FUNCTION public.get_active_guest_restrictions(
  p_session_token text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  out_id uuid,
  out_restriction_type text,
  out_source_report_id uuid,
  out_reason text,
  out_created_at timestamptz,
  out_updated_at timestamptz,
  out_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_limit integer;
BEGIN
  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN RETURN; END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);

  RETURN QUERY
  SELECT r.id, r.restriction_type, r.source_report_id, r.reason,
         r.created_at, r.updated_at, r.expires_at
  FROM private.guest_restrictions r
  WHERE r.expires_at > now()
  ORDER BY r.expires_at DESC
  LIMIT v_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_guest_restrictions(text, integer)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_guest_restrictions(text, integer) TO anon;

CREATE OR REPLACE FUNCTION public.lift_guest_restriction(
  p_session_token text,
  p_restriction_id uuid,
  p_note text DEFAULT NULL
)
RETURNS TABLE(out_ok boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_moderator_id uuid;
  v_restriction record;
  v_note text;
BEGIN
  out_ok := false;
  out_reason := 'Moderator session invalid or expired.';
  v_moderator_id := private.moderator_session_owner(p_session_token);
  IF v_moderator_id IS NULL THEN RETURN NEXT; RETURN; END IF;

  SELECT * INTO v_restriction
  FROM private.guest_restrictions r
  WHERE r.id = p_restriction_id;
  IF NOT FOUND THEN
    out_reason := 'Restriction not found or already expired.';
    RETURN NEXT; RETURN;
  END IF;

  v_note := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
  DELETE FROM private.guest_restrictions WHERE id = p_restriction_id;

  INSERT INTO private.enforcement_events(
    restriction_id, subject_hash, source_report_id, moderator_id, action_type,
    reason, effective_until, audit_expires_at
  ) VALUES (
    v_restriction.id, v_restriction.subject_hash, v_restriction.source_report_id,
    v_moderator_id, 'lift', v_note, now(), now() + interval '30 days'
  );

  out_ok := true;
  out_reason := NULL;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lift_guest_restriction(text, uuid, text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.lift_guest_restriction(text, uuid, text) TO anon;

CREATE OR REPLACE FUNCTION private.purge_expired_enforcement_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restrictions integer := 0;
  v_events integer := 0;
BEGIN
  DELETE FROM private.guest_restrictions WHERE expires_at <= now();
  GET DIAGNOSTICS v_restrictions = ROW_COUNT;
  DELETE FROM private.enforcement_events WHERE audit_expires_at <= now();
  GET DIAGNOSTICS v_events = ROW_COUNT;
  RETURN v_restrictions + v_events;
END;
$$;
REVOKE ALL ON FUNCTION private.purge_expired_enforcement_data()
FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'eznoobs-purge-enforcement-retention'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
END;
$$;

SELECT cron.schedule(
  'eznoobs-purge-enforcement-retention',
  '23 * * * *',
  'SELECT private.purge_expired_enforcement_data();'
);
