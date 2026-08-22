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
const legalGate = read('docs/LEGAL_RELEASE_GATE.md');
const dataMap = read('docs/DATA_PROCESSING_MAP.md');
const dsaRunbook = read('docs/DSA_NOTICE_AND_INCIDENT_RUNBOOK.md');
const gameIp = read('docs/THIRD_PARTY_GAME_IP.md');

check(rules.includes('EZNOOBS is intended for people who are 18 years old or older'), 'Community Rules include the 18+ requirement');
check(rules.includes('Trash talk is allowed'), 'Community Rules explicitly preserve normal game trash talk');
check(rules.includes('protected-class hate, real-world threats or personal-data exposure'), 'Community Rules define the safety boundary');
check(rules.includes('No sexual exploitation'), 'Community Rules include exploitation and child-safety boundaries');
check(rules.includes('Illegal-content notices'), 'Community Rules distinguish formal illegal-content notices');
check(rules.includes('Reports are signals for review, not automatic proof'), 'Community Rules do not treat report count as automatic guilt');
check(!rules.includes('You can mute another player locally'), 'Community Rules do not promise an unimplemented local mute feature');

check(privacy.includes('without registering an account'), 'Privacy Policy explains accountless use');
check(privacy.includes("remains in your browser's local storage until you clear EZNOOBS site data"), 'Privacy Policy accurately describes browser credential persistence');
check(privacy.includes('Ordinary room data is deleted when the temporary lobby is purged after expiry'), 'Privacy Policy explains temporary room deletion');
check(privacy.includes('Purposes and legal bases'), 'Privacy Policy documents purposes and working legal bases');
check(privacy.includes('Infrastructure, recipients and processors'), 'Privacy Policy documents processor/recipient categories');
check(privacy.includes('does not currently use personal data for behavioural advertising or cross-site profiling'), 'Privacy Policy states current no-behavioural-advertising posture');
check(privacy.includes('expire after 24 hours'), 'Privacy Policy states blocked-content event retention');
check(privacy.includes('30-day retention period'), 'Privacy Policy states report-evidence retention');
check(privacy.includes('technical connection information such as IP addresses'), 'Privacy Policy acknowledges infrastructure-level technical logs without claiming zero collection');
check(privacy.includes('Room codes are intentionally redacted'), 'Privacy Policy explains room-code redaction in client diagnostics');
check(privacy.includes('does not request its brand typography from Google Fonts at runtime'), 'Privacy Policy accurately describes self-hosted typography');

check(terms.includes('at least 18 years old'), 'Terms include the 18+ requirement');
check(terms.includes('The Community Rules are part of these terms'), 'Terms incorporate the Community Rules');
check(terms.includes('Illegal-content notices'), 'Terms describe the separate illegal-content notice channel');
check(terms.includes('Independent service and game references'), 'Terms include third-party game no-affiliation language');
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
check(legalHub.includes('Notice & action · pre-launch gate'), 'Legal hub marks formal notice intake as a public-beta gate');
check(legalHub.includes('good-faith confirmation'), 'Legal hub lists the formal notice good-faith confirmation');
check(legalHub.includes('Independent service'), 'Legal hub includes independent-service/no-endorsement posture');
check(legalNav.includes('to="/legal"'), 'Homepage uses one compact Legal & Safety destination');
check(!legalNav.includes('to="/community-rules"') && !legalNav.includes('to="/privacy"') && !legalNav.includes('to="/terms"'), 'Homepage no longer spends primary space on three separate legal links');
check(rootRoute.includes('<HomeLegalNav />'), 'Homepage legal navigation is mounted from the root');

check(firstUseGate.includes('eznoobs:legal-ack:v3'), 'Current beta Terms/18+ assent is versioned for the legal hardening update');
check(firstUseGate.includes('agree to the Terms of Service'), 'First-use gate requires explicit Terms assent');
check(firstUseGate.includes('to="/terms"') && firstUseGate.includes('to="/privacy"') && firstUseGate.includes('to="/community-rules"'), 'First-use gate provides direct document links before assent');
check(firstUseGate.includes('LEGAL_PATHS') && firstUseGate.includes('"/legal"') && firstUseGate.includes('"/community-rules"') && firstUseGate.includes('"/privacy"') && firstUseGate.includes('"/terms"'), 'Legal pages remain readable before assent');

check(diagnostics.includes('redactRoomCode'), 'Client diagnostics define room-code redaction');
check(diagnostics.includes('/room/[code]'), 'Client diagnostics replace temporary room codes with a fixed placeholder');
check(robots.includes('Disallow: /ops/'), 'Crawler policy excludes private operations paths');

check(retention.includes("('report_retention_days', 30)"), 'Database report retention is configured to 30 days');
check(retention.includes('ADD COLUMN IF NOT EXISTS expires_at timestamptz'), 'Reports carry an explicit expiry timestamp');
check(retention.includes('eznoobs-purge-moderation-retention') && retention.includes("'17 * * * *'"), 'Report/moderation retention cleanup is scheduled hourly');

check(legalGate.includes('BLOCKERS before wider public beta'), 'Internal legal release gate records unresolved public-beta blockers');
check(legalGate.includes('production operator') && legalGate.includes('legal@eznoobs.com'), 'Legal release gate requires final operator and monitored legal contact');
check(legalGate.includes('illegal-content notice-and-action backend'), 'Legal release gate blocks beta until formal notice intake is functional');
check(dataMap.includes('Working Data Processing Map'), 'Internal data-processing inventory exists');
check(dataMap.includes('Browser guest credential') && dataMap.includes('Legal/DSA notice (planned)'), 'Data map covers current guest data and planned legal notices');
check(dsaRunbook.includes('Formal illegal-content notice'), 'Illegal-content notice runbook separates formal notices from community reports');
check(dsaRunbook.includes('Credible threat to life or safety'), 'Runbook contains urgent life/safety escalation procedure');
check(dsaRunbook.includes('finite documented retention period'), 'Runbook requires finite legal-notice retention');
check(gameIp.includes('generic Lucide icons'), 'Third-party IP policy preserves generic game-mark default');
check(gameIp.includes('A domain name alone is not trademark clearance'), 'Third-party IP policy warns that domain ownership is not trademark clearance');

if (failures.length) {
  console.error(`\nEZNOOBS legal regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS legal regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
