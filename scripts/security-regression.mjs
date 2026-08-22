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

function sqlFunction(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0] ?? '';
}

const sourceFiles = walk('src').filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
const reviewedDangerousHtmlHelpers = new Set(['src/components/ui/chart.tsx']);
const applicationSourceFiles = sourceFiles.filter((file) => !reviewedDangerousHtmlHelpers.has(file));
const source = applicationSourceFiles.map((file) => `\n/* ${file} */\n${read(file)}`).join('\n');
const reviewedChartHelper = read('src/components/ui/chart.tsx');
const client = read('src/integrations/supabase/client.ts');
const room = read('src/routes/room.$code.tsx');
const server = read('src/server.ts');
const lobbyFunctions = read('src/lib/lobby.functions.ts');
const lobbyStateFunctions = read('src/lib/lobby-state.functions.ts');
const realtimeTokenFunctions = read('src/lib/realtime-token.functions.ts');
const secureRealtimeLayer = read('src/components/eznoobs/SecureRealtimeLayer.tsx');
const baseSchema = read('supabase/migrations/20260818105303_2c8cbfe8-37d8-4074-bb5e-c8c6fb0e1923.sql');
const reactionSchema = read('supabase/migrations/20260819053424_9bfc3cb3-81d0-492b-91f8-c15a7bf63d80.sql');
const guestHardening = read('supabase/migrations/20260819073500_guest_credential_hardening.sql');
const privacy = read('supabase/migrations/20260819122500_lock_down_room_reads.sql');
const credentialFunctions = read('supabase/migrations/20260819090500_move_guest_credentials_private.sql');
const moderation = read('supabase/migrations/20260819161000_moderation_and_abuse_protection.sql');
const lookup = read('supabase/migrations/20260820063000_rate_limit_lobby_lookup.sql');
const realtime = read('supabase/migrations/20260820045843_secure_realtime_channels.sql');
const usernames = read('supabase/migrations/20260820074500_unique_active_usernames.sql');
const legacyRevoke = read('supabase/migrations/20260820102000_revoke_legacy_participant_check.sql');
const authenticatedReadLimits = read('supabase/migrations/20260820111000_rate_limit_authenticated_room_reads.sql');
const usernameSafety = read('supabase/migrations/20260820113000_reject_invisible_username_spoofing.sql');
const cleanup = read('supabase/migrations/20260819124500_five_minute_ttl_and_cleanup.sql');
const activityLifetime = read('supabase/migrations/20260821050000_activity_driven_lobby_extension.sql');

check(!/dangerouslySetInnerHTML\s*=/.test(source), 'No dangerouslySetInnerHTML in EZNOOBS application source');
check(
  /dangerouslySetInnerHTML\s*=/.test(reviewedChartHelper) &&
    !/(?:from\s+["'][^"']*components\/ui\/chart["']|import\(["'][^"']*components\/ui\/chart["']\))/.test(source),
  'Reviewed shadcn chart HTML helper remains unused by EZNOOBS application code',
);
check(!/\b(?:RTCPeerConnection|webkitRTCPeerConnection|RTCDataChannel)\b/.test(source), 'No WebRTC/P2P browser APIs in application source');
check(!/sb_secret_[A-Za-z0-9_-]{8,}/.test(source), 'No Supabase secret key literal in client/server source');
check(!/service[_-]?role[^\n]{0,80}(?:eyJ|sb_secret_)/i.test(source), 'No service-role credential embedded in source');
check(!/throw\s+new\s+Error\(\s*error\.message\s*\)/.test(source), 'Browser-facing server functions do not expose raw backend error messages');
check(!/return\s+message\s*;/.test(lobbyFunctions), 'Lobby RPC error mapper never returns arbitrary database errors');

