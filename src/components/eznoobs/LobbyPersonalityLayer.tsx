import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Radio, Sparkles, Volume2, VolumeX, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getGuestId, getGuestPublicId, type Team } from "@/lib/eznoobs";
import { getLobbySnapshot } from "@/lib/lobby-state.functions";
import { lobbyChannelName, useLobbyRealtimeToken } from "@/lib/use-realtime-token";

type Player = {
  guest_id: string;
  nickname: string;
  team: Team;
};

type Message = {
  id: string;
  guest_id: string;
  nickname: string;
  created_at: string;
};

type Reaction = {
  id: string;
  message_id: string;
  guest_id: string;
  emoji: "GG" | "skull" | "salt" | "clown";
  created_at: string;
};

type Snapshot = {
  lobby: { code: string; expires_at: string };
  players: Player[];
  messages: Message[];
  reactions: Reaction[];
  rematchVotes: { guest_id: string }[];
};

type ActivityTone = "lime" | "blue" | "red" | "muted" | "hot";
type ActivityEvent = {
  id: number;
  text: string;
  tone: ActivityTone;
  icon: "radio" | "zap" | "spark";
};

type SaltLabel = "CALM" | "WARM" | "SPICY" | "NUCLEAR";
type SaltState = {
  label: SaltLabel;
  score: number;
  level: 1 | 2 | 3 | 4;
};

type Cue = "message" | "reaction" | "join" | "leave" | "combo" | "runback";

const OPENERS = ["GG", "RUN IT BACK", "WHO THREW?", "EZ?", "ONE MORE."];
const DEFAULT_SALT: SaltState = { label: "CALM", score: 0, level: 1 };

function teamLabel(team: Team) {
  if (team === "blue") return "BLUE";
  if (team === "red") return "RED";
  return "SPECTATOR";
}

function comboLabel(emoji: Reaction["emoji"], mega: boolean) {
  if (emoji === "salt") return mega ? "MEGA SALT STORM" : "SALT STORM";
  if (emoji === "clown") return mega ? "FULL CIRCUS" : "CLOWNED";
  if (emoji === "skull") return mega ? "BODY BAGGED" : "BODY BAG";
  return mega ? "GG OVERLOAD" : "GG STACK";
}

function toneClass(tone: ActivityTone) {
  if (tone === "blue") return "border-blue-team/45 bg-blue-team/[0.08] text-blue-team";
  if (tone === "red") return "border-red-team/45 bg-red-team/[0.08] text-red-team";
  if (tone === "hot") return "border-orange-400/50 bg-orange-400/[0.08] text-orange-300";
  if (tone === "muted") return "border-border bg-background/92 text-muted-foreground";
  return "border-primary/45 bg-primary/[0.08] text-primary";
}

function saltTone(label: SaltLabel) {
  if (label === "NUCLEAR") {
    return {
      text: "text-red-300",
      border: "border-red-400/45",
      fill: "border-red-300 bg-red-300",
      glow: "shadow-[0_0_24px_rgba(248,113,113,0.10)]",
    };
  }
  if (label === "SPICY") {
    return {
      text: "text-orange-300",
      border: "border-orange-400/40",
      fill: "border-orange-300 bg-orange-300",
      glow: "shadow-[0_0_20px_rgba(253,186,116,0.08)]",
    };
  }
  if (label === "WARM") {
    return {
      text: "text-yellow-300",
      border: "border-yellow-300/35",
      fill: "border-yellow-300 bg-yellow-300",
      glow: "",
    };
  }
  return {
    text: "text-primary",
    border: "border-primary/35",
    fill: "border-primary bg-primary",
    glow: "",
  };
}

