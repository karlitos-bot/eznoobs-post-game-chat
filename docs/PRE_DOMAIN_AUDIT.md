# EZNOOBS — Pre-Domain Stability Checkpoint

This checkpoint separates code-level verification from the manual browser and legal/operational checks that must still be completed on the published build before calling the public beta ready.

## Automated / repository checks

- [x] Security regression suite exists and runs in CI.
- [x] Privacy regression suite exists and runs in CI.
- [x] Moderation and enforcement regression suites exist and run in CI.
- [x] Mobile regression suite exists and runs in CI.
- [x] Accessibility regression suite exists and runs in CI.
- [x] Copy regression suite exists and runs in CI.
- [x] Performance regression suite exists and runs in CI.
- [x] Strict TypeScript configuration is present.
- [x] CI now runs a real `tsc --noEmit` typecheck before lint/build.
- [x] Correctness lint is no longer blocked by repository-wide Prettier formatting debt.
- [x] Production build remains a required CI step.
- [x] Private room/ops responses receive `no-store` and `noindex, nofollow, noarchive` headers.
- [x] Google font hosts are not allowed by the CSP; brand fonts are bundled locally.
- [x] Browser Supabase setup rejects accidental `sb_secret_` key exposure.

## Product systems implemented

- [x] No-account guest identity.
- [x] Create lobby with game, nickname and side.
- [x] Five-character room codes and join-by-code.
- [x] Realtime text chat with secure snapshot fallback.
- [x] Participant roster/presence and local mute.
- [x] Blue / Red / Spectator sides.
- [x] 7-minute base lifetime with activity extension near expiry and a hard 10-minute cap.
- [x] Offline/reconnect state and draft preservation.
- [x] Message reactions and reaction effects.
- [x] Typing indicators.
- [x] Salt-O-Meter / room heat personality.
- [x] Quick Shots / opening interactions.
- [x] Runback voting and secure successor room creation.
- [x] Match Aftermath summary.
- [x] Reporting, moderation queue and enforcement controls.
- [x] First-use 18+ / Terms assent and room rules reminder.
- [x] Community Rules, Privacy and Terms surfaces.
- [x] Responsive/mobile and accessibility layers.
- [x] Self-hosted EZNOOBS typography and final wordmark/mascot branding.

## Legal/safety hardening implemented in-repo

- [x] Privacy wording matches self-hosted fonts and no longer claims Google Fonts runtime requests.
- [x] Privacy Policy documents purposes/legal-basis categories, processors/recipients and planned transfer review.
- [x] Community Rules explicitly separate normal trash talk from serious/illegal real-world harm.
- [x] Terms distinguish community reports from formal illegal-content notices.
- [x] Terms/Legal hub include an independent-service/no-endorsement statement for third-party games.
- [x] Legal acknowledgement is versioned for the August 22 policy update.
- [x] Internal data-processing map exists (`docs/DATA_PROCESSING_MAP.md`).
- [x] Internal illegal-content/urgent-safety runbook exists (`docs/DSA_NOTICE_AND_INCIDENT_RUNBOOK.md`).
- [x] Third-party game IP policy exists (`docs/THIRD_PARTY_GAME_IP.md`).
- [x] Public Legal & Safety hub clearly marks the illegal-content intake as a pre-launch blocker rather than pretending a non-functional channel exists.

## Manual release checks still required

Use `docs/PRE_BETA_QA.md` for the full procedure. At minimum before connecting the production domain:

- [ ] Published build opens correctly in a fresh Incognito/InPrivate browser.
- [ ] Create → join → chat works across at least two different browsers/devices.
- [ ] 4–6 client multiplayer session completes without stuck syncing or duplicate messages.
- [ ] Disconnect/reconnect preserves the draft and catches up missing room state.
- [ ] Repeated refreshes do not duplicate the same guest in the roster.
- [ ] Room starts around 7:00, only qualifying activity near expiry extends it, and it never exceeds 10:00 from creation.
- [ ] Room stays closed after 00:00, including after reconnect/refresh.
- [ ] Reactions, Salt-O-Meter and Runback counts converge across clients.
- [ ] Successful Runback creates one usable successor room for the eligible lobby.
- [ ] Report → moderation → enforcement flow is exercised once end-to-end.
- [ ] 360px phone, larger phone, tablet and desktop layouts have no blocking overlap/horizontal scroll.
- [ ] Keyboard-only first-use/join flow and mobile roster dialog behave correctly.
- [ ] Published response headers are checked on `/room/{CODE}` and `/ops/*`.
- [ ] Social/share preview is checked after the custom domain is connected.

## Legal/operational release blockers still required

Follow `docs/LEGAL_RELEASE_GATE.md` before wider public beta:

- [ ] Final production operator/controller identity is decided and published with legally appropriate contact information.
- [ ] Dedicated legal/privacy/support electronic contact channels are live and monitored.
- [ ] Formal illegal-content notice-and-action intake is genuinely functional (not just a policy description).
- [ ] Notice receipt/decision communications and an urgent life/safety escalation procedure are operational.
- [ ] Final production hosting/database/email providers and applicable data-protection agreements/transfers are documented.
- [ ] Privacy-rights request process is operational.
- [ ] Preliminary EZNOOBS trademark/name search is completed; professional clearance is considered before major commercial investment.
- [ ] Final Greek/EU lawyer review is completed before commercial or large-scale launch.

## Domain readiness rule

Buying/holding `eznoobs.com` is fine before all release checks are complete. **Do not call the site wider-public-beta ready or actively promote public use** until CI is fully green, the manual browser tests have no release-blocking failures, and the legal/operational blockers above are resolved.
