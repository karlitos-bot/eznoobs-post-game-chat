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

const realtimeLayer = read('src/components/eznoobs/SecureRealtimeLayer.tsx');
const room = read('src/routes/room.$code.tsx');
const doxxing = read('supabase/migrations/20260820114500_expand_doxxing_detection.sql');

check(realtimeLayer.includes('fastAttempts < 8'), 'Realtime keeps bounded fast reconnect retries');
check(realtimeLayer.includes('30_000'), 'Realtime falls back to low-frequency background token retries');
check(realtimeLayer.includes('window.addEventListener("online", handleOnline)'), 'Realtime retries immediately when the browser returns online');
check(realtimeLayer.includes('window.removeEventListener("online", handleOnline)'), 'Realtime online listener is cleaned up on unmount');
check(realtimeLayer.includes('requestInFlight'), 'Realtime token recovery prevents overlapping requests');
check(realtimeLayer.includes('tokenReady'), 'Realtime token recovery stops retries after success');

check(room.includes('const playersRef = useRef<Participant[]>([])'), 'Typing identity has a trusted participant snapshot ref');
check(room.includes('playersRef.current = snapshot.players'), 'Trusted typing participant ref is populated only from secure lobby snapshots');
check(room.includes('playersRef.current.find((player) => player.guest_id === payload.guestId)'), 'Incoming typing guest IDs are resolved against trusted participant state');
check(room.includes('if (!sender) return;'), 'Unknown realtime typing guest IDs are ignored');
check(room.includes('nickname: sender.nickname') && room.includes('team: sender.team'), 'Typing display identity comes from trusted participant state');
check(!/payload:\s*\{[\s\S]{0,180}nickname:\s*currentPlayer\.nickname/.test(room), 'Typing broadcasts do not send a nickname to be trusted by peers');
check(!/payload:\s*\{[\s\S]{0,180}team:\s*currentPlayer\.team/.test(room), 'Typing broadcasts do not send a team to be trusted by peers');

check(doxxing.includes("v_raw ~* '[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}'"), 'Email-address detection remains active');
check(doxxing.includes("position(' phone ' in v_padded) > 0") && doxxing.includes("[0-9() .\\-]{6,}"), 'Phone-like numbers require whole-word contact-sharing context');
check(doxxing.includes("position(' your ip ' in v_padded) > 0") && doxxing.includes("([0-9]{1,3}\\.){3}[0-9]{1,3}"), 'Contextual IP-address exposure is detected');
check(doxxing.includes("position(' address ' in v_padded) > 0") && doxxing.includes('(street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way)'), 'Contextual street-address exposure is detected');
check(doxxing.includes("position(' discord ' in v_padded) > 0") && doxxing.includes("@[a-z0-9._-]{2,32}"), 'Explicit social/contact handle sharing uses whole-word service matching');
check(doxxing.includes("out_category := 'personal_data'"), 'Expanded doxxing patterns use the personal_data moderation category');

if (failures.length) {
  console.error(`\nEZNOOBS beta-hardening regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS beta-hardening regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
