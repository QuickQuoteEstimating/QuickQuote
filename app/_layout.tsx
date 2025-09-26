import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";

function RootNavigator() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        await initLocalDB();
        if (!isMounted) {
          return;
        }
        setDbReady(true);
        setDbError(null);
      } catch (error) {
        console.error("Failed to initialize local database", error);
        if (!isMounted) {
          return;
        }
        setDbError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dbReady) {
      return;
    }

    const runAfterInit = () =>
      runSync().catch((error) => {
        console.error("Failed to run sync after initialization", error);
      });

    runAfterInit();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runAfterInit();
      }
    });

    return () => sub.remove();
  }, [dbReady]);

  if (dbError) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
        <Text style={{ textAlign: "center", marginBottom: 12, fontSize: 16 }}>
          Failed to initialize local database.
        </Text>
        <Text style={{ textAlign: "center", color: "#666" }}>{dbError.message}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
