import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
import { createLobby } from "@/lib/lobby.functions";
import {
  GAMES,
  TEAMS,
  type Team,
  getGuestId,
  lastNickname,
  normalizeCode,
  rememberNickname,
  CODE_RE,
} from "@/lib/eznoobs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EZNOOBS — Temporary Post-Game Lobbies for Gamers" },
      {
        name: "description",
        content:
          "Create a temporary post-game chat lobby, share a 5-character code, and keep the trash talk going after the match ends. No account needed.",
      },
      { property: "og:title", content: "EZNOOBS — The match ended. The lobby didn't." },
      {
        property: "og:description",
        content:
          "Temporary post-game lobbies for GGs, trash talk, rematches and unfinished business.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const create = useServerFn(createLobby);
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState<string>(GAMES[0]);
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState<Team>("blue");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (nick.length < 2) {
      toast.error("Nickname needs at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      rememberNickname(nick);
      const res = await create({ data: { game, nickname: nick, team, guestId: getGuestId() } });
      navigate({ to: "/room/$code", params: { code: res.code } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create lobby.");
    } finally {
      setBusy(false);
    }
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!CODE_RE.test(c)) {
      toast.error("Room codes are 5 characters, e.g. XEL34.");
      return;
    }
    navigate({ to: "/room/$code", params: { code: c } });
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.35]" />
      <div className="pointer-events-none absolute inset-0 radar-glow" />

      <header className="relative z-10 flex items-center justify-between border-b border-border/60 px-5 py-4">
        <Logo className="text-2xl" />
        <span className="hud-label">No account · Temporary · Gamer-first</span>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <section>
          <p className="hud-label mb-4 flex items-center gap-2">
            <span className="inline-block size-1.5 animate-pulse bg-primary" /> Post-game lobbies
          </p>
          <h1 className="text-6xl leading-[0.9] sm:text-7xl lg:text-8xl">
            EZ<span className="text-primary">NOOBS</span>
          </h1>
          <p className="display mt-4 text-2xl text-foreground/90 sm:text-3xl">
            The match ended. The lobby didn't.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Temporary post-game lobbies for GGs, trash talk, rematches and unfinished
            business. Create a room, paste the link in match chat, keep talking.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setNickname((n) => n || lastNickname());
                setOpen(true);
              }}
              className="bg-primary px-6 py-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Create post-game lobby
            </button>
            <form onSubmit={onJoin} className="flex">
              <input
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                placeholder="CODE"
                maxLength={5}
                aria-label="Room code"
                className="w-28 border border-border bg-surface px-3 py-3 text-center font-mono text-sm uppercase tracking-[0.3em] outline-none focus:border-primary"
              />
              <button className="border border-l-0 border-border px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                Join
              </button>
            </form>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-5">
            {["No account", "Temporary", "Gamer-first"].map((v) => (
              <span key={v} className="hud-label text-foreground/70">
                {v}
              </span>
            ))}
          </div>
        </section>

        <section className="border border-border bg-surface/70 p-5 backdrop-blur-[1px]">
          {open ? (
            <form onSubmit={onCreate} className="space-y-5">
              <h2 className="text-xl">New lobby</h2>
              <div>
                <label className="hud-label" htmlFor="game">
                  Game
                </label>
                <select
                  id="game"
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  className="mt-2 w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  {GAMES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="hud-label" htmlFor="nick">
                  Nickname (max 20)
                </label>
                <input
                  id="nick"
                  value={nickname}
                  maxLength={20}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ghostpeek"
                  className="mt-2 w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <span className="hud-label">Team</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TEAMS.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => setTeam(t.value)}
                      className={`border px-2 py-2.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] transition-colors ${
                        team === t.value
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                disabled={busy}
                className="w-full bg-primary py-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Spinning up…" : "Create & enter"}
              </button>
              <SafetyNote />
            </form>
          ) : (
            <div className="space-y-4">
              <h2 className="text-xl">How it works</h2>
              <ol className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Create a lobby right after your match.",
                  "Copy the short link, e.g. /room/XEL34.",
                  "Paste it into post-match chat.",
                  "Everyone joins with a nickname and a team.",
                  "Lobby fades out after inactivity.",
                ].map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="font-mono text-xs text-primary">0{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <SafetyNote className="border-t border-border/60 pt-4" />
            </div>
          )}
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 px-5 py-6">
        <p className="hud-label">Trash talk responsibly.</p>
      </footer>
    </div>
  );
}
