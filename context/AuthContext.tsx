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
import { Alert } from "react-native";
import { bootstrapUserData, clearLocalData } from "../lib/bootstrap";
import { supabase } from "../lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  signOutLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const bootstrappedUserRef = useRef<string | null>(null);

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

        if (event === "SIGNED_OUT" || event === "USER_DELETED") {
          bootstrappedUserRef.current = null;
          try {
            await clearLocalData();
          } catch (error) {
            console.error("Failed to clear local data on sign out", error);
          }
        }
      }
    );

    init();

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      return;
    }

    if (bootstrappedUserRef.current === userId) {
      return;
    }

    let isActive = true;
    setIsBootstrapping(true);

    bootstrapUserData(userId)
      .then(() => {
        if (isActive) {
          bootstrappedUserRef.current = userId;
        }
      })
      .catch((error) => {
        console.error("Failed to bootstrap local data", error);
        if (isActive) {
          Alert.alert(
            "Sync Error",
            "We couldn't refresh your data. Pull down to refresh after reconnecting."
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsBootstrapping(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

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
    }),
    [session, isLoadingSession, isBootstrapping, handleSignOut, signOutLoading]
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
