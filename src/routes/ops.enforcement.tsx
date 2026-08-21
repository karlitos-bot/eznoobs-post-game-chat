import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Gavel,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/eznoobs/Logo";
import {
  applyGuestRestriction,
  getActiveRestrictions,
  getEnforcementCandidates,
  liftGuestRestriction,
  type ActiveRestriction,
  type EnforcementCandidate,
} from "@/lib/enforcement.functions";

const SESSION_KEY = "eznoobs:moderator-session:v1";
const SESSION_EXPIRY_KEY = "eznoobs:moderator-session-expiry:v1";

type RestrictionType = "chat_mute" | "cooldown" | "suspension";

const ACTIONS: Array<{
  type: RestrictionType;
  label: string;
  description: string;
  durations: Array<{ label: string; minutes: number }>;
}> = [
  {
    type: "chat_mute",
    label: "Chat mute",
    description: "Can still read, leave and report. Blocks messages, reactions and Runback.",
    durations: [
      { label: "10 min", minutes: 10 },
      { label: "30 min", minutes: 30 },
      { label: "1 hour", minutes: 60 },
      { label: "24 hours", minutes: 1440 },
    ],
  },
  {
    type: "cooldown",
    label: "Cooldown",
    description: "Blocks new room joins/creation and chat interaction for a limited period.",
    durations: [
      { label: "30 min", minutes: 30 },
      { label: "1 hour", minutes: 60 },
      { label: "6 hours", minutes: 360 },
      { label: "24 hours", minutes: 1440 },
      { label: "7 days", minutes: 10080 },
    ],
  },
  {
    type: "suspension",
    label: "Suspension",
    description: "For serious or repeat abuse. Blocks new room access and interaction.",
    durations: [
      { label: "1 hour", minutes: 60 },
      { label: "24 hours", minutes: 1440 },
      { label: "7 days", minutes: 10080 },
      { label: "30 days", minutes: 43200 },
    ],
  },
];

export const Route = createFileRoute("/ops/enforcement")({
  head: () => ({
    meta: [
      { title: "Abuse Enforcement — EZNOOBS" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "description", content: "Private EZNOOBS beta abuse-enforcement console." },
    ],
  }),
  component: EnforcementOperations,
});

