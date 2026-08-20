import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}

function check(condition, label) {
  if (condition) passes.push(label);
  else failures.push(label);
}

const sourceFiles = walk('src').filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
const source = sourceFiles.map((file) => `\n/* ${file} */\n${read(file)}`).join('\n');
const client = read('src/integrations/supabase/client.ts');
const room = read('src/routes/room.$code.tsx');
const server = read('src/server.ts');
const privacy = read('supabase/migrations/20260819122500_lock_down_room_reads.sql');
const lookup = read('supabase/migrations/20260820063000_rate_limit_lobby_lookup.sql');
const realtime = read('supabase/migrations/20260820045843_secure_realtime_channels.sql');
const usernames = read('supabase/migrations/20260820074500_unique_active_usernames.sql');
const cleanup = read('supabase/migrations/20260819124500_five_minute_ttl_and_cleanup.sql');
const fixedLifetime = read('supabase/migrations/20260819143000_fixed_lobby_lifetime_and_capacity.sql');

check(!/dangerouslySetInnerHTML\s*=/.test(source), 'No dangerouslySetInnerHTML in application source');
check(!/\b(?:RTCPeerConnection|webkitRTCPeerConnection|RTCDataChannel)\b/.test(source), 'No WebRTC/P2P browser APIs in application source');
check(!/sb_secret_[A-Za-z0-9_-]{8,}/.test(source), 'No Supabase secret key literal in client/server source');
check(!/service[_-]?role[^\n]{0,80}(?:eyJ|sb_secret_)/i.test(source), 'No service-role credential embedded in source');

check(/PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]sb_publishable_/.test(client), 'Browser client uses a publishable Supabase key');
check(/lobbyChannelName\(lobby\.code,\s*realtimeToken\)/.test(room), 'Room realtime subscription uses the joined-only tokenized topic');
check(!/\.channel\(\s*[`'"]room:/.test(room), 'Room route does not directly subscribe to a short-code-only realtime topic');

for (const header of [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
]) {
  check(server.includes(`"${header}"`), `Server sends ${header}`);
}

for (const table of ['lobbies', 'messages', 'participants', 'reactions', 'rematch_votes', 'reports']) {
  check(
    privacy.includes(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM anon, authenticated;`),
    `Anonymous direct table privileges revoked for ${table}`,
  );
}

check(/p_guest_id\s+IS\s+NULL[\s\S]*p_guest_secret\s+IS\s+NULL/i.test(lookup), 'Lobby lookup requires a browser guest credential');
check(/consume_rate_limit\(p_guest_id,\s*'lobby_lookup',\s*60,\s*30,\s*600,\s*120\)/.test(lookup), 'Lobby lookup enumeration is rate limited');
check(/out_id\s*:=\s*NULL/.test(lookup) && /out_created_at\s*:=\s*NULL/.test(lookup) && /out_last_activity_at\s*:=\s*NULL/.test(lookup), 'Lobby lookup hides internal metadata');

check(realtime.includes('private.lobby_realtime_tokens'), 'Realtime room tokens live in the private schema');
check(realtime.includes('public.get_lobby_realtime_token'), 'Joined-only realtime token RPC exists');
check(/private\.guest_secret_matches\(v_lobby_id,\s*p_guest_id,\s*p_guest_secret\)/.test(realtime), 'Realtime token RPC validates participant credential');

check(/lower\(btrim\(p\.nickname\)\)=lower\(v_nickname\)/.test(usernames), 'Active usernames are unique case-insensitively inside a lobby');
check(/pg_advisory_xact_lock/.test(usernames), 'Username claims are serialized against simultaneous joins');

check(/cron\.schedule\([\s\S]*eznoobs-purge-expired-lobbies[\s\S]*\* \* \* \* \*/.test(cleanup), 'Expired lobby hard-delete cron is declared');
check(/DELETE FROM public\.lobbies\s+WHERE expires_at <= now\(\)/.test(cleanup), 'Expired lobby cleanup hard-deletes lobby rows');
check(/NEW\.expires_at\s*:=\s*NEW\.created_at\s*\+/.test(fixedLifetime), 'Lobby expiry is anchored to creation time');
check(/NEW\.expires_at\s*:=\s*OLD\.expires_at/.test(fixedLifetime), 'Lobby expiry cannot be extended by activity updates');

if (failures.length) {
  console.error(`\nEZNOOBS security regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS security regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
