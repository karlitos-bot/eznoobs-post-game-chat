import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import "./room-clarity.css";

function cleanText(node: Element | null) {
  return (node?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function closestHTMLElement(node: Element | null, selector: string) {
  return node instanceof HTMLElement ? node.closest<HTMLElement>(selector) : null;
}

export function RoomClarityLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(pathname);

  useEffect(() => {
    if (!isRoom) return;

    let frame = 0;

    const apply = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const header = document.querySelector<HTMLElement>("header");
        if (header) {
          header.classList.add("ez-room-header-clean");

          const directRows = Array.from(header.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
          );
          const primaryRow = directRows.find((row) => {
            const text = cleanText(row);
            return (text.includes("POST-MATCH LOBBY") && text.includes("SYNCING")) || text.includes("LIVE");
          });
          primaryRow?.classList.add("ez-room-primary-row");

          const secondaryRow = directRows.find((row) => {
            const text = cleanText(row);
            return text.includes("SALT") && text.includes("INVITE") && text.includes("RUN IT BACK");
          });
          secondaryRow?.classList.add("ez-room-secondary-row");
        }

        const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));

        for (const element of all) {
          const text = cleanText(element);

          if (text === "POST-MATCH LOBBY" && header?.contains(element)) {
            element.parentElement?.classList.add("ez-clarity-hide");
          }

          if (text === "FIXED LIFETIME · NO RESET" && header?.contains(element)) {
            element.parentElement?.classList.add("ez-clarity-hide");
          }

          if (/^\d+\/\d+ ONLINE$/.test(text) && header?.contains(element)) {
            const parent = element.parentElement;
            if (parent && !parent.closest("button")) parent.classList.add("ez-clarity-hide");
          }

          if (text === "RECONNECTING · SYNCING LOBBY STATE") {
            element.classList.add("ez-reconnect-redundant");
          }

          if (text === "OPEN CHANNEL") {
            element.classList.add("ez-clarity-hide");
          }

          if (/^\d+ MESSAGES VISIBLE$/.test(text) || text === "LIVE COMMS") {
            element.classList.add("ez-clarity-hide");
          }

          if (text === "PLAYERS DISAPPEAR FROM THE ROSTER AFTER INACTIVITY.") {
            element.parentElement?.classList.add("ez-roster-footer-muted");
          }

          if (text === "PICK ONE OR TYPE YOUR OWN") {
            element.classList.add("ez-clarity-hide");
          }
        }

        const emptyTitle = all.find((element) => cleanText(element) === "CHANNEL IS QUIET");
        const emptyPanel = closestHTMLElement(emptyTitle ?? null, ".ez-panel");
        emptyPanel?.classList.add("ez-empty-state-clean");

        const openingLabel = all.find((element) => cleanText(element) === "OPENING SHOTS");
        const openingPanel = openingLabel
          ? closestHTMLElement(openingLabel, "div.fixed") ?? openingLabel.parentElement?.parentElement
          : null;
        if (openingPanel instanceof HTMLElement) {
          openingPanel.classList.add("ez-opening-shots-clean");
        }

        const soundButton = document.querySelector<HTMLElement>(
          'button[aria-label^="Turn lobby sounds"]',
        );
        soundButton?.classList.add("ez-sound-control-clean");

        for (const feed of document.querySelectorAll<HTMLElement>("div.pointer-events-none.fixed")) {
          if (feed.querySelector(".animate-in")) feed.classList.add("ez-activity-feed-clean");
        }

        const reactionLive = all.find((element) => cleanText(element).includes("REACTIONS FEEL LIVE"));
        if (reactionLive) {
          let current: HTMLElement | null = reactionLive;
          for (let i = 0; i < 4 && current; i += 1) {
            const text = cleanText(current);
            if (text.includes("REACTIONS FEEL LIVE") && text.includes("SALT")) {
              current.classList.add("ez-clarity-hide");
              break;
            }
            current = current.parentElement;
          }
          reactionLive.classList.add("ez-clarity-hide");
        }

        const composer = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
        const composerForm = composer?.closest<HTMLElement>("form") ?? null;
        composerForm?.classList.add("ez-composer-clean");

        if (composerForm) {
          const composerInner = composerForm.querySelector<HTMLElement>(".max-w-5xl") ?? composerForm;
          const innerRect = composerInner.getBoundingClientRect();
          const formRect = composerForm.getBoundingClientRect();
          document.documentElement.style.setProperty("--ez-composer-left", `${innerRect.left}px`);
          document.documentElement.style.setProperty("--ez-composer-width", `${innerRect.width}px`);
          document.documentElement.style.setProperty("--ez-composer-top", `${formRect.top}px`);
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const fallback = window.setInterval(apply, 1500);
    window.addEventListener("resize", apply);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearInterval(fallback);
      observer.disconnect();
      window.removeEventListener("resize", apply);
      document.documentElement.style.removeProperty("--ez-composer-left");
      document.documentElement.style.removeProperty("--ez-composer-width");
      document.documentElement.style.removeProperty("--ez-composer-top");
    };
  }, [isRoom]);

  return null;
}
