import { Link } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

const RESET_REDIRECT = process.env.EXPO_PUBLIC_SUPABASE_RESET_REDIRECT;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email) {
      Alert.alert("Missing email", "Enter the email tied to your account.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: RESET_REDIRECT,
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        "Email sent",
        "Check your inbox for a password reset link."
      );
    } catch (error: any) {
      console.error("Password reset request failed", error);
      Alert.alert("Reset failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Reset your password</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#888"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleReset} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Sending..." : "Send reset link"}</Text>
        </Pressable>
        <View style={styles.linksRow}>
          <Link href="/(auth)/login" style={styles.link}>
            Back to sign in
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#0f172a",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
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
  linksRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  link: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "500",
  },
});
