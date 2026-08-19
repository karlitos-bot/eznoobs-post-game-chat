-- Room-scoped realtime foundation for EZNOOBS.
-- This does not revoke the current public SELECT grants yet; the frontend will be
-- switched to authenticated snapshots + broadcasts first, then broad reads can
-- be removed without breaking active rooms.

CREATE OR REPLACE FUNCTION private.broadcast_lobby_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lobby_id uuid;
  v_code text;
BEGIN
  IF TG_TABLE_NAME = 'lobbies' THEN
    v_lobby_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    v_code := CASE WHEN TG_OP = 'DELETE' THEN OLD.code ELSE NEW.code END;
  ELSE
    v_lobby_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.lobby_id ELSE NEW.lobby_id END;
    SELECT code INTO v_code
    FROM public.lobbies
    WHERE id = v_lobby_id;
  END IF;

  IF v_code IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'lobby_id', v_lobby_id
      ),
      'db-change',
      'room:' || v_code,
      false
    );
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_lobby_change()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS eznoobs_broadcast_messages ON public.messages;
CREATE TRIGGER eznoobs_broadcast_messages
AFTER INSERT OR UPDATE OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.broadcast_lobby_change();

DROP TRIGGER IF EXISTS eznoobs_broadcast_participants ON public.participants;
CREATE TRIGGER eznoobs_broadcast_participants
AFTER INSERT OR UPDATE OR DELETE ON public.participants
FOR EACH ROW EXECUTE FUNCTION private.broadcast_lobby_change();

DROP TRIGGER IF EXISTS eznoobs_broadcast_reactions ON public.reactions;
CREATE TRIGGER eznoobs_broadcast_reactions
AFTER INSERT OR UPDATE OR DELETE ON public.reactions
FOR EACH ROW EXECUTE FUNCTION private.broadcast_lobby_change();

DROP TRIGGER IF EXISTS eznoobs_broadcast_rematch_votes ON public.rematch_votes;
CREATE TRIGGER eznoobs_broadcast_rematch_votes
AFTER INSERT OR UPDATE OR DELETE ON public.rematch_votes
FOR EACH ROW EXECUTE FUNCTION private.broadcast_lobby_change();

DROP TRIGGER IF EXISTS eznoobs_broadcast_lobbies ON public.lobbies;
CREATE TRIGGER eznoobs_broadcast_lobbies
AFTER INSERT OR UPDATE OR DELETE ON public.lobbies
FOR EACH ROW EXECUTE FUNCTION private.broadcast_lobby_change();
