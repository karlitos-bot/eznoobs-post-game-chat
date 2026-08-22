# EZNOOBS — Pre-Domain Stability Checkpoint

This checkpoint separates code-level verification from the manual browser tests that must still be completed on the published build before calling the public beta ready.

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

## Domain readiness rule

Connect `eznoobs.com` only after CI is fully green (including typecheck, lint and production build) and the manual browser checks above have no release-blocking failures.
