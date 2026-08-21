import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/eznoobs/Logo";

type LegalSection = {
  title: string;
  body?: string[];
  bullets?: string[];
};

export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.2]" />
      <div className="pointer-events-none fixed inset-0 radar-glow opacity-70" />
      <div className="pointer-events-none fixed inset-0 scanlines opacity-15" />

      <header className="relative z-20 border-b border-border/70 bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <Link to="/" aria-label="Back to EZNOOBS" className="inline-flex items-center gap-3">
            <Logo className="text-2xl sm:text-3xl" />
          </Link>
          <Link
            to="/"
            className="touch-target inline-flex items-center gap-2 border border-border bg-surface/45 px-3 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ArrowLeft className="size-3.5" /> Back
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 py-10 sm:py-14 lg:px-8 lg:py-16">
        <section className="ez-panel-strong corner-cut overflow-hidden">
          <div className="border-b border-border/70 px-5 py-7 sm:px-8 sm:py-9">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="size-4" />
              <p className="hud-label text-primary">{eyebrow}</p>
            </div>
            <h1 className="mt-3 text-5xl sm:text-6xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{intro}</p>
            <p className="mt-5 font-mono text-[0.58rem] uppercase tracking-[0.13em] text-muted-foreground">
              Last updated · {updated}
            </p>
          </div>

          <div className="divide-y divide-border/70">
            {sections.map((section, index) => (
              <section key={section.title} className="px-5 py-6 sm:px-8 sm:py-8">
                <div className="grid gap-4 md:grid-cols-[4rem_1fr] md:gap-7">
                  <span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 className="text-2xl sm:text-3xl">{section.title}</h2>
                    {section.body?.map((paragraph) => (
                      <p key={paragraph} className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-[0.95rem]">
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && (
                      <ul className="mt-4 grid max-w-3xl gap-2.5">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex gap-3 border border-border/70 bg-background/45 px-3 py-3 text-sm leading-6 text-foreground/90">
                            <span className="mt-2 size-1.5 shrink-0 bg-primary" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </section>

        <nav aria-label="Legal pages" className="mt-4 grid gap-px border border-border/70 bg-border/70 sm:grid-cols-3">
          <Link to="/community-rules" className="bg-background/90 px-4 py-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
            Community Rules
          </Link>
          <Link to="/privacy" className="bg-background/90 px-4 py-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
            Privacy
          </Link>
          <Link to="/terms" className="bg-background/90 px-4 py-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
            Terms
          </Link>
        </nav>
      </main>

      <footer className="relative z-10 border-t border-border/70 bg-background/75">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 lg:px-8">
          <p className="hud-label">Trash talk responsibly.</p>
          <p className="hud-label text-primary">18+ · Temporary by design</p>
        </div>
      </footer>
    </div>
  );
}
