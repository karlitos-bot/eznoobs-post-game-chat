import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Flag,
  Hash,
  LogOut,
  Radio,
  RotateCcw,
  Send,
  Swords,
  Timer,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
import { getLobbySnapshot } from "@/lib/lobby-state.functions";
import {
  getLobby,
  joinLobby,
  leaveLobby,
  reportMessage,
  sendMessage,
  toggleReaction,
  toggleRematchVote,
  touchPresence,
} from "@/lib/lobby.functions";
import {
  CODE_RE,
  TEAMS,
  getGuestId,
  getGuestPublicId,
  lastNickname,
  lastTeam,
  rememberLobbyPreferences,
  teamClasses,
  type Team,
} from "@/lib/eznoobs";

export const Route = createFileRoute("/room/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Lobby ${params.code} — EZNOOBS` },
      {
        name: "description",
        content: `Join EZNOOBS post-game lobby ${params.code}. Pick a nickname, pick a side, keep the match talk going.`,
      },
      { property: "og:title", content: `EZNOOBS lobby ${params.code}` },
      {
        property: "og:description",
        content: "The match ended. The lobby didn't. Jump in — no account needed.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoomPage,
});

type Lobby = { id: string; code: string; game: string; expires_at: string; joined?: boolean };
type Message = {
  id: string;
  guest_id: string;
  nickname: string;
  team: Team;
  body: string;
  created_at: string;
};
type Participant = {
  id: string;
  guest_id: string;
  nickname: string;
  team: Team;
  last_seen_at: string;
};
type ReactionName = "GG" | "skull" | "salt" | "clown";
type Reaction = {
  id: string;
  message_id: string;
  guest_id: string;
  emoji: ReactionName;
  created_at: string;
};
type RematchVote = { id: string; guest_id: string };

type LobbySnapshot = {
  lobby: { id: string; code: string; game: string; expires_at: string; last_activity_at: string };
  messages: Message[];
  players: Participant[];
  reactions: Reaction[];
  rematchVotes: RematchVote[];
  syncedAt: string;
};

const REACTIONS: { value: ReactionName; label: string; title: string }[] = [
  { value: "GG", label: "GG", title: "Good game" },
  { value: "skull", label: "☠", title: "Dead" },
  { value: "salt", label: "🧂", title: "Salty" },
  { value: "clown", label: "🤡", title: "Clown" },
];

