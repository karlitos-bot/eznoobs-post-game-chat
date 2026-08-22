import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type MomentTone = "neutral" | "blue" | "red" | "hot" | "nuclear";
type Moment = { id: number; text: string; tone: MomentTone };

const SALT_RANK: Record<string, number> = { CALM: 1, WARM: 2, SPICY: 3, NUCLEAR: 4 };

function playerName(row: HTMLElement) {
  const label = row.querySelector<HTMLElement>("span.truncate");
  if (!label) return null;
  const firstText = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)?.textContent;
  return firstText?.trim() || null;
}

function playerTone(row: HTMLElement): MomentTone {
  if (row.dataset["ezTeam"] === "blue" || row.querySelector('[class*="blue-team"]')) return "blue";
  if (row.dataset["ezTeam"] === "red" || row.querySelector('[class*="red-team"]')) return "red";
  return "neutral";
}

export function RoomMomentsLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(pathname);
  const [moments, setMoments] = useState<Moment[]>([]);
  const knownPlayers = useRef(new Set<string>());
  const playerBaselineReady = useRef(false);
  const previousSalt = useRef<string | null>(null);
  const previousRunback = useRef("");
  const counter = useRef(0);
  const timers = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!isRoom) {
      knownPlayers.current.clear();
      playerBaselineReady.current = false;
      previousSalt.current = null;
      previousRunback.current = "";
      setMoments([]);
      return;
    }

    const pushMoment = (text: string, tone: MomentTone = "neutral") => {
      counter.current += 1;
      const id = Date.now() + counter.current;
      setMoments((current) => [...current.slice(-2), { id, text, tone }]);
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        setMoments((current) => current.filter((moment) => moment.id !== id));
      }, 2600);
      timers.current.add(timer);
    };

    let frame = 0;
    const sync = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const main = document.querySelector<HTMLElement>("main");
        if (!main) return;
        const roomRoot = main.parentElement?.parentElement ?? main;

        const currentPlayers = new Map<string, MomentTone>();
        roomRoot.querySelectorAll<HTMLElement>(".player-row").forEach((row) => {
          const name = playerName(row);
          if (name && !currentPlayers.has(name)) currentPlayers.set(name, playerTone(row));
        });

        if (!playerBaselineReady.current) {
          knownPlayers.current = new Set(currentPlayers.keys());
          playerBaselineReady.current = currentPlayers.size > 0;
        } else {
          for (const [name, tone] of currentPlayers) {
            if (!knownPlayers.current.has(name)) pushMoment(`${name} joined comms`, tone);
          }
          knownPlayers.current = new Set(currentPlayers.keys());
        }

        const salt =
          document.querySelector<HTMLElement>("[data-salt-level]")?.dataset["saltLevel"] ??
          document.documentElement.dataset["ezSalt"] ??
          null;
        if (salt && previousSalt.current && salt !== previousSalt.current) {
          const climbed = (SALT_RANK[salt] ?? 0) > (SALT_RANK[previousSalt.current] ?? 0);
          if (climbed && salt === "WARM") pushMoment("SALT LEVEL → WARM", "hot");
          if (climbed && salt === "SPICY") pushMoment("SALT LEVEL → SPICY", "hot");
          if (climbed && salt === "NUCLEAR") pushMoment("SALT LEVEL → NUCLEAR", "nuclear");
        }
        previousSalt.current = salt;

        const runbackNode =
          main.querySelector<HTMLElement>(".runback-ready") ??
          Array.from(main.querySelectorAll<HTMLElement>("div")).find((node) =>
            /\d+\/\d+ want the runback|runback locked/i.test(node.textContent ?? ""),
          );
        const runbackText = runbackNode?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (runbackText && runbackText !== previousRunback.current) {
          if (/runback locked/i.test(runbackText)) {
            pushMoment("RUNBACK LOCKED · NEXT ROOM UNLOCKED", "hot");
          } else {
            const count = runbackText.match(/(\d+\/\d+)/)?.[1];
            if (count) pushMoment(`RUNBACK ${count}`, "neutral");
          }
        }
        previousRunback.current = runbackText;
      });
    };

    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;
    const roomRoot = main.parentElement?.parentElement ?? main;
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(roomRoot, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-salt-level", "class", "data-ez-team"],
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, [isRoom]);

  if (!isRoom || moments.length === 0) return null;

  return (
    <div className="ez-system-moments" aria-live="polite" aria-atomic="false">
      {moments.map((moment) => (
        <div key={moment.id} className={`ez-system-moment ez-system-moment-${moment.tone}`}>
          <strong>EZ //</strong> {moment.text}
        </div>
      ))}
    </div>
  );
}
