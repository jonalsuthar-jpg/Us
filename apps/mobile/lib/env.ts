// Expo inlines EXPO_PUBLIC_* only when referenced literally.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  oneSignalAppId: process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '',
  forceRelay: process.env.EXPO_PUBLIC_FORCE_TURN_RELAY === 'true',
  /** The web app's origin; password-reset links open there. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, ''),
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
