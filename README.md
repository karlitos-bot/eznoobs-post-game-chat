# EZNOOBS Post-Game Chat

Build a polished MVP web app called EZNOOBS.

PRODUCT IDEA
EZNOOBS is a gamer-first temporary post-game text chat platform. A player finishes a multiplayer match, creates a temporary room, gets a short shareable URL like /XEL34, pastes that link into the game's post-match chat, and teammates/enemies can join the same room to continue chatting. It is for gamers in general, not one specific game.

CORE POSITIONING
Tagline: “The match ended. The lobby didn’t.”
Tone: playful, competitive, gamer-native, slightly edgy, but not hateful or harassment-focused. Normal profanity and trash talk are part of the culture, while threats, doxxing, hate speech, spam, sustained targeted harassment and illegal content are not acceptable.

MVP GOAL
Build the real core flow now:
1. Homepage
2. Create a lobby
3. Generate a short 5-character room code using uppercase letters/numbers excluding confusing characters
4. Route to /room/{CODE}
5. Allow anyone with the URL to join the same lobby
6. Ask for nickname before entering
7. Let user choose Team Blue, Team Red, or Spectator
8. Realtime text chat shared between different browsers/devices
9. Show current players in the room if feasible
10. Copy invite link button
11. Temporary lobby concept with visible expiry/status
12. Join-by-code field on homepage
13. Responsive mobile/desktop UI

TECHNICAL REQUIREMENTS
- Use the Lovable default full-stack TypeScript stack.
- Provision/use the project’s Supabase/PostgreSQL backend for persistent lobby/message data and realtime behavior.
- Do NOT require accounts/authentication for MVP.
- Use a guest session identifier stored locally so messages can be associated with a browser session without sign-up.
- Database should include at minimum lobbies, participants/presence where appropriate, and messages.
- Validate room codes and nicknames server-side where possible.
- Limit nickname length to around 20 chars and message length to around 500 chars.
- Add basic anti-spam/rate-limit foundations if practical without overcomplicating MVP.
- Treat lobby URL knowledge as the access boundary for now.
- No DMs, user search, profiles, voice chat, friends, follower systems, file uploads or images in MVP.
- Avoid overengineering.

ROOM CREATION
When creating a room, ask for:
- Game: Counter-Strike 2, League of Legends, Valorant, Rocket League, Overwatch 2, Marvel Rivals, Other
- Nickname
- Team: Blue, Red, Spectator
Then create the lobby and enter it immediately.

ROOM PAGE
Header should include:
- EZNOOBS logo
- game name
- room code
- copy invite button
- visible status such as LIVE
- a small expiry indicator such as “expires after inactivity” or a countdown if implemented safely

Desktop room layout:
- left sidebar: players grouped by Blue Team / Red Team / Spectators
- main area: chat
- mobile: collapse player list cleanly without breaking chat usability

Each message should show:
- nickname
- team identity through accent/badge
- timestamp
- message

Include local mute control foundation if easy, but do not let moderation features distract from the main experience.

DESIGN DIRECTION
Make it feel like a modern gaming product, NOT a generic SaaS template and NOT a Discord clone.
- near-black background
- off-white text
- acid/lime green primary accent
- blue team accent
- red team accent
- restrained borders
- subtle grid/noise/radar-like background details
- bold condensed/industrial-feeling headings if available, clean readable body font
- compact HUD-like labels
- smooth but subtle hover/entrance transitions
- clean enough to become a real brand
- avoid excessive gradients, glassmorphism, giant rounded cards, corporate illustrations, stock imagery and generic AI landing-page patterns

HOMEPAGE
Hero:
EZNOOBS
“The match ended. The lobby didn’t.”
Supporting copy: “Temporary post-game lobbies for GGs, trash talk, rematches and unfinished business.”
Primary CTA: CREATE POST-GAME LOBBY
Secondary action: join by code
Small value strip: NO ACCOUNT / TEMPORARY / GAMER-FIRST
Footer line: “Trash talk responsibly.”

PERSONALITY FOUNDATION
Include a small non-functional or lightly functional “Salt” visual in the room header such as “SALT: CALM” so the product identity is visible, but do not spend much time implementing the future Salt Meter system yet.

IMPORTANT UX RULES
- Creating or joining a room must be fast.
- No onboarding flow.
- No registration wall.
- No unnecessary modal chains.
- A person with a room link should get from link click to chatting in seconds.
- Keep the room code easy to copy/share.

SAFETY COPY
Somewhere unobtrusive in the room or join flow, communicate: profanity and competitive banter are allowed; threats, doxxing, hate speech, spam and targeted harassment are not.

DELIVERABLE
Build the working MVP rather than only a visual mockup. Verify the main flow yourself: create room, join room, send messages, and ensure room URLs function. Fix obvious build/runtime issues before finishing. Name the project EZNOOBS.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e9248f33-3b99-4c5e-b94b-a99238998f27).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
