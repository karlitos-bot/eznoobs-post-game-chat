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
const rootRoute = read('src/routes/__root.tsx');
const firstUseGate = read('src/components/eznoobs/FirstUseSafetyGate.tsx');
const roomClarity = read('src/components/eznoobs/RoomClarityLayer.tsx');
const expiryGuard = read('src/components/eznoobs/RoomExpiryGuard.tsx');
const styles = read('src/styles.css');
const doxxing = read('supabase/migrations/20260820114500_expand_doxxing_detection.sql');
const lifetime = read('supabase/migrations/20260821043500_configurable_seven_to_ten_minute_lifetime.sql');
const activityLifetime = read('supabase/migrations/20260821050000_activity_driven_lobby_extension.sql');
const activityCooldown = read('supabase/migrations/20260821051000_activity_extension_cooldown.sql');

check(realtimeLayer.includes('fastAttempts < 8'), 'Realtime keeps bounded fast reconnect retries');
check(realtimeLayer.includes('30_000'), 'Realtime falls back to low-frequency background token retries');
check(realtimeLayer.includes('window.addEventListener("online", handleOnline)'), 'Realtime retries immediately when the browser returns online');
check(realtimeLayer.includes('window.removeEventListener("online", handleOnline)'), 'Realtime online listener is cleaned up on unmount');
check(realtimeLayer.includes('requestInFlight'), 'Realtime token recovery prevents overlapping requests');
check(realtimeLayer.includes('tokenReady'), 'Realtime token recovery stops retries after success');
check(realtimeLayer.includes('MutationObserver'), 'Realtime waits for room join without tight DOM polling');
check(!realtimeLayer.includes('setTimeout(waitForJoinedRoom, 200)'), 'Realtime no longer polls for the composer every 200ms');

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

check(lifetime.includes("('lobby_duration_minutes', 7)"), 'Default lobby lifetime remains 7 minutes');
check(lifetime.includes("('lobby_max_duration_minutes', 10)"), 'Absolute lobby lifetime cap remains 10 minutes');
check(lifetime.includes('NEW.expires_at := NEW.created_at + make_interval(mins => private.lobby_duration_minutes())'), 'Room creation uses the configurable base lifetime');
check(lifetime.includes('v_max_expires_at') && lifetime.includes('private.lobby_max_duration_minutes()'), 'All explicit expiry changes remain clamped to the configured max lifetime');

check(activityLifetime.includes("('lobby_activity_extension_window_minutes', 2)"), 'Meaningful activity extends only in the final two-minute window');
check(activityLifetime.includes("('lobby_activity_extension_minutes', 1)"), 'Each meaningful activity extension adds only one minute');
check(activityLifetime.includes('CREATE OR REPLACE FUNCTION private.record_meaningful_lobby_activity'), 'Meaningful activity is centralized in a private database function');
check(activityLifetime.includes("v_lobby.expires_at - now()") && activityLifetime.includes('private.lobby_activity_extension_window_minutes()'), 'Activity helper checks the remaining-time window');
check(activityLifetime.includes('LEAST(') && activityLifetime.includes('private.lobby_max_duration_minutes()'), 'Activity helper cannot extend beyond the 10-minute cap');
check((activityLifetime.match(/PERFORM private\.record_meaningful_lobby_activity\(v_lobby_id\)/g) ?? []).length === 3, 'Messages, reactions and Runback votes are the three extension-producing actions');
check(!activityLifetime.includes('CREATE OR REPLACE FUNCTION public.touch_presence'), 'Presence heartbeats are not an extension-producing action');
check(activityLifetime.includes('DROP FUNCTION IF EXISTS public.extend_lobby(text, text, text)'), 'Old manual lobby extension RPC is removed');
check(!fs.existsSync(path.join(root, 'src/components/eznoobs/KeepItGoingButton.tsx')), 'Manual Keep It Going button is removed');
check(!fs.existsSync(path.join(root, 'src/lib/lobby-lifetime.functions.ts')), 'Manual extension server action is removed');
check(!realtimeLayer.includes('KeepItGoingButton'), 'Realtime layer no longer mounts a manual extension UI');

check(activityCooldown.includes('ADD COLUMN IF NOT EXISTS last_extended_at'), 'Lobby stores only its most recent automatic extension time');
check(activityCooldown.includes("('lobby_activity_extension_cooldown_seconds', 60)"), 'Automatic extensions have a 60-second room-level cooldown');
check(activityCooldown.includes('private.lobby_activity_extension_cooldown_seconds()'), 'Activity helper enforces the configured extension cooldown');
check(activityCooldown.includes('v_lobby.last_extended_at IS NULL'), 'First eligible late-room activity may extend immediately');
check(activityCooldown.includes('last_extended_at = CASE WHEN v_extended THEN now() ELSE last_extended_at END'), 'Extension timestamp changes only when time was actually added');

