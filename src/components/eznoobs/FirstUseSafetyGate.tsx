import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, Skull, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

const LEGAL_ACK_KEY = "eznoobs:legal-ack:v3";
const RULES_ACK_KEY = "eznoobs:rules-ack:v1";
const ROOM_PATH_RE = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}\/?$/i;
const LEGAL_PATHS = new Set(["/legal", "/community-rules", "/privacy", "/terms"]);
const INTERNAL_PATHS = new Set(["/ops/moderation", "/ops/enforcement"]);
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const memoryAcknowledgments = new Set<string>();

type GateStage = "legal" | "rules" | null;

function hasAcknowledgment(key: string) {
  if (memoryAcknowledgments.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "yes";
  } catch {
    return false;
  }
}

function rememberAcknowledgment(key: string) {
  memoryAcknowledgments.add(key);
  try {
    window.localStorage.setItem(key, "yes");
  } catch {
    // Some privacy modes may block persistent browser storage. Keep the acknowledgment
    // in memory for this tab/session so the user is never trapped behind the modal.
  }
}

export function FirstUseSafetyGate() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [stage, setStage] = useState<GateStage>(null);
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (LEGAL_PATHS.has(pathname) || INTERNAL_PATHS.has(pathname)) {
      setStage(null);
      setReady(true);
      return;
    }

    const legalAccepted = hasAcknowledgment(LEGAL_ACK_KEY);
    const rulesAccepted = hasAcknowledgment(RULES_ACK_KEY);

    if (!legalAccepted) {
      setStage("legal");
    } else if (ROOM_PATH_RE.test(pathname) && !rulesAccepted) {
      setStage("rules");
    } else {
      setStage(null);
    }
    setReady(true);
  }, [pathname]);

  useEffect(() => {
    if (!stage || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const focusFirstControl = () => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    };
    const frame = requestAnimationFrame(focusFirstControl);

    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [stage]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
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
  }

  function acceptLegal() {
    if (!checked) return;
    rememberAcknowledgment(LEGAL_ACK_KEY);
    setChecked(false);

    if (ROOM_PATH_RE.test(pathname) && !hasAcknowledgment(RULES_ACK_KEY)) {
      setStage("rules");
    } else {
      setStage(null);
    }
  }

  function acceptRules() {
    rememberAcknowledgment(RULES_ACK_KEY);
    setStage(null);
  }

  if (!ready || !stage) return null;

  if (stage === "rules") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/96 px-4 py-6 backdrop-blur-sm">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="eznoobs-rules-title"
          aria-describedby="eznoobs-rules-description"
          onKeyDown={trapFocus}
          className="ez-panel-strong corner-cut my-auto w-full max-w-xl overflow-hidden"
        >
          <div className="border-b border-border/70 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-2 text-primary">
              <Skull className="size-4" aria-hidden="true" />
              <p className="hud-label text-primary">Before your first lobby</p>
            </div>
            <h2 id="eznoobs-rules-title" className="mt-2 text-3xl sm:text-4xl">
              Trash talk stays in-game.
            </h2>
            <p id="eznoobs-rules-description" className="mt-3 text-sm leading-6 text-muted-foreground">
              Profanity and ordinary game banter are allowed. Protected-class hate, real-world threats, doxxing and targeted harassment are not.
            </p>
          </div>

          <div className="grid gap-3 px-5 py-5 sm:px-6">
            <div className="border border-border/70 bg-background/45 px-4 py-3 text-sm leading-6 text-foreground/90">
              Keep the salt about the match, the play and the rivalry — not someone&apos;s protected identity or private life.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/community-rules"
                className="touch-target inline-flex items-center font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
              >
                Read Community Rules
              </Link>
              <button
                type="button"
                onClick={acceptRules}
                className="tactical-button touch-target bg-primary px-5 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground"
              >
                Enter lobby
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/96 px-4 py-6 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eznoobs-legal-title"
        aria-describedby="eznoobs-legal-description"
        onKeyDown={trapFocus}
        className="ez-panel-strong corner-cut my-auto w-full max-w-xl overflow-hidden"
      >
        <div className="border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-primary">
            <UserRoundCheck className="size-4" aria-hidden="true" />
            <p className="hud-label text-primary">First time here</p>
          </div>
          <h2 id="eznoobs-legal-title" className="mt-2 text-3xl sm:text-4xl">
            Adults only. Read the rules.
          </h2>
          <p id="eznoobs-legal-description" className="mt-3 text-sm leading-6 text-muted-foreground">
            EZNOOBS is an 18+ temporary post-game chat beta. Before continuing, confirm your age and agreement to the current Terms of Service.
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <label className="flex cursor-pointer items-start gap-3 border border-border/70 bg-background/45 px-4 py-4 text-sm leading-6 text-foreground/90">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
            />
            <span>
              I confirm I am 18 or older and agree to the Terms of Service. I understand that the Privacy Policy and Community Rules also apply.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[0.6rem] uppercase tracking-[0.11em] text-muted-foreground">
            <Link to="/terms" className="touch-target inline-flex items-center px-2 hover:text-primary">
              Terms
            </Link>
            <Link to="/privacy" className="touch-target inline-flex items-center px-2 hover:text-primary">
              Privacy
            </Link>
            <Link to="/community-rules" className="touch-target inline-flex items-center px-2 hover:text-primary">
              Community Rules
            </Link>
          </div>

          <button
            type="button"
            disabled={!checked}
            onClick={acceptLegal}
            className="tactical-button touch-target mt-5 inline-flex w-full items-center justify-center gap-2 bg-primary px-5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldCheck className="size-4" aria-hidden="true" /> Continue
          </button>
        </div>
      </div>
    </div>
  );
}
