import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";

export default function RootLayout() {
  useEffect(() => {
    // Initialize SQLite on startup and reuse the promise to avoid race conditions
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

    // Re-run sync when app comes back from background
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runAfterInit();
      }
    });

    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
