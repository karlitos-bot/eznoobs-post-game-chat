import { useRouterState } from "@tanstack/react-router";
import { ShieldCheck, Skull, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

const ADULT_ACK_KEY = "eznoobs:adult-ack:v1";
const RULES_ACK_KEY = "eznoobs:rules-ack:v1";
const ROOM_PATH_RE = /^\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}\/?$/i;
const LEGAL_PATHS = new Set(["/community-rules", "/privacy", "/terms"]);
const INTERNAL_PATHS = new Set(["/ops/moderation", "/ops/enforcement"]);
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const memoryAcknowledgments = new Set<string>();

type GateStage = "age" | "rules" | null;

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

    const adultAccepted = hasAcknowledgment(ADULT_ACK_KEY);
    const rulesAccepted = hasAcknowledgment(RULES_ACK_KEY);

    if (!adultAccepted) {
      setStage("age");
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

  function acceptAge() {
    if (!checked) return;
    rememberAcknowledgment(ADULT_ACK_KEY);
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

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-background/95 px-4 py-6 backdrop-blur-md sm:py-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="eznoobs-first-use-title"
        aria-describedby="eznoobs-first-use-description"
        onKeyDown={trapFocus}
        className="ez-panel-strong corner-cut relative w-full max-w-lg overflow-hidden border border-primary/25 bg-background p-5 shadow-2xl sm:p-7"
      >
        <div className="pointer-events-none absolute inset-0 micro-grid opacity-15" />
        <div className="relative">
          {stage === "age" ? (
            <>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center border border-primary/35 bg-primary/[0.06] text-primary">
                  <UserRoundCheck className="size-5" />
                </span>
                <div>
                  <p className="hud-label text-primary">One-time check</p>
                  <h2 id="eznoobs-first-use-title" className="mt-1 text-3xl">18+ only</h2>
                </div>
              </div>

              <p id="eznoobs-first-use-description" className="mt-5 text-sm leading-6 text-muted-foreground">
                EZNOOBS is intended for adults. Confirm that you are 18 or older to continue.
              </p>

              <label className="mt-5 flex cursor-pointer items-start gap-3 border border-border bg-surface/35 p-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                />
                <span>I confirm that I am 18 years old or older.</span>
              </label>

              <button
                type="button"
                disabled={!checked}
                onClick={acceptAge}
                className="tactical-button mt-5 flex min-h-12 w-full items-center justify-center bg-primary px-5 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-35"
              >
                Continue to EZNOOBS
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center border border-primary/35 bg-primary/[0.06] text-primary">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <p className="hud-label text-primary">Before you enter</p>
                  <h2 id="eznoobs-first-use-title" className="mt-1 text-3xl">Trash talk responsibly</h2>
                </div>
              </div>

              <p id="eznoobs-first-use-description" className="mt-5 text-sm leading-6 text-muted-foreground">
                EZNOOBS gives post-game chat more room to breathe, but the line is simple.
              </p>

              <div className="mt-4 grid gap-2">
                <div className="flex items-center gap-3 border border-primary/25 bg-primary/[0.035] px-3 py-3">
                  <span className="font-mono text-xs font-semibold text-primary">OK</span>
                  <span className="text-sm">Game trash talk, profanity and ordinary insults.</span>
                </div>
                <div className="flex items-center gap-3 border border-destructive/25 bg-destructive/[0.035] px-3 py-3">
                  <Skull className="size-4 shrink-0 text-destructive" />
                  <span className="text-sm">No hate/slurs targeting race, sex, religion or identity.</span>
                </div>
                <div className="flex items-center gap-3 border border-destructive/25 bg-destructive/[0.035] px-3 py-3">
                  <Skull className="size-4 shrink-0 text-destructive" />
                  <span className="text-sm">No threats, doxxing, or personal contact/location information.</span>
                </div>
              </div>

              <button
                type="button"
                onClick={acceptRules}
                className="tactical-button mt-5 flex min-h-12 w-full items-center justify-center bg-primary px-5 font-mono text-xs font-semibold uppercase tracking-[0.17em] text-primary-foreground"
              >
                Got it — enter lobby
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const FIRST_USE_STORAGE_KEYS = {
  adult: ADULT_ACK_KEY,
  rules: RULES_ACK_KEY,
} as const;
