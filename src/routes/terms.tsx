import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/eznoobs/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — EZNOOBS" },
      {
        name: "description",
        content: "The terms for using EZNOOBS temporary post-game lobbies during beta.",
      },
    ],
  }),
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Service"
      updated="August 22, 2026"
      intro="These terms govern use of the current EZNOOBS beta service. The product is intentionally lightweight and temporary: create a room after a match, share the code, talk, and let the room disappear."
      sections={[
        {
          title: "18+ requirement",
          body: [
            "EZNOOBS is intended for adults. You may use the service only if you are at least 18 years old and legally able to agree to these terms.",
          ],
        },
        {
          title: "Agreement to these terms",
          body: [
            "When the first-use screen asks you to confirm that you are 18 or older and agree to these Terms of Service, selecting that confirmation and continuing means you agree to these terms for the current beta service. If you do not agree, do not continue into EZNOOBS rooms.",
            "The Privacy Policy explains how the service handles data, and the Community Rules form part of these terms.",
          ],
        },
        {
          title: "Using the service",
          body: [
            "You may use EZNOOBS for temporary post-game communication, reactions, rematch coordination and related social interaction. You are responsible for the content you submit and for using the service lawfully.",
            "Do not use EZNOOBS to distribute content that is illegal where the service or user is subject to applicable law, to facilitate fraud or serious crime, or to create a credible risk of real-world harm.",
          ],
        },
        {
          title: "Community Rules apply",
          body: [
            "The Community Rules are part of these terms. Normal game trash talk and profanity are allowed, but protected-class hate, threats, doxxing, personal-data exposure, sexual exploitation, deliberate service disruption and abusive misuse of reporting or other controls are not.",
          ],
        },
        {
          title: "Temporary rooms",
          body: [
            "EZNOOBS rooms are designed to expire. The service does not promise permanent access to messages, participants, reactions, votes, room codes or other ordinary lobby data. Do not use EZNOOBS as storage for information you need to preserve.",
            "Temporary room deletion does not prevent EZNOOBS from retaining the limited evidence described in the Privacy Policy when a report, safety event, legal notice, security incident or legal obligation requires it.",
          ],
        },
        {
          title: "Your content",
          body: [
            "You keep whatever rights you have in content you submit. You give EZNOOBS the limited permission needed to process, display, transmit and temporarily store that content to operate the room, enforce the Community Rules and handle reports. If a message is reported, a limited moderation copy may remain for the retention period described in the Privacy Policy.",
            "You must not submit content that you do not have the right to share or content that unlawfully infringes another person's copyright, trademark, privacy, publicity or other legal rights.",
          ],
        },
        {
          title: "Illegal-content notices",
          body: [
            "EZNOOBS is preparing a separate electronic notice-and-action channel for specific content that a person or entity believes is illegal. That channel is distinct from the normal in-room community report control and will be activated before wider public beta.",
            "A formal notice should identify the specific content and its exact electronic location, explain why the notifier believes it is illegal, provide the notifier information required by applicable law, and include a good-faith confirmation that the notice is accurate and complete. EZNOOBS will process valid notices in a timely, diligent, objective and non-arbitrary manner.",
          ],
        },
        {
          title: "Moderation and enforcement",
          body: [
            "EZNOOBS may block content, rate-limit actions, remove access to a room or session, preserve report evidence, or apply stronger restrictions where reasonably necessary to enforce the Community Rules, protect users, comply with law or protect the service. A report by itself does not guarantee enforcement against another participant.",
            "When EZNOOBS restricts content or service access and has a practical electronic way to inform the affected person, it will aim to explain the restriction and the reason for it unless doing so would conflict with law, safety or security requirements.",
          ],
        },
        {
          title: "No account or identity guarantee",
          body: [
            "The current service does not require registered accounts. In-game usernames are user-chosen display labels and are not verified identities. Do not rely on a displayed nickname as proof of who a person is.",
          ],
        },
        {
          title: "Independent service and game references",
          body: [
            "EZNOOBS is an independent community service. References to games, publishers, platforms, teams or other third-party products are for identification and compatibility/context only and do not imply sponsorship, partnership, endorsement or affiliation unless EZNOOBS expressly says otherwise.",
            "Third-party game names, logos, characters, artwork and other marks remain the property of their respective owners. EZNOOBS should use third-party brand assets only where permitted by applicable law, licence or published brand guidelines.",
          ],
        },
        {
          title: "Beta service",
          body: [
            "EZNOOBS is being tested and improved. Features may change, break, be limited, be removed or be unavailable without notice. Rooms may fail to create, reconnect or persist for their expected lifetime during testing. The service is provided on an as-available basis during beta.",
          ],
        },
        {
          title: "Prohibited interference",
          bullets: [
            "Do not attempt to bypass room credentials, rate limits, moderation controls or other security measures.",
            "Do not probe, scrape, overload or disrupt EZNOOBS or its infrastructure without authorization.",
            "Do not use forged requests, automated abuse, impersonation or report manipulation to interfere with other users.",
            "Do not use the service for unlawful activity or to facilitate real-world harm.",
          ],
        },
        {
          title: "Availability and liability",
          body: [
            "To the maximum extent permitted by applicable law, EZNOOBS does not guarantee uninterrupted availability, preservation of temporary content, error-free operation or that every harmful or unlawful message will be detected. Nothing in these terms limits rights or protections that cannot legally be excluded.",
          ],
        },
        {
          title: "Changes to these terms",
          body: [
            "These terms may change as the beta evolves. Material updates will be reflected by changing the Last updated date on this page and, where appropriate, by asking users to acknowledge the updated terms again. Continued use after an update means you agree to the revised terms to the extent permitted by applicable law.",
          ],
        },
        {
          title: "Operator and contact before wider launch",
          body: [
            "EZNOOBS is still being prepared for wider public beta. The production operator identity, legally required establishment/contact information, a dedicated privacy/support/legal contact method and any jurisdiction-specific notices required for the intended launch markets will be published before that broader release.",
            "These beta terms are a product-level compliance draft and should receive qualified Greek/EU legal review before commercial or large-scale launch. No placeholder in this document should be treated as a substitute for legally required operator information once the service is publicly launched.",
          ],
        },
      ]}
    />
  );
}
