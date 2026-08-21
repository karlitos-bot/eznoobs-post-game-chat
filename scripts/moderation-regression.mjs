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

const migration = read('supabase/migrations/20260821071500_moderation_operations.sql');
const serverFns = read('src/lib/moderation.functions.ts');
const route = read('src/routes/ops.moderation.tsx');
const firstUseGate = read('src/components/eznoobs/FirstUseSafetyGate.tsx');
const home = read('src/routes/index.tsx');
const homeLegalNav = read('src/components/eznoobs/HomeLegalNav.tsx');
const legalPage = read('src/components/eznoobs/LegalPage.tsx');

check(migration.includes("review_status text NOT NULL DEFAULT 'pending'"), 'Reports default to pending moderation review');
check(/CHECK \(review_status IN \('pending', 'dismissed', 'confirmed', 'serious'\)\)/.test(migration), 'Report review statuses are constrained');
check(migration.includes('private.moderator_credentials'), 'Moderator credentials live in the private schema');
check(migration.includes('private.moderator_sessions'), 'Moderator sessions live in the private schema');
check(migration.includes('private.report_review_events'), 'Report review audit events live in the private schema');
check(/REVOKE ALL ON TABLE private\.moderator_credentials FROM PUBLIC, anon, authenticated/.test(migration), 'Moderator credential table is not directly readable');
check(/REVOKE ALL ON TABLE private\.moderator_sessions FROM PUBLIC, anon, authenticated/.test(migration), 'Moderator session table is not directly readable');
check(/digest\(p_secret, 'sha256'\)/.test(migration), 'Moderator secrets are verified as hashes');
check(/digest\(v_token, 'sha256'\)/.test(migration), 'Moderator session tokens are stored as hashes');
check(/gen_random_bytes\(32\)/.test(migration), 'Moderator session tokens use cryptographic randomness');
check(/interval '8 hours'/.test(migration), 'Moderator sessions have a bounded eight-hour lifetime');
check(/consume_rate_limit\([\s\S]*'moderator_login'[\s\S]*60, 5,[\s\S]*900, 15/.test(migration), 'Moderator login is server-side rate limited');
check(/private\.moderator_session_owner\(p_session_token\)/.test(migration), 'Moderation queue/review actions require a valid moderator session');
check(migration.includes('review_status = v_status'), 'Report reviews update explicit status');
check(migration.includes('INSERT INTO private.report_review_events'), 'Report reviews append an audit event');
check(!/INSERT INTO private\.moderator_credentials\s*\(/i.test(migration), 'Production moderator credential is not committed in the migration');

check(serverFns.includes('moderator_login'), 'Server exposes credentialed moderator login through RPC');
check(serverFns.includes('get_moderation_queue'), 'Server exposes the moderator review queue through RPC');
check(serverFns.includes('review_report'), 'Server exposes report review through RPC');
check(!/throw\s+new\s+Error\(\s*error\.message\s*\)/.test(serverFns), 'Moderator server functions do not expose raw backend errors');

check(route.includes('noindex,nofollow,noarchive'), 'Moderation console is marked noindex/nofollow/noarchive');
check(route.includes('sessionStorage.setItem(SESSION_KEY'), 'Moderator session token is stored in sessionStorage');
check(!/localStorage\.setItem\([^\n]*moderator/i.test(route), 'Moderator session is not persisted in localStorage');
check(route.includes('type="password"'), 'Moderator secret input is masked');
check(!/value=\{?\s*["'][0-9a-f]{8}-[0-9a-f-]{27,}["']/i.test(route), 'Moderator ID is not hardcoded into the login form');
check(route.includes('Serious') && route.includes('does not auto-ban'), 'Serious review status is clearly separated from automatic enforcement');

check(firstUseGate.includes('"/ops/moderation"'), 'Internal moderation route bypasses the public first-use gate');
check(!home.includes('/ops/moderation'), 'Homepage does not expose the moderation console');
check(!homeLegalNav.includes('/ops/moderation'), 'Homepage legal navigation does not expose the moderation console');
check(!legalPage.includes('/ops/moderation'), 'Legal-page navigation does not expose the moderation console');

if (failures.length) {
  console.error(`\nEZNOOBS moderation regression check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passes.length} moderation checks passed before failure.`);
  process.exit(1);
}

console.log(`EZNOOBS moderation regression check passed (${passes.length} checks).`);
for (const pass of passes) console.log(`  ✓ ${pass}`);