check(/PUBLIC_SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]sb_publishable_/.test(client), 'Browser client uses a publishable Supabase key');
check(client.includes("value.startsWith('sb_secret_')") && client.includes('must never be exposed to the browser'), 'Browser client rejects accidental Supabase secret keys');
check(/lobbyChannelName\(lobby\.code,\s*realtimeToken\)/.test(room), 'Room realtime subscription uses the joined-only tokenized topic');
check(!/\.channel\(\s*[`'"]room:/.test(room), 'Room route does not directly subscribe to a short-code-only realtime topic');
check(/sessionStorage\.setItem\(key,\s*token\)/.test(secureRealtimeLayer), 'Realtime token is stored in sessionStorage only');
check(!/localStorage\.setItem\([^\n]*realtime/i.test(secureRealtimeLayer), 'Realtime token is not persisted in localStorage');

check(room.includes('{m.body}'), 'Chat message body is rendered as React text');
check(room.includes('{m.nickname}'), 'Chat username is rendered as React text');
check(!/href=\{\s*m\.body\s*\}/.test(room), 'Chat message text is not treated as a clickable URL');

for (const header of [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Content-Security-Policy-Report-Only',
]) {
  check(server.includes(`"${header}"`), `Server sends ${header}`);
}

for (const directive of [
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
]) {
  check(server.includes(`"${directive}"`), `CSP report-only policy includes ${directive}`);
}
check(server.includes('https://*.supabase.co'), 'CSP report-only policy includes https://*.supabase.co');
check(server.includes('wss://*.supabase.co'), 'CSP report-only policy includes wss://*.supabase.co');
check(
  server.includes("\"connect-src 'self' https://*.supabase.co wss://*.supabase.co\""),
  'CSP report-only connect-src keeps Supabase HTTPS and WSS on the same directive',
);

for (const table of ['lobbies', 'messages', 'participants', 'reactions', 'rematch_votes', 'reports']) {
  check(
    privacy.includes(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM anon, authenticated;`),
    `Anonymous direct table privileges revoked for ${table}`,
  );
}

for (const signature of [
  'public.create_lobby(text, text, text, text)',
  'public.join_lobby(text, text, text, text)',
  'public.send_message(text, text, text)',
  'public.report_message(text, text, uuid, text)',
  'public.touch_presence(text, text)',
  'public.toggle_reaction(text, text, uuid, text)',
  'public.toggle_rematch_vote(text, text)',
  'public.leave_lobby(text, text)',
]) {
  check(
    guestHardening.includes(`DROP FUNCTION IF EXISTS ${signature};`),
    `Legacy no-secret RPC removed: ${signature}`,
  );
}

check(/p_guest_id\s+IS\s+NULL[\s\S]*p_guest_secret\s+IS\s+NULL/i.test(lookup), 'Lobby lookup requires a browser guest credential');
check(/consume_rate_limit\(p_guest_id,\s*'lobby_lookup',\s*60,\s*30,\s*600,\s*120\)/.test(lookup), 'Lobby lookup enumeration is rate limited');
check(/out_id\s*:=\s*NULL/.test(lookup) && /out_created_at\s*:=\s*NULL/.test(lookup) && /out_last_activity_at\s*:=\s*NULL/.test(lookup), 'Lobby lookup hides internal metadata');

check(realtime.includes('private.lobby_realtime_tokens'), 'Realtime room tokens live in the private schema');
check(realtime.includes('public.get_lobby_realtime_token'), 'Joined-only realtime token RPC exists');
check(/private\.guest_secret_matches\(v_lobby_id,\s*p_guest_id,\s*p_guest_secret\)/.test(realtime), 'Realtime token RPC validates participant credential');
check(/guestId:\s*guestSchema/.test(realtimeTokenFunctions), 'Realtime token server function requires a full guest credential');

