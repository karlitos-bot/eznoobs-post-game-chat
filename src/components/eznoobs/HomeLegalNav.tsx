import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

export function HomeLegalNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/") return null;

  return (
    <nav
      aria-label="Legal and community information"
      className="mobile-safe-bottom relative z-20 border-t border-border/70 bg-background/90"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3 lg:px-8">
        <span className="hud-label text-muted-foreground">18+ · Temporary by design</span>
        <Link
          to="/legal"
          className="touch-target inline-flex items-center gap-2 px-2 font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Legal & Safety
        </Link>
      </div>
    </nav>
  );
}
