import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Users, X, VolumeX, Volume2, Flag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/eznoobs/Logo";
import { SafetyNote } from "@/components/eznoobs/SafetyNote";
import {
  getLobby,
  joinLobby,
  sendMessage,
  reportMessage,
  touchPresence,
} from "@/lib/lobby.functions";
import {
  TEAMS,
  type Team,
  getGuestId,
  lastNickname,
  rememberNickname,
  teamClasses,
  CODE_RE,
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
type Participant = { id: string; guest_id: string; nickname: string; team: Team };

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
    return <Centered>
      <p className="hud-label">Pinging lobby…</p>
    </Centered>;

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [players, setPlayers] = useState<Participant[]>([]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [muted, setMuted] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(lobby.expires_at);
  const [now, setNow] = useState(() => Date.now());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [m, p] = await Promise.all([
        supabase
          .from("messages")
          .select("id, guest_id, nickname, team, body, created_at")
          .eq("lobby_id", lobby.id)
          .order("created_at", { ascending: true })
          .limit(200),
        supabase
          .from("participants")
          .select("id, guest_id, nickname, team")
          .eq("lobby_id", lobby.id),
      ]);
      if (!alive) return;
      setMessages((m.data ?? []) as Message[]);
      setPlayers((p.data ?? []) as Participant[]);
    }
    load();

    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => setMessages((prev) =>
          prev.some((m) => m.id === (payload.new as Message).id)
            ? prev
            : [...prev, payload.new as Message],
        ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `lobby_id=eq.${lobby.id}` },
        () => {
          supabase
            .from("participants")
            .select("id, guest_id, nickname, team")
            .eq("lobby_id", lobby.id)
            .then(({ data }) => setPlayers((data ?? []) as Participant[]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => setExpiresAt((payload.new as Lobby).expires_at),
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [lobby.id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!guestId) return;
    const ping = () => void heartbeat({ data: { code: lobby.code, guestId } }).catch(() => {});
    const t = setInterval(ping, 60_000);
    return () => clearInterval(t);
  }, [guestId, lobby.code, heartbeat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const visible = useMemo(
    () => messages.filter((m) => !muted.includes(m.guest_id)),
    [messages, muted],
  );

  const grouped = useMemo(
    () => ({
      blue: players.filter((p) => p.team === "blue"),
      red: players.filter((p) => p.team === "red"),
      spectator: players.filter((p) => p.team === "spectator"),
    }),
    [players],
  );

  const salt = useMemo(() => {
    const recent = messages.filter(
      (m) => Date.now() - new Date(m.created_at).getTime() < 60_000,
    ).length;
    if (recent > 14) return "NUCLEAR";
    if (recent > 7) return "SPICY";
    if (recent > 2) return "WARM";
    return "CALM";
  }, [messages]);

  const minutesLeft = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000));
  const expired = new Date(expiresAt).getTime() <= now;

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

  function copyInvite() {
    const url = `${window.location.origin}/room/${lobby.code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface/70 px-4 py-3">
        <Logo className="text-lg" />
        <span className="hud-label hidden sm:inline">{lobby.game}</span>
        <span className="flex items-center gap-2 border border-border px-2 py-1 font-mono text-sm tracking-[0.24em] text-primary">
          {lobby.code}
        </span>
        <button
          onClick={copyInvite}
          className="flex items-center gap-2 border border-border px-3 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Invite
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="hud-label flex items-center gap-1.5 text-primary">
            <span className="inline-block size-1.5 animate-pulse bg-primary" /> Live
          </span>
          <span className="hud-label hidden md:inline">Salt: {salt}</span>
          <span className="hud-label hidden lg:inline">
            {expired ? "Expired" : `Expires in ~${minutesLeft}m idle`}
          </span>
          <button
            onClick={() => setShowPlayers(true)}
            className="flex items-center gap-1.5 border border-border px-2.5 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground lg:hidden"
          >
            <Users className="size-3.5" /> {players.length}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-surface/40 p-4 lg:block">
          <PlayerList grouped={grouped} guestId={guestId} muted={muted} setMuted={setMuted} />
        </aside>

        {showPlayers && (
          <div className="fixed inset-0 z-30 flex lg:hidden">
            <div className="flex-1 bg-background/70" onClick={() => setShowPlayers(false)} />
            <div className="w-72 overflow-y-auto border-l border-border bg-surface p-4">
              <button
                onClick={() => setShowPlayers(false)}
                className="mb-4 flex items-center gap-2 hud-label"
              >
                <X className="size-3.5" /> Close
              </button>
              <PlayerList grouped={grouped} guestId={guestId} muted={muted} setMuted={setMuted} />
            </div>
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
            <div className="relative z-10 space-y-2.5">
              {visible.length === 0 && (
                <p className="hud-label">No messages yet. Open with a GG or an accusation.</p>
              )}
              {visible.map((m) => {
                const tc = teamClasses(m.team);
                return (
                  <div key={m.id} className="msg-in group/msg flex gap-3 text-sm">
                    <span className="hud-label mt-1 w-11 shrink-0 text-right">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className={`min-w-0 border-l-2 pl-3 ${tc.border}`}>
                      <span className={`font-mono text-xs font-semibold ${tc.text}`}>
                        {m.nickname}
                        {m.guest_id === guestId && (
                          <span className="ml-1 text-muted-foreground">(you)</span>
                        )}
                      </span>
                      <p className="break-words text-foreground/90">{m.body}</p>
                      {m.guest_id !== guestId && (
                        <button
                          type="button"
                          aria-label={`Report message from ${m.nickname}`}
                          onClick={() =>
                            report({
                              data: { code: lobby.code, guestId, messageId: m.id, reason: "abuse" },
                            })
                              .then(() => toast.success("Reported. Thanks."))
                              .catch(() => toast.error("Could not report that message."))
                          }
                          className="mt-1 hidden items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground hover:text-destructive group-hover/msg:flex"
                        >
                          <Flag className="size-3" /> Report
                        </button>
                      )}
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
                className="bg-primary px-5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-50"
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
                        className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                      >
                        {isMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
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
