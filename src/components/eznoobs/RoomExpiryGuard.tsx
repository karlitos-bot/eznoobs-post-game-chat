import { Link, useRouterState } from "@tanstack/react-router";
import { Timer } from "lucide-react";
import { useEffect, useState } from "react";

type MainRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function hasExpiredSignal(main: HTMLElement) {
  return Array.from(main.querySelectorAll<HTMLElement>("div, p, h1, h2")).some((node) => {
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    return text === "TIME'S UP" || text.includes("LOBBY CLOSED · TEMPORARY CHAT CLEARED");
  });
}

export function RoomExpiryGuard() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(pathname);
  const [expired, setExpired] = useState(false);
  const [mainRect, setMainRect] = useState<MainRect | null>(null);

  useEffect(() => {
    if (!isRoom) {
      setExpired(false);
      setMainRect(null);
      return;
    }

    setExpired(false);
    setMainRect(null);

    let roomMain: HTMLElement | null = null;
    let mountObserver: MutationObserver | null = null;
    let expiryObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const measureMain = () => {
      if (!roomMain) return;
      const rect = roomMain.getBoundingClientRect();
      const nextRect: MainRect = {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setMainRect((current) =>
        current &&
        current.top === nextRect.top &&
        current.left === nextRect.left &&
        current.width === nextRect.width &&
        current.height === nextRect.height
          ? current
          : nextRect,
      );
    };

    const inspectExpiry = () => {
      if (!roomMain) return;
      if (hasExpiredSignal(roomMain)) {
        setExpired(true);
        expiryObserver?.disconnect();
        expiryObserver = null;
      }
    };

    const attachToMain = (main: HTMLElement) => {
      roomMain = main;
      mountObserver?.disconnect();
      mountObserver = null;
      measureMain();
      inspectExpiry();

      resizeObserver = new ResizeObserver(measureMain);
      resizeObserver.observe(main);

      if (!hasExpiredSignal(main)) {
        expiryObserver = new MutationObserver(inspectExpiry);
        expiryObserver.observe(main, { childList: true, subtree: true, characterData: true });
      }
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

    return () => {
      mountObserver?.disconnect();
      expiryObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [isRoom, pathname]);

  if (!isRoom || !expired || !mainRect) return null;

  return (
    <div
      className="fixed z-[85] flex items-center justify-center bg-background/95 px-5 backdrop-blur-sm"
      style={{
        top: mainRect.top,
        left: mainRect.left,
        width: mainRect.width,
        height: mainRect.height,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="ez-panel corner-cut w-[min(92vw,34rem)] border-destructive/35 p-7 text-center sm:p-10">
        <Timer className="mx-auto size-7 text-destructive" />
        <p className="hud-label mt-4 text-destructive">00:00 · Lobby closed</p>
        <h2 className="mt-2 text-4xl">Time&apos;s up</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          This temporary lobby has ended and the chat has been cleared.
        </p>
        <Link
          to="/"
          className="tactical-button mt-6 inline-flex min-h-11 items-center bg-primary px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground"
        >
          Back to EZNOOBS
        </Link>
      </div>
    </div>
  );
}