for (const name of ['send_message', 'toggle_reaction', 'toggle_rematch_vote', 'report_message']) {
  const body = sqlFunction(moderation, name);
  check(body.length > 0, `${name} RPC definition is present in the hardened migration`);
  check(/private\.guest_secret_matches\(/.test(body), `${name} validates the participant guest secret`);
}

for (const name of ['touch_presence', 'leave_lobby']) {
  const body = sqlFunction(credentialFunctions, name);
  check(body.length > 0, `${name} RPC definition is present`);
  check(/private\.guest_secret_matches\(/.test(body), `${name} validates the participant guest secret`);
}

for (const [name, action] of [
  ['send_message', 'message'],
  ['toggle_reaction', 'reaction'],
  ['toggle_rematch_vote', 'rematch'],
  ['report_message', 'report'],
]) {
  check(
    sqlFunction(moderation, name).includes(`consume_rate_limit(p_guest_id,'${action}'`),
    `${name} has server-side abuse throttling`,
  );
}

for (const [name, action, limits] of [
  ['get_lobby_snapshot', 'snapshot', "10, 40, 60, 180"],
  ['touch_presence', 'presence', "60, 10, 3600, 60"],
  ['get_lobby_realtime_token', 'realtime_token', "10, 10, 600, 30"],
]) {
  const body = sqlFunction(authenticatedReadLimits, name);
  const credentialIndex = body.indexOf('private.guest_secret_matches');
  const limiterNeedle = `private.consume_rate_limit(p_guest_id, '${action}', ${limits})`;
  const limiterIndex = body.indexOf(limiterNeedle);
  check(body.length > 0, `${name} hardened RPC definition is present`);
  check(credentialIndex >= 0, `${name} validates the participant guest secret`);
  check(limiterIndex >= 0, `${name} has server-side abuse throttling`);
  check(credentialIndex >= 0 && limiterIndex > credentialIndex, `${name} throttles only after credential validation`);
}

check(/REVOKE EXECUTE ON FUNCTION public\.check_participant\(text, text, text\)[\s\S]*PUBLIC, anon, authenticated/.test(legacyRevoke), 'Obsolete check_participant RPC is no longer anonymously executable');

check(/lower\(btrim\(p\.nickname\)\)=lower\(v_nickname\)/.test(usernames), 'Active usernames are unique case-insensitively inside a lobby');
check(/pg_advisory_xact_lock/.test(usernames), 'Username claims are serialized against simultaneous joins');
check(lobbyFunctions.includes('\\u200B') && lobbyFunctions.includes('\\u202A-\\u202E') && lobbyFunctions.includes('\\u2066-\\u2069'), 'Server rejects invisible/bidirectional username spoofing characters');
check(usernameSafety.includes('participants_username_safe_display'), 'Database enforces safe-display usernames for participant writes');
check(usernameSafety.includes('position(chr(8203) IN nickname) = 0') && usernameSafety.includes('position(chr(8238) IN nickname) = 0') && usernameSafety.includes('position(chr(65279) IN nickname) = 0'), 'Database blocks zero-width and bidi override username tricks');

check(/body:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)/.test(lobbyFunctions), 'Message input is capped at 500 characters before RPC execution');
check(/max\(20\)/.test(lobbyFunctions), 'Username input is capped at 20 characters before RPC execution');
check(/reason:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)/.test(lobbyFunctions), 'Report reason is capped at 200 characters before RPC execution');
check(/guestId:\s*guestSchema/.test(lobbyStateFunctions), 'Lobby snapshot server function requires a full guest credential');

check(/lobby_id uuid NOT NULL REFERENCES public\.lobbies\(id\) ON DELETE CASCADE/.test(baseSchema), 'Participants/messages are anchored to lobby cascade deletion');
check((baseSchema.match(/REFERENCES public\.lobbies\(id\) ON DELETE CASCADE/g) ?? []).length >= 2, 'Both participants and messages cascade when a lobby is deleted');
check((reactionSchema.match(/REFERENCES public\.lobbies\(id\) ON DELETE CASCADE/g) ?? []).length >= 2, 'Reactions and rematch votes cascade when a lobby is deleted');
check(/REFERENCES public\.participants \(lobby_id, guest_id\)[\s\S]*ON DELETE CASCADE/.test(credentialFunctions), 'Private guest credentials cascade with participant deletion');
check(/lobby_id uuid primary key references public\.lobbies\(id\) on delete cascade/i.test(realtime), 'Private realtime token cascades with lobby deletion');
check(/reports_lobby_id_fkey[\s\S]*ON DELETE SET NULL/.test(cleanup), 'Reports detach safely from deleted lobbies');
check(/reports_message_id_fkey[\s\S]*ON DELETE SET NULL/.test(cleanup), 'Reports detach safely from deleted messages');
check(cleanup.includes('message_body text') && cleanup.includes('message_nickname text') && cleanup.includes('message_team text'), 'Reports preserve moderation evidence before temporary chat deletion');

check(/cron\.schedule\([\s\S]*eznoobs-purge-expired-lobbies[\s\S]*\* \* \* \* \*/.test(cleanup), 'Expired lobby hard-delete cron is declared');
check(/DELETE FROM public\.lobbies\s+WHERE expires_at <= now\(\)/.test(cleanup), 'Expired lobby cleanup hard-deletes lobby rows');
check(/v_max_expires_at\s*:=\s*v_lobby\.created_at[\s\S]*lobby_max_duration_minutes/.test(activityLifetime), 'Current room lifetime hard cap is anchored to original creation time');
check(/LEAST\([\s\S]*v_max_expires_at[\s\S]*v_lobby\.expires_at\s*\+/.test(activityLifetime), 'Activity extension is clamped to the configured absolute lifetime cap');

if (failures.length) {
  console.error(`\nEZNOOBS security regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS security regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
