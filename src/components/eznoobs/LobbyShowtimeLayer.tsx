import { useRouterState } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "./lobby-showtime.css";

type TeamEnergy = {
  blue: number;
  red: number;
  active: boolean;
};

type MainRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ComboKey = "salt" | "clown" | "skull" | "gg";

const COMBO_COPY: Record<ComboKey, { normal: string; mega: string }> = {
  salt: { normal: "SALT STORM", mega: "MEGA SALT STORM" },
  clown: { normal: "CLOWNED", mega: "FULL CIRCUS" },
  skull: { normal: "BODY BAG", mega: "BODY BAGGED" },
  gg: { normal: "GG STACK", mega: "GG OVERLOAD" },
};

function reactionKey(button: HTMLButtonElement): ComboKey | null {
  const label = (button.getAttribute("aria-label") ?? "").toLowerCase();
  if (label.startsWith("salty reaction")) return "salt";
  if (label.startsWith("clown reaction")) return "clown";
  if (label.startsWith("dead reaction")) return "skull";
  if (label.startsWith("good game reaction")) return "gg";
  return null;
}

function reactionCount(button: HTMLButtonElement) {
  const label = button.getAttribute("aria-label") ?? "";
  const match = label.match(/reaction(?:,\s*(\d+))?$/i);
  return match?.[1] ? Number(match[1]) : 0;
}

function messageTeam(card: HTMLElement): "blue" | "red" | null {
  const labels = Array.from(card.querySelectorAll("span"));
  if (labels.some((item) => item.textContent?.trim().toUpperCase() === "BLUE")) return "blue";
  if (labels.some((item) => item.textContent?.trim().toUpperCase() === "RED")) return "red";
  return null;
}

function shouldDecorate(mutations: MutationRecord[]) {
  return mutations.some((mutation) => {
    if (mutation.type !== "attributes") return true;
    const target = mutation.target;
    if (!(target instanceof HTMLElement)) return true;

    // Ignore class changes produced by this layer itself. Message additions and reaction
    // count changes are observed through childList / aria-label mutations instead.
    if (
      mutation.attributeName === "class" &&
      (target.classList.contains("message-card") || target.classList.contains("live-activity-strip"))
    ) {
      return false;
    }

    return true;
  });
}

