import React from "react";
import { Text, StyleSheet, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const themeColors = {
    background: isDark ? "#090909" : "#FFFFFF",
    text: isDark ? "#F9FAFB" : "#1F2933",
  };

  return (
    <SafeAreaView
      style={[homeStyles.container, { backgroundColor: themeColors.background }]}
    >
      <Text style={[homeStyles.text, { color: themeColors.text }]}>
        Welcome to QuickQuote!
      </Text>
    </SafeAreaView>
  );
}

const homeStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  text: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
});
