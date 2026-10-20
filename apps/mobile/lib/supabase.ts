import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database, UsClient } from '@us/shared';
import { AppState, Platform } from 'react-native';
import { env, isConfigured } from './env';

export const supabase: UsClient = createClient<Database>(
  isConfigured ? env.supabaseUrl : 'http://localhost:54321',
  isConfigured ? env.supabaseAnonKey : 'unconfigured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
