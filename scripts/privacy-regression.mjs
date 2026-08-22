import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function check(condition, label) {
  if (condition) passes.push(label);
  else failures.push(label);
}

const identity = read('src/lib/eznoobs.ts');
const diagnostics = read('src/lib/lovable-error-reporting.ts');
const privacy = read('src/routes/privacy.tsx');
const server = read('src/server.ts');
const styles = read('src/styles.css');
const robots = read('public/robots.txt');
const room = read('src/routes/room.$code.tsx');
const gate = read('src/components/eznoobs/FirstUseSafetyGate.tsx');
const runbackMigration = read('supabase/migrations/20260821101500_runback_successor_lobbies.sql');
const roomReadLock = read('supabase/migrations/20260819122500_lock_down_room_reads.sql');

check(identity.includes('memoryGuestCredential'), 'Guest identity has an in-memory storage fallback');
check(identity.includes('try {') && identity.includes('window.localStorage.getItem(key)') && identity.includes('window.localStorage.setItem(key, value)'), 'Browser preference storage is guarded against blocked localStorage');
check(privacy.includes("remains in your browser's local storage until you clear EZNOOBS site data"), 'Privacy wording matches persistent browser guest identity');

check(diagnostics.includes('redactRoomCode'), 'Client diagnostics redact temporary room codes');
check(diagnostics.includes('/room/[code]'), 'Room-code telemetry redaction uses a fixed placeholder');
check(!diagnostics.includes('route: window.location.pathname'), 'Raw room pathname is not sent as telemetry context');

check(server.includes('Cache-Control') && server.includes('no-store, max-age=0'), 'Private surfaces receive no-store cache policy');
check(server.includes('X-Robots-Tag') && server.includes('noindex, nofollow, noarchive'), 'Private surfaces receive crawler-blocking response headers');
check(server.includes('/^\\/room\\//i') && server.includes('/^\\/ops(?:\\/|$)/i'), 'No-store/crawler policy targets room and ops paths');
check(!server.includes('fonts.googleapis.com') && !server.includes('fonts.gstatic.com'), 'CSP does not allow remote Google font hosts');
check(!styles.includes('fonts.googleapis.com') && !styles.includes('fonts.gstatic.com'), 'Styles do not load fonts from Google at runtime');
check(styles.includes('@fontsource/oxanium') && styles.includes('@fontsource/chakra-petch') && styles.includes('@fontsource/share-tech-mono'), 'Brand fonts are bundled locally');
check(!privacy.includes('loads its web typography from Google Fonts domains'), 'Privacy Policy does not falsely claim runtime Google Fonts requests');
check(privacy.includes('does not request its brand typography from Google Fonts at runtime'), 'Privacy Policy accurately describes self-hosted typography');
check(privacy.includes('Purposes and legal bases'), 'Privacy Policy includes purposes/legal-basis section');
check(privacy.includes('Infrastructure, recipients and processors'), 'Privacy Policy includes processor/recipient categories');
check(privacy.includes('does not currently use personal data for behavioural advertising or cross-site profiling'), 'Privacy Policy states current no-behavioural-advertising posture');
check(robots.includes('Disallow: /ops/'), 'Robots policy excludes private ops paths');
check(room.includes('{ name: "robots", content: "noindex" }'), 'Room route remains marked noindex in page metadata');

check(gate.includes('eznoobs:legal-ack:v3'), 'Current legal assent is versioned for the August 22 policy update');
check(gate.includes('agree to the Terms of Service'), 'First-use gate explicitly records Terms assent');
check(gate.includes('LEGAL_PATHS') && gate.includes('"/legal"'), 'Legal hub remains readable before assent');

check(runbackMigration.includes('CREATE TABLE IF NOT EXISTS private.runback_links'), 'Runback successor links stay in the private schema');
check(runbackMigration.includes('REVOKE ALL ON TABLE private.runback_links FROM PUBLIC, anon, authenticated'), 'Runback link table is not directly readable by clients');

for (const table of ['lobbies', 'messages', 'participants', 'reactions', 'rematch_votes', 'reports']) {
  check(
    roomReadLock.includes(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM anon, authenticated;`),
    `Direct client table privileges remain revoked for ${table}`,
  );
}

if (failures.length) {
  console.error(`\nEZNOOBS privacy regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS privacy regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
