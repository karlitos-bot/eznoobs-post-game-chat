// Browser-side Supabase client using Lovable Cloud's publishable key.
// Public table access is revoked; room data is loaded through credential-checked RPCs.
// Lobby Realtime channels are additionally protected by a random participant-only token.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PUBLIC_SUPABASE_URL = 'https://nzrdwfdaqksteovncmxi.supabase.co';
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C4hEH3SIPWIfcr6texO3sg_9ZlWhJED';
const ROOM_TOPIC_RE = /^room:([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5})$/i;
const REALTIME_TOKEN_EVENT = 'eznoobs:realtime-token-ready';
const realtimeTokenStorageKey = (code: string) => `eznoobs_realtime_token:${code}`;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseClient() {
  const serverEnv = typeof process !== 'undefined' ? process.env : undefined;
  const SUPABASE_URL =
    import.meta.env['VITE_SUPABASE_URL'] ||
    serverEnv?.['SUPABASE_URL'] ||
    PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ||
    import.meta.env['VITE_SUPABASE_ANON_KEY'] ||
    serverEnv?.['SUPABASE_PUBLISHABLE_KEY'] ||
    serverEnv?.['SUPABASE_ANON_KEY'] ||
    PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_KEY),
    },
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

type SupabaseBrowserClient = ReturnType<typeof createSupabaseClient>;
type OnRegistration = { type: any; filter: any; callback: (...args: any[]) => void };

class DeferredSecureRoomChannel {
  readonly __eznoobsDeferredRoomChannel = true;
  private realChannel: any = null;
  private registrations: OnRegistration[] = [];
  private subscribeCallback: ((status: any, error?: any) => void) | undefined;
  private subscribeTimeout: number | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHandler: (() => void) | null = null;
  private stopped = false;

  constructor(
    private readonly client: SupabaseBrowserClient,
    private readonly requestedTopic: string,
    private readonly code: string,
    private readonly config?: Record<string, unknown>,
  ) {}

  on(type: any, filter: any, callback: (...args: any[]) => void) {
    if (this.realChannel) {
      this.realChannel.on(type, filter, callback);
    } else {
      this.registrations.push({ type, filter, callback });
    }
    return this;
  }

  subscribe(callback?: (status: any, error?: any) => void, timeout?: number) {
    this.subscribeCallback = callback;
    this.subscribeTimeout = timeout;
    const token = this.readToken();
    if (token) this.connect(token);
    else this.waitForToken();
    return this;
  }

  async send(payload: Record<string, unknown>) {
    if (!this.realChannel) return 'timed out' as const;
    return this.realChannel.send(payload);
  }

  async unsubscribe(timeout?: number) {
    this.stopped = true;
    this.stopWaiting();
    if (!this.realChannel) return 'ok' as const;
    return this.realChannel.unsubscribe(timeout);
  }

  private readToken() {
    if (typeof window === 'undefined') return null;
    try {
      const token = sessionStorage.getItem(realtimeTokenStorageKey(this.code));
      return token && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(token) ? token : null;
    } catch {
      return null;
    }
  }

  private waitForToken() {
    if (typeof window === 'undefined' || this.stopped || this.realChannel) return;

    const attempt = () => {
      if (this.stopped || this.realChannel) return;
      const token = this.readToken();
      if (token) {
        this.connect(token);
        return;
      }
      this.pollTimer = setTimeout(attempt, 100);
    };

    this.eventHandler = () => attempt();
    window.addEventListener(REALTIME_TOKEN_EVENT, this.eventHandler);
    this.timeoutTimer = setTimeout(() => {
      if (!this.realChannel && !this.stopped) this.subscribeCallback?.('TIMED_OUT');
    }, 4000);
    attempt();
  }

  private stopWaiting() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.pollTimer = null;
    this.timeoutTimer = null;
    if (typeof window !== 'undefined' && this.eventHandler) {
      window.removeEventListener(REALTIME_TOKEN_EVENT, this.eventHandler);
    }
    this.eventHandler = null;
  }

  private connect(token: string) {
    if (this.stopped || this.realChannel) return;
    this.stopWaiting();

    const secureTopic = `${this.requestedTopic}:${token}`;
    this.realChannel = this.client.channel(secureTopic, this.config as any);
    for (const registration of this.registrations) {
      this.realChannel.on(registration.type, registration.filter, registration.callback);
    }
    this.registrations = [];
    this.realChannel.subscribe(this.subscribeCallback, this.subscribeTimeout);
  }
}

let _supabase: SupabaseBrowserClient | undefined;

export const supabase = new Proxy({} as SupabaseBrowserClient, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();

    if (prop === 'channel') {
      return (topic: string, config?: Record<string, unknown>) => {
        const match = topic.match(ROOM_TOPIC_RE);
        if (!match?.[1]) return _supabase!.channel(topic, config as any);
        return new DeferredSecureRoomChannel(
          _supabase!,
          topic,
          match[1].toUpperCase(),
          config,
        ) as any;
      };
    }

    if (prop === 'removeChannel') {
      return (channel: any) => {
        if (channel?.__eznoobsDeferredRoomChannel) return channel.unsubscribe();
        return _supabase!.removeChannel(channel);
      };
    }

    return Reflect.get(_supabase, prop, receiver);
  },
});
