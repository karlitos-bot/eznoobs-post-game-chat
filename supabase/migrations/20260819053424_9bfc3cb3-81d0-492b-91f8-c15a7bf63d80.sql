-- Reactions
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reactions_emoji_check CHECK (emoji IN ('GG','skull','salt','clown')),
  CONSTRAINT reactions_unique UNIQUE (message_id, guest_id, emoji)
);
CREATE INDEX IF NOT EXISTS reactions_lobby_idx ON public.reactions(lobby_id);
CREATE INDEX IF NOT EXISTS reactions_message_idx ON public.reactions(message_id);

GRANT SELECT ON public.reactions TO anon, authenticated;
GRANT ALL ON public.reactions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.reactions FROM anon, authenticated;
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reactions readable by anyone with the link" ON public.reactions;
CREATE POLICY "Reactions readable by anyone with the link" ON public.reactions FOR SELECT TO anon, authenticated USING (true);

-- Rematch votes
CREATE TABLE IF NOT EXISTS public.rematch_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rematch_votes_unique UNIQUE (lobby_id, guest_id)
);
CREATE INDEX IF NOT EXISTS rematch_votes_lobby_idx ON public.rematch_votes(lobby_id);

GRANT SELECT ON public.rematch_votes TO anon, authenticated;
GRANT ALL ON public.rematch_votes TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.rematch_votes FROM anon, authenticated;
ALTER TABLE public.rematch_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Rematch votes readable by anyone with the link" ON public.rematch_votes;
CREATE POLICY "Rematch votes readable by anyone with the link" ON public.rematch_votes FOR SELECT TO anon, authenticated USING (true);

-- Presence index
CREATE INDEX IF NOT EXISTS participants_lobby_seen_idx ON public.participants(lobby_id, last_seen_at);

-- Realtime
ALTER TABLE public.reactions REPLICA IDENTITY FULL;
ALTER TABLE public.rematch_votes REPLICA IDENTITY FULL;
DO $do$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rematch_votes; EXCEPTION WHEN duplicate_object THEN NULL; END;
END
$do$;

-- Toggle reaction
CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_code text, p_guest_id text, p_message_id uuid, p_emoji text
)
RETURNS TABLE(out_ok boolean, out_reason text, out_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid; v_expires timestamptz; v_exists uuid;
BEGIN
  IF p_emoji NOT IN ('GG','skull','salt','clown') THEN
    out_ok := false; out_reason := 'Invalid reaction.'; out_active := false; RETURN NEXT; RETURN;
  END IF;
  SELECT id, expires_at INTO v_lobby_id, v_expires FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.'; out_active := false; RETURN NEXT; RETURN;
  END IF;
  IF v_expires < now() THEN
    out_ok := false; out_reason := 'Lobby expired.'; out_active := false; RETURN NEXT; RETURN;
  END IF;
  PERFORM 1 FROM public.participants
    WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; RETURN NEXT; RETURN;
  END IF;
  PERFORM 1 FROM public.messages
    WHERE public.messages.id = p_message_id AND public.messages.lobby_id = v_lobby_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Message not in this lobby.'; out_active := false; RETURN NEXT; RETURN;
  END IF;

  SELECT id INTO v_exists FROM public.reactions
    WHERE public.reactions.message_id = p_message_id
      AND public.reactions.guest_id = p_guest_id
      AND public.reactions.emoji = p_emoji;

  IF FOUND THEN
    DELETE FROM public.reactions WHERE public.reactions.id = v_exists;
    out_active := false;
  ELSE
    INSERT INTO public.reactions (lobby_id, message_id, guest_id, emoji)
    VALUES (v_lobby_id, p_message_id, p_guest_id, p_emoji);
    out_active := true;
  END IF;

  UPDATE public.participants SET last_seen_at = now()
    WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;
  UPDATE public.lobbies SET last_activity_at = now() WHERE public.lobbies.id = v_lobby_id;

  out_ok := true; out_reason := null; RETURN NEXT;
END;
$$;

-- Toggle rematch vote
CREATE OR REPLACE FUNCTION public.toggle_rematch_vote(p_code text, p_guest_id text)
RETURNS TABLE(out_ok boolean, out_reason text, out_active boolean, out_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid; v_expires timestamptz; v_exists uuid; v_count int;
BEGIN
  SELECT id, expires_at INTO v_lobby_id, v_expires FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Lobby not found.'; out_active := false; out_count := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_expires < now() THEN
    out_ok := false; out_reason := 'Lobby expired.'; out_active := false; out_count := 0; RETURN NEXT; RETURN;
  END IF;
  PERFORM 1 FROM public.participants
    WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;
  IF NOT FOUND THEN
    out_ok := false; out_reason := 'Join the lobby first.'; out_active := false; out_count := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT id INTO v_exists FROM public.rematch_votes
    WHERE public.rematch_votes.lobby_id = v_lobby_id AND public.rematch_votes.guest_id = p_guest_id;
  IF FOUND THEN
    DELETE FROM public.rematch_votes WHERE public.rematch_votes.id = v_exists;
    out_active := false;
  ELSE
    INSERT INTO public.rematch_votes (lobby_id, guest_id) VALUES (v_lobby_id, p_guest_id);
    out_active := true;
  END IF;

  SELECT count(*)::int INTO v_count FROM public.rematch_votes
    WHERE public.rematch_votes.lobby_id = v_lobby_id;

  UPDATE public.participants SET last_seen_at = now()
    WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;

  out_ok := true; out_reason := null; out_count := v_count; RETURN NEXT;
END;
$$;

-- Leave lobby: mark inactive without deleting history
CREATE OR REPLACE FUNCTION public.leave_lobby(p_code text, p_guest_id text)
RETURNS TABLE(out_ok boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
BEGIN
  SELECT id INTO v_lobby_id FROM public.lobbies WHERE public.lobbies.code = p_code;
  IF NOT FOUND THEN
    out_ok := false; RETURN NEXT; RETURN;
  END IF;
  UPDATE public.participants
    SET last_seen_at = now() - interval '1 day'
    WHERE public.participants.lobby_id = v_lobby_id AND public.participants.guest_id = p_guest_id;
  DELETE FROM public.rematch_votes
    WHERE public.rematch_votes.lobby_id = v_lobby_id AND public.rematch_votes.guest_id = p_guest_id;
  out_ok := true; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_reaction(text, text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_rematch_vote(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.leave_lobby(text, text) TO anon;