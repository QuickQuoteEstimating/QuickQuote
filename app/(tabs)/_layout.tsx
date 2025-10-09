import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { useThemeContext } from "../../theme/ThemeProvider";

export default function TabsLayout() {
  const { session, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { theme } = useThemeContext();

  const palette = {
    background: theme.colors.surface,
    card: theme.colors.surfaceAlt,
    accent: theme.colors.accent,
    primaryText: theme.colors.primaryText,
    muted: theme.colors.mutedText,
    border: theme.colors.border,
    overlay: theme.colors.overlay,
  };

  // Show a simple loading state while session is being determined
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  // Redirect to login if not signed in
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: {
          fontWeight: "600",
          fontSize: 12,
          marginBottom: 4,
        },
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
        tabBarItemStyle: {
          borderRadius: 10,
          marginHorizontal: 4,
        },
        tabBarActiveBackgroundColor: palette.card,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: "Customers",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={24} />
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
              color={color}
              size={24}
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
              color={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
