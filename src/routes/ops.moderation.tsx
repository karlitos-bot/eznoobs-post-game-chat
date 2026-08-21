import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flag,
  LogOut,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/eznoobs/Logo";
import {
  getModerationQueue,
  moderatorLogin,
  moderatorLogout,
  reviewModerationReport,
  type ModerationReport,
} from "@/lib/moderation.functions";

const SESSION_KEY = "eznoobs:moderator-session:v1";
const SESSION_EXPIRY_KEY = "eznoobs:moderator-session-expiry:v1";
const FILTERS = ["pending", "serious", "confirmed", "dismissed", "all"] as const;
type QueueFilter = (typeof FILTERS)[number];
type ReviewStatus = Exclude<QueueFilter, "all">;

export const Route = createFileRoute("/ops/moderation")({
  head: () => ({
    meta: [
      { title: "Moderation Operations — EZNOOBS" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "description", content: "Private EZNOOBS beta moderation operations console." },
    ],
  }),
  component: ModerationOperations,
});

function ModerationOperations() {
  const login = useServerFn(moderatorLogin);
  const loadQueue = useServerFn(getModerationQueue);
  const review = useServerFn(reviewModerationReport);
  const logout = useServerFn(moderatorLogout);

  const [moderatorId, setModeratorId] = useState("");
  const [secret, setSecret] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = window.sessionStorage.getItem(SESSION_KEY);
      const expiry = window.sessionStorage.getItem(SESSION_EXPIRY_KEY);
      if (token && expiry && Date.parse(expiry) > Date.now()) {
        setSessionToken(token);
        setSessionExpiry(expiry);
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_EXPIRY_KEY);
      }
    } catch {
      // Restricted storage only means this tab cannot restore a prior moderator session.
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const rows = await loadQueue({ data: { sessionToken, status: filter, limit: 50 } });
      setReports(rows);
      setNotes((current) => {
        const next = { ...current };
        for (const row of rows) {
          if (next[row.id] === undefined) next[row.id] = row.reviewNote ?? "";
        }
        return next;
      });
    } catch {
      toast.error("Could not load the moderation queue.");
    } finally {
      setLoading(false);
    }
  }, [filter, loadQueue, sessionToken]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  async function onLogin(event: React.FormEvent) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    try {
      const result = await login({
        data: { moderatorId: moderatorId.trim(), secret },
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }

      setSessionToken(result.sessionToken);
      setSessionExpiry(result.expiresAt);
      setSecret("");
      try {
        window.sessionStorage.setItem(SESSION_KEY, result.sessionToken);
        window.sessionStorage.setItem(SESSION_EXPIRY_KEY, result.expiresAt);
      } catch {
        // Session still works in memory for this tab.
      }
      toast.success("Moderator session opened.");
    } catch {
      toast.error("Could not open moderator session.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function applyReview(reportId: string, status: ReviewStatus) {
    if (!sessionToken || reviewingId) return;
    setReviewingId(reportId);
    try {
      const result = await review({
        data: {
          sessionToken,
          reportId,
          status,
          note: notes[reportId] ?? "",
        },
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success(`Report marked ${status}.`);
      await fetchQueue();
    } catch {
      toast.error("Could not update that report.");
    } finally {
      setReviewingId(null);
    }
  }

  async function onLogout() {
    const token = sessionToken;
    setSessionToken(null);
    setSessionExpiry(null);
    setReports([]);
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    } catch {
      // Nothing else to do.
    }
    if (token) {
      try {
        await logout({ data: { sessionToken: token } });
      } catch {
        // Local logout still completes even if the backend is temporarily unavailable.
      }
    }
  }

  const sessionLabel = useMemo(() => {
    if (!sessionExpiry) return null;
    const expires = new Date(sessionExpiry);
    if (Number.isNaN(expires.getTime())) return null;
    return `Session expires ${expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [sessionExpiry]);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.18]" />
      <div className="pointer-events-none fixed inset-0 scanlines opacity-10" />

      <header className="relative z-20 border-b border-border/70 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/" aria-label="EZNOOBS home">
            <Logo className="text-2xl sm:text-3xl" />
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <span className="hud-label text-primary">Private moderation ops</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 lg:px-8 lg:py-12">
        {!sessionToken ? (
          <section className="ez-panel-strong corner-cut mx-auto max-w-lg overflow-hidden">
            <div className="border-b border-border/70 px-5 py-6 sm:px-7">
              <p className="hud-label text-primary">Operator access</p>
              <h1 className="mt-2 text-4xl">Moderation console</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Beta moderator sessions last up to eight hours. Credentials are not saved by this page.
              </p>
            </div>
            <form onSubmit={onLogin} className="space-y-4 px-5 py-6 sm:px-7">
              <div>
                <label htmlFor="moderator-id" className="hud-label">Moderator ID</label>
                <input
                  id="moderator-id"
                  value={moderatorId}
                  onChange={(event) => setModeratorId(event.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  className="mt-2 min-h-11 w-full border border-border bg-background px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div>
                <label htmlFor="moderator-secret" className="hud-label">Moderator secret</label>
                <input
                  id="moderator-secret"
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="current-password"
                  className="mt-2 min-h-11 w-full border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
                  placeholder="Moderator secret"
                />
              </div>
              <button
                disabled={loginBusy}
                className="tactical-button flex min-h-12 w-full items-center justify-center bg-primary px-5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground disabled:opacity-50"
              >
                {loginBusy ? "Checking…" : "Open moderation session"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="mb-5 flex flex-col gap-4 border border-border/70 bg-background/82 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="hud-label text-primary">Review queue</p>
                <h1 className="mt-1 text-4xl">Moderation operations</h1>
                <p className="mt-2 text-xs text-muted-foreground">
                  {sessionLabel ?? "Temporary moderator session"} · Serious marks a case for P1 #8; it does not auto-ban.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void fetchQueue()}
                  disabled={loading}
                  className="touch-target inline-flex items-center gap-2 border border-border bg-surface/45 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  className="touch-target inline-flex items-center gap-2 border border-border bg-surface/45 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <LogOut className="size-3.5" /> Logout
                </button>
              </div>
            </section>

            <nav aria-label="Moderation queue filters" className="mb-5 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  aria-pressed={filter === item}
                  className={`min-h-10 border px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] ${
                    filter === item
                      ? "border-primary bg-primary/[0.08] text-primary"
                      : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item}
                </button>
              ))}
            </nav>

            {loading && reports.length === 0 ? (
              <div className="border border-border/70 bg-background/80 p-8 text-center text-sm text-muted-foreground">
                Loading moderation queue…
              </div>
            ) : reports.length === 0 ? (
              <div className="border border-border/70 bg-background/80 p-8 text-center">
                <CheckCircle2 className="mx-auto size-6 text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">No {filter === "all" ? "retained" : filter} reports in the queue.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    note={notes[report.id] ?? ""}
                    busy={reviewingId === report.id}
                    onNote={(value) => setNotes((current) => ({ ...current, [report.id]: value }))}
                    onReview={(status) => void applyReview(report.id, status)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReportCard({
  report,
  note,
  busy,
  onNote,
  onReview,
}: {
  report: ModerationReport;
  note: string;
  busy: boolean;
  onNote: (value: string) => void;
  onReview: (status: ReviewStatus) => void;
}) {
  const created = new Date(report.createdAt);
  const expires = new Date(report.expiresAt);

  return (
    <article className="overflow-hidden border border-border/70 bg-background/86">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.reviewStatus} />
            <span className="hud-label">Room {report.lobbyCode ?? "deleted"}</span>
            {report.messageTeam && <span className="hud-label">{report.messageTeam}</span>}
          </div>
          <h2 className="mt-2 text-2xl">{report.messageNickname ?? "Unknown player"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reported {created.toLocaleString()} · evidence expires {expires.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" /> 30-day evidence window
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="hud-label text-primary">Reported message</p>
          <blockquote className="mt-2 border-l-2 border-primary bg-surface/35 px-4 py-3 text-sm leading-6 text-foreground/90">
            {report.messageBody ?? "Message snapshot unavailable."}
          </blockquote>
          <div className="mt-4">
            <p className="hud-label">Report reason</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{report.reason}</p>
          </div>
          <details className="mt-4 border border-border/60 bg-background/55 px-3 py-3">
            <summary className="cursor-pointer font-mono text-[0.62rem] uppercase tracking-[0.1em] text-muted-foreground">
              Technical identifiers
            </summary>
            <div className="mt-3 grid gap-2 break-all font-mono text-[0.65rem] text-muted-foreground">
              <p>Report: {report.id}</p>
              <p>Reporter: {report.reporterGuestId}</p>
              <p>Reported: {report.reportedGuestId}</p>
            </div>
          </details>
        </div>

        <div>
          <label htmlFor={`note-${report.id}`} className="hud-label">Internal review note</label>
          <textarea
            id={`note-${report.id}`}
            value={note}
            maxLength={500}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Optional moderator note…"
            className="mt-2 min-h-28 w-full resize-y border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-right font-mono text-[0.56rem] text-muted-foreground">{note.length}/500</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ActionButton
              label="Dismiss"
              icon={XCircle}
              disabled={busy}
              onClick={() => onReview("dismissed")}
            />
            <ActionButton
              label="Confirm"
              icon={CheckCircle2}
              disabled={busy}
              onClick={() => onReview("confirmed")}
            />
            <ActionButton
              label="Serious"
              icon={AlertTriangle}
              disabled={busy}
              onClick={() => onReview("serious")}
              danger
            />
            {report.reviewStatus !== "pending" && (
              <ActionButton
                label="Return pending"
                icon={Flag}
                disabled={busy}
                onClick={() => onReview("pending")}
              />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const classes =
    status === "serious"
      ? "border-destructive/40 bg-destructive/[0.08] text-destructive"
      : status === "confirmed"
        ? "border-primary/40 bg-primary/[0.08] text-primary"
        : status === "dismissed"
          ? "border-border bg-surface/50 text-muted-foreground"
          : "border-amber-400/40 bg-amber-400/[0.06] text-amber-300";
  return (
    <span className={`border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.1em] ${classes}`}>
      {status}
    </span>
  );
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  onClick,
  danger = false,
}: {
  label: string;
  icon: typeof Flag;
  disabled: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-11 border px-3 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] disabled:opacity-40 ${
        danger
          ? "border-destructive/40 text-destructive hover:bg-destructive/[0.06]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      <span className="inline-flex items-center gap-2"><Icon className="size-3.5" /> {label}</span>
    </button>
  );
}