check(firstUseGate.includes('eznoobs:legal-ack:v2'), '18+ and Terms assent is versioned and remembered locally');
check(firstUseGate.includes('eznoobs:rules-ack:v1'), 'Lobby rules acknowledgment is remembered locally');
check(firstUseGate.includes('EZNOOBS is an adults-only beta built for temporary post-game chat.'), 'First-use explanation stays short and product-focused');
check(firstUseGate.includes('I confirm that I am 18 years old or older and agree to the Terms of Service.'), 'First-use gate requires explicit age and Terms assent');
check(firstUseGate.includes('to="/terms"') && firstUseGate.includes('to="/privacy"') && firstUseGate.includes('to="/community-rules"'), 'Terms, Privacy and Rules are readable before assent');
check(firstUseGate.includes('No hate/slurs targeting race, sex, religion or identity.'), 'Rules reminder states the protected-class hate boundary');
check(firstUseGate.includes('No threats, doxxing, or personal contact/location information.'), 'Rules reminder states the threats/doxxing boundary');
check(firstUseGate.includes('function rememberAcknowledgment') && firstUseGate.includes('window.localStorage.setItem(key, "yes")'), 'Accepted first-use gates persist when browser storage is available');
check(firstUseGate.includes('memoryAcknowledgments.add(key)') && firstUseGate.includes('function hasAcknowledgment'), 'First-use gates have an in-memory fallback when persistent storage is unavailable');
check(firstUseGate.includes('ROOM_PATH_RE.test(pathname)'), 'Rules reminder is scoped to first lobby entry');
check(firstUseGate.includes('aria-modal="true"') && firstUseGate.includes('aria-describedby="eznoobs-first-use-description"'), 'First-use modal exposes dialog semantics');
check(firstUseGate.includes('function trapFocus') && firstUseGate.includes('previousFocusRef'), 'First-use modal traps and restores keyboard focus');
check(firstUseGate.includes('overflow-y-auto') && firstUseGate.includes('py-6'), 'First-use modal can scroll safely on short mobile viewports');
check(rootRoute.includes('<FirstUseSafetyGate />'), 'First-use safety gate is mounted globally');

check(styles.includes('@media (prefers-reduced-motion: reduce)'), 'Global reduced-motion preference is respected');
check(/@media \(max-width: 639px\)[\s\S]*font-size:\s*16px/.test(styles), 'Mobile text inputs avoid iOS focus zoom');
check(styles.includes('@utility mobile-safe-bottom') && styles.includes('env(safe-area-inset-bottom)'), 'Safe-area bottom utility exists for mobile browser chrome');
check(room.includes('h-[100dvh]') && room.includes('mobile-safe-bottom composer-shell'), 'Room uses dynamic viewport height and safe-area composer padding');

check(roomClarity.includes('event.key === "Escape"') && roomClarity.includes('event.key !== "Tab"'), 'Mobile roster drawer supports Escape and trapped Tab navigation');
check(roomClarity.includes('drawer.setAttribute("role", "dialog")') && roomClarity.includes('drawer.setAttribute("aria-modal", "true")'), 'Mobile roster drawer receives dialog semantics');
check(roomClarity.includes('document.visibilityState === "hidden"'), 'Room clarity observer skips expensive work in background tabs');
check(!roomClarity.includes('setInterval('), 'Room clarity uses event-driven updates without permanent polling');
check(!roomClarity.includes('querySelectorAll<HTMLElement>("body *")'), 'Room clarity no longer scans the entire document on room updates');
check(roomClarity.includes('7 min base · active rooms can reach 10'), 'Visible room lifetime copy matches the automatic extension model');
check(roomClarity.includes('Active rooms can last up to 10 minutes.'), 'Join-gate lifetime copy no longer claims the timer never changes');
check(!expiryGuard.includes('setInterval('), 'Expiry guard uses event-driven expiry detection without permanent layout polling');
check(expiryGuard.includes('ResizeObserver'), 'Expiry guard tracks room geometry only when layout actually changes');
check(expiryGuard.includes('MutationObserver'), 'Expiry guard observes room expiry transitions instead of polling');
check(expiryGuard.includes('current.top === nextRect.top') && expiryGuard.includes('current.height === nextRect.height'), 'Expiry guard avoids redundant rectangle state updates');

if (failures.length) {
  console.error(`\nEZNOOBS beta-hardening regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS beta-hardening regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
