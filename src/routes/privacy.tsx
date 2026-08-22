import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/eznoobs/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — EZNOOBS" },
      {
        name: "description",
        content: "How EZNOOBS handles temporary room data, browser storage, safety evidence and privacy rights.",
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
      updated="August 22, 2026"
      intro="EZNOOBS is designed around temporary post-game rooms, not permanent social profiles. This policy explains what the service needs to process, why it is processed, what disappears with a room, and what limited safety or legal evidence may be kept for longer."
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
          title: "Purposes and legal bases",
          body: [
            "EZNOOBS processes temporary room and guest data to provide the service you request when you create or join a lobby, to operate the service under the Terms of Service, and to keep rooms reliable and secure.",
            "Security, anti-abuse, moderation and service-protection processing is carried out where necessary for EZNOOBS's legitimate interests in operating a safe and resilient service and, where applicable, to comply with legal obligations. Formal illegal-content notices or other legally required records may also be processed where necessary to comply with applicable law.",
            "EZNOOBS does not currently use personal data for behavioural advertising or cross-site profiling. If optional analytics or advertising technologies are introduced later, the privacy notice and consent controls will be updated before those technologies are enabled where consent is required.",
          ],
        },
        {
          title: "Browser storage and trackers",
          body: [
            "EZNOOBS may remember lightweight choices in your browser, such as your last nickname/team/game, sound preference, browser guest credential, and whether you have already acknowledged the 18+ / Terms and lobby-rules notices. These values reduce repeated setup and are not public profiles.",
            "The current beta does not intentionally install advertising cookies or third-party audience-measurement cookies. If optional tracking or analytics is added later, it must remain disabled until any consent required by applicable law has been obtained.",
          ],
        },
        {
          title: "Safety and blocked content",
          body: [
            "If content is blocked by EZNOOBS safety checks, a limited moderation event may be recorded for abuse prevention. These events can include a temporary guest identifier, lobby code, category, context and a short excerpt of the blocked content. They are configured to expire after 24 hours.",
          ],
        },
        {
          title: "Reports and legal notices",
          body: [
            "When a participant reports a message, EZNOOBS preserves limited evidence so the report can still be reviewed after the temporary room disappears. This may include the reported message text, room code, temporary reporter/reported guest identifiers, displayed nickname/team, report reason and timestamp.",
            "Report evidence is configured for a 30-day retention period and is then eligible for automatic deletion. This is intentionally longer than normal room data because the report would otherwise disappear before it could be reviewed.",
            "A separate electronic notice-and-action channel for allegedly illegal content is being prepared before wider public beta. Formal legal notices may require additional information, such as contact details, the exact location of the content, the legal reason for the notice and a good-faith confirmation. Any retention for those notices will be limited to what is reasonably necessary for handling the notice, legal obligations, disputes and accountability.",
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
          title: "Infrastructure, recipients and processors",
          body: [
            "EZNOOBS uses hosted infrastructure, database, realtime, network and development/deployment services to operate and protect the site. Those providers may process data only as needed to provide their services to EZNOOBS, subject to the provider terms and data-protection arrangements that apply to the production setup.",
            "Hosting, network, security and platform providers may process ordinary technical connection information such as IP addresses, request metadata and logs as part of delivering and protecting the service. EZNOOBS does not expose those technical details to other lobby participants.",
            "Before wider public beta, the production operator will document the final provider list, applicable processor agreements and any international-transfer mechanism required by the selected hosting/database setup.",
          ],
        },
        {
          title: "Diagnostics and self-hosted typography",
          body: [
            "Application diagnostics may record technical error details needed to investigate failures. Room codes are intentionally redacted from EZNOOBS client error-telemetry route labels so a temporary lobby code is not unnecessarily included in that diagnostic context.",
            "EZNOOBS web fonts are bundled with the application and served by the EZNOOBS deployment. The current site does not request its brand typography from Google Fonts at runtime.",
          ],
        },
        {
          title: "Your choices and privacy rights",
          body: [
            "You can clear EZNOOBS browser storage through your browser/site-data controls to remove the locally remembered guest credential and preferences from that browser. Doing so creates a fresh browser identity the next time you use the service.",
            "Depending on the law that applies to you, you may have rights relating to personal data such as access, correction, deletion, restriction, objection, portability where applicable, or complaint to a supervisory authority. Because EZNOOBS intentionally avoids registered accounts and most room data is short-lived, the service may have limited ability to connect a retained record to a real-world person without additional information from that person.",
            "A dedicated privacy contact method and the identity/contact details of the production data controller will be published before wider public beta so applicable privacy requests can be handled through a clear channel.",
          ],
        },
        {
          title: "What EZNOOBS does not build by default",
          bullets: [
            "No mandatory account or permanent public profile is required for the current service.",
            "No direct-message system or friend graph is part of the current product.",
            "No public searchable history of your temporary rooms or messages is provided.",
            "The current chat architecture does not use browser-to-browser WebRTC/P2P connections for lobby messaging.",
            "The current beta does not provide user image uploads, file uploads or voice chat.",
          ],
        },
        {
          title: "Changes and contact",
          body: [
            "EZNOOBS is still being prepared for public beta, so this policy may be updated as features, providers or legal requirements change. The Last updated date will change when material wording changes.",
            "A dedicated privacy/support/legal contact method and final controller information will be published on EZNOOBS before the wider public-beta launch. Until then, this page describes the current beta data model and retention rules and should receive qualified legal review before commercial or large-scale launch.",
          ],
        },
      ]}
    />
  );
}
