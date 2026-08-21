import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/eznoobs/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EZNOOBS" },
      {
        name: "description",
        content: "How EZNOOBS handles temporary room data, browser preferences, moderation events and reports.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      updated="August 21, 2026"
      intro="EZNOOBS is designed around temporary post-game rooms, not permanent social profiles. This policy explains what the service needs to process, what disappears with a room, and what limited safety evidence may be kept for longer."
      sections={[
        {
          title: "No account required",
          body: [
            "You can create and join EZNOOBS rooms without registering an account. The service uses a browser guest credential so the backend can distinguish your actions from another participant's actions and enforce room/security rules.",
            "That guest credential normally remains in your browser's local storage until you clear EZNOOBS site data. It is not a public profile. If persistent browser storage is unavailable, EZNOOBS can fall back to an in-memory credential for the current page session.",
          ],
        },
        {
          title: "Temporary room data",
          body: [
            "While a room is active, EZNOOBS processes the information needed to make the room work. Ordinary room data is deleted when the temporary lobby is purged after expiry.",
          ],
          bullets: [
            "Room code, selected game and room lifetime information.",
            "Temporary participant identifier, in-game username, selected side and recent-presence time.",
            "Chat messages, reactions, Runback votes and realtime room state.",
            "Private participant credential hashes and temporary realtime tokens used to protect room actions.",
            "A short-lived Runback link may connect an expired/ending room to one successor room; that link disappears with the temporary lobby lifecycle and is not permanent match history.",
          ],
        },
        {
          title: "Browser preferences",
          body: [
            "EZNOOBS may remember lightweight choices in your browser, such as your last nickname/team/game, sound preference, and whether you have already acknowledged the 18+ / Terms and lobby-rules notices. These preferences reduce repeated setup and are not public profiles.",
          ],
        },
        {
          title: "Safety and blocked content",
          body: [
            "If content is blocked by EZNOOBS safety checks, a limited moderation event may be recorded for abuse prevention. These events can include a temporary guest identifier, lobby code, category, context and a short excerpt of the blocked content. They are configured to expire after 24 hours.",
          ],
        },
        {
          title: "Reports",
          body: [
            "When a participant reports a message, EZNOOBS preserves limited evidence so the report can still be reviewed after the temporary room disappears. This may include the reported message text, room code, temporary reporter/reported guest identifiers, displayed nickname/team, report reason and timestamp.",
            "Report evidence is configured for a 30-day retention period and is then eligible for automatic deletion. This is intentionally longer than normal room data because the report would otherwise disappear before it could be reviewed.",
          ],
        },
        {
          title: "Moderation enforcement",
          body: [
            "If a moderator confirms abuse, EZNOOBS may apply a temporary chat mute, cooldown or suspension to the browser guest identity involved. The active restriction is keyed by a one-way hash of the browser guest public identifier rather than storing that identifier in plaintext in the restriction table.",
            "Active restriction data is kept only for the moderator-selected restriction period. A limited enforcement audit record may be kept for the restriction period and up to 30 days afterward so repeat serious abuse and moderator reversals can be reviewed. Expired restrictions and expired enforcement audit records are automatically purged.",
            "The current beta enforcement system does not create a permanent public profile and does not maintain a raw-IP ban list.",
          ],
        },
        {
          title: "Rate limiting and service security",
          body: [
            "EZNOOBS records short-lived action events to enforce server-side rate limits and prevent obvious abuse of room creation, joins, messages, reactions, reports and security-sensitive room endpoints. These operational events are not public activity histories.",
          ],
        },
        {
          title: "Infrastructure and diagnostics",
          body: [
            "EZNOOBS uses hosted infrastructure and database services to operate the site. Hosting, network, security and platform providers may process ordinary technical connection information such as IP addresses, request metadata and logs as part of delivering and protecting the service. EZNOOBS does not expose those technical details to other lobby participants.",
            "Application diagnostics may record technical error details needed to investigate failures. Room codes are intentionally redacted from EZNOOBS client error-telemetry route labels so a temporary lobby code is not unnecessarily included in that diagnostic context.",
          ],
        },
        {
          title: "What EZNOOBS does not build by default",
          bullets: [
            "No mandatory account or permanent public profile is required for the current service.",
            "No direct-message system or friend graph is part of the current product.",
            "No public searchable history of your temporary rooms or messages is provided.",
            "The current chat architecture does not use browser-to-browser WebRTC/P2P connections for lobby messaging.",
          ],
        },
        {
          title: "Changes and contact",
          body: [
            "EZNOOBS is still being prepared for public beta, so this policy may be updated as features or infrastructure change. The Last updated date will change when material wording changes.",
            "A dedicated privacy/support contact method will be published on EZNOOBS before the wider public-beta launch. Until then, this page describes the current beta data model and retention rules.",
          ],
        },
      ]}
    />
  );
}
