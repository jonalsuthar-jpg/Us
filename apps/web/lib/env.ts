// Next inlines NEXT_PUBLIC_* only when referenced literally, so list them here.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  oneSignalAppId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? '',
  forceRelay: process.env.NEXT_PUBLIC_FORCE_TURN_RELAY === 'true',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
