export const GAMES = [
  "Counter-Strike 2",
  "League of Legends",
  "Valorant",
  "Rocket League",
  "Overwatch 2",
  "Marvel Rivals",
  "Other",
] as const;

export type Game = (typeof GAMES)[number];
export type Team = "blue" | "red" | "spectator";

export const TEAMS: { value: Team; label: string }[] = [
  { value: "blue", label: "Team Blue" },
  { value: "red", label: "Team Red" },
  { value: "spectator", label: "Spectator" },
];

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;

export function normalizeCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

export function teamClasses(team: Team) {
  if (team === "blue")
    return { text: "text-blue-team", border: "border-blue-team/40", bg: "bg-blue-team/10" };
  if (team === "red")
    return { text: "text-red-team", border: "border-red-team/40", bg: "bg-red-team/10" };
  return { text: "text-spectator", border: "border-spectator/30", bg: "bg-spectator/10" };
}

const GUEST_KEY = "eznoobs_guest_id";
const NICK_KEY = "eznoobs_nick";
const GAME_KEY = "eznoobs_game";
const TEAM_KEY = "eznoobs_team";
const GUEST_CREDENTIAL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let memoryGuestCredential = "";
const memoryPreferences = new Map<string, string>();

function newGuestCredential() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

function isGame(value: string): value is Game {
  return (GAMES as readonly string[]).includes(value);
}

function isTeam(value: string): value is Team {
  return value === "blue" || value === "red" || value === "spectator";
}

function readLocalValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memoryPreferences.get(key) ?? null;
  }
}

function writeLocalValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  memoryPreferences.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Restricted/private storage falls back to memory for the current page session.
  }
}

/**
 * Returns a browser-local guest credential in the form publicId.secret.
 * The credential normally persists in localStorage until site data is cleared so
 * browser-level abuse enforcement can survive page reloads. If storage is blocked,
 * EZNOOBS falls back to an in-memory credential for the current page session.
 */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";

  let credential = readLocalValue(GUEST_KEY) ?? memoryGuestCredential;

  // Migrate the old public-only UUID format to a fresh credential.
  if (!credential || !GUEST_CREDENTIAL_RE.test(credential)) {
    credential = newGuestCredential();
  }

  memoryGuestCredential = credential;
  writeLocalValue(GUEST_KEY, credential);
  return credential;
}

export function getGuestPublicId(credential: string): string {
  const dot = credential.indexOf(".");
  return dot > 0 ? credential.slice(0, dot) : credential;
}

export function rememberNickname(nick: string) {
  writeLocalValue(NICK_KEY, nick);
}

export function lastNickname(): string {
  return readLocalValue(NICK_KEY) ?? "";
}

export function rememberGame(game: string) {
  if (isGame(game)) writeLocalValue(GAME_KEY, game);
}

export function lastGame(): Game {
  const game = readLocalValue(GAME_KEY);
  return game && isGame(game) ? game : GAMES[0];
}

export function rememberTeam(team: Team) {
  writeLocalValue(TEAM_KEY, team);
}

export function lastTeam(): Team {
  const team = readLocalValue(TEAM_KEY);
  return team && isTeam(team) ? team : "blue";
}

export function rememberLobbyPreferences({
  nickname,
  game,
  team,
}: {
  nickname?: string;
  game?: string;
  team?: Team;
}) {
  if (nickname) rememberNickname(nickname);
  if (game) rememberGame(game);
  if (team) rememberTeam(team);
}
