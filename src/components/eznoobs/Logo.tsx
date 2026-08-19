import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="EZNOOBS home"
      className={`inline-flex items-center leading-none ${className}`}
    >
      <img
        src="/eznoobs-wordmark.webp"
        alt="EZNOOBS"
        className="h-[1.35em] w-auto max-w-[10rem] select-none object-contain"
        draggable={false}
      />
    </Link>
  );
}
