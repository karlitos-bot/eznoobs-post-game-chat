-- EZNOOBS v0.9 identity hardening.
-- Prevent visually deceptive usernames that differ only through invisible or
-- bidirectional formatting controls. Keep ZWJ/ZWNJ allowed for writing systems
-- that legitimately use them.

ALTER TABLE public.participants
  DROP CONSTRAINT IF EXISTS participants_username_safe_display;

ALTER TABLE public.participants
  ADD CONSTRAINT participants_username_safe_display
  CHECK (
    char_length(btrim(nickname)) BETWEEN 2 AND 20
    AND nickname !~ '[[:cntrl:]]'
    AND position(chr(8203) IN nickname) = 0   -- ZERO WIDTH SPACE
    AND position(chr(8206) IN nickname) = 0   -- LEFT-TO-RIGHT MARK
    AND position(chr(8207) IN nickname) = 0   -- RIGHT-TO-LEFT MARK
    AND position(chr(8234) IN nickname) = 0   -- LEFT-TO-RIGHT EMBEDDING
    AND position(chr(8235) IN nickname) = 0   -- RIGHT-TO-LEFT EMBEDDING
    AND position(chr(8236) IN nickname) = 0   -- POP DIRECTIONAL FORMATTING
    AND position(chr(8237) IN nickname) = 0   -- LEFT-TO-RIGHT OVERRIDE
    AND position(chr(8238) IN nickname) = 0   -- RIGHT-TO-LEFT OVERRIDE
    AND position(chr(8288) IN nickname) = 0   -- WORD JOINER
    AND position(chr(8294) IN nickname) = 0   -- LEFT-TO-RIGHT ISOLATE
    AND position(chr(8295) IN nickname) = 0   -- RIGHT-TO-LEFT ISOLATE
    AND position(chr(8296) IN nickname) = 0   -- FIRST STRONG ISOLATE
    AND position(chr(8297) IN nickname) = 0   -- POP DIRECTIONAL ISOLATE
    AND position(chr(65279) IN nickname) = 0  -- ZERO WIDTH NO-BREAK SPACE / BOM
  ) NOT VALID;

-- NOT VALID avoids failing deployment because of any short-lived pre-existing
-- development room. PostgreSQL still enforces the constraint for every new or
-- updated participant row immediately.
