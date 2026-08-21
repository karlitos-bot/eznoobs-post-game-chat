import { Link, useRouterState } from "@tanstack/react-router";

export function HomeLegalNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/") return null;

  return (
    <nav
      aria-label="Legal and community information"
      className="relative z-20 border-t border-border/70 bg-background/90"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 py-3 lg:px-8">
        <span className="hud-label text-primary">18+ · Trash talk responsibly</span>
        <span className="hidden h-3 w-px bg-border sm:block" aria-hidden="true" />
        <Link to="/community-rules" className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
          Community Rules
        </Link>
        <Link to="/privacy" className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
          Privacy
        </Link>
        <Link to="/terms" className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">
          Terms
        </Link>
      </div>
    </nav>
  );
}
