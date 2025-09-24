import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../context/AuthContext";

export default function Settings() {
  const { user, signOut, signOutLoading } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email ?? "Unknown"}</Text>
        <Pressable style={[styles.button, signOutLoading && styles.buttonDisabled]} onPress={signOut} disabled={signOutLoading}>
          <Text style={styles.buttonText}>{signOutLoading ? "Signing out..." : "Sign out"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    padding: 24,
    justifyContent: "flex-start",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  label: {
    fontSize: 14,
    color: "#475569",
  },
  value: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
  },
  button: {
    marginTop: 16,
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
