import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, LockKeyhole, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/eznoobs/Logo";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & Safety — EZNOOBS" },
      {
        name: "description",
        content: "EZNOOBS Community Rules, Privacy Policy, Terms of Service and beta safety information.",
      },
    ],
  }),
  component: LegalHub,
});

const DOCUMENTS = [
  {
    to: "/community-rules" as const,
    eyebrow: "Community standard",
    title: "Community Rules",
    description: "What counts as normal game trash talk, what crosses the safety line, and how reports are handled.",
    icon: ShieldCheck,
  },
  {
    to: "/privacy" as const,
    eyebrow: "Data & retention",
    title: "Privacy Policy",
    description: "What temporary room data exists, what persists in your browser, and what limited moderation evidence is retained.",
    icon: LockKeyhole,
  },
  {
    to: "/terms" as const,
    eyebrow: "Service agreement",
    title: "Terms of Service",
    description: "The rules for using the current adults-only EZNOOBS beta and the limits of a temporary chat service.",
    icon: FileText,
  },
];

function LegalHub() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
      <div className="pointer-events-none absolute inset-0 radar-glow opacity-50" />

      <header className="relative z-10 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <Link to="/" aria-label="Back to EZNOOBS home">
            <Logo className="text-2xl sm:text-3xl" />
          </Link>
          <span className="hud-label text-primary">Legal & Safety</span>
        </div>
      </header>

      <main id="main-content" className="relative z-10 mx-auto w-full max-w-6xl px-5 py-10 lg:px-8 lg:py-16">
        <section className="max-w-3xl">
          <p className="hud-label text-primary">Know the rules before the salt</p>
          <h1 className="mt-3 text-5xl leading-none sm:text-6xl">LEGAL & SAFETY</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            EZNOOBS is an adults-only beta built around temporary post-game rooms. These pages explain the service rules, the privacy model and the agreement that applies when you use it.
          </p>
        </section>

        <section className="mt-9 grid gap-4 md:grid-cols-3" aria-label="Legal documents">
          {DOCUMENTS.map(({ to, eyebrow, title, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group ez-panel-strong relative flex min-h-64 flex-col overflow-hidden p-5 transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="pointer-events-none absolute inset-0 micro-grid opacity-10" />
              <div className="relative flex size-10 items-center justify-center border border-primary/25 bg-primary/[0.04] text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <p className="relative mt-5 hud-label text-primary">{eyebrow}</p>
              <h2 className="relative mt-2 text-2xl">{title}</h2>
              <p className="relative mt-3 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <span className="relative mt-5 inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-primary">
                Read document <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-6 border border-border/75 bg-surface/35 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <span className="flex size-10 items-center justify-center border border-primary/25 bg-primary/[0.04] text-primary" aria-hidden="true">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="hud-label text-primary">Current beta posture</p>
              <h2 className="mt-2 text-2xl">Temporary by design. Safety still matters.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Ordinary room content is designed to disappear with the lobby. Limited report, moderation, enforcement and infrastructure data can be retained longer when needed for safety, abuse prevention or service operation, as described in the Privacy Policy.
              </p>
              <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
                EZNOOBS is still being prepared for wider public beta. A dedicated privacy/support contact method will be published before that launch. These pages describe the current product and are not a substitute for jurisdiction-specific legal advice.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