function calculateSalt(snapshot: Snapshot): SaltState {
  const minuteAgo = Date.now() - 60_000;
  const recentMessages = snapshot.messages.filter((message) => {
    const created = new Date(message.created_at).getTime();
    return Number.isFinite(created) && created >= minuteAgo;
  });
  const recentChatters = new Set(recentMessages.map((message) => message.guest_id)).size;
  const reactionScore = snapshot.reactions.reduce((score, reaction) => {
    const created = new Date(reaction.created_at).getTime();
    if (!Number.isFinite(created) || created < minuteAgo) return score;
    if (reaction.emoji === "salt") return score + 4;
    if (reaction.emoji === "clown") return score + 3;
    if (reaction.emoji === "skull") return score + 1;
    return score;
  }, 0);
  const rematchScore = Math.min(snapshot.rematchVotes.length * 2, 8);
  const chatterBonus = Math.max(0, Math.min(recentChatters - 2, 4));
  const score = recentMessages.length + reactionScore + rematchScore + chatterBonus;

  if (score >= 24) return { label: "NUCLEAR", score, level: 4 };
  if (score >= 14) return { label: "SPICY", score, level: 3 };
  if (score >= 6) return { label: "WARM", score, level: 2 };
  return { label: "CALM", score, level: 1 };
}

