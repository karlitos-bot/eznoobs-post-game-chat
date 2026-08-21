import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

const failures = [];
const passes = [];
function check(condition, label) {
  (condition ? passes : failures).push(label);
}

const styles = read("src/styles.css");
const mobile = read("src/mobile-qa.css");
const root = read("src/routes/__root.tsx");
const room = read("src/routes/room.$code.tsx");
const legal = read("src/components/eznoobs/LegalPage.tsx");
const firstUse = read("src/components/eznoobs/FirstUseSafetyGate.tsx");

check(/@media \(max-width: 639px\)[\s\S]*font-size:\s*16px/.test(styles), "Mobile inputs keep 16px minimum to avoid iOS zoom");
check(styles.includes("@utility touch-target") && styles.includes("min-width: 44px") && styles.includes("min-height: 44px"), "Global touch targets remain at least 44px");
check(styles.includes("env(safe-area-inset-bottom)"), "Global safe-area bottom utility exists");
check(root.includes("viewport-fit=cover"), "Viewport enables notched-device safe areas");
check(root.includes("interactive-widget=resizes-content"), "Viewport asks supported browsers to resize for the keyboard");
check(root.includes("mobileQaCss") && root.includes("../mobile-qa.css?url"), "Mobile QA stylesheet is loaded globally");
check(room.includes('h-[100dvh]'), "Live room uses dynamic viewport height");
check(room.includes("mobile-safe-bottom composer-shell"), "Composer keeps bottom safe-area protection");
check(room.includes('window.matchMedia("(pointer: coarse)").matches'), "Touch devices do not submit chat on Enter");
check(mobile.includes("body:has(.composer-shell)") && mobile.includes("overscroll-behavior: none"), "Live room prevents page-level overscroll behind fixed chat");
check(mobile.includes("max-width: 389px") && mobile.includes('aria-label="Invite players to this lobby"'), "Narrow room header has compact invite treatment");
check(mobile.includes("overflow-wrap: anywhere"), "Long mobile content has overflow protection");
check(legal.includes("min-h-[100dvh]") && legal.includes("mobile-safe-top") && legal.includes("mobile-safe-bottom"), "Legal pages are dynamic-viewport and safe-area aware");
check(firstUse.includes("overflow-y-auto") && firstUse.includes("max-w-lg"), "First-use dialogs remain scrollable on short phones");

if (failures.length) {
  console.error(`\nEZNOOBS mobile regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS mobile regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
