import {
  Crosshair,
  Crown,
  Gamepad2,
  Rocket,
  Shield,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import type { Game } from "@/lib/eznoobs";

type GameVisual = {
  short: string;
  icon: LucideIcon;
  text: string;
  border: string;
  bg: string;
};

export const GAME_VISUALS: Record<Game, GameVisual> = {
  "Counter-Strike 2": {
    short: "CS2",
    icon: Crosshair,
    text: "text-orange-300",
    border: "border-orange-400/40",
    bg: "bg-orange-400/[0.07]",
  },
  "League of Legends": {
    short: "LOL",
    icon: Crown,
    text: "text-yellow-300",
    border: "border-yellow-300/40",
    bg: "bg-yellow-300/[0.06]",
  },
  Valorant: {
    short: "VAL",
    icon: Target,
    text: "text-red-300",
    border: "border-red-400/40",
    bg: "bg-red-400/[0.06]",
  },
  "Rocket League": {
    short: "RL",
    icon: Rocket,
    text: "text-blue-300",
    border: "border-blue-400/40",
    bg: "bg-blue-400/[0.06]",
  },
  "Overwatch 2": {
    short: "OW2",
    icon: Shield,
    text: "text-orange-200",
    border: "border-orange-300/35",
    bg: "bg-orange-300/[0.055]",
  },
  "Marvel Rivals": {
    short: "MR",
    icon: Sparkles,
    text: "text-purple-300",
    border: "border-purple-400/40",
    bg: "bg-purple-400/[0.06]",
  },
  Other: {
    short: "OTHER",
    icon: Gamepad2,
    text: "text-primary",
    border: "border-primary/35",
    bg: "bg-primary/[0.055]",
  },
};

export function getGameVisual(game: string): GameVisual {
  return GAME_VISUALS[game as Game] ?? GAME_VISUALS.Other;
}

export function GameMark({
  game,
  compact = false,
  className = "",
}: {
  game: string;
  compact?: boolean;
  className?: string;
}) {
  const visual = getGameVisual(game);
  const Icon = visual.icon;

  return (
    <span
      className={`inline-flex shrink-0 items-center border font-mono font-semibold uppercase ${visual.border} ${visual.bg} ${visual.text} ${compact ? "min-h-7 gap-1.5 px-2 text-[0.58rem] tracking-[0.1em]" : "min-h-10 gap-2 px-3 text-[0.68rem] tracking-[0.12em]"} ${className}`}
      title={game}
    >
      <Icon className={compact ? "size-3" : "size-4"} aria-hidden="true" />
      <span>{visual.short}</span>
    </span>
  );
}
