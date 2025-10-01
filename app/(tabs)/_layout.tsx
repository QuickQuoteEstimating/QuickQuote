import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";

export default function TabsLayout() {
  const { session, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const palette = {
    background: "#f8fafc",
    card: "#ffffff",
    accent: "#1e40af",
    primaryText: "#0f172a",
    muted: "#64748b",
    border: "#e2e8f0",
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

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
          borderTopWidth: 1,
          borderTopColor: palette.border,
          shadowColor: palette.primaryText,
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: -4 },
          shadowRadius: 12,
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          height: 70 + Math.max(insets.bottom, 12),
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 6,
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
            <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={24} />
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
