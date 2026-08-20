-- EZNOOBS live beta-hardening audit harness.
-- Intended to be run against the project database by a trusted maintainer connection.
-- It creates one disposable room, exercises valid and forged credentials, verifies
-- moderation/identity protections and deletion cascades, then cleans up its audit data.
-- The function lives in pg_temp and disappears with the database session.

CREATE OR REPLACE FUNCTION pg_temp.eznoobs_live_security_audit()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner_id text := gen_random_uuid()::text;
  v_owner_secret text := gen_random_uuid()::text;
  v_wrong_secret text := gen_random_uuid()::text;
  v_attacker_id text := gen_random_uuid()::text;
  v_attacker_secret text := gen_random_uuid()::text;
  v_peer_id text := gen_random_uuid()::text;
  v_peer_secret text := gen_random_uuid()::text;
  v_code text;
  v_lobby_id uuid;
  v_owner_message_id uuid;
  v_peer_message_id uuid;
  v_report_id uuid;
  v_ok boolean;
  v_active boolean;
  v_allowed boolean;
  v_reason text;
  v_category text;
  v_token text;
  v_snapshot jsonb;
  v_count integer;
  v_pass boolean;
  v_all_pass boolean;
  v_results jsonb := '{}'::jsonb;
BEGIN
  -- Create a fresh disposable room and prove the normal credential path works.
  SELECT out_code INTO v_code
  FROM public.create_lobby('Security Audit', v_owner_id, v_owner_secret, 'AuditOwner', 'blue');

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Audit could not create a disposable lobby.';
  END IF;

  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code = v_code;
  v_results := v_results || jsonb_build_object('room_created', v_lobby_id IS NOT NULL);

  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.send_message(v_code, v_owner_id, v_owner_secret, 'audit owner message');
  v_results := v_results || jsonb_build_object('valid_owner_message', COALESCE(v_ok, false));

  SELECT id INTO v_owner_message_id
  FROM public.messages
  WHERE lobby_id = v_lobby_id AND guest_id = v_owner_id
  ORDER BY created_at DESC
  LIMIT 1;
  v_results := v_results || jsonb_build_object('owner_message_persisted', v_owner_message_id IS NOT NULL);

  -- Completely fake outsider must fail every sensitive write/heartbeat action.
  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.send_message(v_code, v_attacker_id, v_attacker_secret, 'forged outsider message');
  v_results := v_results || jsonb_build_object('outsider_message_blocked', NOT COALESCE(v_ok, false));

  SELECT out_ok, out_reason, out_active INTO v_ok, v_reason, v_active
  FROM public.toggle_reaction(v_code, v_attacker_id, v_attacker_secret, v_owner_message_id, 'GG');
  v_results := v_results || jsonb_build_object('outsider_reaction_blocked', NOT COALESCE(v_ok, false));

  SELECT out_ok, out_reason, out_active, out_count INTO v_ok, v_reason, v_active, v_count
  FROM public.toggle_rematch_vote(v_code, v_attacker_id, v_attacker_secret);
  v_results := v_results || jsonb_build_object('outsider_rematch_blocked', NOT COALESCE(v_ok, false));

  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.report_message(v_code, v_attacker_id, v_attacker_secret, v_owner_message_id, 'audit forged report');
  v_results := v_results || jsonb_build_object('outsider_report_blocked', NOT COALESCE(v_ok, false));

  SELECT out_ok INTO v_ok
  FROM public.touch_presence(v_code, v_attacker_id, v_attacker_secret);
  v_results := v_results || jsonb_build_object('outsider_presence_blocked', NOT COALESCE(v_ok, false));

  SELECT out_ok INTO v_ok
  FROM public.leave_lobby(v_code, v_attacker_id, v_attacker_secret);
  v_results := v_results || jsonb_build_object('outsider_leave_blocked', NOT COALESCE(v_ok, false));

  -- Stronger impersonation test: a real visible owner guest ID paired with a wrong secret.
  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.send_message(v_code, v_owner_id, v_wrong_secret, 'forged owner message');
  v_results := v_results || jsonb_build_object('real_id_wrong_secret_message_blocked', NOT COALESCE(v_ok, false));

  v_snapshot := NULL;
  BEGIN
    SELECT out_snapshot INTO v_snapshot
    FROM public.get_lobby_snapshot(v_code, v_owner_id, v_wrong_secret);
    v_pass := v_snapshot IS NULL;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object('real_id_wrong_secret_snapshot_blocked', v_pass);

  v_token := NULL;
  SELECT out_token INTO v_token
  FROM public.get_lobby_realtime_token(v_code, v_owner_id, v_wrong_secret);
  v_results := v_results || jsonb_build_object('real_id_wrong_secret_token_blocked', v_token IS NULL);

  -- Anonymous roles must not be able to bypass RPCs with direct table reads.
  v_results := v_results || jsonb_build_object(
    'anon_messages_select_revoked', NOT has_table_privilege('anon', 'public.messages', 'SELECT'),
    'anon_participants_select_revoked', NOT has_table_privilege('anon', 'public.participants', 'SELECT'),
    'anon_lobbies_select_revoked', NOT has_table_privilege('anon', 'public.lobbies', 'SELECT'),
    'legacy_check_participant_revoked', NOT has_function_privilege('anon', 'public.check_participant(text,text,text)', 'EXECUTE')
  );

  -- Existing active username cannot be claimed case-insensitively by another guest.
  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.join_lobby(v_code, v_attacker_id, v_attacker_secret, 'AUDITOWNER', 'red');
  v_results := v_results || jsonb_build_object('duplicate_username_blocked', NOT COALESCE(v_ok, false));

  -- Invisible/bidi display tricks must also fail even for a direct RPC caller.
  BEGIN
    SELECT out_ok, out_reason INTO v_ok, v_reason
    FROM public.join_lobby(
      v_code,
      v_attacker_id,
      v_attacker_secret,
      'Audit' || chr(8203) || 'Ghost',
      'red'
    );
    v_pass := NOT COALESCE(v_ok, false);
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object('invisible_username_blocked', v_pass);

  -- Valid owner state-changing actions still work after hardening and create rows
  -- that we can later prove are removed by the lobby cascade.
  SELECT out_ok, out_reason, out_active INTO v_ok, v_reason, v_active
  FROM public.toggle_reaction(v_code, v_owner_id, v_owner_secret, v_owner_message_id, 'GG');
  v_results := v_results || jsonb_build_object('valid_owner_reaction', COALESCE(v_ok, false) AND COALESCE(v_active, false));

  SELECT out_ok, out_reason, out_active, out_count INTO v_ok, v_reason, v_active, v_count
  FROM public.toggle_rematch_vote(v_code, v_owner_id, v_owner_secret);
  v_results := v_results || jsonb_build_object('valid_owner_rematch', COALESCE(v_ok, false) AND COALESCE(v_active, false));

  -- Create one legitimate peer so report evidence retention can be tested.
  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.join_lobby(v_code, v_peer_id, v_peer_secret, 'AuditPeer', 'red');
  v_results := v_results || jsonb_build_object('valid_peer_join', COALESCE(v_ok, false));

  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.send_message(v_code, v_peer_id, v_peer_secret, 'audit peer message');
  v_results := v_results || jsonb_build_object('valid_peer_message', COALESCE(v_ok, false));

  SELECT id INTO v_peer_message_id
  FROM public.messages
  WHERE lobby_id = v_lobby_id AND guest_id = v_peer_id
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT out_ok, out_reason INTO v_ok, v_reason
  FROM public.report_message(v_code, v_owner_id, v_owner_secret, v_peer_message_id, 'audit evidence retention');
  v_results := v_results || jsonb_build_object('valid_report_created', COALESCE(v_ok, false));

  SELECT id INTO v_report_id
  FROM public.reports
  WHERE reporter_guest_id = v_owner_id AND message_id = v_peer_message_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Expanded personal-data moderation: block high-confidence sharing but keep
  -- ordinary game numbers and plain @mentions usable.
  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('email me at audit@example.com');
  v_results := v_results || jsonb_build_object('dox_email_blocked', NOT COALESCE(v_allowed, true) AND v_category = 'personal_data');

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('call me +30 6912 345 678');
  v_results := v_results || jsonb_build_object('dox_phone_blocked', NOT COALESCE(v_allowed, true) AND v_category = 'personal_data');

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('your ip is 203.0.113.42');
  v_results := v_results || jsonb_build_object('dox_ip_blocked', NOT COALESCE(v_allowed, true) AND v_category = 'personal_data');

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('your address is 123 Example Street');
  v_results := v_results || jsonb_build_object('dox_address_blocked', NOT COALESCE(v_allowed, true) AND v_category = 'personal_data');

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('discord @auditplayer');
  v_results := v_results || jsonb_build_object('dox_social_handle_blocked', NOT COALESCE(v_allowed, true) AND v_category = 'personal_data');

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('score was 12-3, gg');
  v_results := v_results || jsonb_build_object('ordinary_numbers_allowed', COALESCE(v_allowed, false));

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('@teammate nice shot');
  v_results := v_results || jsonb_build_object('plain_mention_allowed', COALESCE(v_allowed, false));

  SELECT out_allowed, out_category INTO v_allowed, v_category
  FROM private.moderate_text('headphones 12345678');
  v_results := v_results || jsonb_build_object('headphone_false_positive_avoided', COALESCE(v_allowed, false));

  -- Private credential and realtime-token rows should exist while the room is alive.
  v_results := v_results || jsonb_build_object(
    'private_credential_exists_before_delete', EXISTS (
      SELECT 1 FROM private.participant_credentials WHERE lobby_id = v_lobby_id AND guest_id = v_owner_id
    ),
    'private_realtime_token_exists_before_delete', EXISTS (
      SELECT 1 FROM private.lobby_realtime_tokens WHERE lobby_id = v_lobby_id
    )
  );

  -- Hard-delete the disposable lobby and verify all temporary data cascades away.
  DELETE FROM public.lobbies WHERE id = v_lobby_id;

  v_results := v_results || jsonb_build_object(
    'lobby_deleted', NOT EXISTS (SELECT 1 FROM public.lobbies WHERE id = v_lobby_id),
    'messages_cascade_deleted', NOT EXISTS (SELECT 1 FROM public.messages WHERE lobby_id = v_lobby_id),
    'participants_cascade_deleted', NOT EXISTS (SELECT 1 FROM public.participants WHERE lobby_id = v_lobby_id),
    'reactions_cascade_deleted', NOT EXISTS (SELECT 1 FROM public.reactions WHERE lobby_id = v_lobby_id),
    'rematch_cascade_deleted', NOT EXISTS (SELECT 1 FROM public.rematch_votes WHERE lobby_id = v_lobby_id),
    'credentials_cascade_deleted', NOT EXISTS (SELECT 1 FROM private.participant_credentials WHERE lobby_id = v_lobby_id),
    'realtime_token_cascade_deleted', NOT EXISTS (SELECT 1 FROM private.lobby_realtime_tokens WHERE lobby_id = v_lobby_id)
  );

  -- Reports deliberately survive temporary-room deletion, but only as detached
  -- moderation evidence with their message snapshot retained.
  IF v_report_id IS NOT NULL THEN
    SELECT (
      lobby_id IS NULL
      AND message_id IS NULL
      AND lobby_code = v_code
      AND message_body = 'audit peer message'
      AND message_nickname = 'AuditPeer'
    )
    INTO v_pass
    FROM public.reports
    WHERE id = v_report_id;
  ELSE
    v_pass := false;
  END IF;
  v_results := v_results || jsonb_build_object('report_evidence_survives_detached', COALESCE(v_pass, false));

  -- Remove audit-only moderation evidence/rate-limit rows so the harness leaves no
  -- persistent test data behind.
  IF v_report_id IS NOT NULL THEN
    DELETE FROM public.reports WHERE id = v_report_id;
  END IF;
  DELETE FROM private.rate_limit_events WHERE guest_id IN (v_owner_id, v_attacker_id, v_peer_id);
  DELETE FROM private.moderation_events WHERE guest_id IN (v_owner_id, v_attacker_id, v_peer_id);

  SELECT bool_and(value::boolean)
  INTO v_all_pass
  FROM jsonb_each_text(v_results)
  WHERE value IN ('true', 'false');

  RETURN v_results || jsonb_build_object(
    'all_pass', COALESCE(v_all_pass, false),
    'audit_room_code', v_code
  );
END;
$$;

SELECT pg_temp.eznoobs_live_security_audit() AS audit_result;
