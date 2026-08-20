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
const doxxing = read('supabase/migrations/20260820114500_expand_doxxing_detection.sql');

check(realtimeLayer.includes('fastAttempts < 8'), 'Realtime keeps bounded fast reconnect retries');
check(realtimeLayer.includes('30_000'), 'Realtime falls back to low-frequency background token retries');
check(realtimeLayer.includes('window.addEventListener("online", handleOnline)'), 'Realtime retries immediately when the browser returns online');
check(realtimeLayer.includes('window.removeEventListener("online", handleOnline)'), 'Realtime online listener is cleaned up on unmount');
check(realtimeLayer.includes('requestInFlight'), 'Realtime token recovery prevents overlapping requests');
check(realtimeLayer.includes('tokenReady'), 'Realtime token recovery stops retries after success');

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
