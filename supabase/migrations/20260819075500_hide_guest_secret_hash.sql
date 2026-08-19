-- Hide participant credential hashes from anonymous/authenticated Data API reads.
-- RLS limits rows; column privileges limit which fields inside those rows are readable.

REVOKE SELECT ON TABLE public.participants FROM anon, authenticated;

GRANT SELECT (
  id,
  lobby_id,
  guest_id,
  nickname,
  team,
  joined_at,
  last_seen_at
) ON TABLE public.participants TO anon, authenticated;
