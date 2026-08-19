// Browser-side Supabase client using Lovable Cloud's publishable key.
// Reads realtime data directly (RLS allows SELECT). Writes go through
// server functions that call SECURITY DEFINER RPCs.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const PUBLIC_SUPABASE_URL = 'https://nzrdwfdaqksteovncmxi.supabase.co';
const PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C4hEH3SIPWIfcr6texO3sg_9ZlWhJED';

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

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
