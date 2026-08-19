// Server-side Supabase client using Lovable Cloud's publishable key.
// Writes go through SECURITY DEFINER functions (RPCs) that bypass RLS,
// so the service-role key is not needed.
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

function createSupabaseAdminClient() {
  const SUPABASE_URL = process.env['SUPABASE_URL'] || PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY =
    process.env['SUPABASE_PUBLISHABLE_KEY'] ||
    process.env['SUPABASE_ANON_KEY'] ||
    PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client. Uses the publishable key with SECURITY DEFINER
// RPCs for writes. Direct table writes from this client remain subject to RLS.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
