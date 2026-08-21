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

const realtime = read('src/components/eznoobs/SecureRealtimeLayer.tsx');
const clarity = read('src/components/eznoobs/RoomClarityLayer.tsx');
const expiry = read('src/components/eznoobs/RoomExpiryGuard.tsx');
const showtime = read('src/components/eznoobs/LobbyShowtimeLayer.tsx');
const personality = read('src/components/eznoobs/LobbyPersonalityLayer.tsx');

check(realtime.includes('MutationObserver'), 'Realtime waits for joined room state with an observer');
check(!realtime.includes('setTimeout(waitForJoinedRoom, 200)'), 'Realtime has no 200ms joined-room polling loop');

check(!clarity.includes('setInterval('), 'Room clarity has no permanent polling interval');
check(!clarity.includes('querySelectorAll<HTMLElement>("body *")'), 'Room clarity avoids whole-document scans');
check(clarity.includes('new ResizeObserver(measureComposer)'), 'Composer geometry updates through ResizeObserver');
check(clarity.includes('observer.observe(document.body, { childList: true, subtree: true })'), 'Room clarity observes structural changes only');

check(!expiry.includes('setInterval('), 'Expiry guard has no permanent polling interval');
check(expiry.includes('new ResizeObserver(measureMain)'), 'Expiry guard geometry is ResizeObserver-driven');
check(expiry.includes('expiryObserver = new MutationObserver(inspectExpiry)'), 'Expiry guard watches the room for the expiry transition');
check(expiry.includes('expiryObserver.observe(main'), 'Expiry observation is scoped to room main');

check(!showtime.includes('setInterval('), 'Showtime layer has no permanent fallback interval');
check(showtime.includes('roomObserver.observe(main'), 'Showtime DOM observation is scoped to room main');
check(showtime.includes('new ResizeObserver(measureMain)'), 'Showtime geometry is ResizeObserver-driven');
check(showtime.includes('document.visibilityState === "hidden"'), 'Showtime skips decoration work in hidden tabs');
check(showtime.includes('shouldDecorate(mutations)'), 'Showtime ignores self-generated decorative mutations');

check(personality.includes('!realtimeToken'), 'Personality layer waits for secure realtime before starting snapshot work');
check(personality.includes('refreshing') && personality.includes('refreshQueued'), 'Personality snapshot refreshes cannot overlap');
check(personality.includes('document.visibilityState === "hidden"'), 'Personality work pauses in hidden tabs');
check(personality.includes('30_000'), 'Personality fallback snapshot interval is reduced to 30 seconds');
check(!personality.includes('8000'), 'Old 8-second personality polling is removed');

if (failures.length) {
  console.error(`\nEZNOOBS performance regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS performance regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
