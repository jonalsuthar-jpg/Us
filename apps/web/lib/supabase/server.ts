import { createServerClient } from '@supabase/ssr';
import type { Database } from '@us/shared';
import { cookies } from 'next/headers';
import { env } from '../env';

/** Server Component / Route Handler client bound to the request's cookies. */
export async function getServerSupabase() {
  const store = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
