import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

import { GameMark } from "@/components/eznoobs/GameMark";
import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
import { supabase } from "@/integrations/supabase/client";
import { getLobbySnapshot } from "@/lib/lobby-state.functions";
import { lobbyChannelName, useLobbyRealtimeToken } from "@/lib/use-realtime-token";
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
type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";
type ReactionBurst = { id: number; messageId: string; label: string; lane: number };
type TypingUser = { guestId: string; nickname: string; team: Team; expiresAt: number };
type TypingPayload = {
  guestId?: string;
  nickname?: string;
  team?: Team;
  active?: boolean;
};

type LobbySnapshot = {
  lobby: {
    id: string;
    code: string;
    game: string;
    expires_at: string;
    last_activity_at: string;
    max_players?: number;
  };
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

function reactionLabel(emoji: ReactionName) {
  return REACTIONS.find((reaction) => reaction.value === emoji)?.label ?? emoji;
}

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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNickname(lastNickname());
    setTeam(lastTeam());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = secondsUntil(lobby.expires_at, now);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (secondsLeft <= 0) {
      toast.error("This lobby has expired.");
      return;
    }

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
            <span className={`flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-[0.15em] ${timerTextClass(secondsLeft)}`}>
              <Timer className="size-3.5" /> {formatCountdown(secondsLeft)}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between gap-4 border-y border-border/60 py-3">
            <div>
              <p className="hud-label">Room code</p>
              <p className="mt-1 font-mono text-2xl tracking-[0.26em] text-primary">{lobby.code}</p>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-right">
              <div className="min-w-0">
                <p className="hud-label">Game</p>
                <p className="mt-1 truncate text-sm text-foreground">{lobby.game}</p>
              </div>
              <GameMark game={lobby.game} compact />
            </div>
          </div>
          <h1 className="mt-5 text-4xl">Drop into comms</h1>
          <p className="mt-2 text-sm text-muted-foreground">No account. Pick a name and a side. The clock never resets.</p>
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
              disabled={busy || secondsLeft <= 0}
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
                  disabled={busy || secondsLeft <= 0}
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
            disabled={busy || secondsLeft <= 0}
            aria-busy={busy}
            className="tactical-button flex min-h-12 w-full items-center justify-center gap-2 bg-primary py-3.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground disabled:cursor-wait disabled:opacity-60"
          >
            {secondsLeft <= 0 ? "Lobby closed" : busy ? "Connecting…" : "Enter lobby"}
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
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [now, setNow] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, TypingUser>>({});
  const [incomingMessageId, setIncomingMessageId] = useState<string | null>(null);
  const [impactMessageId, setImpactMessageId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "connecting",
  );

  const endRef = useRef<HTMLDivElement>(null);
  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const clearedAfterExpiry = useRef(false);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
  const knownReactionIdsRef = useRef<Set<string> | null>(null);
  const burstCounterRef = useRef(0);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    if (!guestId) return;

    let alive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshing = false;
    let refreshQueued = false;
    let channelSubscribed = false;

    function applySnapshot(snapshot: LobbySnapshot) {
      const nextMessageIds = new Set(snapshot.messages.map((message) => message.id));
      if (knownMessageIdsRef.current) {
        const newMessages = snapshot.messages.filter(
          (message) => !knownMessageIdsRef.current?.has(message.id),
        );
        const newestRemote = [...newMessages]
          .reverse()
          .find((message) => message.guest_id !== guestPublicId);
        if (newestRemote) {
          setIncomingMessageId(newestRemote.id);
          if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
          incomingTimerRef.current = setTimeout(() => setIncomingMessageId(null), 850);
        }
      }
      knownMessageIdsRef.current = nextMessageIds;

      const nextReactionIds = new Set(snapshot.reactions.map((reaction) => reaction.id));
      if (knownReactionIdsRef.current) {
        const newRemoteReactions = snapshot.reactions
          .filter((reaction) => !knownReactionIdsRef.current?.has(reaction.id))
          .filter((reaction) => reaction.guest_id !== guestPublicId)
          .slice(-4);

        if (newRemoteReactions.length > 0) {
          const bursts = newRemoteReactions.map((reaction) => {
            burstCounterRef.current += 1;
            return {
              id: Date.now() + burstCounterRef.current,
              messageId: reaction.message_id,
              label: reactionLabel(reaction.emoji),
              lane: burstCounterRef.current % 3,
            };
          });
          setReactionBursts((current) => [...current.slice(-5), ...bursts]);
          const newest = bursts[bursts.length - 1];
          if (newest) {
            setImpactMessageId(newest.messageId);
            if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
            impactTimerRef.current = setTimeout(() => setImpactMessageId(null), 520);
          }
          for (const burst of bursts) {
            setTimeout(() => {
              setReactionBursts((current) => current.filter((item) => item.id !== burst.id));
            }, 900);
          }
        }
      }
      knownReactionIdsRef.current = nextReactionIds;

      setMessages(snapshot.messages);
      setPlayers(snapshot.players);
      setReactions(snapshot.reactions);
      setRematchVotes(snapshot.rematchVotes);
      setExpiresAt(snapshot.lobby.expires_at);
      setMaxPlayers(snapshot.lobby.max_players ?? 20);
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
        if (typeof navigator === "undefined" || navigator.onLine) {
          setConnectionState(channelSubscribed ? "connected" : "reconnecting");
        }
      } catch (err) {
        if (alive) {
          setConnectionState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
          console.warn("Could not refresh lobby state", err);
        }
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

    function handleTyping(event: unknown) {
      const payload = (event as { payload?: TypingPayload })?.payload;
      if (!payload?.guestId || payload.guestId === guestPublicId) return;

      if (!payload.active) {
        setTypingUsers((current) => {
          const next = { ...current };
          delete next[payload.guestId!];
          return next;
        });
        return;
      }

      if (!payload.nickname || !payload.team) return;
      setTypingUsers((current) => ({
        ...current,
        [payload.guestId!]: {
          guestId: payload.guestId!,
          nickname: payload.nickname!,
          team: payload.team!,
          expiresAt: Date.now() + 2200,
        },
      }));
    }

    function handleOffline() {
      setConnectionState("offline");
    }

    function handleOnline() {
      setConnectionState("reconnecting");
      void refreshState();
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    void refreshState();

    // Only ever subscribe to the private, token-scoped topic. Without a token the
    // secure snapshot fallback keeps the room usable and we stay "reconnecting".
    let channel: RealtimeChannel | null = null;
    if (realtimeToken) {
      const nextChannel = supabase
        .channel(lobbyChannelName(lobby.code, realtimeToken), { config: { private: true } })
        .on("broadcast", { event: "db-change" }, scheduleRefresh)
        .on("broadcast", { event: "typing" }, handleTyping)
        .subscribe((status, err) => {
          if (!alive) return;
          if (status === "SUBSCRIBED") {
            channelSubscribed = true;
            roomChannelRef.current = nextChannel;
            setConnectionState("connected");
            void refreshState();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            channelSubscribed = false;
            if (roomChannelRef.current === nextChannel) roomChannelRef.current = null;
            setConnectionState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
            if (err) console.warn("Realtime channel unavailable", status);
          }
        });
      channel = nextChannel;
      roomChannelRef.current = nextChannel;
    } else {
      roomChannelRef.current = null;
      setConnectionState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "reconnecting");
    }
    const fallbackRefresh = setInterval(() => void refreshState(), 10_000);
    const typingSweep = setInterval(() => {
      const cutoff = Date.now();
      setTypingUsers((current) => {
        const entries = Object.entries(current).filter(([, user]) => user.expiresAt > cutoff);
        if (entries.length === Object.keys(current).length) return current;
        return Object.fromEntries(entries) as Record<string, TypingUser>;
      });
    }, 500);

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      clearInterval(fallbackRefresh);
      clearInterval(typingSweep);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (channel) {
        if (roomChannelRef.current === channel) roomChannelRef.current = null;
        void supabase.removeChannel(channel);
      }
    };
  }, [fetchSnapshot, guestId, guestPublicId, lobby.code, realtimeToken]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!guestId) return;
    const ping = () => void heartbeat({ data: { code: lobby.code, guestId } }).catch(() => {});
    ping();
    const timer = setInterval(ping, 60_000);
    return () => clearInterval(timer);
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

  const secondsLeft = secondsUntil(expiresAt, now);
  const expired = secondsLeft <= 0;

  useEffect(() => {
    if (!expired || clearedAfterExpiry.current) return;
    clearedAfterExpiry.current = true;
    setMessages([]);
    setPlayers([]);
    setReactions([]);
    setRematchVotes([]);
    setReactionBursts([]);
    setTypingUsers({});
    setDraft("");
    setShowPlayers(false);
  }, [expired]);

  const activePlayers = useMemo(
    () =>
      players.filter(
        (p) => p.guest_id === guestPublicId || now - new Date(p.last_seen_at).getTime() < 150_000,
      ),
    [players, guestPublicId, now],
  );

  const currentPlayer = activePlayers.find((player) => player.guest_id === guestPublicId);

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
    const recentMessages = messages.filter(
      (m) => new Date(m.created_at).getTime() >= minuteAgo,
    );
    const recentChatters = new Set(recentMessages.map((m) => m.guest_id)).size;
    const messageScore = recentMessages.length;
    const reactionScore = reactions.reduce((score, reaction) => {
      if (new Date(reaction.created_at).getTime() < minuteAgo) return score;
      if (reaction.emoji === "salt") return score + 4;
      if (reaction.emoji === "clown") return score + 3;
      if (reaction.emoji === "skull") return score + 1;
      return score;
    }, 0);
    const rematchScore = Math.min(rematchVotes.length * 2, 8);
    const chatterBonus = Math.max(0, Math.min(recentChatters - 2, 4));
    const score = messageScore + reactionScore + rematchScore + chatterBonus;

    if (score >= 24) return { label: "NUCLEAR", className: "text-red-400", score, level: 4 };
    if (score >= 14) return { label: "SPICY", className: "text-orange-400", score, level: 3 };
    if (score >= 6) return { label: "WARM", className: "text-yellow-300", score, level: 2 };
    return { label: "CALM", className: "text-primary", score, level: 1 };
  }, [messages, reactions, rematchVotes.length, now]);

  const hasRematchVote = rematchVotes.some((v) => v.guest_id === guestPublicId);
  const rematchTarget = Math.max(2, Math.ceil(Math.max(activePlayers.length, 2) / 2));
  const rematchReady = rematchVotes.length >= rematchTarget;
  const offline = connectionState === "offline";
  const activeTypers = Object.values(typingUsers)
    .filter((user) => user.expiresAt > now)
    .slice(0, 3);
  const typingText = activeTypers.length === 0
    ? ""
    : activeTypers.length === 1
      ? `${activeTypers[0]!.nickname} is typing`
      : activeTypers.length === 2
        ? `${activeTypers[0]!.nickname} + ${activeTypers[1]!.nickname} are typing`
        : `${activeTypers[0]!.nickname} + ${activeTypers.length - 1} others are typing`;

  function broadcastTyping(active: boolean) {
    const channel = roomChannelRef.current;
    if (!channel || !currentPlayer || expired || offline) return;
    void channel
      .send({
        type: "broadcast",
        event: "typing",
        payload: {
          guestId: guestPublicId,
          nickname: currentPlayer.nickname,
          team: currentPlayer.team,
          active,
        },
      })
      .catch(() => {});
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);

    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);

    if (!value.trim()) {
      if (lastTypingSentRef.current > 0) broadcastTyping(false);
      lastTypingSentRef.current = 0;
      return;
    }

    const timestamp = Date.now();
    if (timestamp - lastTypingSentRef.current > 900) {
      broadcastTyping(true);
      lastTypingSentRef.current = timestamp;
    }

    typingStopTimerRef.current = setTimeout(() => {
      broadcastTyping(false);
      lastTypingSentRef.current = 0;
    }, 1200);
  }

  function stopTyping() {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (lastTypingSentRef.current > 0) broadcastTyping(false);
    lastTypingSentRef.current = 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    if (expired) {
      toast.error("This lobby has expired.");
      return;
    }
    if (offline) {
      toast.error("You're offline. Reconnect before sending.");
      return;
    }
    stopTyping();
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
    if (expired || offline) return;
    try {
      const result = await react({ data: { code: lobby.code, guestId, messageId, emoji } });
      if (result.active) {
        burstCounterRef.current += 1;
        const id = Date.now() + burstCounterRef.current;
        setReactionBursts((current) => [
          ...current.slice(-5),
          {
            id,
            messageId,
            label: reactionLabel(emoji),
            lane: burstCounterRef.current % 3,
          },
        ]);
        setImpactMessageId(messageId);
        if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
        impactTimerRef.current = setTimeout(() => setImpactMessageId(null), 520);
        setTimeout(() => {
          setReactionBursts((current) => current.filter((item) => item.id !== id));
        }, 900);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reaction failed.");
    }
  }

  async function handleRematch() {
    if (expired || offline) return;
    try {
      const result = await voteRematch({ data: { code: lobby.code, guestId } });
      toast.success(result.active ? "Runback vote locked in." : "Runback vote removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rematch vote failed.");
    }
  }

  async function handleLeave() {
    if (leaving) return;
    setLeaving(true);
    stopTyping();
    try {
      await leave({ data: { code: lobby.code, guestId } });
      window.location.assign("/");
    } catch (err) {
      setLeaving(false);
      toast.error(err instanceof Error ? err.message : "Could not leave lobby.");
    }
  }

  const statusLabel = expired
    ? "Ended"
    : connectionState === "offline"
      ? "Offline"
      : connectionState === "connected"
        ? "Live"
        : "Syncing";

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.16]" />
      <div className="pointer-events-none absolute inset-0 radar-glow opacity-55" />

      <header className="relative z-20 border-b border-border/80 bg-background/90 backdrop-blur-sm">
        <div className="flex min-h-14 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="shrink-0 text-lg sm:text-xl" />
            <span className="hidden h-5 w-px bg-border md:block" />
            <div className="hidden min-w-0 items-center gap-2 md:flex">
              <GameMark game={lobby.game} compact />
              <div className="min-w-0">
                <p className="hud-label">Post-match lobby</p>
                <p className="truncate text-xs text-foreground/80">{lobby.game}</p>
              </div>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div className={`flex min-h-10 items-center gap-1.5 border px-2.5 font-mono text-sm font-semibold tracking-[0.08em] ${timerBoxClass(secondsLeft)}`} title="Time until this temporary lobby closes">
              <Timer className="size-3.5" />
              <span className={secondsLeft <= 10 && !expired ? "signal-pulse" : ""}>{formatCountdown(secondsLeft)}</span>
            </div>
            <div className="flex min-h-10 items-center border border-primary/30 bg-primary/[0.04] px-2 sm:px-2.5">
              <Hash className="mr-1 size-3 text-primary sm:mr-1.5 sm:size-3.5" />
              <span className="font-mono text-xs tracking-[0.18em] text-primary sm:text-base sm:tracking-[0.22em]">{lobby.code}</span>
            </div>
            <span
              className={`hidden min-h-10 items-center gap-1.5 px-1 font-mono text-[0.56rem] uppercase tracking-[0.12em] sm:flex sm:text-[0.6rem] sm:tracking-[0.15em] ${
                expired || offline ? "text-destructive" : connectionState === "connected" ? "text-primary" : "text-yellow-300"
              }`}
            >
              <span className={`size-1.5 shrink-0 ${expired || offline ? "bg-destructive" : connectionState === "connected" ? "bg-primary signal-pulse" : "bg-yellow-300 signal-pulse"}`} />
              {statusLabel}
            </span>
            <button
              onClick={() => setShowPlayers(true)}
              aria-label={`Open player list, ${activePlayers.length} of ${maxPlayers} online`}
              className="touch-target flex items-center justify-center gap-1.5 border border-border bg-surface/40 px-2 font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground lg:hidden"
            >
              <Users className="size-3.5" /> {activePlayers.length}/{maxPlayers}
            </button>
          </div>
        </div>

        <div className="flex min-h-12 items-center gap-2 border-t border-border/60 bg-surface/25 px-3 py-1.5 sm:px-4 lg:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:hidden">
              <GameMark game={lobby.game} compact />
              <p className="truncate text-xs text-foreground/75">{lobby.game}</p>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <div className="flex shrink-0 items-center gap-2 border-r border-border/70 pr-3">
                <span className="hud-label">Salt</span>
                <SaltMeter level={salt.level} label={salt.label} score={salt.score} className={salt.className} />
              </div>
              <div className="hidden shrink-0 items-center gap-2 border-r border-border/70 pr-3 md:flex">
                <Timer className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  Fixed lifetime · no reset
                </span>
              </div>
              <div className="hidden shrink-0 items-center gap-2 border-r border-border/70 pr-3 lg:flex">
                <Users className="size-3.5 text-muted-foreground" />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {activePlayers.length}/{maxPlayers} online
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
              disabled={expired || offline}
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
              {rematchVotes.length > 0 && <span className="text-primary">{rematchVotes.length}/{rematchTarget}</span>}
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
              <span className="flex h-9 min-w-12 items-center justify-center border border-border bg-surface/40 px-2 font-mono text-xs text-primary">
                {activePlayers.length}/{maxPlayers}
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
                  <h2 className="mt-1 text-xl">{activePlayers.length}/{maxPlayers} online</h2>
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
          {!expired && connectionState !== "connected" && (
            <div className={`border-b px-4 py-2.5 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] ${offline ? "border-destructive/30 bg-destructive/[0.06] text-destructive" : "border-yellow-300/30 bg-yellow-300/[0.04] text-yellow-300"}`}>
              {offline ? "Connection lost · Check your internet · Your draft is safe" : "Reconnecting · Syncing lobby state"}
            </div>
          )}
          {!expired && secondsLeft <= 60 && (
            <div className={`border-b px-4 py-2.5 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] ${secondsLeft <= 10 ? "border-destructive/30 bg-destructive/[0.08] text-destructive" : "border-yellow-300/30 bg-yellow-300/[0.04] text-yellow-300"}`}>
              {secondsLeft <= 10 ? `Lobby closes in ${secondsLeft}` : `Final minute · ${formatCountdown(secondsLeft)} remaining`}
            </div>
          )}
          {expired && (
            <div className="border-b border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] text-destructive">
              00:00 · Lobby closed · Temporary chat cleared
            </div>
          )}
          {!expired && rematchVotes.length > 0 && (
            <div
              className={`flex items-center justify-center gap-2 border-b px-4 py-2.5 text-center font-mono text-[0.66rem] uppercase tracking-[0.16em] ${
                rematchReady
                  ? "runback-ready border-primary/50 bg-primary/[0.08] text-primary"
                  : "border-primary/25 bg-primary/[0.035] text-primary/85"
              }`}
            >
              <Swords className="size-3.5" />
              {rematchReady
                ? `Runback locked · ${rematchVotes.length}/${activePlayers.length || rematchVotes.length} players want another`
                : `${rematchVotes.length}/${rematchTarget} want the runback`}
            </div>
          )}

          <div className={`relative min-h-0 flex-1 overflow-y-auto ${salt.level >= 4 ? "chat-energy-nuclear" : salt.level >= 3 ? "chat-energy-spicy" : ""}`}>
            <div className="pointer-events-none absolute inset-0 micro-grid opacity-[0.12]" />
            <div className="relative z-10 mx-auto w-full max-w-5xl px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
              <div className="mb-5 flex items-end justify-between border-b border-border/60 pb-3">
                <div>
                  <p className="hud-label text-primary">Open channel</p>
                  <h2 className="mt-1 text-2xl">{expired ? "Lobby closed" : "Post-match chat"}</h2>
                </div>
                <div className="hidden items-center gap-3 sm:flex">
                  <span className="hud-label">{expired ? "Temporary by design" : `${visible.length} messages visible`}</span>
                  {!expired && (
                    <span className="flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.1em] text-primary/75">
                      <span className="size-1.5 bg-primary signal-pulse" /> Live comms
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {expired && (
                  <div className="ez-panel border-dashed p-7 text-center sm:p-12">
                    <Timer className="mx-auto size-6 text-destructive" />
                    <p className="mt-4 display text-2xl">Time&apos;s up</p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">This temporary lobby has closed. Queue the next match or create another room.</p>
                    <Link to="/" className="tactical-button mt-6 inline-flex min-h-11 items-center bg-primary px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground">
                      Back to EZNOOBS
                    </Link>
                  </div>
                )}

                {!expired && visible.length === 0 && (
                  <div className="ez-panel border-dashed p-6 text-center sm:p-10">
                    <Radio className="mx-auto size-5 text-primary" />
                    <p className="mt-4 display text-xl">Channel is quiet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Open with a GG or an accusation.</p>
                  </div>
                )}

                {!expired && visible.map((m) => {
                  const tc = teamClasses(m.team);
                  const messageReactions = reactionsByMessage.get(m.id) ?? [];
                  const own = m.guest_id === guestPublicId;
                  const totalReactions = messageReactions.length;
                  const heatClass = totalReactions >= 7
                    ? "message-on-fire"
                    : totalReactions >= 4
                      ? "message-heated"
                      : "";
                  const bursts = reactionBursts.filter((burst) => burst.messageId === m.id);

                  return (
                    <article
                      key={m.id}
                      className={`message-card msg-in group/msg relative border px-2 py-3 transition-all sm:px-3 ${
                        own ? "own-message border-primary/[0.08]" : "border-border/35"
                      } ${incomingMessageId === m.id ? "incoming-message" : ""} ${impactMessageId === m.id ? "reaction-impact" : ""} ${heatClass}`}
                    >
                      <span className={`absolute bottom-3 left-0 top-3 w-[2px] ${m.team === "blue" ? "bg-blue-team" : m.team === "red" ? "bg-red-team" : "bg-spectator"}`} />
                      {bursts.map((burst) => (
                        <span
                          key={burst.id}
                          className="reaction-burst pointer-events-none absolute top-0 z-20 font-mono text-base font-bold text-primary"
                          style={{ right: `${12 + burst.lane * 34}px` }}
                        >
                          {burst.label}
                        </span>
                      ))}

                      <div className="flex gap-3 sm:gap-4">
                        <div className={`message-avatar mt-0.5 flex size-9 shrink-0 items-center justify-center border bg-background font-mono text-[0.68rem] font-semibold uppercase ${tc.border} ${tc.text}`}>
                          {initials(m.nickname)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`font-mono text-xs font-semibold ${tc.text}`}>{m.nickname}</span>
                            {own && (
                              <span className="border border-primary/25 bg-primary/[0.04] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.12em] text-primary">You</span>
                            )}
                            <span className="font-mono text-[0.58rem] uppercase tracking-[0.1em] text-muted-foreground">{teamName(m.team)}</span>
                            {totalReactions >= 4 && (
                              <span className={`message-heat-badge font-mono text-[0.52rem] uppercase tracking-[0.11em] ${totalReactions >= 7 ? "text-red-300" : "text-orange-300"}`}>
                                {totalReactions >= 7 ? "Meltdown" : "Heated"} · {totalReactions}
                              </span>
                            )}
                            <span className="ml-auto font-mono text-[0.58rem] text-muted-foreground/70">
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <p className="message-body mt-1.5 whitespace-pre-wrap break-words text-[0.94rem] leading-6 text-foreground/95 sm:text-base">{m.body}</p>

                          <div className="reaction-rail mt-2 flex min-h-9 flex-wrap items-center gap-1.5 sm:min-h-7">
                            {REACTIONS.map((item) => {
                              const count = messageReactions.filter((r) => r.emoji === item.value).length;
                              const active = messageReactions.some((r) => r.emoji === item.value && r.guest_id === guestPublicId);
                              return (
                                <button
                                  key={item.value}
                                  type="button"
                                  disabled={expired || offline}
                                  onClick={() => handleReaction(m.id, item.value)}
                                  aria-label={`${item.title} reaction${count ? `, ${count}` : ""}`}
                                  aria-pressed={active}
                                  title={item.title}
                                  className={`reaction-chip min-h-9 min-w-9 border px-2 py-1.5 font-mono text-[0.64rem] transition-all disabled:opacity-40 sm:min-h-0 sm:min-w-0 sm:py-1 ${
                                    active
                                      ? "reaction-chip-active border-primary bg-primary/[0.12] text-primary"
                                      : count
                                        ? "border-border bg-background/70 text-foreground"
                                        : "border-border/50 bg-background/35 text-muted-foreground"
                                  }`}
                                >
                                  <span className="reaction-label">{item.label}</span>{count ? <span className="ml-1 tabular-nums">{count}</span> : null}
                                </button>
                              );
                            })}

                            {m.guest_id !== guestPublicId && (
                              <button
                                type="button"
                                aria-label={`Report message from ${m.nickname}`}
                                title={`Report ${m.nickname}`}
                                onClick={() =>
                                  report({ data: { code: lobby.code, guestId, messageId: m.id, reason: "abuse" } })
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

          <div className="live-activity-strip flex min-h-8 items-center justify-between gap-3 border-t border-border/70 bg-surface/25 px-3 py-1.5 sm:px-4 lg:px-6" aria-live="polite">
            <div className="min-w-0 flex-1">
              {typingText ? (
                <div className="flex min-w-0 items-center gap-2 text-primary">
                  <TypingDots />
                  <span className="truncate font-mono text-[0.62rem] uppercase tracking-[0.1em]">{typingText}</span>
                </div>
              ) : (
                <span className="font-mono text-[0.58rem] uppercase tracking-[0.11em] text-muted-foreground">
                  {activePlayers.length} connected · reactions are live
                </span>
              )}
            </div>
            <span className={`hidden shrink-0 font-mono text-[0.58rem] uppercase tracking-[0.11em] sm:inline ${salt.className}`}>
              Salt {salt.label} · {Math.min(salt.score, 99)}
            </span>
          </div>

          <form
            onSubmit={submit}
            className={`mobile-safe-bottom composer-shell relative border-t border-border/80 bg-background/92 px-3 pt-3 sm:px-4 lg:px-6 ${draft.trim() ? "composer-live" : ""}`}
          >
            <div className="mx-auto w-full max-w-5xl">
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <textarea
                    value={draft}
                    rows={2}
                    maxLength={500}
                    onChange={handleDraftChange}
                    onBlur={stopTyping}
                    onKeyDown={handleComposerKeyDown}
                    disabled={expired || offline}
                    placeholder={expired ? "Lobby closed" : offline ? "Connection lost — reconnecting…" : "Fire back…"}
                    aria-label="Message"
                    className={`min-h-12 max-h-28 w-full resize-none border bg-surface/40 px-3 py-3 pr-14 text-sm leading-5 outline-none transition-all placeholder:text-muted-foreground/45 focus:border-primary focus:bg-surface/60 disabled:opacity-50 ${draft.trim() ? "composer-armed border-primary/45" : "border-border"}`}
                  />
                  <span className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[0.56rem] text-muted-foreground/65">{draft.length}/500</span>
                </div>
                <button
                  disabled={expired || offline || !draft.trim()}
                  aria-label="Send message"
                  className={`tactical-button flex min-h-12 min-w-12 items-center justify-center gap-2 bg-primary px-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 ${draft.trim() && !expired && !offline ? "send-ready" : ""}`}
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

function TypingDots() {
  return (
    <span className="typing-dots flex shrink-0 items-center gap-1" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function SaltMeter({
  level,
  label,
  score,
  className,
}: {
  level: number;
  label: string;
  score: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2" title={`Salt level: ${label}`} data-salt-level={label}>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span key={segment} className={`h-1.5 w-3 border ${segment <= level ? "border-primary bg-primary" : "border-border bg-background"}`} />
        ))}
      </div>
      <span className={`font-mono text-[0.6rem] uppercase tracking-[0.13em] ${className}`}>{label}</span>
      <span className="border-l border-border/70 pl-2 font-mono text-[0.58rem] tabular-nums text-muted-foreground" title="Behavioral heat score">
        {Math.min(score, 99)}
      </span>
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
                    className={`player-row group flex min-h-11 items-center gap-2.5 border border-border/55 bg-surface/25 px-2.5 py-1.5 ${self ? "border-primary/30 bg-primary/[0.025]" : ""}`}
                  >
                    <span className={`flex size-7 shrink-0 items-center justify-center border bg-background font-mono text-[0.58rem] font-semibold ${tc.border} ${tc.text}`}>
                      {initials(p.nickname)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.nickname}
                      {self && <span className="ml-1 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-primary">you</span>}
                    </span>
                    <span className="online-dot size-1.5 shrink-0 bg-primary/80" title="Online" />
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

function secondsUntil(expiresAt: string, now: number) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function timerTextClass(seconds: number) {
  if (seconds <= 10) return "text-destructive";
  if (seconds <= 30) return "text-orange-400";
  if (seconds <= 60) return "text-yellow-300";
  return "text-primary";
}

function timerBoxClass(seconds: number) {
  if (seconds <= 10) return "border-destructive/60 bg-destructive/[0.08] text-destructive";
  if (seconds <= 30) return "border-orange-400/45 bg-orange-400/[0.05] text-orange-400";
  if (seconds <= 60) return "border-yellow-300/40 bg-yellow-300/[0.04] text-yellow-300";
  return "border-primary/30 bg-primary/[0.04] text-primary";
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
