import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const root = read("src/routes/__root.tsx");
const accessibilityLayer = read("src/components/eznoobs/AccessibilityLayer.tsx");
const accessibilityCss = read("src/accessibility.css");
const firstUse = read("src/components/eznoobs/FirstUseSafetyGate.tsx");
const roomClarity = read("src/components/eznoobs/RoomClarityLayer.tsx");
const aftermath = read("src/components/eznoobs/RunbackAftermathLayer.tsx");
const legal = read("src/components/eznoobs/LegalPage.tsx");
const styles = read("src/styles.css");

const checks = [
  ["global accessibility layer mounted", root.includes("<AccessibilityLayer />")],
  ["accessibility stylesheet loaded", root.includes("accessibilityCss")],
  ["skip to main control exists", accessibilityLayer.includes("Skip to main content")],
  ["skip control focuses main landmark", accessibilityLayer.includes('querySelector<HTMLElement>("main")')],
  ["SPA route changes have polite announcement", accessibilityLayer.includes('aria-live="polite"') && accessibilityLayer.includes("Navigated to")],
  ["first-use modal is a modal dialog", firstUse.includes('role="dialog"') && firstUse.includes('aria-modal="true"')],
  ["first-use modal traps Tab focus", firstUse.includes("function trapFocus") && firstUse.includes('event.key !== "Tab"')],
  ["first-use modal restores previous focus", firstUse.includes("previousFocusRef.current?.focus")],
  ["roster exposes dialog state", roomClarity.includes('aria-haspopup", "dialog"') && roomClarity.includes('aria-expanded')],
  ["roster dialog has Escape close", roomClarity.includes('event.key === "Escape"') && roomClarity.includes("closeButton.click()")],
  ["roster dialog traps Tab focus", roomClarity.includes('event.key !== "Tab"') && roomClarity.includes("focusable.length")],
  ["typing activity is not noisy live-region content", roomClarity.includes('activityStrip.setAttribute("aria-live", "off")')],
  ["offline state announces assertively", roomClarity.includes('role", "alert"') && roomClarity.includes('aria-live", "assertive"')],
  ["Match Aftermath is a labelled modal dialog", aftermath.includes('role="dialog"') && aftermath.includes('aria-modal="true"') && aftermath.includes('aria-describedby="ez-aftermath-description"')],
  ["Match Aftermath supports Escape close", aftermath.includes('event.key === "Escape"') && aftermath.includes('setShowAftermath(false)')],
  ["Match Aftermath traps Tab focus", aftermath.includes('event.key !== "Tab"') && aftermath.includes('FOCUSABLE_SELECTOR')],
  ["Match Aftermath restores prior focus", aftermath.includes('previousFocusRef.current?.focus')],
  ["legal nav exposes current page", legal.includes("aria-current")],
  ["global focus-visible styling exists", styles.includes("button:focus-visible") && styles.includes("textarea:focus-visible")],
  ["touch target utility is at least 44px", styles.includes("min-width: 44px") && styles.includes("min-height: 44px")],
  ["reduced motion is respected", styles.includes("prefers-reduced-motion: reduce") && accessibilityCss.includes("prefers-reduced-motion: reduce")],
  ["higher contrast preference supported", accessibilityCss.includes("prefers-contrast: more")],
  ["forced colors supported", accessibilityCss.includes("forced-colors: active")],
];

let failed = 0;
for (const [label, pass] of checks) {
  if (pass) {
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} accessibility regression check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} accessibility regression checks passed.`);
