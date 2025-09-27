import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const missingEnvMessage =
  "Supabase credentials are not configured. Copy `.env.example` to `.env` " +
  "and provide EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.";

const createPlaceholderClient = (): SupabaseClient<any, any, any> => {
  const throwConfigurationError = () => {
    throw new Error(missingEnvMessage);
  };

  const handler: ProxyHandler<any> = {
    get: (_target, property) => {
      if (property === "__isPlaceholderClient") {
        return true;
      }

      return new Proxy(throwConfigurationError, handler);
    },
    apply: () => {
      throwConfigurationError();
    },
  };

  if (process.env.NODE_ENV !== "test") {
    console.warn(`[QuickQuote] ${missingEnvMessage}`);
  }

  return new Proxy({}, handler) as SupabaseClient<any, any, any>;
};

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : createPlaceholderClient();
