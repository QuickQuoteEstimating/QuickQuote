import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";

export default function RootLayout() {
  useEffect(() => {
    // Initialize SQLite on startup
    initLocalDB();

    // Run sync immediately
    runSync();

    // Re-run sync when app comes back from background
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSync();
      }
    });

    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
