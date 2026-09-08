import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import type { Database } from '@/types/database';
import { runtimeEnv } from './env';
import { authStorage } from './secureStorage';

export const supabase: SupabaseClient<Database> | null = runtimeEnv.isDemo || runtimeEnv.configurationIssue
  ? null
  : createClient<Database>(runtimeEnv.supabaseUrl!, runtimeEnv.supabasePublishableKey!, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: authStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      },
      global: { headers: { 'X-Client-Info': 'rummal-mobile/0.1.0' } }
    });

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase?.auth.startAutoRefresh();
    else supabase?.auth.stopAutoRefresh();
  });
}
