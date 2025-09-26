import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY
);

const MISSING_CONFIG_MESSAGE =
  "Supabase credentials are not configured. Update your .env file with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY before continuing.";

function createUnconfiguredClient(): SupabaseClient {
  const error = new Error(MISSING_CONFIG_MESSAGE);
  const handler: ProxyHandler<SupabaseClient> = {
    get() {
      throw error;
    },
    apply() {
      throw error;
    },
  };
  return new Proxy({} as SupabaseClient, handler);
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : createUnconfiguredClient();

export const supabaseConfigError = isSupabaseConfigured
  ? null
  : MISSING_CONFIG_MESSAGE;
