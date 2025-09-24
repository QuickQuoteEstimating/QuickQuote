import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
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
  useEffect(() => {
    const initPromise = (async () => {
      try {
        await initLocalDB();
      } catch (error) {
        console.error("Failed to initialize local database", error);
        throw error;
      }
    })();

    const runAfterInit = () =>
      initPromise
        .then(() => runSync())
        .catch((error) => {
          console.error("Skipping sync because initialization failed", error);
        });

    runAfterInit();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runAfterInit();
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
