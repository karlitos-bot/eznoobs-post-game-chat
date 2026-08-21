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
    let joinedRoom = false;
    let tokenReady = false;
    let requestInFlight = false;
    let fastAttempts = 0;
    let joinObserver: MutationObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let slowRetryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetryTimers = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (slowRetryTimer) {
        clearTimeout(slowRetryTimer);
        slowRetryTimer = null;
      }
    };

    const publish = (token: string) => {
      tokenReady = true;
      clearRetryTimers();
      sessionStorage.setItem(key, token);
      window.dispatchEvent(new CustomEvent(REALTIME_TOKEN_EVENT, { detail: { code } }));
    };

    const scheduleSlowRetry = (requestToken: (fast?: boolean) => Promise<void>) => {
      if (cancelled || tokenReady || slowRetryTimer) return;
      // After the short reconnect burst, retry quietly in the background so a
      // longer outage can recover without a remount. One attempt every 30s stays
      // below the server-side realtime-token abuse limit.
      slowRetryTimer = setTimeout(() => {
        slowRetryTimer = null;
        void requestToken(false);
      }, 30_000);
    };

    const requestToken = async (fast = true): Promise<void> => {
      if (cancelled || tokenReady || requestInFlight || !joinedRoom) return;
      requestInFlight = true;
      if (fast) fastAttempts += 1;

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
      } finally {
        requestInFlight = false;
      }

      if (cancelled || tokenReady) return;

      if (fast && fastAttempts < 8) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void requestToken(true);
        }, 700);
        return;
      }

      scheduleSlowRetry(requestToken);
    };

    const markJoined = () => {
      if (joinedRoom || cancelled) return;
      joinedRoom = true;
      joinObserver?.disconnect();
      joinObserver = null;
      void requestToken(true);
    };

    const detectJoinedRoom = () => {
      if (document.querySelector('textarea[aria-label="Message"]')) {
        markJoined();
        return true;
      }
      return false;
    };

    const handleOnline = () => {
      if (!joinedRoom || tokenReady || cancelled) return;
      clearRetryTimers();
      fastAttempts = 0;
      void requestToken(true);
    };

    window.addEventListener("online", handleOnline);

    // The composer only exists after a participant has successfully joined. Check once,
    // then observe structural changes instead of polling the whole DOM every 200ms.
    if (!detectJoinedRoom()) {
      joinObserver = new MutationObserver(() => {
        detectJoinedRoom();
      });
      joinObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      joinObserver?.disconnect();
      clearRetryTimers();
      window.removeEventListener("online", handleOnline);
      sessionStorage.removeItem(key);
    };
  }, [code, fetchToken]);

  return null;
}
