# EZNOOBS — Pre-Beta QA Checklist

Use this checklist before public beta. Run the browser tests against the published build, not only local/dev preview.

## 1. First-use safety flow

- [ ] Fresh Incognito/InPrivate visit shows the 18+ gate.
- [ ] Copy is short: EZNOOBS is intended for adults; confirm 18+ to continue.
- [ ] Continue button stays disabled until the checkbox is selected.
- [ ] Keyboard focus stays inside the modal while it is open.
- [ ] On a short mobile viewport the modal scrolls instead of clipping controls.
- [ ] First lobby entry shows the rules reminder.
- [ ] Rules reminder allows normal game trash talk/profanity and clearly blocks hate/slurs, threats and doxxing.
- [ ] After accepting, neither gate repeats on normal navigation in the same browser.

## 2. Lobby lifetime

- [ ] Fresh room starts at about 7:00.
- [ ] No manual “+3 min” / Keep It Going control exists.
- [ ] Activity while more than 2:00 remains does not extend expiry.
- [ ] A valid message, reaction or Runback vote at <= 2:00 can add about +1:00.
- [ ] Multiple rapid actions cannot bank multiple minutes immediately.
- [ ] A room can never live beyond 10:00 from original creation.
- [ ] Typing, refreshes, reconnects and presence heartbeats do not extend the room.
- [ ] At 00:00 the composer closes and the room never revives.

## 3. Reconnect torture

- [ ] Two browsers/clients are in the same room.
- [ ] Put one client offline for 20–30 seconds.
- [ ] Offline client shows connection loss and keeps its unsent draft.
- [ ] Other client can continue chatting while the first is offline.
- [ ] Restore network; missing state catches up automatically.
- [ ] Connection state returns to Live without a page reload.
- [ ] No messages are duplicated after reconnect.
- [ ] Repeat with an outage longer than the initial realtime retry burst.
- [ ] Refresh one joined client five times; the same guest identity returns.
- [ ] No duplicate roster entry is created by repeated refreshes.
- [ ] Open the same room in another tab of the same browser; it behaves as the same guest identity.
- [ ] Take one client offline near expiry, allow 00:00 to pass, then reconnect; the expired room remains closed.

## 4. Multiplayer browser session

Run with 4–6 real browser clients if possible.

- [ ] All clients can join with unique usernames.
- [ ] Simultaneous messages arrive on every client.
- [ ] Reactions converge to the same counts.
- [ ] Runback votes converge to the same count.
- [ ] Typing indicators identify only real joined users.
- [ ] Leaving/reconnecting does not create ghost roster entries.
- [ ] No client becomes permanently stuck in Syncing while others remain healthy.

## 5. Mobile/responsive QA

Test at least one narrow phone viewport (~360px), a larger phone (~430px), tablet, and desktop.

- [ ] No horizontal page scrolling.
- [ ] 18+ and rules modals fit and scroll on short screens.
- [ ] Join form remains usable with the software keyboard open.
- [ ] Room uses the dynamic viewport without content disappearing behind browser chrome.
- [ ] Composer stays above the bottom safe area.
- [ ] Send/reaction/roster/leave controls remain comfortable touch targets.
- [ ] Player drawer fits the viewport and scrolls internally.
- [ ] Player drawer supports Escape to close and traps Tab focus on keyboard devices.
- [ ] Long usernames/messages wrap or truncate without breaking layout.
- [ ] Opening Shots never covers the composer.

## 6. Accessibility

- [ ] Complete the first-use flow using keyboard only.
- [ ] Complete lobby join using keyboard only.
- [ ] Visible focus indicator is present on interactive controls.
- [ ] First-use dialog announces a title and description.
- [ ] Mobile roster exposes dialog semantics.
- [ ] Buttons with icons have useful accessible names.
- [ ] Reduced-motion OS setting suppresses nonessential animation/transitions.
- [ ] Critical connection/expiry information is understandable without relying only on color.

## 7. Performance sanity

- [ ] Active chat remains smooth with 4–6 clients.
- [ ] Scrolling a message-heavy room stays responsive.
- [ ] Typing into the composer does not visibly lag.
- [ ] Background tabs do not create noticeable CPU load.
- [ ] Reconnect does not cause a burst of duplicate requests/messages.
- [ ] Expiry UI does not cause continuous layout jumping.

## 8. Release blockers after QA

Do not call public beta ready until:

- [ ] All P0 security/live audits remain green.
- [ ] Timer/reconnect tests above pass.
- [ ] Mobile blockers are fixed.
- [ ] Community Rules, Privacy Policy and Terms are published.
- [ ] Moderation/report operating rules are defined.
- [ ] Final production build/security check passes.
- [ ] Domain/share-link/social-preview checks are complete.
