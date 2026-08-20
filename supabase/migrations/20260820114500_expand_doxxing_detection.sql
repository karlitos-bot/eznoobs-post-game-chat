-- EZNOOBS v0.9 moderation hardening.
-- Expand personal-data detection without turning ordinary numbers or @mentions
-- into blanket false positives. High-risk patterns are blocked only when they
-- appear in a contact/location-sharing context, except email addresses which
-- remain directly detectable.

CREATE OR REPLACE FUNCTION private.moderate_text(p_text text)
RETURNS TABLE(out_allowed boolean, out_category text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_words text;
  v_padded text;
  v_compact text;
  v_raw text := COALESCE(p_text, '');
  v_category text;
BEGIN
  v_words := private.normalize_moderation_words(v_raw);
  v_padded := ' ' || v_words || ' ';
  v_compact := replace(v_words, ' ', '');

  -- Email addresses are explicit contact information and do not need a context word.
  IF v_raw ~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}' THEN
    out_allowed := false;
    out_category := 'personal_data';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Phone-like numbers are blocked when the surrounding message clearly indicates
  -- contact sharing. Whole-word checks avoid matching harmless words like "headphone".
  IF (
      position(' phone ' in v_padded) > 0
      OR position(' call me ' in v_padded) > 0
      OR position(' text me ' in v_padded) > 0
      OR position(' whatsapp ' in v_padded) > 0
      OR position(' signal ' in v_padded) > 0
    )
    AND v_raw ~* '[+]?[0-9][0-9() .\-]{6,}[0-9]'
  THEN
    out_allowed := false;
    out_category := 'personal_data';
    RETURN NEXT;
    RETURN;
  END IF;

  -- IP addresses are only treated as personal-data exposure when someone explicitly
  -- frames the value as a person's IP, keeping ordinary technical/game discussion usable.
  IF (
      position(' your ip ' in v_padded) > 0
      OR position(' his ip ' in v_padded) > 0
      OR position(' her ip ' in v_padded) > 0
      OR position(' their ip ' in v_padded) > 0
      OR position(' my ip ' in v_padded) > 0
    )
    AND v_raw ~* '([0-9]{1,3}\.){3}[0-9]{1,3}'
  THEN
    out_allowed := false;
    out_category := 'personal_data';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Street-address pattern + explicit location-sharing context. Requiring both pieces
  -- keeps harmless map/game location talk from being blocked.
  IF (
      position(' address ' in v_padded) > 0
      OR position(' live at ' in v_padded) > 0
      OR position(' lives at ' in v_padded) > 0
    )
    AND lower(v_raw) ~ '[0-9]{1,6}[[:space:]]+[[:alnum:]][[:alnum:] .-]{1,60}[[:space:]](street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way)([[:space:],.]|$)'
  THEN
    out_allowed := false;
    out_category := 'personal_data';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Explicit social/contact-handle sharing. A plain @mention remains allowed; the
  -- platform/contact-service name must also be present as a whole word.
  IF (
      position(' discord ' in v_padded) > 0
      OR position(' instagram ' in v_padded) > 0
      OR position(' insta ' in v_padded) > 0
      OR position(' snapchat ' in v_padded) > 0
      OR position(' telegram ' in v_padded) > 0
      OR position(' tiktok ' in v_padded) > 0
      OR position(' twitter ' in v_padded) > 0
    )
    AND lower(v_raw) ~ '@[a-z0-9._-]{2,32}'
  THEN
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
      (t.match_mode='word' AND position(' ' || t.term || ' ' in v_padded) > 0)
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
