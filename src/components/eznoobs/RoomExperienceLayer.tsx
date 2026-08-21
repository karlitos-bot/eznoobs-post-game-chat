import { useRouterState } from "@tanstack/react-router";
import { Flame, Sparkles, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const GAME_OPENERS: Record<string, string[]> = {
  "Counter-Strike 2": [
    "GG",
    "WHO WHIFFED?",
    "CT DIFF?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  "League of Legends": [
    "GG",
    "JUNGLE DIFF?",
    "FF15?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  Valorant: [
    "GG",
    "INSTALOCK DIFF?",
    "AIM DIFF?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  "Rocket League": [
    "GG",
    "WHAT A SAVE!",
    "TEAM DIFF?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  "Overwatch 2": [
    "GG",
    "TANK DIFF?",
    "SUPPORT DIFF?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  "Marvel Rivals": [
    "GG",
    "HERO DIFF?",
    "TEAM DIFF?",
    "RUN IT BACK",
    "ONE MORE.",
  ],
  Other: ["GG", "WHO THREW?", "EZ?", "RUN IT BACK", "ONE MORE."],
};

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function teamFromAvatar(avatar: HTMLElement) {
  if (avatar.className.includes("blue-team")) return "blue";
  if (avatar.className.includes("red-team")) return "red";
  return "spectator";
}

function decorateAvatar(avatar: HTMLElement, identity: string) {
  if (!identity || avatar.dataset.ezIdentityReady === "true") return;
  const hash = hashIdentity(identity.toLowerCase());
  avatar.dataset.ezIdentityReady = "true";
  avatar.dataset.ezSigil = String(hash % 6);
  avatar.style.setProperty("--ez-sigil-hue", String(hash % 360));
  avatar.style.setProperty("--ez-sigil-rotate", `${hash % 180}deg`);
}

function decorateMessage(card: HTMLElement) {
  const avatar = card.querySelector<HTMLElement>(".message-avatar");
  if (!avatar) return;
  const nickname = card
    .querySelector<HTMLElement>("span.font-mono.text-xs.font-semibold")
    ?.textContent?.trim();
  if (nickname) decorateAvatar(avatar, nickname);
  card.dataset.ezTeam = teamFromAvatar(avatar);
}

function decoratePlayer(row: HTMLElement, recent = false) {
  const avatar = row.querySelector<HTMLElement>("span[class*='size-7']");
  if (!avatar) return;
  const nickname = Array.from(row.children)
    .find(
      (child) =>
        child instanceof HTMLElement &&
        child !== avatar &&
        child.classList.contains("truncate"),
    )
    ?.textContent?.replace(/you$/i, "")
    .trim();
  if (nickname) decorateAvatar(avatar, nickname);
  row.dataset.ezTeam = teamFromAvatar(avatar);
  if (recent && row.dataset.ezSeen !== "true") {
    row.classList.add("ez-player-new");
    window.setTimeout(() => row.classList.remove("ez-player-new"), 1900);
  }
  row.dataset.ezSeen = "true";
}

function decorateExisting(root: ParentNode, recentPlayers = false) {
  if (root instanceof HTMLElement && root.matches(".message-card")) {
    decorateMessage(root);
  }
  if (root instanceof HTMLElement && root.matches(".player-row")) {
    decoratePlayer(root, recentPlayers);
  }
  root.querySelectorAll<HTMLElement>(".message-card").forEach(decorateMessage);
  root
    .querySelectorAll<HTMLElement>(".player-row")
    .forEach((row) => decoratePlayer(row, recentPlayers));
}

function prefillComposer(text: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Message"]',
  );
  if (!textarea || textarea.disabled) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, text);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(text.length, text.length);
}

function readGame() {
  for (const node of document.querySelectorAll<HTMLElement>("header [title]")) {
    if (node.title in GAME_OPENERS) return node.title;
  }
  return "Other";
}

export function RoomExperienceLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isRoom = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/i.test(
    pathname,
  );
  const [game, setGame] = useState("Other");
  const [showQuickFire, setShowQuickFire] = useState(false);
  const [nuclearBurst, setNuclearBurst] = useState(false);
  const previousSalt = useRef<string | null>(null);
  const nuclearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRoom) {
      delete document.documentElement.dataset.ezSalt;
      previousSalt.current = null;
      setShowQuickFire(false);
      setNuclearBurst(false);
      return;
    }

    let frame = 0;

    const syncState = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextGame = readGame();
        setGame((current) => (current === nextGame ? current : nextGame));

        const composer = document.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Message"]',
        );
        const hasMessages = Boolean(document.querySelector(".message-card"));
        setShowQuickFire(Boolean(composer && !composer.disabled && !hasMessages));

        const saltNode =
          document.querySelector<HTMLElement>("[data-salt-level]");
        const salt = saltNode?.dataset.saltLevel ?? null;
        if (salt) document.documentElement.dataset.ezSalt = salt;

        if (
          salt &&
          previousSalt.current &&
          previousSalt.current !== "NUCLEAR" &&
          salt === "NUCLEAR"
        ) {
          setNuclearBurst(true);
          if (nuclearTimer.current) clearTimeout(nuclearTimer.current);
          nuclearTimer.current = setTimeout(() => setNuclearBurst(false), 1700);
        }
        previousSalt.current = salt;
      });
    };

    decorateExisting(document, false);
    syncState();

    const observer = new MutationObserver((mutations) => {
      let shouldSync = false;
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-salt-level"
        ) {
          shouldSync = true;
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          decorateExisting(node, true);
          if (
            node.matches(".message-card, header, form") ||
            node.querySelector(
              ".message-card, header, textarea[aria-label='Message']",
            )
          ) {
            shouldSync = true;
          }
        }
        for (const node of mutation.removedNodes) {
          if (
            node instanceof HTMLElement &&
            (node.matches(".message-card") || node.querySelector(".message-card"))
          ) {
            shouldSync = true;
          }
        }
      }
      if (shouldSync) syncState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-salt-level"],
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (nuclearTimer.current) clearTimeout(nuclearTimer.current);
      observer.disconnect();
      delete document.documentElement.dataset.ezSalt;
      previousSalt.current = null;
    };
  }, [isRoom]);

  if (!isRoom) return null;
  const openers = GAME_OPENERS[game] ?? GAME_OPENERS.Other;

  return (
    <>
      {showQuickFire && (
        <div
          className="ez-quickfire"
          role="group"
          aria-label={`${game} quick chat suggestions`}
        >
          <div className="ez-quickfire-heading" aria-hidden="true">
            <Sparkles className="size-3.5" />
            <span>Opening shots</span>
            <b>{game === "Other" ? "QUICK FIRE" : game}</b>
          </div>
          <div className="ez-quickfire-scroll">
            {openers.map((opener, index) => (
              <button
                key={opener}
                type="button"
                onClick={() => prefillComposer(opener)}
                className="ez-quickfire-chip"
                style={{ "--ez-chip-index": index } as CSSProperties}
              >
                {opener === "RUN IT BACK" ? (
                  <Zap className="size-3" aria-hidden="true" />
                ) : null}
                {opener}
              </button>
            ))}
          </div>
        </div>
      )}

      {nuclearBurst && (
        <div
          className="ez-nuclear-moment pointer-events-none fixed inset-0 z-[78] flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <div className="ez-nuclear-flash" />
          <div className="ez-nuclear-card">
            <div className="ez-nuclear-mark" aria-hidden="true" />
            <div>
              <span>
                <Flame className="size-3.5" /> SALT LEVEL
              </span>
              <strong>NUCLEAR</strong>
              <p>Lobby temperature critical.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
