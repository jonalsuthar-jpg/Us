import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database, UsClient } from '@us/shared';
import { currentCallManager } from '@us/shared/react';
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

// Only refresh tokens while the app is in the foreground, or a call is on:
// a call can carry on for hours with the app in the background or closed,
// and its signaling and call-row checks need a live session.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active' || currentCallManager()?.isOnCall()) void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
