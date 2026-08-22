# EZNOOBS — Working Data Processing Map

This document is an internal privacy/compliance inventory for the current beta architecture. It should be updated whenever the product, providers, retention periods or legal bases materially change. It is not a substitute for qualified legal advice.

## Design principles

- Temporary rooms, not permanent social profiles.
- No mandatory account.
- No public searchable message history.
- No DMs/friend graph in the current product.
- No user image/file upload or voice chat in the current beta.
- Minimise retained evidence to what is needed for safety, security, legal obligations and review.
- Do not sell personal data or use behavioural advertising in the current beta.

## Processing inventory

| Data / event | Purpose | Working legal basis to validate with counsel | Typical location | Current retention / lifecycle | Access / recipients |
| --- | --- | --- | --- | --- | --- |
| Browser guest credential | Distinguish one browser participant from another; protect room actions | Service performance / contract where applicable; legitimate interests for security | Browser local storage; secret/hash-related server state | Browser side until site data is cleared; server-side credential state follows participant/lobby lifecycle | User browser; EZNOOBS backend/database |
| Room code, selected game, timestamps | Create and operate temporary lobby | Service performance / contract where applicable | Database | Lobby lifecycle; purged after expiry/cleanup | EZNOOBS backend; participants receive limited room state |
| Nickname / side / presence | Display participants and maintain room state | Service performance / contract where applicable | Database + realtime | Temporary lobby lifecycle | Joined room participants; EZNOOBS backend |
| Chat messages | Provide post-game text chat | Service performance / contract where applicable | Database + realtime | Temporary lobby lifecycle unless separately preserved as report evidence | Joined room participants; EZNOOBS backend |
| Reactions / Runback votes | Room interaction / successor-room coordination | Service performance / contract where applicable | Database + realtime | Temporary lobby lifecycle | Joined room participants; EZNOOBS backend |
| Realtime room token | Restrict realtime channel access to joined participants | Legitimate interests / service security | Private server/database state; browser session storage | Short-lived / room lifecycle | User browser and EZNOOBS backend only |
| Rate-limit / abuse events | Prevent spam, abuse and security bypass | Legitimate interests in service security | Database/private operational state | Short-lived; exact setting should remain documented in migrations | EZNOOBS backend / authorised operations only |
| Blocked-content moderation event | Detect/prevent serious abuse and support safety review | Legitimate interests; legal obligation where applicable | Private moderation storage | Configured to expire after 24 hours | Authorised moderation/operations only |
| Community report evidence | Review reported message after temporary lobby disappears | Legitimate interests in safety and dispute handling | Reports/moderation storage | Configured 30-day retention | Authorised moderation/operations only |
| Moderator session / audit | Securely operate moderation tools and preserve accountable decisions | Legitimate interests / security | Private database schema; browser session storage for session token | Moderator session bounded; audit finite per migration | Authorised moderator only |
| Enforcement restriction | Apply temporary mute/cooldown/suspension | Legitimate interests in safety/security | Private database schema | Restriction duration selected within server-side bounds | Authorised moderation/backend only |
| Enforcement audit | Review reversals/repeat serious abuse | Legitimate interests in safety/accountability | Private database schema | Restriction period plus limited post-expiry retention (current policy: up to 30 days) | Authorised moderation/backend only |
| Runback successor link | Connect one temporary room to one successor | Service performance | Private database schema | Temporary lobby lifecycle | EZNOOBS backend; eligible joined participants receive result |
| Technical connection metadata / logs | Deliver, secure and troubleshoot service | Legitimate interests; provider security obligations | Hosting/network/database providers | Provider-specific; must be documented for production | Hosting/network/database provider and authorised operator |
| Client diagnostics | Investigate application failures | Legitimate interests in reliability/security | Development/diagnostic service if enabled | Provider/configuration-specific | Authorised operator/provider; room codes are redacted from route labels |
| Legal/DSA notice (planned) | Review allegation that specific content is illegal; notify notifier of decision; accountability | Legal obligation and legitimate interests | Planned private legal-notice storage | Finite period to be selected after counsel review; longer only for dispute/legal hold | Authorised legal/moderation operator; authorities where legally required |
| Privacy request correspondence (planned) | Respond to data-protection rights requests | Legal obligation | Legal/privacy mailbox and limited case log | Only as long as necessary for request/accountability obligations | Authorised privacy operator/advisers |

## Browser storage inventory

The current beta intentionally avoids third-party analytics/advertising cookies. Browser storage is used for functionality such as:

- browser guest credential;
- last nickname / selected game / side;
- sound preference;
- versioned 18+ / Terms acknowledgement;
- first-room Community Rules acknowledgement;
- short-lived realtime/session state where appropriate.

Before public beta, re-check every storage key against Greek ePrivacy/Law 3471/2006 requirements. If any storage is not technically necessary or not clearly requested by the user, decide whether it should be removed, made session-only, or placed behind an appropriate consent mechanism.

## Final production processors / recipients — TO COMPLETE

Do not publish guesses. Fill this after the production deployment is fixed.

| Provider/category | Service | Region / transfer | DPA / terms reviewed | Notes |
| --- | --- | --- | --- | --- |
| Supabase | Database / realtime / backend infrastructure | TBD from production project | [ ] | Confirm project region and final production DPA/terms |
| Production host/CDN | Web/SSR deployment | TBD | [ ] | Current build targets Cloudflare/Nitro but final production arrangement must be confirmed |
| Development/preview platform | Development / preview | TBD | [ ] | Confirm whether any production traffic/data will pass through this provider |
| Error monitoring (if retained) | Diagnostics | TBD | [ ] | Keep room-code redaction; avoid chat-content capture by default |
| Email provider | legal/privacy/support correspondence | TBD | [ ] | Activate after domain and mail setup |

## Data-subject request notes

Because there is no registered account, EZNOOBS should not promise that every retained record can automatically be linked to a real-world person. Requests should use proportionate verification and the minimum additional information necessary. Avoid asking for government ID by default.

## Change-control rule

Any of these changes require a privacy review and likely a versioned policy update before release:

- accounts/profiles;
- DMs/friends/followers;
- image or file uploads;
- voice/video;
- persistent room history;
- location data;
- advertising/analytics/tracking;
- payment processing;
- minors / under-18 access;
- new moderation vendors or automated profiling;
- materially longer retention;
- new production processors or cross-border transfers.
