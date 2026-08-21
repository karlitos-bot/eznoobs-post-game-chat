import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(condition, label) {
  if (condition) passes.push(label);
  else failures.push(label);
}

const migration = read("supabase/migrations/20260821073000_privacy_conscious_enforcement.sql");
const serverFns = read("src/lib/enforcement.functions.ts");
const consoleRoute = read("src/routes/ops.enforcement.tsx");
const safetyGate = read("src/components/eznoobs/FirstUseSafetyGate.tsx");
const privacy = read("src/routes/privacy.tsx");
const publicUi = [
  read("src/routes/index.tsx"),
  read("src/components/eznoobs/HomeLegalNav.tsx"),
  read("src/components/eznoobs/LegalPage.tsx"),
].join("\n");

check(
  migration.includes("private.guest_restrictions") &&
    migration.includes("private.enforcement_events"),
  "Enforcement state and audit history live in the private schema",
);
check(
  migration.includes("guest_subject_hash") &&
    migration.includes("extensions.digest('eznoobs-guest:'"),
  "Enforcement subjects use one-way hashed browser guest identifiers",
);
check(
  !/CREATE TABLE[\s\S]*private\.guest_restrictions[\s\S]*\bguest_id\b/i.test(
    migration.match(/CREATE TABLE IF NOT EXISTS private\.guest_restrictions[\s\S]*?\);/)?.[0] ?? "",
  ),
  "Active restriction table does not store plaintext guest IDs",
);
check(
  /BEFORE INSERT ON public\.participants/.test(migration) &&
    /BEFORE INSERT ON public\.messages/.test(migration) &&
    /BEFORE INSERT ON public\.reactions/.test(migration) &&
    /BEFORE INSERT ON public\.rematch_votes/.test(migration),
  "Restrictions are enforced at database write boundaries",
);
check(
  !/BEFORE INSERT ON public\.reports/.test(migration),
  "Restricted users can still submit safety reports",
);
check(
  /review_status NOT IN \('confirmed', 'serious'\)/.test(migration),
  "Only moderator-confirmed or serious reports can receive enforcement",
);
check(
  /chat_mute'[\s\S]*v_duration < 5[\s\S]*v_duration > 1440/.test(migration) &&
    /cooldown'[\s\S]*v_duration < 10[\s\S]*v_duration > 10080/.test(migration) &&
    /suspension'[\s\S]*v_duration < 60[\s\S]*v_duration > 43200/.test(migration),
  "Restriction durations are bounded server-side",
);
check(
  migration.includes("v_expires_at + interval '30 days'") &&
    migration.includes("audit_expires_at <= now()") &&
    migration.includes("eznoobs-purge-enforcement-retention"),
  "Enforcement audit data has finite automatic retention",
);
check(
  !/\binet\b|client_addr|x-forwarded-for|raw.?ip/i.test(migration),
  "P1 #8 does not create a raw-IP ban store",
);
check(
  consoleRoute.includes('name: "robots", content: "noindex,nofollow,noarchive"'),
  "Enforcement console is noindex/nofollow/noarchive",
);
check(
  consoleRoute.includes("window.sessionStorage.getItem(SESSION_KEY)") &&
    !consoleRoute.includes("localStorage"),
  "Enforcement console reuses only the temporary moderator session",
);
check(
  safetyGate.includes('"/ops/enforcement"'),
  "Internal enforcement route is outside the public first-use gate",
);
check(
  !publicUi.includes("/ops/enforcement"),
  "Public navigation does not expose the enforcement console",
);
check(
  serverFns.includes('"apply_guest_restriction"') &&
    serverFns.includes('"lift_guest_restriction"') &&
    serverFns.includes('"get_active_guest_restrictions"'),
  "Server functions expose only credentialed enforcement RPCs",
);
check(
  privacy.includes("one-way hash of the browser guest public identifier") &&
    privacy.includes("up to 30 days afterward") &&
    privacy.includes("does not maintain a raw-IP ban list"),
  "Privacy policy documents enforcement identity and retention accurately",
);

if (failures.length) {
  console.error(`\nEZNOOBS enforcement regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS enforcement regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
