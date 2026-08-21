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
  Timer,
  Zap,
} from "lucide-react";

import { GameMark, getGameVisual } from "@/components/eznoobs/GameMark";
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

import "../home-refinement.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EZNOOBS — Temporary Post-Game Lobbies for Gamers" },
      {
        name: "description",
        content:
          "Create a 7-minute post-game chat lobby, share a 5-character code, and keep active conversations going for up to 10 minutes. No account needed.",
      },
      { property: "og:title", content: "EZNOOBS — The match ended. The lobby didn't." },
      {
        property: "og:description",
        content:
          "Temporary post-game lobbies for GGs, trash talk, rematches and unfinished business. 7-minute base, up to 10 when the room stays active.",
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
      toast.error("Username needs at least 2 characters.");
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
            <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hud-label hidden sm:inline">Post-match comms</span>
          </div>
          <div className="flex items-center gap-2 border border-primary/25 bg-primary/[0.03] px-2.5 py-1.5">
            <span className="size-1.5 bg-primary signal-pulse" aria-hidden="true" />
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-primary">
              Public test online
            </span>
          </div>
        </div>
      </header>

      <main id="main-content" className="home-main">
        <section className="home-hero-grid" aria-labelledby="home-hero-title">
          <div className="home-hero-copy rise-in">
            <div className="home-brand-lockup">
              <div className="home-mascot-emblem">
                <span className="home-mascot-orbit" aria-hidden="true" />
                <img
                  src="/eznoobs-logo.webp"
                  alt="EZNOOBS gaming mascot"
                  className="home-mascot-image select-none"
                  draggable={false}
                />
              </div>

              <div className="home-brand-copy">
                <div className="home-channel-row">
                  <span className="hud-label flex items-center gap-2 text-primary">
                    <Radio className="size-3.5" aria-hidden="true" /> Channel open
                  </span>
                  <span className="home-channel-divider" aria-hidden="true" />
                  <span className="home-channel-meta hud-label">No signup · 7 min base · Up to 10</span>
                </div>
                <p className="display mt-2 text-xl tracking-[0.03em] text-foreground sm:text-2xl">
                  GGs. Salt. Runbacks.
                </p>
                <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground sm:text-sm">
                  One temporary lobby for everything the scoreboard didn&apos;t settle.
                </p>
              </div>
            </div>

            <h1 id="home-hero-title" className="home-hero-title">
              THE MATCH
              <span className="block text-foreground/30">ENDED.</span>
              THE LOBBY
              <span className="block text-primary">DIDN&apos;T.</span>
            </h1>

            <p className="home-hero-description">
              Open a post-game room, drop the code in match chat, and keep the GGs, trash talk
              and rematch energy moving. Rooms start at 7 minutes and active conversations can
              stay open up to 10.
            </p>

            <div className="home-hero-actions">
              <button
                type="button"
                onClick={focusCreate}
                className="tactical-button flex min-h-11 items-center gap-3 bg-primary px-5 py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                Create lobby <ArrowRight className="size-4" aria-hidden="true" />
              </button>
              <div className="home-signal-chip">
                <Timer className="mr-2 size-4 text-primary" aria-hidden="true" />
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.14em]">
                  7 min base · up to 10
                </span>
              </div>
            </div>

            <div className="home-preview-host" data-home-preview-host />
          </div>

          <section
            id="create-lobby"
            className="home-create-panel ez-panel-strong corner-cut rise-in"
            aria-labelledby="create-lobby-title"
          >
            <div className="pointer-events-none absolute inset-0 micro-grid opacity-20" />
            <div className="relative border-b border-border/70 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hud-label text-primary">Quick deploy</p>
                  <h2 id="create-lobby-title" className="mt-1 text-3xl">
                    Open a post-game lobby
                  </h2>
                </div>
                <Zap className="mt-1 size-5 text-primary" aria-hidden="true" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick the game, your name and your side. Rooms start at 7 minutes and active
                conversations can stay open up to 10.
              </p>
            </div>

            <form onSubmit={onCreate} className="relative space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <fieldset disabled={busy}>
                <div className="mb-2 flex items-center justify-between">
                  <legend className="hud-label">Game</legend>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">
                    Pick your battlefield
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GAMES.map((g) => {
                    const visual = getGameVisual(g);
                    const selected = game === g;
                    const Icon = visual.icon;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGame(g)}
                        aria-pressed={selected}
                        className={`group relative min-h-[4.65rem] border px-2.5 py-2.5 text-left transition-all disabled:cursor-wait disabled:opacity-60 ${
                          selected
                            ? `${visual.border} ${visual.bg} ${visual.text} shadow-[inset_0_0_0_1px_currentColor]`
                            : "border-border bg-background/55 text-muted-foreground hover:border-foreground/30 hover:bg-surface/55 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Icon
                            className={`size-4 ${selected ? visual.text : "text-muted-foreground group-hover:text-foreground"}`}
                            aria-hidden="true"
                          />
                          {selected && <span className="size-1.5 bg-current signal-pulse" aria-hidden="true" />}
                        </div>
                        <p className="mt-2 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.1em]">
                          {visual.short}
                        </p>
                        <p className="mt-0.5 truncate text-[0.67rem] text-current/70">{g}</p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="hud-label" htmlFor="nick">
                    In-game username
                  </label>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">
                    2–20 chars
                  </span>
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
                  placeholder="Your in-game username"
                  className="min-h-11 w-full border border-border bg-background/85 px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary disabled:cursor-wait disabled:opacity-60"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="hud-label">Side</span>
                  <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">
                    Choose your badge
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {TEAMS.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      disabled={busy}
                      onClick={() => setTeam(t.value)}
                      aria-pressed={team === t.value}
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
                {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
              </button>

              <div className="flex items-start gap-2 border-t border-border/60 pt-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <SafetyNote />
              </div>
            </form>

            <div className="relative border-t border-border/70 bg-background/45 px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center gap-2">
                <Hash className="size-4 text-primary" aria-hidden="true" />
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
                  Join <ArrowRight className="size-3.5" aria-hidden="true" />
                </button>
              </form>
              <p
                className={`mt-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] ${joinReady ? "text-primary" : "text-muted-foreground/55"}`}
              >
                {joinReady ? "Code locked · ready to connect" : `${code.length}/5 characters`}
              </p>
            </div>
          </section>
        </section>

        <section className="home-process-section" aria-labelledby="home-process-title">
          <div className="home-process-heading">
            <div>
              <p className="hud-label text-primary">Four moves. No setup.</p>
              <h2 id="home-process-title" className="mt-1 text-3xl sm:text-4xl">
                From scoreboard to open comms
              </h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              No accounts to exchange and no community to join. The room exists because the match
              happened — then it disappears.
            </p>
          </div>

          <div className="home-process-track">
            {[
              ["01", "Finish match", "The scoreboard closes. The conversation does not."],
              ["02", "Create room", "Pick your game, name and side in a few seconds."],
              ["03", "Drop the code", "Send five characters to teammates or opponents."],
              ["04", "Settle it", "GGs, reactions, salt and the Runback live in one place."],
            ].map(([number, title, text]) => (
              <article key={number} className="home-process-step">
                <span className="home-process-marker">{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-story-grid" aria-label="Why EZNOOBS">
          <article className="home-feature-primary">
            <div className="home-feature-primary-copy">
              <p className="hud-label text-primary">Post-match by design</p>
              <h2>BUILT FOR THE MINUTES AFTER GG.</h2>
              <p>
                EZNOOBS is not another social network to maintain. It is the short-lived room you
                open while the match is still fresh — for the clutch, the throw, the salt and the
                rematch that still needs settling.
              </p>
            </div>
            <div className="home-feature-proof" aria-label="EZNOOBS product principles">
              <span><i aria-hidden="true" /> No account required</span>
              <span><i aria-hidden="true" /> 5-character invite</span>
              <span><i aria-hidden="true" /> Auto-expires</span>
            </div>
          </article>

          <div className="home-feature-stack">
            <article className="home-feature-row">
              <span className="home-feature-icon" aria-hidden="true">
                <Radio className="size-4" />
              </span>
              <div>
                <h3>Live across devices</h3>
                <p>
                  Drop the code and both sides can jump into the same realtime room immediately.
                  No invite tree, friend request or permanent server.
                </p>
              </div>
            </article>

            <article className="home-feature-row">
              <span className="home-feature-icon" aria-hidden="true">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <h3>Temporary on purpose</h3>
                <p>
                  Rooms start at 7 minutes. Meaningful activity can carry the conversation to a
                  hard 10-minute cap, then ordinary room data disappears.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="home-games-band" aria-label="Supported games">
          <div className="home-games-copy">
            <div>
              <p className="hud-label text-primary">Supported arenas</p>
              <p className="mt-1 text-xs text-muted-foreground">One post-match ritual, whatever you queue.</p>
            </div>
          </div>
          <div className="home-games-list">
            {GAMES.map((g) => (
              <GameMark key={g} game={g} compact />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
