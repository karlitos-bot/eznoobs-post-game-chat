import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import "./room-clarity.css";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ROOM_LIFETIME_LABEL = "7 min base · active rooms can reach 10";
const JOIN_LIFETIME_COPY =
  "No account. Pick a name and a side. Active rooms can last up to 10 minutes.";

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
    let composerResizeObserver: ResizeObserver | null = null;
    let observedComposerForm: HTMLElement | null = null;

    const measureComposer = () => {
      if (!observedComposerForm) return;
      const composerInner =
        observedComposerForm.querySelector<HTMLElement>(".max-w-5xl") ?? observedComposerForm;
      const innerRect = composerInner.getBoundingClientRect();
      const formRect = observedComposerForm.getBoundingClientRect();
      document.documentElement.style.setProperty("--ez-composer-left", `${innerRect.left}px`);
      document.documentElement.style.setProperty("--ez-composer-width", `${innerRect.width}px`);
      document.documentElement.style.setProperty("--ez-composer-top", `${formRect.top}px`);
    };

    const attachComposerGeometry = (composerForm: HTMLElement | null) => {
      if (!composerForm || observedComposerForm === composerForm) return;
      composerResizeObserver?.disconnect();
      observedComposerForm = composerForm;
      measureComposer();
      composerResizeObserver = new ResizeObserver(measureComposer);
      composerResizeObserver.observe(composerForm);
      const composerInner = composerForm.querySelector<HTMLElement>(".max-w-5xl");
      if (composerInner && composerInner !== composerForm) composerResizeObserver.observe(composerInner);
    };

    const apply = () => {
      if (document.visibilityState === "hidden") return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const header = document.querySelector<HTMLElement>("header");
        const main = document.querySelector<HTMLElement>("main");

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

          // The persistent personality dock now owns Salt. Hide the small legacy header meter
          // instead of showing two competing Salt readouts.
          const legacySaltMeter = secondaryRow?.querySelector<HTMLElement>("[data-salt-level]");
          legacySaltMeter?.parentElement?.classList.add("ez-clarity-hide");

          for (const element of header.querySelectorAll<HTMLElement>("p, span, div")) {
            const text = cleanText(element);

            if (text === "POST-MATCH LOBBY") {
              element.parentElement?.classList.add("ez-clarity-hide");
            }

            // Legacy room JSX is consolidated in a later architecture pass. Normalize the
            // two lifetime labels at render time without scanning the whole document.
            if (text.includes("LIFETIME") && text.includes("RESET")) {
              element.textContent = ROOM_LIFETIME_LABEL;
            }

            if (/^\d+\/\d+ ONLINE$/.test(text)) {
              const parent = element.parentElement;
              if (parent && !parent.closest("button")) parent.classList.add("ez-clarity-hide");
            }
          }
        }

        for (const paragraph of document.querySelectorAll<HTMLElement>("p.text-muted-foreground")) {
          const text = cleanText(paragraph);
          if (
            text.startsWith("NO ACCOUNT. PICK A NAME AND A SIDE.") &&
            text.includes("CLOCK") &&
            text.includes("RESET")
          ) {
            paragraph.textContent = JOIN_LIFETIME_COPY;
          }
        }

        if (main) {
          const mainCandidates = Array.from(main.querySelectorAll<HTMLElement>("p, span, div"));
          for (const element of mainCandidates) {
            const text = cleanText(element);

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

            if (text === "OPEN CHANNEL") element.classList.add("ez-clarity-hide");
            if (/^\d+ MESSAGES VISIBLE$/.test(text) || text === "LIVE COMMS") {
              element.classList.add("ez-clarity-hide");
            }
          }

          const emptyTitle = mainCandidates.find((element) => cleanText(element) === "CHANNEL IS QUIET");
          const emptyPanel = closestHTMLElement(emptyTitle ?? null, ".ez-panel");
          emptyPanel?.classList.add("ez-empty-state-clean");
        }

        for (const rosterCopy of document.querySelectorAll<HTMLElement>("aside p")) {
          if (cleanText(rosterCopy) === "PLAYERS DISAPPEAR FROM THE ROSTER AFTER INACTIVITY.") {
            rosterCopy.parentElement?.classList.add("ez-roster-footer-muted");
          }
        }

        const openingLabels = Array.from(
          document.querySelectorAll<HTMLElement>("div.fixed span, div.fixed p"),
        );
        const openingLabel = openingLabels.find((element) => cleanText(element) === "OPENING SHOTS");
        const openingPanel = openingLabel
          ? closestHTMLElement(openingLabel, "div.fixed") ?? openingLabel.parentElement?.parentElement
          : null;
        if (openingPanel instanceof HTMLElement) openingPanel.classList.add("ez-opening-shots-clean");

        const pickOwn = openingLabels.find((element) => cleanText(element) === "PICK ONE OR TYPE YOUR OWN");
        pickOwn?.classList.add("ez-clarity-hide");

        const saltStatus = document.querySelector<HTMLElement>(
          '[role="status"][aria-label^="Salt-O-Meter"]',
        );
        const personalityDock = saltStatus?.closest<HTMLElement>("div.fixed") ?? null;
        personalityDock?.classList.add("ez-personality-dock-clean");

        // Keep the legacy floating sound control hidden, but do not hide the sound toggle that
        // now lives inside the Salt-O-Meter / Quick Shots dock.
        for (const soundButton of document.querySelectorAll<HTMLElement>(
          'button[aria-label^="Turn lobby sounds"]',
        )) {
          if (!soundButton.closest(".ez-personality-dock-clean")) {
            soundButton.classList.add("ez-sound-control-clean");
          }
        }

        for (const feed of document.querySelectorAll<HTMLElement>("div.pointer-events-none.fixed")) {
          if (feed.querySelector(".animate-in")) feed.classList.add("ez-activity-feed-clean");
        }

        const reactionLive = Array.from(document.querySelectorAll<HTMLElement>("p, span")).find((element) =>
          cleanText(element).includes("REACTIONS FEEL LIVE"),
        );
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

          // Salt is now represented by the persistent meter above the composer.
          for (const child of Array.from(activityStrip.children)) {
            if (cleanText(child).includes("SALT")) child.classList.add("ez-clarity-hide");
          }
        }

        const composer = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
        const composerForm = composer?.closest<HTMLElement>("form") ?? null;
        composerForm?.classList.add("ez-composer-clean");
        attachComposerGeometry(composerForm);
        // The personality dock can mount after the composer geometry observer is attached.
        // Refresh the CSS variables whenever the DOM layer changes so it snaps above composer.
        measureComposer();

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
    // Structural changes cover route transitions, drawer/opening-shot mounts, reconnect banners,
    // messages, and expiry. Ignore noisy text-only updates such as the timer and typing strip.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      composerResizeObserver?.disconnect();
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
