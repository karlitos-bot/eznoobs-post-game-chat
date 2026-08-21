import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ArrowRight, Copy, Radio, Skull, Swords, Timer, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getGuestId } from "@/lib/eznoobs";
import { createRunbackLobby, getRunbackLobby } from "@/lib/runback.functions";
import { lobbyChannelName, useLobbyRealtimeToken } from "@/lib/use-realtime-token";

type AftermathStats = {
  messages: number;
  reactions: number;
  peakSalt: string;
  topReaction: string;
  topReactionCount: number;
  runback: string;
};

const SALT_RANK: Record<string, number> = {
  CALM: 1,
  WARM: 2,
  SPICY: 3,
  NUCLEAR: 4,
};

const REACTION_NAMES: Record<string, string> = {
  "Good game": "GG",
  Dead: "☠",
  Salty: "🧂",
  Clown: "🤡",
  Fire: "🔥",
  Nuclear: "☢",
};

const RUNBACK_RECOVERY_DELAYS = [0, 3_000, 10_000, 30_000] as const;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function roomCodeFromPath(pathname: string) {
  return pathname.match(/^\/room\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5})$/i)?.[1]?.toUpperCase() ?? null;
}

function captureStats(previous: AftermathStats): AftermathStats {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return previous;

  const messages = main.querySelectorAll(".message-card").length;
  const totals = new Map<string, number>();
  let reactions = 0;

  main.querySelectorAll<HTMLButtonElement>('button[aria-label*=" reaction"]').forEach((button) => {
    const label = button.getAttribute("aria-label") ?? "";
    const match = label.match(/^(.+?) reaction(?:,\s*(\d+))?$/i);
    if (!match) return;
    const count = Number(match[2] ?? 0);
    if (!Number.isFinite(count) || count <= 0) return;
    const reaction = REACTION_NAMES[match[1] ?? ""] ?? match[1] ?? "Reaction";
    totals.set(reaction, (totals.get(reaction) ?? 0) + count);
    reactions += count;
  });

  let topReaction = previous.topReaction;
  let topReactionCount = previous.topReactionCount;
  for (const [reaction, count] of totals) {
    if (count > topReactionCount) {
      topReaction = reaction;
      topReactionCount = count;
    }
  }

  const currentSalt =
    document.querySelector<HTMLElement>("[data-salt-level]")?.dataset.saltLevel ??
    document.documentElement.dataset.ezSalt ??
    previous.peakSalt;
  const peakSalt =
    (SALT_RANK[currentSalt] ?? 0) > (SALT_RANK[previous.peakSalt] ?? 0)
      ? currentSalt
      : previous.peakSalt;

  const runbackNode =
    main.querySelector<HTMLElement>(".runback-ready") ??
    Array.from(main.querySelectorAll<HTMLElement>("div")).find((node) =>
      /want the runback|runback locked/i.test(node.textContent ?? ""),
    );
  const runback = runbackNode?.textContent?.replace(/\s+/g, " ").trim() || previous.runback;

  return {
    messages: Math.max(previous.messages, messages),
    reactions: Math.max(previous.reactions, reactions),
    peakSalt,
    topReaction,
    topReactionCount,
    runback,
  };
}

