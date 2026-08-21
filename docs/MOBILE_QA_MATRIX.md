# EZNOOBS P1 #9 — Mobile QA Matrix

Use the published build or responsive DevTools for the viewport checks below. Real-device checks are still required for keyboard, safe-area, share sheet and browser chrome behavior.

## Viewports

- 320 × 568 — narrow/legacy phone stress case
- 375 × 667 — small modern phone
- 390 × 844 — common modern phone
- 430 × 932 — large phone
- 768 × 1024 — tablet portrait
- 1024 × 768 — tablet landscape

## Homepage

- No horizontal scrolling at any viewport.
- EZNOOBS wordmark and public-test badge do not collide.
- Hero headline remains readable and does not clip.
- Create Lobby CTA remains fully visible and at least 44px high.
- Game grid stays usable at 320px.
- Username field does not trigger browser zoom when focused.
- Blue / Red / Spectator controls remain tappable.
- Room-code input and Join action remain on-screen when keyboard opens.
- Community Rules / Privacy / Terms links have comfortable tap targets.
- Bottom legal bar does not collide with device safe area.

## First-use 18+ and rules dialogs

- Dialog fits 320px width without horizontal overflow.
- On a short landscape viewport, dialog scrolls instead of clipping controls.
- Checkbox label is tappable, not only the small checkbox.
- Continue / Enter Lobby buttons remain reachable with browser chrome visible.
- Opening the keyboard elsewhere never leaves the page permanently body-locked.

## Join lobby screen

- Room code, game and timer fit without overlap.
- Username field remains visible when keyboard opens.
- Team buttons do not overflow.
- Enter Lobby button remains reachable on short screens.
- Expired lobby state is readable without clipped content.

## Live room

- No page-level horizontal scrolling.
- Room uses the visible mobile viewport; composer is not hidden under browser UI.
- Timer, room code and roster button fit at 320px.
- At very narrow widths, reduced logo treatment does not hide timer/code/roster controls.
- Secondary Invite / Runback / Leave controls fit on one row or remain fully usable.
- Opening the roster leaves a clear backdrop target to dismiss it.
- Roster drawer respects top and bottom safe areas.
- Long 20-character usernames do not push timestamps/actions off-screen.
- 500-character unbroken-ish message content wraps instead of expanding the page.
- Reaction chips remain at least 40px in the room and do not overlap Report.
- Report control is directly tappable on touch devices.
- Typing strip truncates long names instead of widening the page.
- Textarea remains visible above the on-screen keyboard.
- Character counter does not cover typed text.
- Native share sheet works on a coarse-pointer mobile device.
- Rotating portrait ↔ landscape does not strand the composer or roster off-screen.

## Connection / keyboard stress

- Type a draft, background the browser, then return: draft remains.
- Toggle airplane mode/offline while keyboard is open: reconnect banner remains readable.
- Reconnect: composer becomes usable again without refresh.
- Send from the mobile keyboard: Enter inserts/newline behavior does not accidentally submit on coarse-pointer devices.
- Repeated focus/blur does not cause the page to stay zoomed or shifted.

## Legal pages

- Community Rules, Privacy and Terms have no horizontal overflow.
- Long paragraphs and bullet text wrap safely.
- Headings fit at 320px.
- Back button remains visible beside the logo.
- Legal navigation links remain at least 44px high.
- Footer clears the bottom safe area.

## Moderator / enforcement pages

- Login inputs fit without horizontal scroll.
- Queue filters wrap instead of overflowing.
- Evidence text and technical IDs wrap safely.
- Notes textarea remains usable with keyboard open.
- Enforcement action/duration selects fit at 320px.
- Review / Refresh / Lift controls remain tappable.

## P1 #9 pass condition

P1 #9 can be marked complete after:

1. All six viewport sizes have no blocker-level layout overflow.
2. One real Android or iOS phone passes homepage → create/join → live chat → roster → report → share flow.
3. On-screen keyboard does not cover or permanently displace the composer.
4. No critical control is below 44px except compact in-message reaction chips, which remain at least 40px.
5. Any issues found are fixed and retested at both 320px and 390px.
