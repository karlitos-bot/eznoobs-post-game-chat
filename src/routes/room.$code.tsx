import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Flag,
  LogOut,
  RotateCcw,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
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
  rememberNickname,
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

  if (state === "loading")
    return (
      <Centered>
        <p className="hud-label">Pinging lobby…</p>
      </Centered>
    );

  if (state === "missing")
    return (
      <Centered>
        <h1 className="text-4xl">Lobby offline</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Code <span className="font-mono text-foreground">{code}</span> doesn't exist or has
          expired.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block bg-primary px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-primary-foreground"
        >
          Create a lobby
        </Link>
      </Centered>
    );

  if (state === "gate" && lobby)
    return (
      <JoinGate
        lobby={lobby}
        onJoined={() => setState("in")}
        join={join}
        guestId={guestId}
      />
    );

  return <Room lobby={lobby!} guestId={guestId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 text-center">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
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
  const [nickname, setNickname] = useState(lastNickname());
  const [team, setTeam] = useState<Team>("blue");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      rememberNickname(nick);
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
        className="w-[min(92vw,26rem)] border border-border bg-surface/80 p-6 text-left"
      >
        <Logo className="text-xl" />
        <p className="hud-label mt-4">
          Lobby <span className="text-primary">{lobby.code}</span> · {lobby.game}
        </p>
        <h1 className="mt-2 text-3xl">Drop in</h1>

        <label className="hud-label mt-5 block" htmlFor="nick">
          Nickname (max 20)
        </label>
        <input
          id="nick"
          autoFocus
          maxLength={20}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="ghostpeek"
          className="mt-2 w-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />

        <span className="hud-label mt-5 block">Side</span>
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

        <button
          disabled={busy}
          className="mt-6 w-full bg-primary py-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Connecting…" : "Enter lobby"}
        </button>
        <SafetyNote className="mt-4" />
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
    let alive = true;

    async function refreshPlayers() {
      const { data } = await supabase
        .from("participants")
        .select("id, guest_id, nickname, team, last_seen_at")
        .eq("lobby_id", lobby.id);
      if (alive) setPlayers((data ?? []) as Participant[]);
    }

    async function refreshReactions() {
      const { data } = await supabase
        .from("reactions")
        .select("id, message_id, guest_id, emoji, created_at")
        .eq("lobby_id", lobby.id);
      if (alive) setReactions((data ?? []) as Reaction[]);
    }

    async function refreshRematchVotes() {
      const { data } = await supabase
        .from("rematch_votes")
        .select("id, guest_id")
        .eq("lobby_id", lobby.id);
      if (alive) setRematchVotes((data ?? []) as RematchVote[]);
    }

    async function load() {
      const { data } = await supabase
        .from("messages")
        .select("id, guest_id, nickname, team, body, created_at")
        .eq("lobby_id", lobby.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (alive) setMessages((data ?? []) as Message[]);
      await Promise.all([refreshPlayers(), refreshReactions(), refreshRematchVotes()]);
    }

    void load();

    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lobby_id=eq.${lobby.id}` },
        (payload) =>
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Message).id)
              ? prev
              : [...prev, payload.new as Message],
          ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `lobby_id=eq.${lobby.id}` },
        () => void refreshPlayers(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reactions", filter: `lobby_id=eq.${lobby.id}` },
        () => void refreshReactions(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rematch_votes", filter: `lobby_id=eq.${lobby.id}` },
        () => void refreshRematchVotes(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => setExpiresAt((payload.new as Lobby).expires_at),
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [lobby.id]);

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

    if (score > 20) return { label: "NUCLEAR", className: "text-red-400", score };
    if (score > 11) return { label: "SPICY", className: "text-orange-400", score };
    if (score > 4) return { label: "WARM", className: "text-yellow-300", score };
    return { label: "CALM", className: "text-primary", score };
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

  async function copyInvite() {
    const url = `${window.location.origin}/room/${lobby.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the invite link.");
    }
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
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="relative z-20 flex flex-wrap items-center gap-2 border-b border-border bg-surface/70 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto">
          <Logo className="shrink-0 text-lg" />
          <span className="hud-label hidden md:inline">{lobby.game}</span>
          <span className="flex shrink-0 items-center border border-border px-2 py-1 font-mono text-sm tracking-[0.2em] text-primary sm:tracking-[0.24em]">
            {lobby.code}
          </span>
          <span
            className={`hud-label ml-auto flex shrink-0 items-center gap-1.5 lg:ml-1 ${
              expired ? "text-destructive" : "text-primary"
            }`}
          >
            <span className={`inline-block size-1.5 ${expired ? "bg-destructive" : "animate-pulse bg-primary"}`} />
            {expired ? "Ended" : "Live"}
          </span>
          <button
            onClick={() => setShowPlayers(true)}
            className="flex shrink-0 items-center gap-1.5 border border-border px-2 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground lg:hidden"
          >
            <Users className="size-3.5" /> {activePlayers.length}
          </button>
          <button
            onClick={handleLeave}
            disabled={leaving}
            aria-label="Leave lobby"
            className="flex shrink-0 items-center gap-1.5 border border-border px-2 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
          >
            <LogOut className="size-3.5" /> <span className="hidden sm:inline">Leave</span>
          </button>
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 lg:ml-auto lg:w-auto">
          <button
            onClick={copyInvite}
            className="flex min-w-0 flex-1 items-center justify-center gap-2 border border-border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary hover:text-primary sm:flex-none sm:tracking-[0.14em]"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Invite
          </button>
          <button
            onClick={handleRematch}
            disabled={expired}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.12em] transition-colors disabled:opacity-40 sm:flex-none sm:tracking-[0.14em] ${
              hasRematchVote
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            <RotateCcw className="size-3.5" /> Rematch
            {rematchVotes.length > 0 && <span className="text-primary">{rematchVotes.length}</span>}
          </button>
          <span className={`hud-label hidden sm:inline ${salt.className}`} title={`Salt score ${salt.score}`}>
            Salt: {salt.label}
          </span>
          <span className="hud-label hidden xl:inline">
            {expired ? "Read-only" : `~${minutesLeft}m idle`}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-surface/40 p-4 lg:block">
          <p className="hud-label mb-4">Online · {activePlayers.length}</p>
          <PlayerList grouped={grouped} guestId={guestPublicId} muted={muted} setMuted={setMuted} />
        </aside>

        {showPlayers && (
          <div className="fixed inset-0 z-30 flex lg:hidden">
            <div className="flex-1 bg-background/70" onClick={() => setShowPlayers(false)} />
            <div className="w-72 overflow-y-auto border-l border-border bg-surface p-4">
              <button
                onClick={() => setShowPlayers(false)}
                className="mb-2 flex items-center gap-2 hud-label"
              >
                <X className="size-3.5" /> Close
              </button>
              <p className="hud-label mb-4">Online · {activePlayers.length}</p>
              <PlayerList grouped={grouped} guestId={guestPublicId} muted={muted} setMuted={setMuted} />
            </div>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          {expired && (
            <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-center font-mono text-[0.68rem] uppercase tracking-[0.16em] text-destructive">
              Lobby expired. Chat is now read-only.
            </div>
          )}
          {!expired && rematchVotes.length >= 2 && (
            <div className="border-b border-primary/30 bg-primary/5 px-4 py-2 text-center font-mono text-[0.68rem] uppercase tracking-[0.16em] text-primary">
              {rematchVotes.length} players want the runback. Queue it up.
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
            <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
            <div className="relative z-10 space-y-3 sm:space-y-2.5">
              {visible.length === 0 && (
                <p className="hud-label">No messages yet. Open with a GG or an accusation.</p>
              )}
              {visible.map((m) => {
                const tc = teamClasses(m.team);
                const messageReactions = reactionsByMessage.get(m.id) ?? [];
                return (
                  <div key={m.id} className="msg-in group/msg flex gap-2.5 text-sm sm:gap-3">
                    <span className="hud-label mt-1 hidden w-11 shrink-0 text-right sm:block">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className={`min-w-0 flex-1 border-l-2 pl-3 ${tc.border}`}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={`font-mono text-xs font-semibold ${tc.text}`}>
                          {m.nickname}
                          {m.guest_id === guestPublicId && (
                            <span className="ml-1 text-muted-foreground">(you)</span>
                          )}
                        </span>
                        <span className="hud-label sm:hidden">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="break-words text-foreground/90">{m.body}</p>

                      <div className="mt-1.5 flex min-h-6 flex-wrap items-center gap-1.5">
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
                              className={`border px-1.5 py-0.5 font-mono text-[0.64rem] transition-all disabled:opacity-40 ${
                                active
                                  ? "border-primary bg-primary/10 text-primary"
                                  : count
                                    ? "border-border text-foreground hover:border-primary hover:text-primary"
                                    : "border-border/60 text-muted-foreground hover:border-primary hover:text-primary sm:border-transparent sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus:opacity-100"
                              }`}
                            >
                              {item.label}
                              {count ? ` ${count}` : ""}
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
                            className="ml-auto flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus:opacity-100"
                          >
                            <Flag className="size-3" /> <span className="hidden sm:inline">Report</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          </div>

          <form onSubmit={submit} className="border-t border-border bg-surface/60 p-3">
            <div className="flex gap-2">
              <input
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                disabled={expired}
                placeholder={expired ? "Lobby expired" : "Say something…"}
                aria-label="Message"
                className="min-w-0 flex-1 border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-50"
              />
              <button
                disabled={expired}
                className="bg-primary px-4 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground disabled:opacity-50 sm:px-5 sm:tracking-[0.16em]"
              >
                Send
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <SafetyNote />
              <span className="hud-label">{draft.length}/500</span>
            </div>
          </form>
        </main>
      </div>
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
    { team: "blue", label: "Blue Team" },
    { team: "red", label: "Red Team" },
    { team: "spectator", label: "Spectators" },
  ];
  return (
    <div className="space-y-6">
      {sections.map(({ team, label }) => {
        const tc = teamClasses(team);
        return (
          <div key={team}>
            <p className={`hud-label ${tc.text}`}>
              {label} · {grouped[team].length}
            </p>
            <ul className="mt-2 space-y-1">
              {grouped[team].length === 0 && (
                <li className="text-xs text-muted-foreground">empty</li>
              )}
              {grouped[team].map((p) => {
                const isMuted = muted.includes(p.guest_id);
                return (
                  <li
                    key={p.id}
                    className={`group flex items-center justify-between gap-2 border-l-2 py-1 pl-2 text-sm ${tc.border}`}
                  >
                    <span className="truncate">
                      {p.nickname}
                      {p.guest_id === guestId && (
                        <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                      )}
                    </span>
                    {p.guest_id !== guestId && (
                      <button
                        aria-label={isMuted ? `Unmute ${p.nickname}` : `Mute ${p.nickname}`}
                        onClick={() =>
                          setMuted((prev) =>
                            prev.includes(p.guest_id)
                              ? prev.filter((g) => g !== p.guest_id)
                              : [...prev, p.guest_id],
                          )
                        }
                        className="text-muted-foreground opacity-60 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        {isMuted ? (
                          <VolumeX className="size-3.5" />
                        ) : (
                          <Volume2 className="size-3.5" />
                        )}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
