// Expo inlines EXPO_PUBLIC_* only when referenced literally.
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  oneSignalAppId: process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '',
  forceRelay: process.env.EXPO_PUBLIC_FORCE_TURN_RELAY === 'true',
  /** The web app's origin; password-reset links open there. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/$/, ''),
  /** GIPHY API key for GIFs and stickers in chat; the GIF button hides without it. */
  giphyKey: process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? '',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
