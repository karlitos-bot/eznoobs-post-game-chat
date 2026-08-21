-- EZNOOBS v0.95 activity-driven temporary room lifetime.
-- Rooms start at 7 minutes. Meaningful in-room actions may add one minute when
-- there are two minutes or less remaining, but no room may live beyond 10 minutes
-- from its original creation time. Presence, refreshes and typing do not count.

INSERT INTO private.app_settings(key, int_value)
VALUES
  ('lobby_duration_minutes', 7),
  ('lobby_max_duration_minutes', 10),
  ('lobby_activity_extension_window_minutes', 2),
  ('lobby_activity_extension_minutes', 1)
ON CONFLICT (key) DO UPDATE
SET int_value = excluded.int_value,
    updated_at = now();

CREATE OR REPLACE FUNCTION private.lobby_activity_extension_window_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_activity_extension_window_minutes'),
    2
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_activity_extension_window_minutes()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.lobby_activity_extension_minutes()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT s.int_value FROM private.app_settings s WHERE s.key = 'lobby_activity_extension_minutes'),
    1
  );
$$;
REVOKE ALL ON FUNCTION private.lobby_activity_extension_minutes()
FROM PUBLIC, anon, authenticated;

-- Centralized meaningful activity hook. It both records activity and grants the
-- next minute only inside the configured final-window. Because the extension adds
-- one minute, the room immediately moves back outside that window; repeated spam
-- cannot instantly jump a room from seven to ten minutes.
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
BEGIN
  SELECT l.id, l.created_at, l.expires_at
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
       <= make_interval(mins => private.lobby_activity_extension_window_minutes()) THEN
    v_target_expires_at := LEAST(
      v_max_expires_at,
      v_lobby.expires_at + make_interval(mins => private.lobby_activity_extension_minutes())
    );
  END IF;

  UPDATE public.lobbies
  SET last_activity_at = now(),
      expires_at = v_target_expires_at
  WHERE id = p_lobby_id
  RETURNING expires_at INTO v_target_expires_at;

  RETURN v_target_expires_at;
END;
$$;
REVOKE ALL ON FUNCTION private.record_meaningful_lobby_activity(uuid)
FROM PUBLIC, anon, authenticated;

-- The old manual extension API is intentionally removed. Lifetime increases are
-- now exclusively a consequence of successful credential-checked room activity.
DROP FUNCTION IF EXISTS public.extend_lobby(text, text, text);

