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

const rules = read('src/routes/community-rules.tsx');
const privacy = read('src/routes/privacy.tsx');
const terms = read('src/routes/terms.tsx');
const legalHub = read('src/routes/legal.tsx');
const legalLayout = read('src/components/eznoobs/LegalPage.tsx');
const legalNav = read('src/components/eznoobs/HomeLegalNav.tsx');
const firstUseGate = read('src/components/eznoobs/FirstUseSafetyGate.tsx');
const diagnostics = read('src/lib/lovable-error-reporting.ts');
const robots = read('public/robots.txt');
const rootRoute = read('src/routes/__root.tsx');
const retention = read('supabase/migrations/20260821054500_finite_report_retention.sql');

check(rules.includes('EZNOOBS is intended for people who are 18 years old or older'), 'Community Rules include the 18+ requirement');
check(rules.includes('Trash talk is allowed'), 'Community Rules explicitly preserve normal game trash talk');
check(rules.includes('protected-class hate, real-world threats or personal-data exposure'), 'Community Rules define the safety boundary');
check(rules.includes('Reports are signals for review, not automatic proof'), 'Community Rules do not treat report count as automatic guilt');
check(!rules.includes('You can mute another player locally'), 'Community Rules do not promise an unimplemented local mute feature');

check(privacy.includes('without registering an account'), 'Privacy Policy explains accountless use');
check(privacy.includes("remains in your browser's local storage until you clear EZNOOBS site data"), 'Privacy Policy accurately describes browser credential persistence');
check(privacy.includes('Ordinary room data is deleted when the temporary lobby is purged after expiry'), 'Privacy Policy explains temporary room deletion');
check(privacy.includes('expire after 24 hours'), 'Privacy Policy states blocked-content event retention');
check(privacy.includes('30-day retention period'), 'Privacy Policy states report-evidence retention');
check(privacy.includes('technical connection information such as IP addresses'), 'Privacy Policy acknowledges infrastructure-level technical logs without claiming zero collection');
check(privacy.includes('Room codes are intentionally redacted'), 'Privacy Policy explains room-code redaction in client diagnostics');

check(terms.includes('at least 18 years old'), 'Terms include the 18+ requirement');
check(terms.includes('The Community Rules are part of these terms'), 'Terms incorporate the Community Rules');
check(terms.includes('being tested and improved'), 'Terms clearly identify the beta nature of the service');
check(terms.includes('Do not attempt to bypass room credentials, rate limits, moderation controls'), 'Terms prohibit security and abuse bypass attempts');

check(
  legalLayout.includes('to="/community-rules"') &&
    legalLayout.includes('to="/privacy"') &&
    legalLayout.includes('to="/terms"'),
  'Legal document pages cross-link each other',
);
check(
  legalHub.includes('to: "/community-rules"') &&
    legalHub.includes('to: "/privacy"') &&
    legalHub.includes('to: "/terms"'),
  'Legal & Safety hub exposes Rules, Privacy and Terms',
);
check(legalNav.includes('to="/legal"'), 'Homepage uses one compact Legal & Safety destination');
check(!legalNav.includes('to="/community-rules"') && !legalNav.includes('to="/privacy"') && !legalNav.includes('to="/terms"'), 'Homepage no longer spends primary space on three separate legal links');
check(rootRoute.includes('<HomeLegalNav />'), 'Homepage legal navigation is mounted from the root');

check(firstUseGate.includes('eznoobs:legal-ack:v2'), 'Current beta Terms/18+ assent is versioned');
check(firstUseGate.includes('agree to the Terms of Service'), 'First-use gate requires explicit Terms assent');
check(firstUseGate.includes('to="/terms"') && firstUseGate.includes('to="/privacy"') && firstUseGate.includes('to="/community-rules"'), 'First-use gate provides direct document links before assent');
check(firstUseGate.includes('LEGAL_PATHS') && firstUseGate.includes('"/legal"') && firstUseGate.includes('"/community-rules"') && firstUseGate.includes('"/privacy"') && firstUseGate.includes('"/terms"'), 'Legal pages remain readable before assent');

check(diagnostics.includes('redactRoomCode'), 'Client diagnostics define room-code redaction');
check(diagnostics.includes('/room/[code]'), 'Client diagnostics replace temporary room codes with a fixed placeholder');
check(robots.includes('Disallow: /ops/'), 'Crawler policy excludes private operations paths');

check(retention.includes("('report_retention_days', 30)"), 'Database report retention is configured to 30 days');
check(retention.includes('ADD COLUMN IF NOT EXISTS expires_at timestamptz'), 'Reports carry an explicit expiry timestamp');
check(retention.includes('eznoobs-purge-moderation-retention') && retention.includes("'17 * * * *'"), 'Report/moderation retention cleanup is scheduled hourly');

if (failures.length) {
  console.error(`\nEZNOOBS legal regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS legal regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
