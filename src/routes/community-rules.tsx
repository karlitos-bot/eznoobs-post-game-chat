import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/eznoobs/LegalPage";

export const Route = createFileRoute("/community-rules")({
  head: () => ({
    meta: [
      { title: "Community Rules — EZNOOBS" },
      {
        name: "description",
        content: "The EZNOOBS community rules: trash talk is welcome, hate, threats and doxxing are not.",
      },
    ],
  }),
  component: CommunityRules,
});

function CommunityRules() {
  return (
    <LegalPage
      eyebrow="Community standard"
      title="Community Rules"
      updated="August 21, 2026"
      intro="EZNOOBS is built for the few minutes after a match when people still have something to say. Trash talk is part of the point. Real-world abuse is not. Keep it about the game, the play and the rivalry."
      sections={[
        {
          title: "Adults only",
          body: [
            "EZNOOBS is intended for people who are 18 years old or older. By continuing into the service, you confirm that you meet that requirement.",
          ],
        },
        {
          title: "Trash talk is allowed",
          body: [
            "Competitive banter, profanity, ordinary insults, jokes about the match and telling someone they got diffed are allowed. EZNOOBS is not trying to turn post-game chat into a corporate meeting.",
          ],
          bullets: [
            "Talk about the game, the score, the play, the throw, the clutch, the whiff or the rematch.",
            "Profanity and ordinary non-protected insults are allowed.",
            "You can mute another player locally if you simply do not want to see their messages.",
          ],
        },
        {
          title: "The hard line",
          body: [
            "The moment trash talk turns into protected-class hate, real-world threats or personal-data exposure, it is no longer normal game banter and it is not allowed on EZNOOBS.",
          ],
          bullets: [
            "No slurs or hateful attacks targeting race, ethnicity, nationality, sex, gender, religion, disability or other protected identity characteristics.",
            "No threats of violence, sexual violence, swatting, stalking or real-world intimidation.",
            "No doxxing. Do not post another person's address, phone number, email, IP address, social handle or other private contact/location information.",
            "Do not use usernames, messages or room behavior to harass, impersonate or deliberately disrupt other people or the service.",
          ],
        },
        {
          title: "Spam and abuse",
          body: [
            "EZNOOBS uses server-side rate limits and safety checks to keep temporary rooms usable. Repeatedly hammering messages, reactions, reports, room joins or other actions may be slowed or blocked.",
          ],
        },
        {
          title: "Reporting",
          body: [
            "A report preserves a limited snapshot of the reported message so it can be reviewed after the temporary room disappears. Reports are signals for review, not automatic proof that someone broke the rules.",
            "Do not abuse the report system to punish someone for ordinary trash talk, losing a match or disagreeing with you.",
          ],
        },
        {
          title: "Enforcement",
          body: [
            "EZNOOBS may block content, rate-limit actions, restrict a session or take stronger action against repeated or serious abuse. Enforcement is intended to target behavior that crosses the safety line without treating normal game trash talk as a violation.",
          ],
        },
        {
          title: "Temporary means temporary",
          body: [
            "Rooms are designed to disappear. Do not treat an EZNOOBS lobby as permanent storage, a private vault or a place to post information you need to keep. When the room ends, ordinary room data is deleted as part of the temporary-room lifecycle.",
          ],
        },
      ]}
    />
  );
}