export function RunbackAftermathLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const code = roomCodeFromPath(pathname);
  const realtimeToken = useLobbyRealtimeToken(code ?? "");
  const createRunback = useServerFn(createRunbackLobby);
  const lookupRunback = useServerFn(getRunbackLobby);
  const [locked, setLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runbackCode, setRunbackCode] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [showAftermath, setShowAftermath] = useState(false);
  const [stats, setStats] = useState<AftermathStats>({
    messages: 0,
    reactions: 0,
    peakSalt: "CALM",
    topReaction: "—",
    topReactionCount: 0,
    runback: "No Runback vote",
  });
  const statsRef = useRef(stats);
  const runbackChannelRef = useRef<RealtimeChannel | null>(null);
  const aftermathRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    if (!code) {
      setLocked(false);
      setRunbackCode(null);
      setExpired(false);
      setShowAftermath(false);
      return;
    }

    let frame = 0;
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const main = document.querySelector<HTMLElement>("main");
        if (!main) return;

        const nextStats = captureStats(statsRef.current);
        statsRef.current = nextStats;
        setStats(nextStats);

        const isLocked =
          Boolean(main.querySelector(".runback-ready")) || /runback locked/i.test(main.textContent ?? "");
        setLocked(isLocked);

        const isExpired =
          /temporary chat cleared|lobby closed/i.test(main.textContent ?? "") &&
          Boolean(main.querySelector('textarea[aria-label="Message"]')?.hasAttribute("disabled"));
        if (isExpired) {
          setExpired(true);
          setShowAftermath(true);
        }
      });
    };

    sync();
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;

    const observer = new MutationObserver(sync);
    observer.observe(main, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [code]);

  // Realtime is the fast path. If a client misses the Runback broadcast, perform a
  // small bounded set of credential-protected lookups instead of polling forever.
  useEffect(() => {
    if (!code || !locked || runbackCode) return;

    let cancelled = false;
    const timers: number[] = [];
    const guestId = getGuestId();

    RUNBACK_RECOVERY_DELAYS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        if (cancelled || runbackCode) return;
        void lookupRunback({ data: { code, guestId } })
          .then((nextCode) => {
            if (!cancelled && nextCode) setRunbackCode(nextCode);
          })
          .catch(() => {});
      }, delay);
      timers.push(timer);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [code, locked, lookupRunback, runbackCode]);

  useEffect(() => {
    if (!code || !realtimeToken) {
      runbackChannelRef.current = null;
      return;
    }

    const channel = supabase
      .channel(lobbyChannelName(code, realtimeToken))
      .on("broadcast", { event: "runback-room" }, (event) => {
        const nextCode = (event.payload as { code?: string } | undefined)?.code;
        if (/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(nextCode ?? "")) {
          setRunbackCode(nextCode!);
          toast.success(`Runback room ${nextCode} is ready.`);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") runbackChannelRef.current = channel;
      });

    return () => {
      if (runbackChannelRef.current === channel) runbackChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [code, realtimeToken]);

  useEffect(() => {
    if (!showAftermath) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      aftermathRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowAftermath(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        aftermathRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => element.offsetParent !== null && !element.hasAttribute("disabled"));
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [showAftermath]);

  async function createNextRoom() {
    if (!code || creating) return;
    setCreating(true);
    try {
      const guestId = getGuestId();
      const result = await createRunback({ data: { code, guestId } });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      setRunbackCode(result.code);
      toast.success(`Runback room ${result.code} created.`);

      const channel = runbackChannelRef.current;
      if (channel) {
        void channel
          .send({
            type: "broadcast",
            event: "runback-room",
            payload: { code: result.code },
          })
          .catch(() => {});
      }
    } catch {
      toast.error("Could not create the Runback room.");
    } finally {
      setCreating(false);
    }
  }

  async function copyRunback() {
    if (!runbackCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${runbackCode}`);
      toast.success("Runback invite copied.");
    } catch {
      toast.error("Could not copy the Runback invite.");
    }
  }

  function joinRunback() {
    if (!runbackCode) return;
    window.location.assign(`/room/${runbackCode}`);
  }

  if (!code) return null;

  return (
    <>
      {locked && !expired && (
        <aside
          className={`ez-runback-next ${runbackCode ? "ez-runback-next-ready" : ""}`}
          aria-label="Runback room"
        >
          <div className="ez-runback-next-icon" aria-hidden="true">
            <Swords className="size-4" />
          </div>
          <div className="ez-runback-next-copy">
            <span>RUNBACK LOCKED</span>
            <strong>{runbackCode ? `ROOM ${runbackCode} READY` : "KEEP THE BEEF GOING"}</strong>
          </div>
          <div className="ez-runback-next-actions">
            {runbackCode ? (
              <>
                <button type="button" onClick={copyRunback} aria-label="Copy Runback invite">
                  <Copy className="size-3.5" />
                </button>
                <button type="button" onClick={joinRunback} className="ez-runback-next-primary">
                  JOIN <ArrowRight className="size-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void createNextRoom()}
                disabled={creating}
                className="ez-runback-next-primary"
              >
                {creating ? "CREATING…" : "CREATE RUNBACK"}{" "}
                <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </aside>
      )}

      {expired && showAftermath && (
        <div
          ref={aftermathRef}
          className="ez-aftermath"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ez-aftermath-title"
          aria-describedby="ez-aftermath-description"
        >
          <div className="ez-aftermath-backdrop" />
          <section className="ez-aftermath-card">
            <div className="ez-aftermath-mascot" aria-hidden="true" />
            <div className="ez-aftermath-head">
              <div>
                <span className="ez-aftermath-kicker">
                  <Radio className="size-3.5" /> CHANNEL CLOSED
                </span>
                <h2 id="ez-aftermath-title">MATCH AFTERMATH</h2>
                <p id="ez-aftermath-description">
                  The room is gone. This summary was captured locally and remains on this screen only.
                </p>
              </div>
              <button
                type="button"
                className="ez-aftermath-close"
                onClick={() => setShowAftermath(false)}
              >
                VIEW CLOSED ROOM
              </button>
            </div>

            <div className="ez-aftermath-grid">
              <article>
                <span>MESSAGES</span>
                <strong>{stats.messages}</strong>
                <small>shots fired</small>
              </article>
              <article>
                <span>REACTIONS</span>
                <strong>{stats.reactions}</strong>
                <small>crowd damage</small>
              </article>
              <article
                className={`ez-aftermath-salt ez-aftermath-salt-${stats.peakSalt.toLowerCase()}`}
              >
                <span>PEAK SALT</span>
                <strong>{stats.peakSalt}</strong>
                <small>highest heat</small>
              </article>
              <article>
                <span>TOP REACTION</span>
                <strong>{stats.topReaction}</strong>
                <small>
                  {stats.topReactionCount ? `×${stats.topReactionCount}` : "none landed"}
                </small>
              </article>
            </div>

            <div className="ez-aftermath-runback">
              <Swords className="size-4" />
              <span>
                {runbackCode ? `RUNBACK ROOM ${runbackCode} IS READY` : stats.runback}
              </span>
            </div>

            <div className="ez-aftermath-actions">
              {runbackCode ? (
                <button type="button" onClick={joinRunback} className="ez-aftermath-primary">
                  <Swords className="size-4" /> JOIN RUNBACK <ArrowRight className="size-4" />
                </button>
              ) : (
                <a href="/" className="ez-aftermath-primary">
                  <Zap className="size-4" /> CREATE FRESH LOBBY <ArrowRight className="size-4" />
                </a>
              )}
              <a href="/" className="ez-aftermath-secondary">
                <Timer className="size-4" /> BACK TO EZNOOBS
              </a>
            </div>

            <div className="ez-aftermath-foot">
              <Skull className="size-3.5" /> Temporary by design · these stats are not a
              permanent match history.
            </div>
          </section>
        </div>
      )}
    </>
  );
}
