-- Restore the private moderation feedback helper independently so a partial
-- safety migration cannot leak a raw PostgreSQL error to users.

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
