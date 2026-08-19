-- EZNOOBS safety + abuse protection.
-- Keeps normal profanity/trash talk available while blocking high-confidence
-- protected-class hate, threats, doxxing/personal-data exposure and spam bursts.

CREATE TABLE IF NOT EXISTS private.moderation_terms (
  term text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('hate','threat','personal_data')),
  match_mode text NOT NULL CHECK (match_mode IN ('word','phrase','compact')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.moderation_terms FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.moderation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guest_id text NOT NULL,
  lobby_code text,
  context text NOT NULL CHECK (context IN ('nickname','message')),
  category text NOT NULL CHECK (category IN ('hate','threat','personal_data')),
  body_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS moderation_events_guest_created_idx
  ON private.moderation_events (guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_events_expires_idx
  ON private.moderation_events (expires_at);
REVOKE ALL ON TABLE private.moderation_events FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guest_id text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limit_events_guest_action_created_idx
  ON private.rate_limit_events (guest_id, action, created_at DESC);
REVOKE ALL ON TABLE private.rate_limit_events FROM PUBLIC, anon, authenticated;

INSERT INTO private.moderation_terms(term, category, match_mode) VALUES
  ('nigger','hate','compact'),
  ('nigga','hate','compact'),
  ('faggot','hate','compact'),
  ('tranny','hate','compact'),
  ('kike','hate','compact'),
  ('chink','hate','compact'),
  ('wetback','hate','compact'),
  ('raghead','hate','compact'),
  ('sandnigger','hate','compact'),
  ('jewboy','hate','compact'),
  ('femoid','hate','compact'),
  ('dyke','hate','word'),
  ('retard','hate','word'),
  ('retarded','hate','word'),
  ('dirty jew','hate','phrase'),
  ('dirty muslim','hate','phrase'),
  ('dirty christian','hate','phrase'),
  ('dirty hindu','hate','phrase'),
  ('dirty sikh','hate','phrase'),
  ('christ killer','hate','phrase'),
  ('women belong in the kitchen','hate','phrase'),
  ('go back to the kitchen','hate','phrase'),
  ('women shouldnt play games','hate','phrase'),
  ('girls shouldnt play games','hate','phrase'),
  ('kill yourself','threat','phrase'),
  ('kys','threat','word'),
  ('i will kill you','threat','phrase'),
  ('ill kill you','threat','phrase'),
  ('im going to kill you','threat','phrase'),
  ('i know where you live','threat','phrase'),
  ('ill find you','threat','phrase'),
  ('dox you','threat','phrase'),
  ('doxx you','threat','phrase'),
  ('swat you','threat','phrase'),
  ('rape you','threat','phrase'),
  ('your address is','personal_data','phrase'),
  ('his address is','personal_data','phrase'),
  ('her address is','personal_data','phrase'),
  ('their address is','personal_data','phrase'),
  ('your phone number is','personal_data','phrase'),
  ('his phone number is','personal_data','phrase'),
  ('her phone number is','personal_data','phrase')
ON CONFLICT (term) DO UPDATE
SET category=excluded.category, match_mode=excluded.match_mode, active=true;

CREATE OR REPLACE FUNCTION private.normalize_moderation_words(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v text;
BEGIN
  v := lower(COALESCE(p_text,''));
  v := regexp_replace(v, '[''’`]', '', 'g');
  v := translate(v, '0134578@$!', 'oieastbasi');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  RETURN trim(regexp_replace(v, '[[:space:]]+', ' ', 'g'));
END;
$$;
REVOKE ALL ON FUNCTION private.normalize_moderation_words(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.moderate_text(p_text text)
RETURNS TABLE(out_allowed boolean, out_category text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_words text;
  v_compact text;
  v_category text;
BEGIN
  v_words := private.normalize_moderation_words(p_text);
  v_compact := replace(v_words, ' ', '');

  IF COALESCE(p_text,'') ~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}' THEN
    out_allowed := false;
    out_category := 'personal_data';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT t.category
  INTO v_category
  FROM private.moderation_terms t
  WHERE t.active
    AND (
      (t.match_mode='word' AND position(' ' || t.term || ' ' in ' ' || v_words || ' ') > 0)
      OR (t.match_mode='phrase' AND position(t.term in v_words) > 0)
      OR (t.match_mode='compact' AND position(t.term in v_compact) > 0)
    )
  ORDER BY CASE t.category WHEN 'threat' THEN 3 WHEN 'personal_data' THEN 2 ELSE 1 END DESC
  LIMIT 1;

  IF FOUND THEN
    out_allowed := false;
    out_category := v_category;
    RETURN NEXT;
    RETURN;
  END IF;

  out_allowed := true;
  out_category := NULL;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION private.moderate_text(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.moderation_reason(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_category
    WHEN 'hate' THEN 'Keep the trash talk about the game — hate targeting race, sex, religion or identity is not allowed.'
    WHEN 'threat' THEN 'Threats, doxxing and real-world intimidation are not part of EZNOOBS.'
    WHEN 'personal_data' THEN 'Do not post personal contact or location information in the lobby.'
    ELSE 'That message crosses the EZNOOBS safety line.'
  END;
$$;
REVOKE ALL ON FUNCTION private.moderation_reason(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_moderation_block(
  p_guest_id text,
  p_lobby_code text,
  p_context text,
  p_category text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.moderation_events(guest_id,lobby_code,context,category,body_excerpt)
  VALUES(p_guest_id,p_lobby_code,p_context,p_category,left(COALESCE(p_body,''),180));

  IF random() < 0.03 THEN
    DELETE FROM private.moderation_events WHERE expires_at <= now();
    DELETE FROM private.rate_limit_events WHERE created_at < now() - interval '24 hours';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.record_moderation_block(text,text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.moderation_cooldown_active(p_guest_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) >= 3
  FROM private.moderation_events e
  WHERE e.guest_id=p_guest_id
    AND e.created_at >= now() - interval '2 minutes';
$$;
REVOKE ALL ON FUNCTION private.moderation_cooldown_active(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.consume_rate_limit(
  p_guest_id text,
  p_action text,
  p_short_seconds integer,
  p_short_max integer,
  p_long_seconds integer,
  p_long_max integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_short integer;
  v_long integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_guest_id),
    pg_catalog.hashtext(p_action)
  );

  SELECT
    count(*) FILTER (WHERE created_at >= now() - make_interval(secs => p_short_seconds)),
    count(*) FILTER (WHERE created_at >= now() - make_interval(secs => p_long_seconds))
  INTO v_short, v_long
  FROM private.rate_limit_events
  WHERE guest_id=p_guest_id AND action=p_action;

  IF v_short >= p_short_max OR v_long >= p_long_max THEN
    RETURN false;
  END IF;

  INSERT INTO private.rate_limit_events(guest_id,action)
  VALUES(p_guest_id,p_action);

  IF random() < 0.02 THEN
    DELETE FROM private.rate_limit_events WHERE created_at < now() - interval '24 hours';
    DELETE FROM private.moderation_events WHERE expires_at <= now();
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION private.consume_rate_limit(text,text,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_lobby(
  p_game text,
  p_guest_id text,
  p_guest_secret text,
  p_nickname text,
  p_team text
)
RETURNS TABLE(out_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code text;
  v_lobby_id uuid;
  v_attempt int;
  v_hash text;
  v_mod RECORD;
BEGIN
  IF char_length(p_game)<2 OR char_length(p_game)>40 THEN RETURN; END IF;
  IF char_length(p_nickname)<2 OR char_length(p_nickname)>20 THEN RETURN; END IF;
  IF p_team NOT IN ('blue','red','spectator') THEN RETURN; END IF;
  IF char_length(p_guest_id)<8 OR char_length(p_guest_id)>64 OR char_length(p_guest_secret)<20 OR char_length(p_guest_secret)>100 THEN RETURN; END IF;

  IF NOT private.consume_rate_limit(p_guest_id,'create_lobby',60,6,3600,30) THEN
    RETURN;
  END IF;

  SELECT * INTO v_mod FROM private.moderate_text(p_nickname);
  IF NOT v_mod.out_allowed THEN
    PERFORM private.record_moderation_block(p_guest_id,NULL,'nickname',v_mod.out_category,p_nickname);
    RETURN;
  END IF;

  v_hash:=encode(extensions.digest(p_guest_secret,'sha256'),'hex');
  FOR v_attempt IN 1..8 LOOP
    v_code:=public.generate_room_code();
    BEGIN
      INSERT INTO public.lobbies(code,game,max_players)
      VALUES(v_code,p_game,private.default_lobby_capacity(p_game))
      RETURNING id INTO v_lobby_id;

      INSERT INTO public.participants(lobby_id,guest_id,nickname,team)
      VALUES(v_lobby_id,p_guest_id,p_nickname,p_team);
      INSERT INTO private.participant_credentials(lobby_id,guest_id,guest_secret_hash)
      VALUES(v_lobby_id,p_guest_id,v_hash);

      out_code:=v_code;RETURN NEXT;RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  RETURN;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_lobby(text,text,text,text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_lobby(text,text,text,text,text) TO anon;

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
BEGIN
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN out_ok:=false;out_reason:='Invalid room code.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;
  IF char_length(p_nickname)<2 OR char_length(p_nickname)>20 THEN out_ok:=false;out_reason:='Nickname must be 2-20 characters.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;
  IF p_team NOT IN ('blue','red','spectator') THEN out_ok:=false;out_reason:='Invalid team.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;
  IF char_length(p_guest_id)<8 OR char_length(p_guest_id)>64 OR char_length(p_guest_secret)<20 OR char_length(p_guest_secret)>100 THEN out_ok:=false;out_reason:='Invalid guest credential.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;

  IF NOT private.consume_rate_limit(p_guest_id,'join_lobby',60,15,600,50) THEN
    out_ok:=false;out_reason:='Slow down — too many join attempts.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  SELECT * INTO v_mod FROM private.moderate_text(p_nickname);
  IF NOT v_mod.out_allowed THEN
    PERFORM private.record_moderation_block(p_guest_id,p_code,'nickname',v_mod.out_category,p_nickname);
    out_ok:=false;out_reason:=private.moderation_reason(v_mod.out_category);out_code:=null;out_game:=null;RETURN NEXT;RETURN;
  END IF;

  SELECT * INTO v_lobby FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='This lobby does not exist.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;
  IF v_lobby.expires_at<=now() THEN out_ok:=false;out_reason:='This lobby has expired.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;END IF;

  v_hash:=encode(extensions.digest(p_guest_secret,'sha256'),'hex');
  SELECT pc.guest_secret_hash INTO v_existing_hash
  FROM public.participants p
  LEFT JOIN private.participant_credentials pc
    ON pc.lobby_id=p.lobby_id AND pc.guest_id=p.guest_id
  WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;

  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      out_ok:=false;out_reason:='Guest credential mismatch.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
    END IF;
    UPDATE public.participants p
    SET nickname=p_nickname,team=p_team,last_seen_at=now()
    WHERE p.lobby_id=v_lobby.id AND p.guest_id=p_guest_id;
  ELSE
    SELECT count(*)::integer INTO v_active_count
    FROM public.participants p
    WHERE p.lobby_id=v_lobby.id AND p.last_seen_at>now()-interval '3 minutes';

    IF v_active_count>=v_lobby.max_players THEN
      out_ok:=false;out_reason:='This lobby is full.';out_code:=null;out_game:=null;RETURN NEXT;RETURN;
    END IF;

    INSERT INTO public.participants(lobby_id,guest_id,nickname,team,last_seen_at)
    VALUES(v_lobby.id,p_guest_id,p_nickname,p_team,now());
    INSERT INTO private.participant_credentials(lobby_id,guest_id,guest_secret_hash)
    VALUES(v_lobby.id,p_guest_id,v_hash);
  END IF;

  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby.id;
  out_ok:=true;out_reason:=null;out_code:=v_lobby.code;out_game:=v_lobby.game;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.join_lobby(text,text,text,text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.join_lobby(text,text,text,text,text) TO anon;

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
  IF p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$' THEN out_ok:=false;out_reason:='Invalid room code.';RETURN NEXT;RETURN;END IF;
  IF p_body IS NULL OR char_length(trim(p_body))<1 OR char_length(p_body)>500 THEN out_ok:=false;out_reason:='Message must be 1-500 characters.';RETURN NEXT;RETURN;END IF;

  SELECT id,expires_at INTO v_lobby_id,v_expires_at FROM public.lobbies WHERE code=p_code;
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
  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby_id;
  UPDATE public.participants SET last_seen_at=now()
  WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;

  out_ok:=true;out_reason:=null;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.send_message(text,text,text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.send_message(text,text,text,text) TO anon;

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_code text,p_guest_id text,p_guest_secret text,p_message_id uuid,p_emoji text
)
RETURNS TABLE(out_ok boolean,out_reason text,out_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_lobby_id uuid;v_expires timestamptz;v_exists uuid;
BEGIN
  IF p_emoji NOT IN ('GG','skull','salt','clown') THEN out_ok:=false;out_reason:='Invalid reaction.';out_active:=false;RETURN NEXT;RETURN;END IF;
  SELECT id,expires_at INTO v_lobby_id,v_expires FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';out_active:=false;RETURN NEXT;RETURN;END IF;
  IF v_expires<=now() THEN out_ok:=false;out_reason:='Lobby expired.';out_active:=false;RETURN NEXT;RETURN;END IF;
  IF NOT private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret) THEN out_ok:=false;out_reason:='Join the lobby first.';out_active:=false;RETURN NEXT;RETURN;END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'reaction',10,15,60,60) THEN out_ok:=false;out_reason:='Easy on the reactions — you are spamming the lobby.';out_active:=false;RETURN NEXT;RETURN;END IF;
  PERFORM 1 FROM public.messages m WHERE m.id=p_message_id AND m.lobby_id=v_lobby_id;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Message not in this lobby.';out_active:=false;RETURN NEXT;RETURN;END IF;
  SELECT id INTO v_exists FROM public.reactions r WHERE r.message_id=p_message_id AND r.guest_id=p_guest_id AND r.emoji=p_emoji;
  IF FOUND THEN DELETE FROM public.reactions WHERE id=v_exists;out_active:=false;
  ELSE INSERT INTO public.reactions(lobby_id,message_id,guest_id,emoji) VALUES(v_lobby_id,p_message_id,p_guest_id,p_emoji);out_active:=true;
  END IF;
  UPDATE public.participants SET last_seen_at=now() WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;
  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby_id;
  out_ok:=true;out_reason:=null;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_reaction(text,text,text,uuid,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(text,text,text,uuid,text) TO anon;

CREATE OR REPLACE FUNCTION public.toggle_rematch_vote(
  p_code text,p_guest_id text,p_guest_secret text
)
RETURNS TABLE(out_ok boolean,out_reason text,out_active boolean,out_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_lobby_id uuid;v_expires timestamptz;v_exists uuid;v_count int;
BEGIN
  SELECT id,expires_at INTO v_lobby_id,v_expires FROM public.lobbies WHERE code=p_code;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  IF v_expires<=now() THEN out_ok:=false;out_reason:='Lobby expired.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  IF NOT private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret) THEN out_ok:=false;out_reason:='Join the lobby first.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'rematch',30,6,300,15) THEN out_ok:=false;out_reason:='Easy — you are hammering the rematch button.';out_active:=false;out_count:=0;RETURN NEXT;RETURN;END IF;
  SELECT id INTO v_exists FROM public.rematch_votes r WHERE r.lobby_id=v_lobby_id AND r.guest_id=p_guest_id;
  IF FOUND THEN DELETE FROM public.rematch_votes WHERE id=v_exists;out_active:=false;
  ELSE INSERT INTO public.rematch_votes(lobby_id,guest_id) VALUES(v_lobby_id,p_guest_id);out_active:=true;
  END IF;
  SELECT count(*)::int INTO v_count FROM public.rematch_votes WHERE lobby_id=v_lobby_id;
  UPDATE public.participants SET last_seen_at=now() WHERE lobby_id=v_lobby_id AND guest_id=p_guest_id;
  UPDATE public.lobbies SET last_activity_at=now() WHERE id=v_lobby_id;
  out_ok:=true;out_reason:=null;out_count:=v_count;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.toggle_rematch_vote(text,text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_rematch_vote(text,text,text) TO anon;

CREATE OR REPLACE FUNCTION public.report_message(
  p_code text,p_guest_id text,p_guest_secret text,p_message_id uuid,p_reason text
)
RETURNS TABLE(out_ok boolean,out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_lobby_id uuid;v_msg RECORD;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE code=p_code AND expires_at>now();
  IF NOT FOUND THEN out_ok:=false;out_reason:='Lobby not found.';RETURN NEXT;RETURN;END IF;
  IF NOT private.guest_secret_matches(v_lobby_id,p_guest_id,p_guest_secret) THEN out_ok:=false;out_reason:='Join the lobby first.';RETURN NEXT;RETURN;END IF;
  IF NOT private.consume_rate_limit(p_guest_id,'report',60,5,300,15) THEN out_ok:=false;out_reason:='Slow down — too many reports at once.';RETURN NEXT;RETURN;END IF;
  SELECT id,guest_id,nickname,team,body INTO v_msg FROM public.messages m WHERE m.id=p_message_id AND m.lobby_id=v_lobby_id;
  IF NOT FOUND THEN out_ok:=false;out_reason:='Message not found.';RETURN NEXT;RETURN;END IF;
  IF v_msg.guest_id=p_guest_id THEN out_ok:=false;out_reason:='You cannot report your own message.';RETURN NEXT;RETURN;END IF;
  BEGIN
    INSERT INTO public.reports(lobby_id,message_id,reporter_guest_id,reported_guest_id,reason,lobby_code,message_body,message_nickname,message_team)
    VALUES(v_lobby_id,v_msg.id,p_guest_id,v_msg.guest_id,left(p_reason,200),p_code,v_msg.body,v_msg.nickname,v_msg.team);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  out_ok:=true;out_reason:=null;RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.report_message(text,text,text,uuid,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.report_message(text,text,text,uuid,text) TO anon;