function playTone(
  context: AudioContext,
  frequency: number,
  delay: number,
  duration: number,
  gain = 0.025,
) {
  window.setTimeout(() => {
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, delay);
}

function prefillComposer(text: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
  if (!textarea) return;

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(text.length, text.length);
}

export function LobbyPersonalityLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchSnapshot = useServerFn(getLobbySnapshot);
  const roomMatch = pathname.match(/^\/room\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5})$/i);
  const code = roomMatch?.[1]?.toUpperCase() ?? null;
  const realtimeToken = useLobbyRealtimeToken(code);

  const [guestCredential, setGuestCredential] = useState("");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [salt, setSalt] = useState<SaltState>(DEFAULT_SALT);
  const [expired, setExpired] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(false);
  const eventCounterRef = useRef(0);
  const previousPlayersRef = useRef<Map<string, Player> | null>(null);
  const previousMessagesRef = useRef<Set<string> | null>(null);
  const previousReactionCountsRef = useRef<Map<string, number> | null>(null);
  const previousRematchRef = useRef<number | null>(null);
  const comboMilestonesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!code) {
      setGuestCredential("");
      return;
    }
    const credential = getGuestId();
    setGuestCredential(credential);
    const saved = window.localStorage.getItem("eznoobs:sound") === "on";
    setSoundOn(saved);
    soundOnRef.current = saved;
  }, [code]);

  const playCue = useCallback((cue: Cue) => {
    if (!soundOnRef.current || typeof window === "undefined") return;
    const AudioCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioRef.current) audioRef.current = new AudioCtor();
    const context = audioRef.current;

    if (cue === "message") playTone(context, 430, 0, 0.08, 0.018);
    if (cue === "reaction") playTone(context, 650, 0, 0.06, 0.015);
    if (cue === "join") {
      playTone(context, 480, 0, 0.07);
      playTone(context, 660, 70, 0.09);
    }
    if (cue === "leave") playTone(context, 300, 0, 0.1, 0.018);
    if (cue === "combo") {
      playTone(context, 720, 0, 0.06, 0.022);
      playTone(context, 920, 65, 0.11, 0.022);
    }
    if (cue === "runback") {
      playTone(context, 520, 0, 0.07, 0.02);
      playTone(context, 700, 70, 0.07, 0.02);
      playTone(context, 900, 140, 0.11, 0.024);
    }
  }, []);

  const pushEvent = useCallback(
    (text: string, tone: ActivityTone, icon: ActivityEvent["icon"], cue?: Cue) => {
      eventCounterRef.current += 1;
      const event: ActivityEvent = {
        id: Date.now() + eventCounterRef.current,
        text,
        tone,
        icon,
      };
      setEvents((current) => [...current.slice(-2), event]);
      if (cue) playCue(cue);
      window.setTimeout(() => {
        setEvents((current) => current.filter((item) => item.id !== event.id));
      }, 2600);
    },
    [playCue],
  );

  useEffect(() => {
    if (!code || !guestCredential || !realtimeToken) {
      previousPlayersRef.current = null;
      previousMessagesRef.current = null;
      previousReactionCountsRef.current = null;
      previousRematchRef.current = null;
      comboMilestonesRef.current.clear();
      setEvents([]);
      setMessageCount(null);
      setSalt(DEFAULT_SALT);
      return;
    }

    let alive = true;
    let refreshing = false;
    let refreshQueued = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const selfId = getGuestPublicId(guestCredential);

    function reactionCounts(reactions: Reaction[]) {
      const map = new Map<string, number>();
      for (const reaction of reactions) {
        const key = `${reaction.message_id}:${reaction.emoji}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return map;
    }

    async function refresh() {
      if (!alive || document.visibilityState === "hidden") return;
      if (refreshing) {
        refreshQueued = true;
        return;
      }

      refreshing = true;
      try {
        const result = await fetchSnapshot({ data: { code, guestId: guestCredential } });
        if (!alive || !result) return;
        const snapshot = result as Snapshot;
        setMessageCount(snapshot.messages.length);
        setSalt(calculateSalt(snapshot));
        setExpired(new Date(snapshot.lobby.expires_at).getTime() <= Date.now());

        const nextPlayers = new Map(snapshot.players.map((player) => [player.guest_id, player]));
        const previousPlayers = previousPlayersRef.current;
        if (previousPlayers) {
          for (const [id, player] of nextPlayers) {
            const old = previousPlayers.get(id);
            if (!old) {
              pushEvent(
                `${player.nickname} JOINED ${teamLabel(player.team)}`,
                player.team === "blue" ? "blue" : player.team === "red" ? "red" : "lime",
                "radio",
                "join",
              );
            } else if (old.team !== player.team) {
              pushEvent(
                `${player.nickname} SWITCHED TO ${teamLabel(player.team)}`,
                player.team === "blue" ? "blue" : player.team === "red" ? "red" : "lime",
                "radio",
              );
            }
          }
          for (const [id, player] of previousPlayers) {
            if (!nextPlayers.has(id))
              pushEvent(`${player.nickname} LEFT THE LOBBY`, "muted", "radio", "leave");
          }
        }
        previousPlayersRef.current = nextPlayers;

        const nextMessageIds = new Set(snapshot.messages.map((message) => message.id));
        if (previousMessagesRef.current) {
          const remoteReply = [...snapshot.messages]
            .reverse()
            .find(
              (message) =>
                !previousMessagesRef.current?.has(message.id) && message.guest_id !== selfId,
            );
          if (remoteReply) playCue("message");
        }
        previousMessagesRef.current = nextMessageIds;

        const nextCounts = reactionCounts(snapshot.reactions);
        const previousCounts = previousReactionCountsRef.current;
        if (previousCounts) {
          for (const [key, count] of nextCounts) {
            const before = previousCounts.get(key) ?? 0;
            const [messageId, emoji] = key.split(":") as [string, Reaction["emoji"]];
            const author =
              snapshot.messages.find((message) => message.id === messageId)?.nickname ??
              "THAT MESSAGE";

            for (const milestone of [3, 5]) {
              const milestoneKey = `${key}:${milestone}`;
              if (
                count >= milestone &&
                before < milestone &&
                !comboMilestonesRef.current.has(milestoneKey)
              ) {
                comboMilestonesRef.current.add(milestoneKey);
                pushEvent(
                  `${comboLabel(emoji, milestone === 5)} · ${author}`,
                  "hot",
                  "spark",
                  "combo",
                );
              }
            }
          }

          const addedReaction = snapshot.reactions.some((reaction) => {
            const next = nextCounts.get(`${reaction.message_id}:${reaction.emoji}`) ?? 0;
            const prev = previousCounts.get(`${reaction.message_id}:${reaction.emoji}`) ?? 0;
            return next > prev && reaction.guest_id !== selfId;
          });
          if (addedReaction) playCue("reaction");
        }
        previousReactionCountsRef.current = nextCounts;

        const rematchCount = snapshot.rematchVotes.length;
        const rematchTarget = Math.max(2, Math.ceil(Math.max(snapshot.players.length, 2) / 2));
        if (
          previousRematchRef.current !== null &&
          previousRematchRef.current < rematchTarget &&
          rematchCount >= rematchTarget
        ) {
          pushEvent(`RUNBACK LOCKED · ${rematchCount} VOTES`, "lime", "zap", "runback");
        }
        previousRematchRef.current = rematchCount;
      } catch {
        // The main room owns connection/error UI. This layer stays non-blocking.
      } finally {
        refreshing = false;
        if (alive && refreshQueued) {
          refreshQueued = false;
          void refresh();
        }
      }
    }

    const scheduleRefresh = () => {
      if (!alive || document.visibilityState === "hidden") return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 180);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const channel = supabase
      .channel(lobbyChannelName(code, realtimeToken))
      .on("broadcast", { event: "db-change" }, scheduleRefresh)
      .subscribe();
    const fallback = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [code, fetchSnapshot, guestCredential, playCue, pushEvent, realtimeToken]);

  if (!code || !guestCredential || !realtimeToken) return null;

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    window.localStorage.setItem("eznoobs:sound", next ? "on" : "off");
    if (next) {
      window.setTimeout(() => playCue("join"), 0);
      pushEvent("LOBBY SOUNDS ON", "lime", "radio");
    }
  }

  const saltClasses = saltTone(salt.label);
  const filledSegments = Math.max(1, Math.min(8, Math.ceil(Math.max(salt.score, 1) / 4)));

  return (
    <>
      <div className="pointer-events-none fixed bottom-[10.5rem] left-1/2 z-40 flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-[9.7rem]">
        {events.map((event) => {
          const Icon = event.icon === "zap" ? Zap : event.icon === "spark" ? Sparkles : Radio;
          return (
            <div
              key={event.id}
              className={`animate-in slide-in-from-bottom-2 fade-in flex max-w-full items-center gap-2 border px-3 py-2 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.13em] shadow-xl backdrop-blur-md duration-200 ${toneClass(event.tone)}`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{event.text}</span>
            </div>
          );
        })}
      </div>

      {!expired && messageCount !== null && (
        <div className="fixed bottom-[6.8rem] left-1/2 z-35 w-[min(96vw,58rem)] -translate-x-1/2 px-1 sm:bottom-[6.25rem]">
          <div
            className={`flex min-h-12 items-center gap-2 border bg-background/94 p-1.5 shadow-2xl backdrop-blur-md ${saltClasses.border} ${saltClasses.glow}`}
          >
            <div
              className="flex shrink-0 items-center gap-2 border-r border-border/70 px-1.5 pr-2.5"
              role="status"
              aria-label={`Salt-O-Meter ${salt.label}, heat score ${Math.min(salt.score, 99)}`}
              title="Salt-O-Meter reflects the last minute of room messages, reactions and Runback energy."
            >
              <div className="hidden min-w-[5.2rem] sm:block">
                <p className="font-display text-[0.58rem] font-bold uppercase tracking-[0.12em] text-foreground/75">
                  Salt-O-Meter
                </p>
                <div className="mt-1 flex gap-[3px]">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((segment) => (
                    <span
                      key={segment}
                      className={`h-1.5 w-2 skew-x-[-14deg] border ${segment <= filledSegments ? saltClasses.fill : "border-border bg-surface/40"}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-right sm:text-left">
                <p
                  className={`font-display text-[0.68rem] font-bold uppercase tracking-[0.08em] ${saltClasses.text} ${salt.label === "NUCLEAR" ? "signal-pulse" : ""}`}
                >
                  {salt.label}
                </p>
                <p className="font-mono text-[0.55rem] tabular-nums text-muted-foreground">
                  {Math.min(salt.score, 99)} heat
                </p>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 hidden items-center gap-2 px-1 sm:flex">
                <Zap className="size-3 text-primary" />
                <span className="font-display text-[0.58rem] font-semibold uppercase tracking-[0.11em] text-foreground/70">
                  Quick shots
                </span>
                <span className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted-foreground">
                  Prefill only
                </span>
              </div>
              <div className="flex min-w-0 gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {OPENERS.map((opener) => (
                  <button
                    key={opener}
                    type="button"
                    onClick={() => prefillComposer(opener)}
                    className="shrink-0 border border-border bg-surface/45 px-2.5 py-1.5 font-display text-[0.58rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.06] hover:text-primary sm:text-[0.62rem]"
                  >
                    {opener}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundOn ? "Turn lobby sounds off" : "Turn lobby sounds on"}
              title={soundOn ? "Lobby sounds on" : "Lobby sounds off by default"}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 border px-2.5 font-mono text-[0.56rem] uppercase tracking-[0.08em] transition-all ${
                soundOn
                  ? "border-primary/45 bg-primary/[0.08] text-primary"
                  : "border-border bg-background/70 text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              <span className="hidden md:inline">Sound {soundOn ? "on" : "off"}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
