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
  if (team === "blue") return { text: "text-blue-team", border: "border-blue-team/40", bg: "bg-blue-team/10" };
  if (team === "red") return { text: "text-red-team", border: "border-red-team/40", bg: "bg-red-team/10" };
  return { text: "text-spectator", border: "border-spectator/30", bg: "bg-spectator/10" };
}

const GUEST_KEY = "eznoobs_guest_id";

export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY, id);
  }
  return id;
}

export function rememberNickname(nick: string) {
  if (typeof window !== "undefined") localStorage.setItem("eznoobs_nick", nick);
}
export function lastNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("eznoobs_nick") ?? "";
}
