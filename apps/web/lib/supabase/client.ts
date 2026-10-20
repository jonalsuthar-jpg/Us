'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database, UsClient } from '@us/shared';
import { env } from '../env';

let client: UsClient | undefined;

/** Browser singleton. Session lives in cookies so proxy.ts can read it. */
export function getSupabase(): UsClient {
  if (!client) {
    if (!env.supabaseUrl || !env.supabaseAnonKey) {
      throw new Error('Supabase is not configured. Copy apps/web/.env.example to apps/web/.env.local.');
    }
    client = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  }
  return client;
}
