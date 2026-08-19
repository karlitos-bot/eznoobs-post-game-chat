import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Hash,
  Radio,
  ShieldCheck,
  Swords,
  Users,
  Zap,
} from "lucide-react";

import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
import { createLobby } from "@/lib/lobby.functions";
import {
  CODE_RE,
  GAMES,
  TEAMS,
  getGuestId,
  lastGame,
  lastNickname,
  lastTeam,
  normalizeCode,
  rememberLobbyPreferences,
  type Team,
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
      { property: "og:image", content: "/eznoobs-logo.webp" },
      { name: "twitter:image", content: "/eznoobs-logo.webp" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const create = useServerFn(createLobby);
  const [game, setGame] = useState<string>(GAMES[0]);
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState<Team>("blue");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const joinReady = CODE_RE.test(code);

  useEffect(() => {
    setGame(lastGame());
    setNickname(lastNickname());
    setTeam(lastTeam());
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const nick = nickname.trim();
    if (nick.length < 2) {
      toast.error("Nickname needs at least 2 characters.");
      return;
    }

    setBusy(true);
    try {
      const res = await create({ data: { game, nickname: nick, team, guestId: getGuestId() } });
      rememberLobbyPreferences({ nickname: nick, game, team });
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

  function focusCreate() {
    document.getElementById("create-lobby")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("nick")?.focus(), 450);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.28]" />
      <div className="pointer-events-none absolute inset-0 radar-glow" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-20" />

      <header className="relative z-20 border-b border-border/70 bg-background/75 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Logo className="text-2xl sm:text-3xl" />
            <span className="hidden h-5 w-px bg-border sm:block" />
            <span className="hud-label hidden sm:inline">Post-match comms</span>
          </div>
          <div className="flex items-center gap-2 border border-primary/25 bg-primary/[0.03] px-2.5 py-1.5">
            <span className="size-1.5 bg-primary signal-pulse" />
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-primary">
              Public test online
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-10 pt-10 lg:px-8 lg:pb-16 lg:pt-16">
        <div className="grid items-stretch gap-8 xl:grid-cols-[1.08fr_0.92fr] xl:gap-12">
          <section className="flex flex-col justify-between py-2 lg:py-6">
            <div className="rise-in">
              <div className="mb-7 flex items-center gap-4 sm:gap-5">
                <div className="relative size-24 shrink-0 overflow-hidden border border-primary/25 bg-black/80 shadow-[0_0_35px_rgba(180,255,0,0.06)] sm:size-28">
                  <img
                    src="/eznoobs-logo.webp"
                    alt="EZNOOBS gaming mascot logo"
                    className="h-full w-full select-none object-cover"
                    draggable={false}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="hud-label flex items-center gap-2 text-primary">
                      <Radio className="size-3.5" /> Channel open
                    </span>
                    <span className="hidden h-3 w-px bg-border sm:block" />
                    <span className="hud-label hidden sm:inline">
                      No signup · No friend request · No waiting
                    </span>
                  </div>
                  <p className="display mt-2 text-xl tracking-[0.03em] text-foreground sm:text-2xl">
                    GGs. Salt. Runbacks.
                  </p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground sm:text-sm">
                    One temporary lobby for everything the scoreboard didn&apos;t settle.
                  </p>
                </div>
              </div>

              <h1 className="max-w-4xl text-[clamp(4rem,10vw,8.8rem)] leading-[0.78] tracking-[-0.025em]">
                THE MATCH
                <span className="block text-foreground/30">ENDED.</span>
                THE LOBBY
                <span className="block text-primary">DIDN&apos;T.</span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                Open a temporary post-game room, drop the code in match chat, and keep the GGs,
                rematch talk and unfinished business moving.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={focusCreate}
                  className="tactical-button flex min-h-11 items-center gap-3 bg-primary px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  Create lobby <ArrowRight className="size-4" />
                </button>
                <div className="flex min-h-11 items-center border border-border bg-surface/55 px-4 py-3">
                  <Users className="mr-2 size-4 text-primary" />
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
                    Built for both teams
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-12 grid max-w-2xl grid-cols-3 border-y border-border/70 lg:mt-16">
              {[
                ["01", "Create", "Instant room"],
                ["02", "Drop", "Share the code"],
                ["03", "Run it back", "Keep talking"],
              ].map(([number, title, detail], index) => (
                <div
                  key={number}
                  className={`py-4 pr-3 ${index > 0 ? "border-l border-border/70 pl-4" : ""}`}
                >
                  <span className="font-mono text-[0.62rem] text-primary">{number}</span>
                  <p className="display mt-1 text-base text-foreground">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="create-lobby" className="ez-panel-strong corner-cut rise-in overflow-hidden">
            <div className="pointer-events-none absolute inset-0 micro-grid opacity-20" />
            <div className="relative border-b border-border/70 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hud-label text-primary">Quick deploy</p>
                  <h2 className="mt-1 text-3xl">Open a post-game lobby</h2>
                </div>
                <Zap className="mt-1 size-5 text-primary" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick the game, your name and your side. Your last setup is remembered on this device.
              </p>
            </div>

            <form onSubmit={onCreate} className="relative space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="hud-label" htmlFor="game">Game</label>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">Match source</span>
                </div>
                <select
                  id="game"
                  value={game}
                  disabled={busy}
                  onChange={(e) => setGame(e.target.value)}
                  className="min-h-11 w-full border border-border bg-background/85 px-3 py-3 text-sm outline-none transition-colors focus:border-primary disabled:cursor-wait disabled:opacity-60"
                >
                  {GAMES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="hud-label" htmlFor="nick">Nickname</label>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">2–20 chars</span>
                </div>
                <input
                  id="nick"
                  value={nickname}
                  maxLength={20}
                  disabled={busy}
                  autoComplete="nickname"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ghostpeek"
                  className="min-h-11 w-full border border-border bg-background/85 px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary disabled:cursor-wait disabled:opacity-60"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="hud-label">Side</span>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">Choose your badge</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TEAMS.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      disabled={busy}
                      onClick={() => setTeam(t.value)}
                      className={`relative min-h-11 overflow-hidden border px-2 py-3 font-mono text-[0.66rem] uppercase tracking-[0.11em] transition-all disabled:cursor-wait disabled:opacity-60 ${
                        team === t.value
                          ? t.value === "blue"
                            ? "border-blue-team bg-blue-team/[0.08] text-blue-team"
                            : t.value === "red"
                              ? "border-red-team bg-red-team/[0.08] text-red-team"
                              : "border-primary bg-primary/[0.07] text-primary"
                          : "border-border bg-background/55 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                disabled={busy}
                aria-busy={busy}
                className="tactical-button flex min-h-12 w-full items-center justify-center gap-3 bg-primary py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? "Spinning up channel…" : "Create & enter"}
                {!busy && <ArrowRight className="size-4" />}
              </button>

              <div className="flex items-start gap-2 border-t border-border/60 pt-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <SafetyNote />
              </div>
            </form>

            <div className="relative border-t border-border/70 bg-background/45 px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center gap-2">
                <Hash className="size-4 text-primary" />
                <span className="hud-label text-foreground/75">Already have a room code?</span>
              </div>
              <form onSubmit={onJoin} className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(normalizeCode(e.target.value))}
                  placeholder="XEL34"
                  maxLength={5}
                  aria-label="Room code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="go"
                  className={`min-h-11 min-w-0 flex-1 border bg-background px-3 py-3 text-center font-mono text-base uppercase tracking-[0.34em] outline-none transition-colors placeholder:tracking-[0.28em] placeholder:text-muted-foreground/35 ${
                    joinReady
                      ? "border-primary text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                      : "border-border focus:border-primary"
                  }`}
                />
                <button
                  disabled={!joinReady}
                  aria-disabled={!joinReady}
                  className={`flex min-h-11 items-center gap-2 border px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.15em] transition-colors ${
                    joinReady
                      ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      : "cursor-not-allowed border-border bg-surface text-muted-foreground/45"
                  }`}
                >
                  Join <ArrowRight className="size-3.5" />
                </button>
              </form>
              <p className={`mt-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] ${joinReady ? "text-primary" : "text-muted-foreground/55"}`}>
                {joinReady ? "Code locked · ready to connect" : `${code.length}/5 characters`}
              </p>
            </div>
          </section>
        </div>

        <section className="mt-10 grid gap-px border border-border/70 bg-border/70 md:grid-cols-3 lg:mt-14">
          {[
            {
              icon: Swords,
              title: "Post-match by design",
              text: "Not another server to manage. One match, one temporary room, zero setup.",
            },
            {
              icon: Radio,
              title: "Live across devices",
              text: "Drop the code and teammates or opponents join the same realtime chat instantly.",
            },
            {
              icon: ShieldCheck,
              title: "Temporary on purpose",
              text: "Rooms expire after inactivity. Say what you need, queue the runback, move on.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="bg-background/85 p-5 sm:p-6">
              <Icon className="size-4 text-primary" />
              <h3 className="mt-3 text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/70 bg-background/70">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 lg:px-8">
          <p className="hud-label">Trash talk responsibly.</p>
          <div className="flex items-center gap-4">
            <span className="hud-label">No account</span>
            <span className="hud-label">Temporary</span>
            <span className="hud-label text-primary">Gamer-first</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
