import { useEffect, useState } from "react";

import { REALTIME_TOKEN_EVENT, realtimeTokenStorageKey } from "@/components/eznoobs/SecureRealtimeLayer";

/**
 * Reads the per-lobby realtime token published by SecureRealtimeLayer.
 * Returns null until a token exists; callers must never open an untokenized channel.
 */
export function useLobbyRealtimeToken(code: string | null) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!code || typeof window === "undefined") {
      setToken(null);
      return;
    }

    const key = realtimeTokenStorageKey(code);
    const read = () => setToken(sessionStorage.getItem(key));

    read();
    const onReady = () => read();
    window.addEventListener(REALTIME_TOKEN_EVENT, onReady);
    const poll = window.setInterval(read, 1000);

    return () => {
      window.removeEventListener(REALTIME_TOKEN_EVENT, onReady);
      clearInterval(poll);
    };
  }, [code]);

  return token;
}

export function lobbyChannelName(code: string, token: string) {
  return `room:${code}:${token}`;
}
