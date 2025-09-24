import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";

export default function RootLayout() {
  useEffect(() => {
    const setup = async () => {
      try {
        await initLocalDB(); // ✅ Ensure DB + tables exist before sync
        console.log("SQLite DB initialized");

        // Run sync immediately on startup
        await runSync();
      } catch (err) {
        console.error("Failed to initialize DB:", err);
      }
    };

    setup();

    // Run sync whenever app goes background → active
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runSync();
      }
    });

    return () => sub.remove();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