function EnforcementOperations() {
  const loadCandidates = useServerFn(getEnforcementCandidates);
  const loadRestrictions = useServerFn(getActiveRestrictions);
  const applyRestriction = useServerFn(applyGuestRestriction);
  const liftRestriction = useServerFn(liftGuestRestriction);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<EnforcementCandidate[]>([]);
  const [restrictions, setRestrictions] = useState<ActiveRestriction[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"candidates" | "active">("candidates");
  const [actions, setActions] = useState<Record<string, RestrictionType>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const token = window.sessionStorage.getItem(SESSION_KEY);
      const expiry = window.sessionStorage.getItem(SESSION_EXPIRY_KEY);
      if (token && expiry && Date.parse(expiry) > Date.now()) {
        setSessionToken(token);
        setSessionExpiry(expiry);
      }
    } catch {
      // The operator can reopen a session from /ops/moderation if storage is unavailable.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [candidateRows, activeRows] = await Promise.all([
        loadCandidates({ data: { sessionToken, limit: 50 } }),
        loadRestrictions({ data: { sessionToken, limit: 100 } }),
      ]);
      setCandidates(candidateRows);
      setRestrictions(activeRows);
      setActions((current) => {
        const next = { ...current };
        for (const candidate of candidateRows) next[candidate.reportId] ??= "chat_mute";
        return next;
      });
      setDurations((current) => {
        const next = { ...current };
        for (const candidate of candidateRows) next[candidate.reportId] ??= 30;
        return next;
      });
    } catch {
      toast.error("Could not load enforcement state.");
    } finally {
      setLoading(false);
    }
  }, [loadCandidates, loadRestrictions, sessionToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function changeAction(reportId: string, type: RestrictionType) {
    const config = ACTIONS.find((item) => item.type === type)!;
    setActions((current) => ({ ...current, [reportId]: type }));
    setDurations((current) => ({ ...current, [reportId]: config.durations[0]!.minutes }));
  }

  async function enforce(candidate: EnforcementCandidate) {
    if (!sessionToken || busyId || candidate.activeRestriction) return;
    const restrictionType = actions[candidate.reportId] ?? "chat_mute";
    const durationMinutes = durations[candidate.reportId] ?? 30;
    setBusyId(candidate.reportId);
    try {
      const result = await applyRestriction({
        data: {
          sessionToken,
          reportId: candidate.reportId,
          restrictionType,
          durationMinutes,
          reason: notes[candidate.reportId] ?? "",
        },
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success(`${labelFor(restrictionType)} applied.`);
      await refresh();
    } catch {
      toast.error("Could not apply that restriction.");
    } finally {
      setBusyId(null);
    }
  }

  async function lift(restriction: ActiveRestriction) {
    if (!sessionToken || busyId) return;
    setBusyId(restriction.id);
    try {
      const result = await liftRestriction({
        data: {
          sessionToken,
          restrictionId: restriction.id,
          note: "Lifted manually from enforcement console.",
        },
      });
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success("Restriction lifted.");
      await refresh();
    } catch {
      toast.error("Could not lift that restriction.");
    } finally {
      setBusyId(null);
    }
  }

  const sessionLabel = useMemo(() => {
    if (!sessionExpiry) return "Temporary moderator session";
    const expiry = new Date(sessionExpiry);
    return Number.isNaN(expiry.getTime())
      ? "Temporary moderator session"
      : `Session expires ${expiry.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [sessionExpiry]);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.18]" />
      <div className="pointer-events-none fixed inset-0 scanlines opacity-10" />

      <header className="relative z-20 border-b border-border/70 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/" aria-label="EZNOOBS home"><Logo className="text-2xl sm:text-3xl" /></Link>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-primary" />
            <span className="hud-label text-primary">Private enforcement ops</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 lg:px-8 lg:py-12">
        {!sessionToken ? (
          <section className="ez-panel-strong corner-cut mx-auto max-w-lg p-6 sm:p-8">
            <ShieldCheck className="size-6 text-primary" />
            <h1 className="mt-4 text-4xl">Moderator session required</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Open the moderation console and sign in first. This page reuses that temporary moderator session.
            </p>
            <Link
              to="/ops/moderation"
              className="tactical-button mt-6 inline-flex min-h-11 items-center bg-primary px-4 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground"
            >
              Open moderation console
            </Link>
          </section>
        ) : (
          <>
            <section className="mb-5 flex flex-col gap-4 border border-border/70 bg-background/82 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <p className="hud-label text-primary">P1 #8</p>
                <h1 className="mt-1 text-4xl">Abuse enforcement</h1>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
                  {sessionLabel}. Enforcement is moderator-applied only. No report count automatically bans a player.
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/ops/moderation"
                  className="touch-target inline-flex items-center border border-border bg-surface/45 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  Review queue
                </Link>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="touch-target inline-flex items-center gap-2 border border-border bg-surface/45 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
            </section>

            <nav aria-label="Enforcement views" className="mb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setTab("candidates")}
                aria-pressed={tab === "candidates"}
                className={`min-h-10 border px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] ${tab === "candidates" ? "border-primary bg-primary/[0.08] text-primary" : "border-border text-muted-foreground"}`}
              >
                Candidates ({candidates.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("active")}
                aria-pressed={tab === "active"}
                className={`min-h-10 border px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] ${tab === "active" ? "border-primary bg-primary/[0.08] text-primary" : "border-border text-muted-foreground"}`}
              >
                Active ({restrictions.length})
              </button>
            </nav>

            {tab === "candidates" ? (
              candidates.length === 0 ? (
                <EmptyState text="No confirmed or serious reports are waiting for enforcement." />
              ) : (
                <div className="grid gap-4">
                  {candidates.map((candidate) => {
                    const type = actions[candidate.reportId] ?? "chat_mute";
                    const config = ACTIONS.find((item) => item.type === type)!;
                    return (
                      <article key={candidate.reportId} className="border border-border/70 bg-background/86 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`hud-label ${candidate.reviewStatus === "serious" ? "text-destructive" : "text-primary"}`}>
                                {candidate.reviewStatus}
                              </span>
                              <span className="hud-label">Room {candidate.lobbyCode ?? "deleted"}</span>
                              {candidate.messageTeam && <span className="hud-label">{candidate.messageTeam}</span>}
                            </div>
                            <h2 className="mt-2 text-2xl">{candidate.messageNickname ?? "Unknown player"}</h2>
                          </div>
                          <div className="text-right">
                            <p className="hud-label">Prior enforcement · {candidate.priorEnforcements}</p>
                            {candidate.activeRestriction && candidate.activeUntil && (
                              <p className="mt-1 text-xs text-destructive">
                                Active {labelFor(candidate.activeRestriction)} until {new Date(candidate.activeUntil).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-5 pt-4 lg:grid-cols-[1.1fr_0.9fr]">
                          <div>
                            <p className="hud-label text-primary">Confirmed evidence</p>
                            <blockquote className="mt-2 border-l-2 border-primary bg-surface/35 px-4 py-3 text-sm leading-6">
                              {candidate.messageBody ?? "Message snapshot unavailable."}
                            </blockquote>
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">{candidate.reason}</p>
                            {candidate.priorEnforcements > 0 && (
                              <div className="mt-4 flex gap-3 border border-destructive/25 bg-destructive/[0.035] p-3 text-sm">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                                <span>This browser identity has {candidate.priorEnforcements} prior moderator restriction(s) in the recent audit window.</span>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="hud-label" htmlFor={`action-${candidate.reportId}`}>Restriction</label>
                            <select
                              id={`action-${candidate.reportId}`}
                              value={type}
                              disabled={Boolean(candidate.activeRestriction)}
                              onChange={(event) => changeAction(candidate.reportId, event.target.value as RestrictionType)}
                              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                            >
                              {ACTIONS.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                            </select>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{config.description}</p>

                            <label className="hud-label mt-4 block" htmlFor={`duration-${candidate.reportId}`}>Duration</label>
                            <select
                              id={`duration-${candidate.reportId}`}
                              value={durations[candidate.reportId] ?? config.durations[0]!.minutes}
                              disabled={Boolean(candidate.activeRestriction)}
                              onChange={(event) => setDurations((current) => ({ ...current, [candidate.reportId]: Number(event.target.value) }))}
                              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                            >
                              {config.durations.map((item) => <option key={item.minutes} value={item.minutes}>{item.label}</option>)}
                            </select>

                            <label className="hud-label mt-4 block" htmlFor={`reason-${candidate.reportId}`}>Internal enforcement note</label>
                            <textarea
                              id={`reason-${candidate.reportId}`}
                              value={notes[candidate.reportId] ?? ""}
                              maxLength={500}
                              disabled={Boolean(candidate.activeRestriction)}
                              onChange={(event) => setNotes((current) => ({ ...current, [candidate.reportId]: event.target.value }))}
                              placeholder="Why this restriction is appropriate…"
                              className="mt-2 min-h-24 w-full resize-y border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary disabled:opacity-50"
                            />

                            <button
                              type="button"
                              disabled={Boolean(candidate.activeRestriction) || busyId === candidate.reportId}
                              onClick={() => void enforce(candidate)}
                              className="tactical-button mt-4 flex min-h-11 w-full items-center justify-center gap-2 bg-destructive px-4 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Gavel className="size-4" />
                              {candidate.activeRestriction ? "Restriction already active" : busyId === candidate.reportId ? "Applying…" : `Apply ${config.label}`}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            ) : restrictions.length === 0 ? (
              <EmptyState text="No active moderator restrictions." />
            ) : (
              <div className="grid gap-3">
                {restrictions.map((restriction) => (
                  <article key={restriction.id} className="flex flex-col gap-4 border border-border/70 bg-background/86 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <Ban className="size-4 text-destructive" />
                        <span className="hud-label text-destructive">{labelFor(restriction.restrictionType)}</span>
                      </div>
                      <p className="mt-2 text-sm text-foreground">Until {new Date(restriction.expiresAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {restriction.reason || "No internal reason supplied."}
                        {restriction.sourceReportId ? ` · Report ${restriction.sourceReportId}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === restriction.id}
                      onClick={() => void lift(restriction)}
                      className="touch-target inline-flex items-center justify-center gap-2 border border-primary/35 bg-primary/[0.04] px-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-primary hover:bg-primary/[0.08] disabled:opacity-50"
                    >
                      <Undo2 className="size-3.5" /> {busyId === restriction.id ? "Lifting…" : "Lift restriction"}
                    </button>
                  </article>
                ))}
              </div>
            )}

            <section className="mt-6 grid gap-px border border-border/70 bg-border/70 md:grid-cols-3">
              {ACTIONS.map((item) => (
                <div key={item.type} className="bg-background/88 p-4">
                  <p className="hud-label text-primary">{item.label}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-border/70 bg-background/80 p-8 text-center">
      <CheckCircle2 className="mx-auto size-6 text-primary" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function labelFor(type: RestrictionType) {
  if (type === "chat_mute") return "Chat mute";
  if (type === "cooldown") return "Cooldown";
  return "Suspension";
}
