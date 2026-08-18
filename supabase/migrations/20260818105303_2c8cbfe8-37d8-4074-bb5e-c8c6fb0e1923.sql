
CREATE TABLE public.lobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  game text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '3 hours'
);

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  nickname text NOT NULL,
  team text NOT NULL CHECK (team IN ('blue','red','spectator')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lobby_id, guest_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_id uuid NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  guest_id text NOT NULL,
  nickname text NOT NULL,
  team text NOT NULL CHECK (team IN ('blue','red','spectator')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_lobby ON public.messages(lobby_id, created_at);
CREATE INDEX idx_participants_lobby ON public.participants(lobby_id);

GRANT SELECT ON public.lobbies TO anon, authenticated;
GRANT SELECT ON public.participants TO anon, authenticated;
GRANT SELECT ON public.messages TO anon, authenticated;
GRANT ALL ON public.lobbies TO service_role;
GRANT ALL ON public.participants TO service_role;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lobbies are readable by anyone with the link" ON public.lobbies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Participants are readable by anyone with the link" ON public.participants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Messages are readable by anyone with the link" ON public.messages FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
