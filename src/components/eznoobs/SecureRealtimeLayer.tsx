import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { KeepItGoingButton } from "@/components/eznoobs/KeepItGoingButton";
import { getGuestId } from "@/lib/eznoobs";
import { getLobbySnapshot } from "@/lib/lobby-state.functions";
import { getLobbyRealtimeToken } from "@/lib/realtime-token.functions";

export const REALTIME_TOKEN_EVENT = "eznoobs:realtime-token-ready";
export const realtimeTokenStorageKey = (code: string) => `eznoobs_realtime_token:${code}`;

type LifetimeState = {
  expiresAt: string;
  canExtend: boolean;
};

export function SecureRealtimeLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const fetchToken = useServerFn(getLobbyRealtimeToken);
  const fetchSnapshot = useServerFn(getLobbySnapshot);
  const match = pathname.match(/^\/room\/([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5})$/i);
  const code = match?.[1]?.toUpperCase() ?? null;
  const [joinedReady, setJoinedReady] = useState(false);
  const [lifetime, setLifetime] = useState<LifetimeState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!code || typeof window === "undefined") {
      setJoinedReady(false);
      setLifetime(null);
      return;
    }

    const key = realtimeTokenStorageKey(code);
    const guestId = getGuestId();
    sessionStorage.removeItem(key);
    setJoinedReady(false);
    setLifetime(null);

    let cancelled = false;
    let joinedRoom = false;
    let tokenReady = false;
    let requestInFlight = false;
    let fastAttempts = 0;
    let waitTimer: ReturnType<typeof setTimeout> | null = null;
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

    const loadLifetime = async () => {
      try {
        const snapshot = await fetchSnapshot({ data: { code, guestId } });
        if (cancelled || !snapshot?.lobby?.expires_at) return;
        setLifetime({
          expiresAt: snapshot.lobby.expires_at as string,
          canExtend: Boolean(snapshot.lobby.can_extend),
        });
      } catch {
        // The room itself already has a secure snapshot fallback. Failure to load this
        // optional control must never block normal chat/reconnect behavior.
      }
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
        const token = await fetchToken({ data: { code, guestId } });
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

    const handleOnline = () => {
      if (!joinedRoom || tokenReady || cancelled) return;
      clearRetryTimers();
      fastAttempts = 0;
      void requestToken(true);
      void loadLifetime();
    };

    const waitForJoinedRoom = () => {
      if (cancelled) return;
      // The composer only exists after a participant has successfully joined.
      if (document.querySelector('textarea[aria-label="Message"]')) {
        joinedRoom = true;
        setJoinedReady(true);
        void loadLifetime();
        void requestToken(true);
        return;
      }
      waitTimer = setTimeout(waitForJoinedRoom, 200);
    };

    window.addEventListener("online", handleOnline);
    waitForJoinedRoom();

    return () => {
      cancelled = true;
      if (waitTimer) clearTimeout(waitTimer);
      clearRetryTimers();
      window.removeEventListener("online", handleOnline);
      sessionStorage.removeItem(key);
    };
  }, [code, fetchSnapshot, fetchToken]);

  const expired = lifetime ? new Date(lifetime.expiresAt).getTime() <= now : false;

  if (!code || !joinedReady || !lifetime || expired) return null;

  return (
    <div className="fixed bottom-[7.25rem] right-3 z-[70] sm:bottom-24 sm:right-4 lg:bottom-20 lg:right-5">
      <KeepItGoingButton
        code={code}
        guestId={getGuestId()}
        canExtend={lifetime.canExtend}
        onExpiryChange={(expiresAt, canExtend) => setLifetime({ expiresAt, canExtend })}
      />
    </div>
  );
}
