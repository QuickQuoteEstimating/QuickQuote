import 'react-native-gesture-handler';

import React, { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Slot } from "expo-router";
import { ThemeProvider, useThemeContext } from "../theme/ThemeProvider";
import { AuthProvider } from "../context/AuthContext";
import { SettingsProvider } from "../context/SettingsContext";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAutoSync } from "../hooks/useAutoSync";

export default function RootLayout() {
  useAutoSync(); // ✅ automatically syncs queued data when online

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
        <RootLayoutInner />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

// ✅ Separate inner layout so we can access the theme context
function RootLayoutInner() {
  const { theme } = useThemeContext();
  const { colors } = theme;

  return (
    <AuthProvider>
      <SettingsProvider>
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.background, // matches your app theme
          }}
          edges={["top", "left", "right"]}
        >
          <StatusBar
            style={theme.isDark ? "light" : "dark"}
            backgroundColor={colors.background}
          />

          <Slot
            screenOptions={{
              headerShown: false,
              animation: "none",
            }}
          />
        </SafeAreaView>
      </SettingsProvider>
    </AuthProvider>
  );
}
