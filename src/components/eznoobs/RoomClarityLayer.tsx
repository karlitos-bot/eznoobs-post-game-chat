import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import "./room-clarity.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function cleanText(node: Element | null) {
  return (node?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function closestHTMLElement(node: Element | null, selector: string) {
  return node instanceof HTMLElement ? node.closest<HTMLElement>(selector) : null;
}

function getPlayerDrawer() {
  const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="Close player list"]');
  const drawer = closeButton?.closest<HTMLElement>(".mobile-safe-top") ?? null;
  return { closeButton, drawer };
}

export function RoomClarityLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(pathname);

  useEffect(() => {
    if (!isRoom) return;

    let frame = 0;
    let drawerPreviousFocus: HTMLElement | null = null;

    const apply = () => {
      if (document.visibilityState === "hidden") return;
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
            element.textContent = "7 min base · active rooms can reach 10";
          }

          if (text === "NO ACCOUNT. PICK A NAME AND A SIDE. THE CLOCK NEVER RESETS.") {
            element.textContent = "No account. Pick a name and a side. Active rooms can last up to 10 minutes.";
          }

          if (/^\d+\/\d+ ONLINE$/.test(text) && header?.contains(element)) {
            const parent = element.parentElement;
            if (parent && !parent.closest("button")) parent.classList.add("ez-clarity-hide");
          }

          if (text === "RECONNECTING · SYNCING LOBBY STATE") {
            element.classList.add("ez-reconnect-redundant");
            element.setAttribute("role", "status");
            element.setAttribute("aria-live", "polite");
            element.setAttribute("aria-atomic", "true");
          }

          if (text.startsWith("CONNECTION LOST ·")) {
            element.setAttribute("role", "alert");
            element.setAttribute("aria-live", "assertive");
            element.setAttribute("aria-atomic", "true");
          }

          if (text.includes("LOBBY CLOSED · TEMPORARY CHAT CLEARED")) {
            element.setAttribute("role", "status");
            element.setAttribute("aria-live", "polite");
            element.setAttribute("aria-atomic", "true");
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

        const activityStrip = document.querySelector<HTMLElement>(".live-activity-strip");
        if (activityStrip) {
          // Typing changes every few hundred milliseconds. Keep it visual instead of making
          // screen readers repeatedly announce names entering/leaving the typing state.
          activityStrip.setAttribute("aria-live", "off");
          activityStrip.removeAttribute("aria-atomic");
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

        const drawerOpener = document.querySelector<HTMLButtonElement>(
          'button[aria-label^="Open player list"]',
        );
        drawerOpener?.setAttribute("aria-haspopup", "dialog");

        const { closeButton, drawer } = getPlayerDrawer();
        drawerOpener?.setAttribute("aria-expanded", drawer ? "true" : "false");

        if (drawer && closeButton) {
          const drawerTitle = drawer.querySelector<HTMLElement>("h2");
          if (drawerTitle) {
            drawerTitle.id = "ez-player-drawer-title";
            drawer.setAttribute("aria-labelledby", drawerTitle.id);
            drawer.removeAttribute("aria-label");
          } else {
            drawer.setAttribute("aria-label", "Players online");
          }
          drawer.setAttribute("role", "dialog");
          drawer.setAttribute("aria-modal", "true");
          if (drawer.dataset.ezA11yReady !== "true") {
            drawer.dataset.ezA11yReady = "true";
            drawerPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            closeButton.focus({ preventScroll: true });
          }
        } else if (drawerPreviousFocus) {
          drawerPreviousFocus.focus({ preventScroll: true });
          drawerPreviousFocus = null;
        }
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const { closeButton, drawer } = getPlayerDrawer();
      if (!drawer || !closeButton) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closeButton.click();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null,
      );
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

    const handleVisibility = () => {
      if (document.visibilityState === "visible") apply();
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const fallback = window.setInterval(apply, 3000);
    window.addEventListener("resize", apply);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearInterval(fallback);
      observer.disconnect();
      window.removeEventListener("resize", apply);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibility);
      drawerPreviousFocus?.focus({ preventScroll: true });
      document.documentElement.style.removeProperty("--ez-composer-left");
      document.documentElement.style.removeProperty("--ez-composer-width");
      document.documentElement.style.removeProperty("--ez-composer-top");
    };
  }, [isRoom]);

  return null;
}
