import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";

import { getGuestId } from "@/lib/eznoobs";
import { getLobbyRealtimeToken } from "@/lib/realtime-token.functions";

export const REALTIME_TOKEN_EVENT = "eznoobs:realtime-token-ready";
export const realtimeTokenStorageKey = (code: string) => `eznoobs_realtime_token:${code}`;

export function SecureRealtimeLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchToken = useServerFn(getLobbyRealtimeToken);
  const match = pathname.match(/^\/room\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5})$/i);
  const code = match?.[1]?.toUpperCase() ?? null;

  useEffect(() => {
    if (!code || typeof window === "undefined") return;

    const key = realtimeTokenStorageKey(code);
    sessionStorage.removeItem(key);

    let cancelled = false;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const publish = (token: string) => {
      sessionStorage.setItem(key, token);
      window.dispatchEvent(new CustomEvent(REALTIME_TOKEN_EVENT, { detail: { code } }));
    };

    const requestToken = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const token = await fetchToken({ data: { code, guestId: getGuestId() } });
        if (cancelled) return;
        if (token) {
          publish(token);
          return;
        }
      } catch {
        // Realtime is an enhancement. The room's secure snapshot fallback keeps working
        // while this retries, so never expose a database error to the player.
      }

      if (!cancelled && attempts < 8) {
        retryTimer = setTimeout(() => void requestToken(), 700);
      }
    };

    const waitForJoinedRoom = () => {
      if (cancelled) return;
      // The composer only exists after a participant has successfully joined.
      if (document.querySelector('textarea[aria-label="Message"]')) {
        void requestToken();
        return;
      }
      waitTimer = setTimeout(waitForJoinedRoom, 200);
    };

    waitForJoinedRoom();

    return () => {
      cancelled = true;
      if (waitTimer) clearTimeout(waitTimer);
      if (retryTimer) clearTimeout(retryTimer);
      sessionStorage.removeItem(key);
    };
  }, [code, fetchToken]);

  return null;
}
