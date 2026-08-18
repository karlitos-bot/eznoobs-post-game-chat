import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`display inline-flex items-baseline gap-[1px] leading-none ${className}`}>
      <span className="text-foreground">EZ</span>
      <span className="text-primary">NOOBS</span>
    </Link>
  );
}
