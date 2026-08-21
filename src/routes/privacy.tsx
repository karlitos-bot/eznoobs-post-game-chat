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
            "You can create and join EZNOOBS rooms without registering an account. The service uses a temporary browser guest credential so the backend can distinguish your actions from another participant's actions inside a room.",
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
            "Temporary private credentials and realtime tokens used to protect room actions.",
          ],
        },
        {
          title: "Browser preferences",
          body: [
            "EZNOOBS may remember lightweight choices in your browser, such as your last nickname/team/game, sound preference, and whether you have already acknowledged the 18+ and lobby-rules notices. These preferences are used to reduce repeated setup and are not public profiles.",
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
          title: "Rate limiting and service security",
          body: [
            "EZNOOBS records short-lived action events to enforce server-side rate limits and prevent obvious abuse of room creation, joins, messages, reactions, reports and security-sensitive room endpoints. These operational events are not public activity histories.",
          ],
        },
        {
          title: "Infrastructure data",
          body: [
            "EZNOOBS uses hosted infrastructure and database services to operate the site. Hosting, network, security and platform providers may process ordinary technical connection information such as IP addresses, request metadata and logs as part of delivering and protecting the service. EZNOOBS does not expose those technical details to other lobby participants.",
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
