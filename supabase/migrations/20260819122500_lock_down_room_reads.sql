-- EZNOOBS room privacy cutover.
-- Joined clients now load lobby state through participant-authenticated server snapshots
-- and use room-code-scoped Realtime Broadcast only as an invalidation signal.
-- The browser no longer needs direct Data API SELECT access to room tables.

REVOKE ALL PRIVILEGES ON TABLE public.lobbies FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.messages FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.participants FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.reactions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.rematch_votes FROM anon, authenticated;

-- Remove permissive read policies as defense-in-depth. Server-side service access and
-- SECURITY DEFINER RPCs remain the only data paths for the no-account MVP.
DROP POLICY IF EXISTS "Lobbies are readable by anyone with the link" ON public.lobbies;
DROP POLICY IF EXISTS "Messages are readable by anyone with the link" ON public.messages;
DROP POLICY IF EXISTS "Participants are readable by anyone with the link" ON public.participants;
DROP POLICY IF EXISTS "Reactions readable by anyone with the link" ON public.reactions;
DROP POLICY IF EXISTS "Rematch votes readable by anyone with the link" ON public.rematch_votes;

-- Reports must never be readable from the public client.
REVOKE ALL PRIVILEGES ON TABLE public.reports FROM anon, authenticated;
