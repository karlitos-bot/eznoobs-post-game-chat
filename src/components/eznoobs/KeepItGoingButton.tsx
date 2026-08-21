import { useServerFn } from "@tanstack/react-start";
import { Clock3 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { extendLobby } from "@/lib/lobby-lifetime.functions";

type KeepItGoingButtonProps = {
  code: string;
  guestId: string;
  canExtend: boolean;
  disabled?: boolean;
  onExpiryChange: (expiresAt: string, canExtend: boolean) => void;
};

export function KeepItGoingButton({
  code,
  guestId,
  canExtend,
  disabled = false,
  onExpiryChange,
}: KeepItGoingButtonProps) {
  const extend = useServerFn(extendLobby);
  const [busy, setBusy] = useState(false);

  async function handleExtend() {
    if (busy || disabled || !canExtend) return;
    setBusy(true);
    try {
      const result = await extend({ data: { code, guestId } });
      onExpiryChange(result.expiresAt, result.extended ? false : canExtend);

      if (result.extended) {
        toast.success("Lobby extended to the 10-minute limit.");
      } else {
        onExpiryChange(result.expiresAt, false);
        toast.message(result.reason ?? "Lobby is already at the time limit.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not extend lobby time.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExtend}
      disabled={disabled || busy || !canExtend}
      aria-label={canExtend ? "Extend lobby by three minutes" : "Lobby is at the 10-minute limit"}
      title={canExtend ? "Keep it going — extend the lobby to 10 minutes max" : "10-minute maximum reached"}
      className="flex min-h-10 items-center gap-1.5 border border-border bg-background/45 px-2.5 font-mono text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-[0.62rem] sm:tracking-[0.12em]"
    >
      <Clock3 className="size-3.5" />
      <span className="hidden md:inline">
        {busy ? "Extending…" : canExtend ? "Keep it going +3" : "10 min max"}
      </span>
      <span className="md:hidden">+3</span>
    </button>
  );
}
