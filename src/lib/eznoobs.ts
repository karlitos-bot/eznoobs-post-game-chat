export const GAMES = [
  "Counter-Strike 2",
  "League of Legends",
  "Valorant",
  "Rocket League",
  "Overwatch 2",
  "Marvel Rivals",
  "Other",
] as const;

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
const GUEST_CREDENTIAL_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newGuestCredential() {
  return `${crypto.randomUUID()}.${crypto.randomUUID()}`;
}

/**
 * Returns a browser-local guest credential in the form publicId.secret.
 * The public ID is stored in chat rows; the secret is only kept in localStorage
 * and is verified server-side before any write action.
 */
export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let credential = localStorage.getItem(GUEST_KEY);

  // Migrate the old public-only UUID format to a fresh credential.
  if (!credential || !GUEST_CREDENTIAL_RE.test(credential)) {
    credential = newGuestCredential();
    localStorage.setItem(GUEST_KEY, credential);
  }

  return credential;
}

export function getGuestPublicId(credential: string): string {
  const dot = credential.indexOf(".");
  return dot > 0 ? credential.slice(0, dot) : credential;
}

export function rememberNickname(nick: string) {
  if (typeof window !== "undefined") localStorage.setItem("eznoobs_nick", nick);
}
export function lastNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("eznoobs_nick") ?? "";
}
