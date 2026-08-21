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
      updated="August 21, 2026"
      intro="These terms govern use of the current EZNOOBS beta service. The product is intentionally lightweight and temporary: create a room after a match, share the code, talk, and let the room disappear."
      sections={[
        {
          title: "18+ requirement",
          body: [
            "EZNOOBS is intended for adults. You may use the service only if you are at least 18 years old and legally able to agree to these terms.",
          ],
        },
        {
          title: "Using the service",
          body: [
            "You may use EZNOOBS for temporary post-game communication, reactions, rematch coordination and related social interaction. You are responsible for the content you submit and for using the service lawfully.",
          ],
        },
        {
          title: "Community Rules apply",
          body: [
            "The Community Rules are part of these terms. Normal game trash talk and profanity are allowed, but protected-class hate, threats, doxxing, personal-data exposure, deliberate service disruption and abusive misuse of reporting or other controls are not.",
          ],
        },
        {
          title: "Temporary rooms",
          body: [
            "EZNOOBS rooms are designed to expire. The service does not promise permanent access to messages, participants, reactions, votes, room codes or other ordinary lobby data. Do not use EZNOOBS as storage for information you need to preserve.",
          ],
        },
        {
          title: "Your content",
          body: [
            "You keep whatever rights you have in content you submit. You give EZNOOBS the limited permission needed to process, display, transmit and temporarily store that content to operate the room, enforce the Community Rules and handle reports. If a message is reported, a limited moderation copy may remain for the retention period described in the Privacy Policy.",
          ],
        },
        {
          title: "Moderation and enforcement",
          body: [
            "EZNOOBS may block content, rate-limit actions, remove access to a room or session, preserve report evidence, or apply stronger restrictions where reasonably necessary to enforce the Community Rules, protect users or protect the service. A report by itself does not guarantee enforcement against another participant.",
          ],
        },
        {
          title: "No account or identity guarantee",
          body: [
            "The current service does not require registered accounts. In-game usernames are user-chosen display labels and are not verified identities. Do not rely on a displayed nickname as proof of who a person is.",
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
            "To the maximum extent permitted by applicable law, EZNOOBS does not guarantee uninterrupted availability, preservation of temporary content, error-free operation or that every harmful message will be detected. Nothing in these terms limits rights or protections that cannot legally be excluded.",
          ],
        },
        {
          title: "Changes to these terms",
          body: [
            "These terms may change as the beta evolves. Material updates will be reflected by changing the Last updated date on this page. Continued use after an update means you agree to the revised terms to the extent permitted by applicable law.",
          ],
        },
      ]}
    />
  );
}