function RoomPage() {
  const { code: rawCode } = useParams({ from: "/room/$code" });
  const code = rawCode.toUpperCase();
  const fetchLobby = useServerFn(getLobby);
  const join = useServerFn(joinLobby);

  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [state, setState] = useState<"loading" | "gate" | "in" | "missing">("loading");
  const [guestId, setGuestId] = useState("");

  useEffect(() => {
    const gid = getGuestId();
    setGuestId(gid);
    if (!CODE_RE.test(code)) {
      setState("missing");
      return;
    }
    let alive = true;
    fetchLobby({ data: { code, guestId: gid } })
      .then((l) => {
        if (!alive) return;
        if (!l) {
          setState("missing");
          return;
        }
        setLobby(l as Lobby);
        setState(l.joined ? "in" : "gate");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [code, fetchLobby]);

  if (state === "loading") {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <span className="size-2 bg-primary signal-pulse" />
          <p className="hud-label text-primary">Pinging lobby {code}</p>
        </div>
      </Centered>
    );
  }

  if (state === "missing") {
    return (
      <Centered>
        <div className="ez-panel corner-cut w-[min(92vw,34rem)] p-7 sm:p-9">
          <Radio className="mx-auto size-5 text-destructive" />
          <p className="hud-label mt-4 text-destructive">Signal lost</p>
          <h1 className="mt-2 text-5xl">Lobby offline</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            Code <span className="font-mono text-foreground">{code}</span> doesn&apos;t exist or has expired.
          </p>
          <Link
            to="/"
            className="tactical-button mt-6 inline-flex min-h-11 items-center gap-2 bg-primary px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground"
          >
            Create a lobby
          </Link>
        </div>
      </Centered>
    );
  }

  if (state === "gate" && lobby) {
    return (
      <JoinGate
        lobby={lobby}
        onJoined={() => setState("in")}
        join={join}
        guestId={guestId}
      />
    );
  }

  return <Room lobby={lobby!} guestId={guestId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 text-center">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute inset-0 radar-glow" />
      <div className="pointer-events-none absolute inset-0 scanlines opacity-20" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function JoinGate({
  lobby,
  onJoined,
  join,
  guestId,
}: {
  lobby: Lobby;
  onJoined: () => void;
  join: ReturnType<typeof useServerFn<typeof joinLobby>>;
  guestId: string;
}) {
  const [nickname, setNickname] = useState("");
  const [team, setTeam] = useState<Team>("blue");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNickname(lastNickname());
    setTeam(lastTeam());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const nick = nickname.trim();
    if (nick.length < 2) {
      toast.error("Nickname needs at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await join({ data: { code: lobby.code, nickname: nick, team, guestId } });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      rememberLobbyPreferences({ nickname: nick, team });
      onJoined();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form
        onSubmit={submit}
        className="ez-panel-strong corner-cut relative w-[min(94vw,31rem)] overflow-hidden text-left"
      >
        <div className="pointer-events-none absolute inset-0 micro-grid opacity-20" />
        <div className="relative border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <Logo className="text-xl" />
            <span className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.15em] text-primary">
              <span className="size-1.5 bg-primary signal-pulse" /> Live lobby
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4 border-y border-border/60 py-3">
            <div>
              <p className="hud-label">Room code</p>
              <p className="mt-1 font-mono text-2xl tracking-[0.26em] text-primary">{lobby.code}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="hud-label">Game</p>
              <p className="mt-1 truncate text-sm text-foreground">{lobby.game}</p>
            </div>
          </div>
          <h1 className="mt-5 text-4xl">Drop into comms</h1>
          <p className="mt-2 text-sm text-muted-foreground">No account. Pick a name and a side.</p>
        </div>

        <div className="relative space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="hud-label" htmlFor="nick">Nickname</label>
              <span className="font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">Max 20</span>
            </div>
            <input
              id="nick"
              autoFocus
              maxLength={20}
              value={nickname}
              disabled={busy}
              autoComplete="nickname"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => setNickname(e.target.value)}
              placeholder="ghostpeek"
              className="min-h-11 w-full border border-border bg-background/85 px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary disabled:cursor-wait disabled:opacity-60"
            />
          </div>

          <div>
            <span className="hud-label">Side</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TEAMS.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  disabled={busy}
                  onClick={() => setTeam(t.value)}
                  className={`min-h-11 border px-2 py-3 font-mono text-[0.64rem] uppercase tracking-[0.11em] transition-all disabled:cursor-wait disabled:opacity-60 ${
                    team === t.value
                      ? t.value === "blue"
                        ? "border-blue-team bg-blue-team/[0.08] text-blue-team"
                        : t.value === "red"
                          ? "border-red-team bg-red-team/[0.08] text-red-team"
                          : "border-primary bg-primary/[0.07] text-primary"
                      : "border-border bg-background/50 text-muted-foreground hover:text-foreground"
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
            className="tactical-button flex min-h-12 w-full items-center justify-center gap-2 bg-primary py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Connecting…" : "Enter lobby"}
          </button>
          <SafetyNote className="border-t border-border/60 pt-4" />
        </div>
      </form>
    </Centered>
  );
}

function Room({ lobby, guestId }: { lobby: Lobby; guestId: string }) {
  const send = useServerFn(sendMessage);
  const report = useServerFn(reportMessage);
  const heartbeat = useServerFn(touchPresence);
  const react = useServerFn(toggleReaction);
  const voteRematch = useServerFn(toggleRematchVote);
  const leave = useServerFn(leaveLobby);
  const fetchSnapshot = useServerFn(getLobbySnapshot);
  const guestPublicId = getGuestPublicId(guestId);

  const [messages, setMessages] = useState<Message[]>([]);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [rematchVotes, setRematchVotes] = useState<RematchVote[]>([]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(lobby.expires_at);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!guestId) return;

    let alive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let refreshQueued = false;

    function applySnapshot(snapshot: LobbySnapshot) {
      setMessages(snapshot.messages);
      setPlayers(snapshot.players);
      setReactions(snapshot.reactions);
      setRematchVotes(snapshot.rematchVotes);
      setExpiresAt(snapshot.lobby.expires_at);
    }

    async function refreshState() {
      if (!alive) return;
      if (refreshing) {
        refreshQueued = true;
        return;
      }

      refreshing = true;
      try {
        const snapshot = await fetchSnapshot({ data: { code: lobby.code, guestId } });
        if (!alive) return;
        if (!snapshot) {
          setExpiresAt(new Date().toISOString());
          return;
        }
        applySnapshot(snapshot as LobbySnapshot);
      } catch (err) {
        if (alive) console.warn("Could not refresh lobby state", err);
      } finally {
        refreshing = false;
        if (alive && refreshQueued) {
          refreshQueued = false;
          void refreshState();
        }
      }
    }

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshState(), 120);
    }

    void refreshState();

    const channel = supabase
      .channel(`room:${lobby.code}`)
      .on("broadcast", { event: "db-change" }, scheduleRefresh)
      .subscribe();

    const fallbackRefresh = setInterval(() => void refreshState(), 20_000);

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(fallbackRefresh);
      void supabase.removeChannel(channel);
    };
  }, [fetchSnapshot, guestId, lobby.code]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!guestId) return;
    const ping = () => void heartbeat({ data: { code: lobby.code, guestId } }).catch(() => {});
    ping();
    const t = setInterval(ping, 60_000);
    return () => clearInterval(t);
  }, [guestId, lobby.code, heartbeat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!showPlayers) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPlayers]);

  const activePlayers = useMemo(
    () =>
      players.filter(
        (p) => p.guest_id === guestPublicId || now - new Date(p.last_seen_at).getTime() < 150_000,
      ),
    [players, guestPublicId, now],
  );

  const visible = useMemo(
    () => messages.filter((m) => !muted.includes(m.guest_id)),
    [messages, muted],
  );

  const grouped = useMemo(
    () => ({
      blue: activePlayers.filter((p) => p.team === "blue"),
      red: activePlayers.filter((p) => p.team === "red"),
      spectator: activePlayers.filter((p) => p.team === "spectator"),
    }),
    [activePlayers],
  );

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const reaction of reactions) {
      const list = map.get(reaction.message_id) ?? [];
      list.push(reaction);
      map.set(reaction.message_id, list);
    }
    return map;
  }, [reactions]);

  const salt = useMemo(() => {
    const minuteAgo = now - 60_000;
    const messageScore = messages.filter(
      (m) => new Date(m.created_at).getTime() >= minuteAgo,
    ).length;
    const reactionScore = reactions.reduce((score, reaction) => {
      if (new Date(reaction.created_at).getTime() < minuteAgo) return score;
      if (reaction.emoji === "salt") return score + 3;
      if (reaction.emoji === "clown") return score + 2;
      if (reaction.emoji === "skull") return score + 1;
      return score;
    }, 0);
    const score = messageScore + reactionScore;

    if (score > 20) return { label: "NUCLEAR", className: "text-red-400", score, level: 4 };
    if (score > 11) return { label: "SPICY", className: "text-orange-400", score, level: 3 };
    if (score > 4) return { label: "WARM", className: "text-yellow-300", score, level: 2 };
    return { label: "CALM", className: "text-primary", score, level: 1 };
  }, [messages, reactions, now]);

  const minutesLeft = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  const expired = new Date(expiresAt).getTime() <= now;
  const hasRematchVote = rematchVotes.some((v) => v.guest_id === guestPublicId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (expired) {
      toast.error("This lobby has expired.");
      return;
    }
    setDraft("");
    try {
      await send({ data: { code: lobby.code, guestId, body: body.slice(0, 500) } });
    } catch (err) {
      setDraft(body);
      toast.error(err instanceof Error ? err.message : "Message failed.");
    }
  }

  async function copyInviteUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the invite link.");
    }
  }

  async function shareInvite() {
    const url = `${window.location.origin}/room/${lobby.code}`;
    const prefersNativeShare =
      typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

    if (prefersNativeShare) {
      try {
        await navigator.share({
          title: `EZNOOBS lobby ${lobby.code}`,
          text: `Join my ${lobby.game} post-game lobby on EZNOOBS.`,
          url,
        });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    await copyInviteUrl(url);
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  async function handleReaction(messageId: string, emoji: ReactionName) {
    if (expired) return;
    try {
      await react({ data: { code: lobby.code, guestId, messageId, emoji } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reaction failed.");
    }
  }

  async function handleRematch() {
    if (expired) return;
    try {
      const result = await voteRematch({ data: { code: lobby.code, guestId } });
      toast.success(result.active ? "You want the rematch." : "Rematch vote removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rematch vote failed.");
    }
  }

  async function handleLeave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await leave({ data: { code: lobby.code, guestId } });
      window.location.assign("/");
    } catch (err) {
      setLeaving(false);
      toast.error(err instanceof Error ? err.message : "Could not leave lobby.");
    }
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.16]" />
      <div className="pointer-events-none absolute inset-0 radar-glow opacity-55" />

      <header className="relative z-20 border-b border-border/80 bg-background/90 backdrop-blur-sm">
        <div className="flex min-h-14 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="shrink-0 text-lg sm:text-xl" />
            <span className="hidden h-5 w-px bg-border md:block" />
            <div className="hidden min-w-0 md:block">
              <p className="hud-label">Post-match lobby</p>
              <p className="truncate text-xs text-foreground/80">{lobby.game}</p>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className="flex min-h-10 items-center border border-primary/30 bg-primary/[0.04] px-2 sm:px-2.5">
              <Hash className="mr-1 size-3 text-primary sm:mr-1.5 sm:size-3.5" />
              <span className="font-mono text-xs tracking-[0.18em] text-primary sm:text-base sm:tracking-[0.22em]">{lobby.code}</span>
            </div>
            <span
              className={`flex min-h-10 items-center gap-1.5 px-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] sm:text-[0.6rem] sm:tracking-[0.15em] ${
                expired ? "text-destructive" : "text-primary"
              }`}
            >
              <span className={`size-1.5 shrink-0 ${expired ? "bg-destructive" : "bg-primary signal-pulse"}`} />
              {expired ? "Ended" : "Live"}
            </span>
            <button
              onClick={() => setShowPlayers(true)}
              aria-label={`Open player list, ${activePlayers.length} online`}
              className="touch-target flex items-center justify-center gap-1.5 border border-border bg-surface/40 px-2 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground lg:hidden"
            >
              <Users className="size-3.5" /> {activePlayers.length}
            </button>
          </div>
        </div>

        <div className="flex min-h-12 items-center gap-2 border-t border-border/60 bg-surface/25 px-3 py-1.5 sm:px-4 lg:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-foreground/75 sm:hidden">{lobby.game}</p>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex shrink-0 items-center gap-2 border-r border-border/70 pr-3">
                <span className="hud-label">Salt</span>
                <SaltMeter level={salt.level} label={salt.label} className={salt.className} />
              </div>
              <div className="hidden shrink-0 items-center gap-2 border-r border-border/70 pr-3 md:flex">
                <Timer className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {expired ? "Read-only" : `~${minutesLeft}m idle`}
                </span>
              </div>
              <div className="hidden shrink-0 items-center gap-2 border-r border-border/70 pr-3 lg:flex">
                <Users className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {activePlayers.length} online
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              onClick={shareInvite}
              aria-label="Invite players to this lobby"
              title="Invite players"
              className="tactical-button flex min-h-10 items-center gap-1.5 border border-border bg-surface/45 px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:px-3 sm:text-[0.62rem] sm:tracking-[0.12em]"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span>Invite</span>
            </button>
            <button
              onClick={handleRematch}
              disabled={expired}
              aria-label="Vote for a rematch"
              title="Run it back"
              className={`flex min-h-10 items-center gap-1.5 border px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] transition-all disabled:opacity-40 sm:px-3 sm:text-[0.62rem] sm:tracking-[0.12em] ${
                hasRematchVote
                  ? "border-primary bg-primary/[0.07] text-primary"
                  : "border-border bg-background/45 text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Run it back</span>
              {rematchVotes.length > 0 && <span className="text-primary">{rematchVotes.length}</span>}
            </button>
            <button
              onClick={handleLeave}
              disabled={leaving}
              aria-label="Leave lobby"
              title="Leave lobby"
              className="touch-target flex items-center justify-center border border-border bg-surface/45 px-2 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:cursor-wait disabled:opacity-40"
            >
              <LogOut className="size-3.5" />
              <span className="sr-only">Leave</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border/80 bg-background/72 lg:flex">
          <div className="border-b border-border/70 px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="hud-label text-primary">Roster</p>
                <h2 className="mt-1 text-xl">Players online</h2>
              </div>
              <span className="flex size-9 items-center justify-center border border-border bg-surface/40 font-mono text-xs text-primary">
                {activePlayers.length}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PlayerList grouped={grouped} guestId={guestPublicId} muted={muted} setMuted={setMuted} />
          </div>
          <div className="border-t border-border/70 p-4">
            <p className="hud-label">Room {lobby.code}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Players disappear from the roster after inactivity.</p>
          </div>
        </aside>

        {showPlayers && (
          <div className="fixed inset-0 z-30 flex lg:hidden">
            <div className="flex-1 bg-background/75 backdrop-blur-[2px]" onClick={() => setShowPlayers(false)} />
            <div className="mobile-safe-top mobile-safe-bottom flex w-[min(86vw,20rem)] flex-col border-l border-border bg-background">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
                <div>
                  <p className="hud-label text-primary">Roster</p>
                  <h2 className="mt-1 text-xl">{activePlayers.length} online</h2>
                </div>
                <button
                  onClick={() => setShowPlayers(false)}
                  aria-label="Close player list"
                  className="touch-target flex items-center justify-center border border-border text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <PlayerList grouped={grouped} guestId={guestPublicId} muted={muted} setMuted={setMuted} />
              </div>
            </div>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-background/45">
          {expired && (
            <div className="border-b border-destructive/30 bg-destructive/[0.06] px-4 py-2.5 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] text-destructive">
              Lobby expired · Chat is now read-only
            </div>
          )}
          {!expired && rematchVotes.length >= 2 && (
            <div className="flex items-center justify-center gap-2 border-b border-primary/30 bg-primary/[0.05] px-4 py-2.5 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] text-primary">
              <Swords className="size-3.5" /> {rematchVotes.length} players want the runback · Queue it up
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="pointer-events-none absolute inset-0 micro-grid opacity-[0.12]" />
            <div className="relative z-10 mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
              <div className="mb-5 flex items-end justify-between border-b border-border/60 pb-3">
                <div>
                  <p className="hud-label text-primary">Open channel</p>
                  <h2 className="mt-1 text-2xl">Post-match chat</h2>
                </div>
                <span className="hud-label hidden sm:block">{visible.length} messages visible</span>
              </div>

              <div className="space-y-1.5">
                {visible.length === 0 && (
                  <div className="ez-panel border-dashed p-6 text-center sm:p-10">
                    <Radio className="mx-auto size-5 text-primary" />
                    <p className="mt-4 display text-xl">Channel is quiet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Open with a GG or an accusation.</p>
                  </div>
                )}

                {visible.map((m) => {
                  const tc = teamClasses(m.team);
                  const messageReactions = reactionsByMessage.get(m.id) ?? [];
                  const own = m.guest_id === guestPublicId;
                  return (
                    <article
                      key={m.id}
                      className={`msg-in group/msg relative border border-transparent px-2 py-3 transition-colors hover:border-border/70 hover:bg-surface/30 sm:px-3 ${
                        own ? "bg-primary/[0.018]" : ""
                      }`}
                    >
                      <span className={`absolute bottom-3 left-0 top-3 w-[2px] ${m.team === "blue" ? "bg-blue-team" : m.team === "red" ? "bg-red-team" : "bg-spectator"}`} />
                      <div className="flex gap-3 sm:gap-4">
                        <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center border bg-background font-mono text-[0.68rem] font-semibold uppercase ${tc.border} ${tc.text}`}>
                          {initials(m.nickname)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`font-mono text-xs font-semibold ${tc.text}`}>{m.nickname}</span>
                            {own && (
                              <span className="border border-primary/25 bg-primary/[0.04] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-primary">You</span>
                            )}
                            <span className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-muted-foreground">
                              {teamName(m.team)}
                            </span>
                            <span className="ml-auto font-mono text-[0.58rem] text-muted-foreground/70">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.92rem] leading-6 text-foreground/92 sm:text-[0.95rem]">{m.body}</p>

                          <div className="mt-2 flex min-h-9 flex-wrap items-center gap-1.5 sm:min-h-7">
                            {REACTIONS.map((item) => {
                              const count = messageReactions.filter((r) => r.emoji === item.value).length;
                              const active = messageReactions.some(
                                (r) => r.emoji === item.value && r.guest_id === guestPublicId,
                              );
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  disabled={expired}
                                  onClick={() => handleReaction(m.id, item.value)}
                                  aria-label={`${item.title} reaction${count ? `, ${count}` : ""}`}
                                  title={item.title}
                                  className={`min-h-9 min-w-9 border px-2 py-1.5 font-mono text-[0.62rem] transition-all disabled:opacity-40 sm:min-h-0 sm:min-w-0 sm:py-1 ${
                                    active
                                      ? "border-primary bg-primary/[0.09] text-primary"
                                      : count
                                        ? "border-border bg-background/55 text-foreground hover:border-primary hover:text-primary"
                                        : "border-border/55 bg-background/30 text-muted-foreground hover:border-primary hover:text-primary sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus:opacity-100"
                                  }`}
                                >
                                  {item.label}{count ? ` ${count}` : ""}
                                </button>
                              );
                            })}

                            {m.guest_id !== guestPublicId && (
                              <button
                                type="button"
                                aria-label={`Report message from ${m.nickname}`}
                                title={`Report ${m.nickname}`}
                                onClick={() =>
                                  report({
                                    data: {
                                      code: lobby.code,
                                      guestId,
                                      messageId: m.id,
                                      reason: "abuse",
                                    },
                                  })
                                    .then(() => toast.success("Reported. Thanks."))
                                    .catch(() => toast.error("Could not report that message."))
                                }
                                className="ml-auto flex min-h-9 min-w-9 items-center justify-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.11em] text-muted-foreground transition-opacity hover:text-destructive sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus:opacity-100"
                              >
                                <Flag className="size-3" /> <span className="hidden sm:inline">Report</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                <div ref={endRef} />
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="mobile-safe-bottom relative border-t border-border/80 bg-background/92 px-3 pt-3 sm:px-4 lg:px-6">
            <div className="mx-auto w-full max-w-5xl">
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <textarea
                    value={draft}
                    rows={2}
                    maxLength={500}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={expired}
                    placeholder={expired ? "Lobby expired" : "Message the lobby…"}
                    aria-label="Message"
                    className="min-h-12 max-h-28 w-full resize-none border border-border bg-surface/40 px-3 py-3 pr-14 text-sm leading-5 outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-primary focus:bg-surface/60 disabled:opacity-50"
                  />
                  <span className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[0.56rem] text-muted-foreground/65">
                    {draft.length}/500
                  </span>
                </div>
                <button
                  disabled={expired || !draft.trim()}
                  aria-label="Send message"
                  className="tactical-button flex min-h-12 min-w-12 items-center justify-center gap-2 bg-primary px-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
                >
                  <Send className="size-4" /> <span className="hidden sm:inline">Send</span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <SafetyNote />
                <span className="hud-label hidden sm:inline">Enter to send · Shift+Enter for line break</span>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

function SaltMeter({
  level,
  label,
  className,
}: {
  level: number;
  label: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2" title={`Salt level: ${label}`}>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 w-3 border ${segment <= level ? "border-primary bg-primary" : "border-border bg-background"}`}
          />
        ))}
      </div>
      <span className={`font-mono text-[0.6rem] uppercase tracking-[0.13em] ${className}`}>{label}</span>
    </div>
  );
}

function PlayerList({
  grouped,
  guestId,
  muted,
  setMuted,
}: {
  grouped: Record<Team, Participant[]>;
  guestId: string;
  muted: string[];
  setMuted: (fn: (prev: string[]) => string[]) => void;
}) {
  const sections: { team: Team; label: string }[] = [
    { team: "blue", label: "Blue team" },
    { team: "red", label: "Red team" },
    { team: "spectator", label: "Spectators" },
  ];

  return (
    <div className="space-y-6">
      {sections.map(({ team, label }) => {
        const tc = teamClasses(team);
        return (
          <section key={team}>
            <div className="flex items-center justify-between">
              <p className={`hud-label ${tc.text}`}>{label}</p>
              <span className={`font-mono text-[0.58rem] ${tc.text}`}>{grouped[team].length}</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {grouped[team].length === 0 && (
                <li className="border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground/65">No players</li>
              )}
              {grouped[team].map((p) => {
                const isMuted = muted.includes(p.guest_id);
                const self = p.guest_id === guestId;
                return (
                  <li
                    key={p.id}
                    className={`group flex min-h-11 items-center gap-2.5 border border-border/55 bg-surface/25 px-2.5 py-1.5 ${self ? "border-primary/30 bg-primary/[0.025]" : ""}`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center border bg-background font-mono text-[0.58rem] font-semibold ${tc.border} ${tc.text}`}>
                      {initials(p.nickname)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.nickname}
                      {self && <span className="ml-1 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-primary">you</span>}
                    </span>
                    <span className="size-1.5 shrink-0 bg-primary/80" title="Online" />
                    {!self && (
                      <button
                        aria-label={isMuted ? `Unmute ${p.nickname}` : `Mute ${p.nickname}`}
                        title={isMuted ? `Unmute ${p.nickname}` : `Mute ${p.nickname}`}
                        onClick={() =>
                          setMuted((prev) =>
                            prev.includes(p.guest_id)
                              ? prev.filter((g) => g !== p.guest_id)
                              : [...prev, p.guest_id],
                          )
                        }
                        className={`touch-target flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-0 sm:min-w-0 ${isMuted ? "text-destructive" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"}`}
                      >
                        {isMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function initials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

function teamName(team: Team) {
  if (team === "blue") return "Blue";
  if (team === "red") return "Red";
  return "Spectator";
}