CREATE OR REPLACE FUNCTION public.send_message(
  p_code text,
  p_guest_id text,
  p_guest_secret text,
  p_body text
)
RETURNS TABLE(out_ok boolean,out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires_at timestamptz;
  v_nickname text;
  v_team text;
  v_mod RECORD;
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN
    out_ok:=false;out_reason:='Invalid room code.';RETURN NEXT;RETURN;
  END IF;
  IF p_body IS NULL OR char_length(trim(p_body))<1 OR char_length(p_body)>500 THEN
    out_ok:=false;out_reason:='Message must be 1-500 characters.';RETURN NEXT;RETURN;
  END IF;

  SELECT id,expires_at INTO v_lobby_id,v_expires_at
  FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';RETURN NEXT;RETURN;END IF;
  IF v_expires_at<=now() THEN out_ok:=false;out_reason:='Lobby expired.';RETURN NEXT;RETURN;END IF;

  SELECT p.nickname,p.team INTO v_nickname,v_team
  FROM public.participants p
  WHERE p.lobby_id=v_lobby_id
    AND p.guest_id=p_guest_id
    AND private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret);
  IF NOT FOUND THEN out_ok:=false;out_reason:='Join the lobby before chatting.';RETURN NEXT;RETURN;END IF;

  IF private.moderation_cooldown_active(p_guest_id) THEN
    out_ok:=false;out_reason:='Cool down for a moment — repeated blocked messages triggered safety mode.';RETURN NEXT;RETURN;
  END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'message',10,8,60,30) THEN
    out_ok:=false;out_reason:='Slow down — you are flooding the lobby.';RETURN NEXT;RETURN;
  END IF;

  SELECT * INTO v_mod FROM private.moderate_text(p_body);
  IF NOT v_mod.out_allowed THEN
    PERFORM private.record_moderation_block(p_guest_id,p_code,'message',v_mod.out_category,p_body);
    out_ok:=false;out_reason:=private.moderation_reason(v_mod.out_category);RETURN NEXT;RETURN;
  END IF;

  INSERT INTO public.messages(lobby_id,guest_id,nickname,team,body)
  VALUES(v_lobby_id,p_guest_id,v_nickname,v_team,trim(p_body));
  UPDATE public.participants SET last_seen_at=now()
  WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;
  PERFORM private.record_meaningful_lobby_activity(v_lobby_id);

  out_ok:=true;out_reason:=null;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_message(text,text,text,text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(text,text,text,text) TO anon;

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_code text,p_guest_id text,p_guest_secret text,p_message_id uuid,p_emoji text
)
RETURNS TABLE(out_ok boolean,out_reason text,out_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires timestamptz;
  v_exists uuid;
BEGIN
  IF p_emoji NOT IN ('GG','skull','salt','clown') THEN
    out_ok:=false;out_reason:='Invalid reaction.';out_active:=false;RETURN NEXT;RETURN;
  END IF;
  SELECT id,expires_at INTO v_lobby_id,v_expires FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';out_active:=false;RETURN NEXT;RETURN;END IF;
  IF v_expires<=now() THEN out_ok:=false;out_reason:='Lobby expired.';out_active:=false;RETURN NEXT;RETURN;END IF;
  IF NOT private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret) THEN
    out_ok:=false;out_reason:='Join the lobby first.';out_active:=false;RETURN NEXT;RETURN;
  END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'reaction',10,15,60,60) THEN
    out_ok:=false;out_reason:='Easy on the reactions — you are spamming the lobby.';out_active:=false;RETURN NEXT;RETURN;
  END IF;
  PERFORM 1 FROM public.messages m WHERE m.id=p_message_id AND m.lobby_id=v_lobby_id;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Message not in this lobby.';out_active:=false;RETURN NEXT;RETURN;END IF;

  SELECT id INTO v_exists
  FROM public.reactions r
  WHERE r.message_id=p_message_id AND r.guest_id=p_guest_id AND r.emoji=p_emoji;
  IF FOUND THEN
    DELETE FROM public.reactions WHERE id=v_exists;
    out_active:=false;
  ELSE
    INSERT INTO public.reactions(lobby_id,message_id,guest_id,emoji)
    VALUES(v_lobby_id,p_message_id,p_guest_id,p_emoji);
    out_active:=true;
  END IF;

  UPDATE public.participants SET last_seen_at=now()
  WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;
  PERFORM private.record_meaningful_lobby_activity(v_lobby_id);

  out_ok:=true;out_reason:=null;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_reaction(text,text,text,uuid,text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(text,text,text,uuid,text) TO anon;

CREATE OR REPLACE FUNCTION public.toggle_rematch_vote(
  p_code text,p_guest_id text,p_guest_secret text
)
RETURNS TABLE(out_ok boolean,out_reason text,out_active boolean,out_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_expires timestamptz;
  v_exists uuid;
  v_count int;
BEGIN
  SELECT id,expires_at INTO v_lobby_id,v_expires FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  IF v_expires<=now() THEN out_ok:=false;out_reason:='Lobby expired.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  IF NOT private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret) THEN
    out_ok:=false;out_reason:='Join the lobby first.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;
  END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'rematch',30,6,300,15) THEN
    out_ok:=false;out_reason:='Easy — you are hammering the rematch button.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;
  END IF;

  SELECT id INTO v_exists
  FROM public.rematch_votes r
  WHERE r.lobby_id=v_lobby_id AND r.guest_id=p_guest_id;
  IF FOUND THEN
    DELETE FROM public.rematch_votes WHERE id=v_exists;
    out_active:=false;
  ELSE
    INSERT INTO public.rematch_votes(lobby_id,guest_id)
    VALUES(v_lobby_id,p_guest_id);
    out_active:=true;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.rematch_votes WHERE lobby_id=v_lobby_id;
  UPDATE public.participants SET last_seen_at=now()
  WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;
  PERFORM private.record_meaningful_lobby_activity(v_lobby_id);

  out_ok:=true;out_reason:=null;out_count:=v_count;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_rematch_vote(text,text,text)
FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_rematch_vote(text,text,text) TO anon;
