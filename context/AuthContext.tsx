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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Failed to read stored session", error);
        }
        if (!isMounted) {
          return;
        }
        setSession(data?.session ?? null);
      } catch (error) {
        console.error("Unexpected auth init error", error);
      } finally {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      }
    };

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);

        const signedOutLike =
          event === "SIGNED_OUT" || (!newSession && !!bootstrappedUserRef.current);
        if (signedOutLike) {
          bootstrappedUserRef.current = null;
          try {
            await clearLocalData();
          } catch (error) {
            console.error("Failed to clear local data on sign out", error);
          }
        }
      },
    );

    init();

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const startBootstrap = useCallback(
    async (userId: string, { silent }: { silent?: boolean } = {}) => {
      if (!userId) {
        return;
      }

      if (bootstrapInFlightRef.current) {
        return bootstrapInFlightRef.current;
      }

      console.log(`Bootstrapping local data for user ${userId}${silent ? " (silent)" : ""}`);

      if (isMountedRef.current) {
        setIsBootstrapping(true);
      }

      const bootstrapPromise = bootstrapUserData(userId)
        .then(() => {
          console.log(`Bootstrap completed for user ${userId}`);
          bootstrappedUserRef.current = userId;
          if (isMountedRef.current) {
            setNeedsBootstrapRetry(false);
          }
        })
        .catch((error) => {
          console.error("Failed to bootstrap local data", error);
          if (isMountedRef.current) {
            setNeedsBootstrapRetry(true);
          }
          if (!silent) {
            Alert.alert(
              "Sync Error",
              "We couldn't refresh your data. Pull down to refresh after reconnecting.",
            );
          }
          throw error;
        })
        .finally(() => {
          if (isMountedRef.current) {
            setIsBootstrapping(false);
          }
          bootstrapInFlightRef.current = null;
        });

      bootstrapInFlightRef.current = bootstrapPromise;
      return bootstrapPromise;
    },
    [],
  );

  const retryBootstrap = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      console.log("retryBootstrap called without an authenticated user");
      return;
    }

    console.log(`Manual bootstrap retry requested for user ${userId}`);
    await startBootstrap(userId);
  }, [session?.user?.id, startBootstrap]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }

    if (bootstrappedUserRef.current === userId) {
      return;
    }

    startBootstrap(userId).catch(() => {
      // Errors are handled within startBootstrap; we intentionally swallow them here.
    });
  }, [session?.user?.id, startBootstrap]);

  useEffect(() => {
    if (!needsBootstrapRetry) {
      return;
    }

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        const userId = session?.user?.id;
        if (!userId) {
          return;
        }
        console.log("App returned to foreground, retrying bootstrap");
        startBootstrap(userId, { silent: true }).catch(() => {
          // Errors are handled inside startBootstrap.
        });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [needsBootstrapRetry, session?.user?.id, startBootstrap]);

  const handleSignOut = useCallback(async () => {
    setSignOutLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      await clearLocalData();
      bootstrappedUserRef.current = null;
    } catch (error: any) {
      console.error("Sign-out failed", error);
      Alert.alert("Sign out failed", error.message ?? "Please try again.");
    } finally {
      setSignOutLoading(false);
    }
  }, []);

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
    [
      session,
      isLoadingSession,
      isBootstrapping,
      handleSignOut,
      signOutLoading,
      needsBootstrapRetry,
      retryBootstrap,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
