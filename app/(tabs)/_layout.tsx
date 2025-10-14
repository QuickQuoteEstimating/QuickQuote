import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useThemeContext } from "../../theme/ThemeProvider";
import React, { useEffect, useRef } from "react";

export default function TabsLayout() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useThemeContext();
  const lastSessionRef = useRef(session);

  const palette = {
    background: theme.colors.surface,
    card: theme.colors.surfaceAlt,
    accent: theme.colors.accent,
    primaryText: theme.colors.primaryText,
    muted: theme.colors.mutedText,
    border: theme.colors.border,
    overlay: theme.colors.overlay,
  };

  // Track session changes only once
  useEffect(() => {
    if (session !== lastSessionRef.current) {
      lastSessionRef.current = session;
      if (!isLoading && !session) {
        router.replace("/(auth)/login");
      }
    }
  }, [session, isLoading]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (!session) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { fontWeight: "600", fontSize: 12, marginBottom: 4 },
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.border,
          shadowColor: palette.overlay,
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: -4 },
          shadowRadius: 8,
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: insets.bottom,
          height: 60 + insets.bottom,
        },
        tabBarItemStyle: { borderRadius: 10, marginHorizontal: 4 },
        tabBarActiveBackgroundColor: palette.card,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="estimates"
        options={{
          title: "Estimates",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "document-text" : "document-text-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