export function LobbyShowtimeLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(pathname);

  const [energy, setEnergy] = useState<TeamEnergy>({ blue: 0.5, red: 0.5, active: false });
  const [mainRect, setMainRect] = useState<MainRect | null>(null);
  const [runbackText, setRunbackText] = useState<string | null>(null);

  const previousRunbackReady = useRef<boolean | null>(null);
  const comboState = useRef(new WeakMap<HTMLElement, string>());
  const runbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRoom) {
      setRunbackText(null);
      setMainRect(null);
      previousRunbackReady.current = null;
      return;
    }

    let roomMain: HTMLElement | null = null;
    let frame = 0;
    let mountObserver: MutationObserver | null = null;
    let roomObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const measureMain = () => {
      if (!roomMain) return;
      const rect = roomMain.getBoundingClientRect();
      const next = {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setMainRect((current) => {
        if (
          current &&
          current.top === next.top &&
          current.left === next.left &&
          current.width === next.width &&
          current.height === next.height
        ) {
          return current;
        }
        return next;
      });
    };

    const decorate = () => {
      if (!roomMain || document.visibilityState === "hidden") return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!roomMain) return;

        const cards = Array.from(roomMain.querySelectorAll<HTMLElement>(".message-card"));
        let blueScore = 0;
        let redScore = 0;

        cards.slice(-12).forEach((card, index, recentCards) => {
          const buttons = Array.from(
            card.querySelectorAll<HTMLButtonElement>('button[aria-label*=" reaction"]'),
          );

          let best: { key: ComboKey; count: number } | null = null;
          let reactionTotal = 0;

          for (const button of buttons) {
            const key = reactionKey(button);
            if (!key) continue;
            const count = reactionCount(button);
            reactionTotal += count;
            if (count >= 3 && (!best || count > best.count)) best = { key, count };
          }

          if (best) {
            const mega = best.count >= 5;
            const label = mega ? COMBO_COPY[best.key].mega : COMBO_COPY[best.key].normal;
            const signature = `${best.key}:${best.count}:${mega ? "mega" : "normal"}`;
            card.classList.add("ez-combo-message", `ez-combo-${best.key}`);
            card.classList.toggle("ez-combo-mega", mega);
            card.dataset["comboLabel"] = `${label} ×${best.count}`;

            const previous = comboState.current.get(card);
            if (previous !== signature) {
              comboState.current.set(card, signature);
              card.classList.remove("ez-combo-pop");
              requestAnimationFrame(() => card.classList.add("ez-combo-pop"));
              window.setTimeout(() => card.classList.remove("ez-combo-pop"), 760);
            }
          } else {
            card.classList.remove(
              "ez-combo-message",
              "ez-combo-salt",
              "ez-combo-clown",
              "ez-combo-skull",
              "ez-combo-gg",
              "ez-combo-mega",
              "ez-combo-pop",
            );
            delete card.dataset["comboLabel"];
            comboState.current.delete(card);
          }

          const team = messageTeam(card);
          if (!team) return;
          const recency =
            recentCards.length <= 1 ? 1 : 0.7 + (index / (recentCards.length - 1)) * 0.6;
          const weight = recency * (1 + Math.min(reactionTotal, 8) * 0.22);
          if (team === "blue") blueScore += weight;
          if (team === "red") redScore += weight;
        });

        const total = blueScore + redScore;
        if (total < 1.2) {
          setEnergy((current) =>
            current.active ? { blue: 0.5, red: 0.5, active: false } : current,
          );
        } else {
          const blue = blueScore / total;
          const red = redScore / total;
          setEnergy((current) => {
            if (
              current.active &&
              Math.abs(current.blue - blue) < 0.015 &&
              Math.abs(current.red - red) < 0.015
            ) {
              return current;
            }
            return { blue, red, active: true };
          });
        }

        const runback = roomMain.querySelector<HTMLElement>(".runback-ready");
        const ready = Boolean(runback);
        if (previousRunbackReady.current === false && ready && runback) {
          const copy = (runback.textContent ?? "RUNBACK LOCKED")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
          setRunbackText(copy || "RUNBACK LOCKED");
          if (runbackTimer.current) clearTimeout(runbackTimer.current);
          runbackTimer.current = setTimeout(() => setRunbackText(null), 1850);
        }
        previousRunbackReady.current = ready;

        const activityStrip = roomMain.querySelector<HTMLElement>(".live-activity-strip");
        if (activityStrip) {
          const text = (activityStrip.textContent ?? "").replace(/\s+/g, " ").trim().toUpperCase();
          activityStrip.classList.toggle(
            "ez-activity-idle",
            text.includes("CONNECTED · REACTIONS ARE LIVE") && !text.includes("IS TYPING"),
          );
        }
      });
    };

    const attachToMain = (main: HTMLElement) => {
      roomMain = main;
      mountObserver?.disconnect();
      mountObserver = null;
      measureMain();
      decorate();

      resizeObserver = new ResizeObserver(measureMain);
      resizeObserver.observe(main);

      roomObserver = new MutationObserver((mutations) => {
        if (shouldDecorate(mutations)) decorate();
      });
      roomObserver.observe(main, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "class"],
      });
    };

    const findMain = () => {
      const main = document.querySelector<HTMLElement>("main");
      if (!main || roomMain === main) return Boolean(main);
      attachToMain(main);
      return true;
    };

    if (!findMain()) {
      mountObserver = new MutationObserver(findMain);
      mountObserver.observe(document.body, { childList: true, subtree: true });
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        measureMain();
        decorate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (runbackTimer.current) clearTimeout(runbackTimer.current);
      mountObserver?.disconnect();
      roomObserver?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isRoom]);

  if (!isRoom) return null;

  return (
    <>
      {mainRect && energy.active && (
        <div
          className="ez-team-energy pointer-events-none fixed z-[12] overflow-hidden"
          style={{
            top: mainRect.top,
            left: mainRect.left,
            width: mainRect.width,
            height: mainRect.height,
          }}
          aria-hidden="true"
        >
          <div
            className="ez-team-energy-blue absolute inset-y-0 left-0"
            style={{
              width: `${Math.max(24, energy.blue * 68)}%`,
              opacity: 0.045 + energy.blue * 0.085,
            }}
          />
          <div
            className="ez-team-energy-red absolute inset-y-0 right-0"
            style={{
              width: `${Math.max(24, energy.red * 68)}%`,
              opacity: 0.045 + energy.red * 0.085,
            }}
          />
        </div>
      )}

      {runbackText && mainRect && (
        <div
          className="ez-runback-showtime pointer-events-none fixed z-[70] flex items-center justify-center"
          style={{
            top: mainRect.top,
            left: mainRect.left,
            width: mainRect.width,
            height: mainRect.height,
          }}
          role="status"
          aria-live="polite"
        >
          <div className="ez-runback-showtime-card">
            <div className="ez-runback-swords" aria-hidden="true">
              <Swords className="size-8" />
            </div>
            <p className="ez-runback-kicker">Vote threshold reached</p>
            <p className="ez-runback-title">RUNBACK LOCKED</p>
            <p className="ez-runback-sub">
              {runbackText.replace(/^RUNBACK LOCKED\s*·?\s*/i, "")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
