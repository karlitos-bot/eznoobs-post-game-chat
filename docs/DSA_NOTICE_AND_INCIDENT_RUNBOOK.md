# EZNOOBS — Illegal-Content Notice & Serious-Safety Runbook

Internal operating procedure for the pre-launch beta. This is a product runbook, not legal advice. A Greek/EU lawyer should validate the final process before wider public beta.

## 1. Keep two reporting paths distinct

### Community report
Use for ordinary Community Rules issues inside a room: harassment, hate, threats, doxxing, spam, etc. The normal report is a moderation signal and is **not automatic proof** that the reported user violated a rule.

### Formal illegal-content notice
Use when an individual/entity alleges that a specific item of content is illegal. The public mechanism must be electronic, easy to find and easy to use.

The formal notice flow must not be hidden behind account creation or room membership.

## 2. Minimum notice fields to support before public beta

The production notice form should support:

1. **Exact content location** — exact URL and, where useful, room code/message reference or other detail needed to find the item.
2. **Explanation of alleged illegality** — enough detail to understand why the notifier says the specific content is illegal.
3. **Notifier name and email** where required by applicable law.
4. **Good-faith confirmation** — confirmation that the information/allegations supplied are accurate and complete to the notifier's bona fide belief.
5. Optional supporting context/documentation, but do not invite unnecessary sensitive uploads.

Special categories where applicable law does not require notifier identity should be handled in the final lawyer-reviewed form design. Do not create a generic anonymous-report loophole for every notice.

## 3. Intake lifecycle

### A. Receive

- Generate a non-guessable case identifier.
- Timestamp receipt.
- Store only the fields needed for the notice/review.
- Do not publish the notice or notifier details to room participants.

### B. Acknowledge

When electronic contact information is supplied, send a confirmation of receipt without undue delay.

Suggested acknowledgement content:

- case ID;
- date/time received;
- statement that receipt does not mean EZNOOBS has concluded the content is illegal;
- warning not to send unnecessary identity documents or sensitive material unless requested;
- route for follow-up.

### C. Triage

Classify at least:

- immediate threat to life/safety;
- sexual exploitation / child-safety concern;
- doxxing/privacy;
- fraud/scam/malware;
- intellectual-property allegation;
- unlawful hate/threat/harassment allegation;
- other alleged illegality;
- insufficient information / cannot locate content.

Do not auto-remove solely because a notice was submitted. Process notices diligently, objectively and non-arbitrarily.

### D. Preserve narrowly

If the temporary room would otherwise disappear before review, preserve only the specific evidence needed for the case. Avoid copying an entire room when one message is enough.

Record:

- exact content reviewed;
- relevant timestamps;
- decision-maker;
- rule/legal ground considered;
- action taken;
- reason;
- notifier communication status;
- affected-user communication status where applicable.

### E. Decide

Possible outcomes include:

- content not found / already expired;
- notice insufficiently substantiated;
- no action because illegality/rule violation is not established;
- content access disabled/removed where technically possible;
- participant/service restriction under Community Rules;
- evidence preserved for legal/safety handling;
- authority escalation where legally required.

### F. Notify

When the notifier supplied contact details, communicate the decision without undue delay and give the available redress information appropriate to the final legal setup.

When EZNOOBS restricts content/service access and knows usable electronic contact details for the affected recipient, provide a clear and specific reason where required and safe to do so. Do not reveal notifier identity unless disclosure is necessary and lawful.

## 4. Credible threat to life or safety

Treat this as a different severity class from normal toxicity.

Examples:

- credible threat of imminent killing or serious violence;
- swatting threat with actionable information;
- credible stalking/abduction threat;
- credible sexual violence threat;
- information reasonably suggesting a criminal offence involving a threat to life/safety has occurred, is occurring or is likely to occur.

Operator procedure:

1. Preserve the minimum relevant evidence and timestamps immediately.
2. Do not engage in amateur investigation or attempt to confront the user.
3. Identify the likely Member State(s) concerned from information already available; do not collect extra sensitive data without a reason.
4. Use the lawyer-reviewed law-enforcement/judicial contact procedure required for the production operator.
5. Record what was disclosed, to whom, when and why.
6. Restrict internal access to the incident record.

Before public beta, the operator must maintain current authority contact details and validate this workflow with counsel.

## 5. Child sexual exploitation / CSAM

The current product does not support images/files, which materially reduces exposure, but text/links can still create child-safety issues.

- Escalate immediately to the highest safety priority.
- Do not redistribute, quote extensively or make unnecessary copies of suspected illegal material.
- Preserve only what the law/safety response requires.
- Follow the final lawyer-reviewed reporting obligations and authority channels.

## 6. Intellectual-property notices

For copyright/trademark complaints:

- ask for the exact content/location;
- ask what right is claimed and the complainant's relationship to the rightsholder;
- do not assume a game/publisher complaint is valid merely because a brand name appears in text;
- distinguish nominative/reference use from copied artwork/assets;
- preserve the decision record.

EZNOOBS should continue preferring generic game-category icons and text labels over copied publisher artwork unless a licence/brand guideline clearly permits the asset.

## 7. Retention

The final legal-notice table must have a finite documented retention period. Retain longer only where a specific legal hold, active dispute, authority request or other lawful need requires it.

Do not silently merge legal-notice retention with ordinary room-history retention. Ordinary rooms remain temporary.

## 8. Access control

- Legal notices must not be directly readable by `anon` or normal room participants.
- Store them in private server-side state/schema with least-privilege access.
- Public submission should go through a rate-limited server endpoint/RPC with strict validation.
- Never expose service-role/secret keys to the browser.
- Audit operator decisions.

## 9. Abuse of the notice mechanism

Use proportionate rate limits and duplicate detection. Do not make the form inaccessible merely because some people abuse it. Repeated manifestly unfounded notices can be handled under the final DSA/counsel-reviewed process.

## 10. Pre-launch test cases

Before public beta, test at least:

- valid notice with exact room URL and explanation;
- invalid/missing URL;
- missing explanation;
- acknowledgement email delivery;
- expired room where report evidence is still reviewable;
- decision email delivery;
- duplicate notices;
- malicious spam submission;
- urgent life/safety flag;
- operator audit trail;
- retention cleanup;
- normal community report remains independent from formal legal notice.
