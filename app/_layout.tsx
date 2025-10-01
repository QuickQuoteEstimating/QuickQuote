import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { SettingsProvider } from "../context/SettingsContext";
import { initLocalDB } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { ThemeProvider } from "../theme";

function RootNavigator() {
  const { isLoading, needsBootstrapRetry, retryBootstrap } = useAuth();
  const [retryingBootstrap, setRetryingBootstrap] = useState(false);

  useEffect(() => {
    if (!needsBootstrapRetry) {
      setRetryingBootstrap(false);
    }
  }, [needsBootstrapRetry]);

  const handleRetryBootstrap = useCallback(async () => {
    if (retryingBootstrap) {
      return;
    }

    setRetryingBootstrap(true);
    console.log("Retry banner pressed: attempting bootstrap recovery");

    try {
      await retryBootstrap();
      console.log("Bootstrap recovery succeeded after manual retry");
    } catch (error) {
      console.error("Manual bootstrap retry failed from banner", error);
    } finally {
      setRetryingBootstrap(false);
    }
  }, [retryBootstrap, retryingBootstrap]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      {needsBootstrapRetry ? (
        <View style={styles.retryBanner}>
          <Text style={styles.retryBannerTitle}>We couldn't sync your data.</Text>
          <Text style={styles.retryBannerMessage}>
            Check your connection and try again so we can finish downloading the latest
            information.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry syncing your account"
            onPress={handleRetryBootstrap}
            disabled={retryingBootstrap}
            style={[styles.retryButton, retryingBootstrap && styles.retryButtonDisabled]}
          >
            <Text style={styles.retryButtonText}>
              {retryingBootstrap ? "Retrying…" : "Retry sync"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
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

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        runAfterInit();
      }
    });

    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  retryBanner: {
    backgroundColor: "#FEF3C7",
    borderBottomColor: "#FCD34D",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  retryBannerTitle: {
    color: "#92400E",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  retryBannerMessage: {
    color: "#B45309",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#B45309",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: "#FFFBEB",
    fontSize: 14,
    fontWeight: "600",
  },
});
