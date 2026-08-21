import { Link, useRouterState } from "@tanstack/react-router";

export function HomeLegalNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/") return null;

  return (
    <nav
      aria-label="Legal and community information"
      className="mobile-safe-bottom relative z-20 border-t border-border/70 bg-background/90"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 sm:gap-x-5 sm:gap-y-2 sm:px-5 sm:py-3 lg:px-8">
        <span className="hud-label px-2 text-primary">18+ · Trash talk responsibly</span>
        <span className="hidden h-3 w-px bg-border sm:block" aria-hidden="true" />
        <Link
          to="/community-rules"
          className="touch-target inline-flex items-center px-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
        >
          Community Rules
        </Link>
        <Link
          to="/privacy"
          className="touch-target inline-flex items-center px-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
        >
          Privacy
        </Link>
        <Link
          to="/terms"
          className="touch-target inline-flex items-center px-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary"
        >
          Terms
        </Link>
      </div>
    </nav>
  );
}
