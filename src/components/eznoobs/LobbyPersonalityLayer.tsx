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
};

type Reaction = {
  id: string;
  message_id: string;
  guest_id: string;
  emoji: "GG" | "skull" | "salt" | "clown";
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

type Cue = "message" | "reaction" | "join" | "leave" | "combo" | "runback";

const OPENERS = ["GG", "RUN IT BACK", "WHO THREW?", "EZ?", "ONE MORE."];

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

function playTone(context: AudioContext, frequency: number, delay: number, duration: number, gain = 0.025) {
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
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  const pushEvent = useCallback((text: string, tone: ActivityTone, icon: ActivityEvent["icon"], cue?: Cue) => {
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
  }, [playCue]);

  useEffect(() => {
    if (!code || !guestCredential) {
      previousPlayersRef.current = null;
      previousMessagesRef.current = null;
      previousReactionCountsRef.current = null;
      previousRematchRef.current = null;
      comboMilestonesRef.current.clear();
      setEvents([]);
      setMessageCount(null);
      return;
    }

    let alive = true;
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
      try {
        const result = await fetchSnapshot({ data: { code, guestId: guestCredential } });
        if (!alive || !result) return;
        const snapshot = result as Snapshot;
        setMessageCount(snapshot.messages.length);
        setExpired(new Date(snapshot.lobby.expires_at).getTime() <= Date.now());

        const nextPlayers = new Map(snapshot.players.map((player) => [player.guest_id, player]));
        const previousPlayers = previousPlayersRef.current;
        if (previousPlayers) {
          for (const [id, player] of nextPlayers) {
            const old = previousPlayers.get(id);
            if (!old) {
              pushEvent(`${player.nickname} JOINED ${teamLabel(player.team)}`, player.team === "blue" ? "blue" : player.team === "red" ? "red" : "lime", "radio", "join");
            } else if (old.team !== player.team) {
              pushEvent(`${player.nickname} SWITCHED TO ${teamLabel(player.team)}`, player.team === "blue" ? "blue" : player.team === "red" ? "red" : "lime", "radio");
            }
          }
          for (const [id, player] of previousPlayers) {
            if (!nextPlayers.has(id)) pushEvent(`${player.nickname} LEFT THE LOBBY`, "muted", "radio", "leave");
          }
        }
        previousPlayersRef.current = nextPlayers;

        const nextMessageIds = new Set(snapshot.messages.map((message) => message.id));
        if (previousMessagesRef.current) {
          const remoteReply = [...snapshot.messages]
            .reverse()
            .find((message) => !previousMessagesRef.current?.has(message.id) && message.guest_id !== selfId);
          if (remoteReply) playCue("message");
        }
        previousMessagesRef.current = nextMessageIds;

        const nextCounts = reactionCounts(snapshot.reactions);
        const previousCounts = previousReactionCountsRef.current;
        if (previousCounts) {
          for (const [key, count] of nextCounts) {
            const before = previousCounts.get(key) ?? 0;
            const [messageId, emoji] = key.split(":") as [string, Reaction["emoji"]];
            const author = snapshot.messages.find((message) => message.id === messageId)?.nickname ?? "THAT MESSAGE";

            for (const milestone of [3, 5]) {
              const milestoneKey = `${key}:${milestone}`;
              if (count >= milestone && before < milestone && !comboMilestonesRef.current.has(milestoneKey)) {
                comboMilestonesRef.current.add(milestoneKey);
                pushEvent(`${comboLabel(emoji, milestone === 5)} · ${author}`, "hot", "spark", "combo");
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
        if (previousRematchRef.current !== null && previousRematchRef.current < rematchTarget && rematchCount >= rematchTarget) {
          pushEvent(`RUNBACK LOCKED · ${rematchCount} VOTES`, "lime", "zap", "runback");
        }
        previousRematchRef.current = rematchCount;
      } catch {
        // The main room owns connection/error UI. This layer stays non-blocking.
      }
    }

    void refresh();
    // Token-scoped private topic only; polling covers the window before it arrives.
    const channel = realtimeToken
      ? supabase
          .channel(lobbyChannelName(code, realtimeToken), { config: { private: true } })
          .on("broadcast", { event: "db-change" }, () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => void refresh(), 150);
          })
          .subscribe()
      : null;
    const fallback = window.setInterval(() => void refresh(), 8000);

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(fallback);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code, fetchSnapshot, guestCredential, playCue, pushEvent, realtimeToken]);

  if (!code || !guestCredential) return null;

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

  return (
    <>
      <div className="pointer-events-none fixed bottom-[7.2rem] left-1/2 z-40 flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-[6.6rem]">
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

      {messageCount === 0 && !expired && events.length === 0 && (
        <div className="fixed bottom-[7.15rem] left-1/2 z-30 w-[min(94vw,38rem)] -translate-x-1/2 border border-border/80 bg-background/94 p-2.5 shadow-2xl backdrop-blur-md sm:bottom-[6.55rem]">
          <div className="flex items-center gap-2 px-1 pb-2">
            <Zap className="size-3.5 text-primary" />
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground">Opening shots</span>
            <span className="ml-auto font-mono text-[0.55rem] uppercase tracking-[0.12em] text-primary">Pick one or type your own</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OPENERS.map((opener) => (
              <button
                key={opener}
                type="button"
                onClick={() => prefillComposer(opener)}
                className="min-h-9 border border-border bg-surface/45 px-2.5 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/[0.06] hover:text-primary"
              >
                {opener}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleSound}
        aria-label={soundOn ? "Turn lobby sounds off" : "Turn lobby sounds on"}
        title={soundOn ? "Lobby sounds on" : "Lobby sounds off by default"}
        className={`fixed bottom-[7.25rem] right-3 z-50 flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[0.56rem] uppercase tracking-[0.1em] backdrop-blur-md transition-all sm:right-4 ${
          soundOn
            ? "border-primary/45 bg-primary/[0.08] text-primary"
            : "border-border bg-background/88 text-muted-foreground hover:border-primary hover:text-primary"
        }`}
      >
        {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        <span className="hidden sm:inline">Sound {soundOn ? "on" : "off"}</span>
      </button>
    </>
  );
}
