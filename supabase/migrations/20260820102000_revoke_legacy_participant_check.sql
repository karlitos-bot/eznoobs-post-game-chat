-- Beta hardening: remove anonymous access to an obsolete participant-check RPC.
-- The current app uses get_lobby_entry/get_lobby_snapshot with guest credentials instead.

REVOKE EXECUTE ON FUNCTION public.check_participant(text, text, text)
FROM PUBLIC, anon, authenticated;
