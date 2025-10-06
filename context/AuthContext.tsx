import { Session, User } from "@supabase/supabase-js";
import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState, AppStateStatus } from "react-native";
import { bootstrapUserData, clearLocalData } from "../lib/bootstrap";
import { supabase } from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  signOutLoading: boolean;
  needsBootstrapRetry: boolean;
  retryBootstrap: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [needsBootstrapRetry, setNeedsBootstrapRetry] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);

  const bootstrappedUserRef = useRef<string | null>(null);
  const bootstrapInFlightRef = useRef<Promise<void> | null>(null);
  const isMountedRef = useRef(true);
  const currentUserIdRef = useRef<string | null>(null);

  // Mount guard
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ✅ Initial session fetch
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("Failed to read stored session", error);
        if (isMounted) setSession(data?.session ?? null);
      } catch (error) {
        console.error("Unexpected auth init error", error);
      } finally {
        if (isMounted) setIsLoadingSession(false);
      }
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // ⚡ only update if changed
      if (newSession?.user?.id !== currentUserIdRef.current) {
        currentUserIdRef.current = newSession?.user?.id ?? null;
        setSession(newSession);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // ✅ Bootstrap logic (memoized)
  const startBootstrap = useCallback(async (userId: string, { silent }: { silent?: boolean } = {}) => {
    if (!userId || bootstrapInFlightRef.current) return bootstrapInFlightRef.current;

    if (isMountedRef.current) setIsBootstrapping(true);

    const bootstrapPromise = bootstrapUserData(userId)
      .then(() => {
        bootstrappedUserRef.current = userId;
        if (isMountedRef.current) setNeedsBootstrapRetry(false);
      })
      .catch((error) => {
        console.error("Failed to bootstrap local data", error);
        if (isMountedRef.current) setNeedsBootstrapRetry(true);
        if (!silent)
          Alert.alert("Sync Error", "We couldn't refresh your data. Pull down to refresh later.");
      })
      .finally(() => {
        if (isMountedRef.current) setIsBootstrapping(false);
        bootstrapInFlightRef.current = null;
      });

    bootstrapInFlightRef.current = bootstrapPromise;
    return bootstrapPromise;
  }, []);

  // ✅ Retry handler
  const retryBootstrap = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    await startBootstrap(userId);
  }, [session?.user?.id, startBootstrap]);

  // ✅ Auto bootstrap when session changes
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || bootstrappedUserRef.current === userId) return;
    startBootstrap(userId).catch(() => {});
  }, [session?.user?.id, startBootstrap]);

  // ✅ Appstate retry on resume
  useEffect(() => {
    if (!needsBootstrapRetry) return;

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        const userId = session?.user?.id;
        if (userId) startBootstrap(userId, { silent: true }).catch(() => {});
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [needsBootstrapRetry, session?.user?.id, startBootstrap]);

  // ✅ Sign out
  const handleSignOut = useCallback(async () => {
    setSignOutLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await clearLocalData();
      bootstrappedUserRef.current = null;
    } catch (error: any) {
      console.error("Sign-out failed", error);
      Alert.alert("Sign out failed", error.message ?? "Please try again.");
    } finally {
      setSignOutLoading(false);
    }
  }, []);

  // ✅ Stable memoized value (prevents rerenders)
  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading: isLoadingSession || isBootstrapping,
      signOut: handleSignOut,
      signOutLoading,
      needsBootstrapRetry,
      retryBootstrap,
    }),
    [session, isLoadingSession, isBootstrapping, signOutLoading, needsBootstrapRetry, retryBootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
