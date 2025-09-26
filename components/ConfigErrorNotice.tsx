import { Linking, StyleSheet, Text, View } from "react-native";
import { useCallback } from "react";

const DOCS_URL =
  "https://github.com/QuickQuoteApp/QuickQuote/blob/main/README.md#getting-started";

type ConfigErrorNoticeProps = {
  message: string;
};

export default function ConfigErrorNotice({
  message,
}: ConfigErrorNoticeProps) {
  const handleOpenDocs = useCallback(() => {
    Linking.openURL(DOCS_URL).catch(() => {
      // Ignore failures; Expo Go will surface a toast automatically
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Configuration needed</Text>
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.instructions}>
        Create a .env file based on .env.example and restart the Expo server.
      </Text>
      <Text style={styles.link} onPress={handleOpenDocs}>
        View setup instructions in the README
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#0f172a",
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    color: "#cbd5f5",
    textAlign: "center",
  },
  instructions: {
    fontSize: 16,
    color: "#e2e8f0",
    textAlign: "center",
  },
  link: {
    fontSize: 16,
    fontWeight: "600",
    color: "#60a5fa",
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
