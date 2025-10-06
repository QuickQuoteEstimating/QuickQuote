import { Stack } from "expo-router";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../context/AuthContext";
import { SettingsProvider } from "../context/SettingsContext";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { ThemeProvider } from "../theme/ThemeProvider";

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      try {
        await initLocalDB();
        await runSync();
      } catch (error) {
        console.error("Initialization failed", error);
      }
    };

    init();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") init();
    });

    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <Stack 
            screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
