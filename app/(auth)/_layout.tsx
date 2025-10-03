import { Redirect, Stack } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";

export default function AuthLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: "height" })}
      style={styles.keyboardAvoider}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          presentation: "card",
          keyboardHandlingEnabled: true,
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
