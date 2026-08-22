import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";

import { Logo } from "@/components/eznoobs/Logo";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal & Safety — EZNOOBS" },
      {
        name: "description",
        content: "EZNOOBS Community Rules, Privacy Policy, Terms of Service and beta legal/safety information.",
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
    description: "What temporary room data exists, why it is processed, what persists in your browser, and what limited safety evidence is retained.",
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

        <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Legal readiness">
          <article className="border border-amber-500/30 bg-amber-500/[0.035] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center border border-amber-500/30 bg-amber-500/[0.05] text-amber-300" aria-hidden="true">
                <TriangleAlert className="size-5" />
              </span>
              <div>
                <p className="hud-label text-amber-300">Notice & action · pre-launch gate</p>
                <h2 className="mt-2 text-2xl">Report allegedly illegal content</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  A normal in-room report is for Community Rules issues. A formal allegation that specific content is illegal needs a separate electronic notice-and-action channel. That intake is being prepared and must be activated before wider public beta.
                </p>
                <p className="mt-4 text-xs leading-5 text-foreground/85">A formal notice should provide:</p>
                <ul className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
                  <li>• a clear explanation of why the specific content is alleged to be illegal;</li>
                  <li>• the exact URL/location and any extra details needed to identify the content;</li>
                  <li>• notifier name and email where required by applicable law; and</li>
                  <li>• a good-faith confirmation that the information is accurate and complete.</li>
                </ul>
                <p className="mt-4 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-amber-300">
                  Public beta remains blocked until the intake + response channel is live.
                </p>
              </div>
            </div>
          </article>

          <article className="border border-border/75 bg-surface/35 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center border border-primary/25 bg-primary/[0.04] text-primary" aria-hidden="true">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <p className="hud-label text-primary">Independent service</p>
                <h2 className="mt-2 text-2xl">Game names do not mean endorsement.</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  EZNOOBS is an independent community service. References to games or publishers are used only to help players identify the game they just played. Unless expressly stated otherwise, EZNOOBS is not sponsored by, affiliated with or endorsed by those publishers or platforms.
                </p>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Third-party names, logos, characters and artwork remain the property of their respective owners. The public beta should avoid third-party brand assets unless their use is permitted by law, licence or published brand guidelines.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-4 border border-border/75 bg-surface/35 p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
            <span className="flex size-10 items-center justify-center border border-primary/25 bg-primary/[0.04] text-primary" aria-hidden="true">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="hud-label text-primary">Current beta posture</p>
              <h2 className="mt-2 text-2xl">Temporary by design. Safety still matters.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Ordinary room content is designed to disappear with the lobby. Limited report, moderation, enforcement, legal-notice and infrastructure data can be retained longer when needed for safety, abuse prevention, legal compliance or service operation, as described in the Privacy Policy.
              </p>
              <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
                EZNOOBS is still being prepared for wider public beta. The production operator identity, legally required contact information and dedicated privacy/support/legal channels must be published before that launch. These pages are product-level compliance drafts and are not a substitute for qualified jurisdiction-specific legal advice.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
