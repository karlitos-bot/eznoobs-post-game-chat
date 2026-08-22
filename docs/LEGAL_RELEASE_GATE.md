# EZNOOBS — Legal & Safety Release Gate

This is the product team's working pre-launch compliance checklist. It is not legal advice and must be reviewed against the final production setup and launch markets before wider public beta.

## Product/legal work completed in-repo

- [x] Adults-only (18+) first-use acknowledgement exists.
- [x] Terms of Service, Privacy Policy and Community Rules are public and cross-linked.
- [x] Legal acknowledgement is versioned so material policy updates can require re-acknowledgement.
- [x] Community Rules preserve normal gaming trash talk while prohibiting threats, doxxing, protected-class hate, exploitation, fraud/malware and other real-world unlawful harm.
- [x] Terms distinguish normal community reports from formal illegal-content notices.
- [x] Terms include an independent-service / no-endorsement statement for third-party games and publishers.
- [x] Privacy Policy describes the no-account browser identity, temporary room lifecycle, moderation/report retention, infrastructure logs and enforcement data.
- [x] Privacy Policy now states that brand fonts are self-hosted and not fetched from Google Fonts at runtime.
- [x] Privacy Policy includes purposes/legal-basis language and processor/recipient categories for the pre-launch model.
- [x] Current product avoids public profiles, DMs, image/file uploads and voice chat, reducing safety and privacy surface area.
- [x] Normal room data is designed to expire; finite report/moderation retention exists in the database migrations.
- [x] Report count alone does not trigger automatic enforcement; moderation decisions require review.
- [x] Security/privacy regression checks exist in CI.

## BLOCKERS before wider public beta

These are deliberately not filled with fake placeholders in public policy text.

### 1. Identify the production operator

- [ ] Decide whether EZNOOBS will be operated personally or through a business/legal entity.
- [ ] Obtain Greek legal/accounting advice on the correct operator/business/tax setup before monetisation or large-scale public operation.
- [ ] Determine the legally appropriate establishment/postal address to publish. Do not publish a home address casually without qualified advice.
- [ ] Add the final operator/controller identity and legally required contact details to the public Legal & Safety/Terms/Privacy pages.

### 2. Activate contact channels

After the domain is controlled, create monitored addresses such as:

- [ ] `legal@eznoobs.com` — formal legal/DSA notices and authorities.
- [ ] `privacy@eznoobs.com` — privacy/data-rights requests.
- [ ] `support@eznoobs.com` — normal product/community support.

One monitored mailbox can initially route multiple aliases, but the public pages must clearly state which channel to use.

### 3. Activate the illegal-content notice-and-action backend

The Legal & Safety hub already explains the required notice fields, but wider public beta remains blocked until the electronic intake is genuinely functional.

- [ ] Connect the EZNOOBS Supabase project to the development tooling.
- [ ] Generate a proper Supabase migration for a private legal-notice record (do not expose the table directly to browser roles).
- [ ] Build a public electronic notice form that collects the required notice details.
- [ ] Acknowledge receipt when an electronic contact is supplied.
- [ ] Record the review decision and notify the notifier without undue delay.
- [ ] Keep legal-notice data under a documented finite retention rule unless a dispute/legal hold requires longer retention.
- [ ] Add anti-spam/rate-limiting without making lawful notices unreasonably difficult to submit.

See `docs/DSA_NOTICE_AND_INCIDENT_RUNBOOK.md`.

### 4. Final privacy-controller / processor setup

- [ ] Confirm the production host/CDN/deployment provider.
- [ ] Confirm the production Supabase project/region.
- [ ] Review and retain the relevant provider Data Processing Agreements / data-protection terms.
- [ ] Document whether any production provider causes personal-data transfers outside the EEA and what transfer mechanism applies.
- [ ] Replace generic processor categories in the Privacy Policy with the final provider list/categories where appropriate.
- [ ] Publish the final controller contact information.

See `docs/DATA_PROCESSING_MAP.md`.

### 5. Privacy requests

- [ ] Define a simple identity-verification process proportionate to an accountless service.
- [ ] Document how access/deletion/restriction/objection requests will be logged and answered.
- [ ] Do not collect extra identity documents unless genuinely necessary to verify a request.

### 6. Serious safety / criminal-threat escalation

- [ ] Decide who monitors urgent legal/safety notices.
- [ ] Keep a current list of the appropriate Greek/EU authority contact routes.
- [ ] Train the operator not to treat credible threats to life/safety as ordinary gamer toxicity.
- [ ] Preserve only relevant evidence when escalation is necessary.

See `docs/DSA_NOTICE_AND_INCIDENT_RUNBOOK.md`.

### 7. Trademark / third-party game IP check

- [ ] Search `EZNOOBS`, `EZ NOOBS` and confusingly similar names in EUIPO/TMview and relevant national/international databases.
- [ ] If the project becomes commercially important, obtain a professional trademark clearance before investing heavily in promotion.
- [ ] Review each game's published community/brand-asset policy before using an official logo/artwork.
- [ ] Keep current generic Lucide game icons / text labels unless a permitted third-party asset is deliberately approved.

## Recommended professional review

Before large-scale or commercial launch, give a Greek/EU lawyer this repository package rather than asking them to start from zero:

1. `src/routes/terms.tsx`
2. `src/routes/privacy.tsx`
3. `src/routes/community-rules.tsx`
4. `src/routes/legal.tsx`
5. `docs/DATA_PROCESSING_MAP.md`
6. `docs/DSA_NOTICE_AND_INCIDENT_RUNBOOK.md`
7. the final production provider/DPA list
8. the final operator identity/contact setup

Ask the reviewer specifically to validate GDPR/ePrivacy, DSA applicability/obligations, Greek information-society/e-commerce disclosure requirements, consumer-law implications (especially if monetisation is added), and trademark/brand use.

## Release rule

**Do not call EZNOOBS public-beta legally ready while any of the operator/contact, illegal-content intake, production-processor, or urgent-escalation items above remain unresolved.**
