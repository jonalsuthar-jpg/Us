import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** The typed Supabase client both apps pass into shared API functions. */
export type UsClient = SupabaseClient<Database>;

export interface UsConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  oneSignalAppId?: string;
  /** Force every call through TURN (useful to verify the relay works). */
  forceRelay?: boolean;
}

/** Read config from whichever env convention the host app uses. */
export function readConfig(env: Record<string, string | undefined>, prefix: 'NEXT_PUBLIC_' | 'EXPO_PUBLIC_'): UsConfig {
  const get = (k: string) => env[`${prefix}${k}`];
  const supabaseUrl = get('SUPABASE_URL');
  const supabaseAnonKey = get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      `Missing ${prefix}SUPABASE_URL / ${prefix}SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.`,
    );
  }
  return {
    supabaseUrl,
    supabaseAnonKey,
    oneSignalAppId: get('ONESIGNAL_APP_ID') || undefined,
    forceRelay: get('FORCE_TURN_RELAY') === 'true',
  };
}
