import { Link } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import { Body, Button, Card, Input, Subtitle, Title } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

const RESET_REDIRECT = process.env.EXPO_PUBLIC_SUPABASE_RESET_REDIRECT;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleReset = async () => {
    if (!email) {
      Alert.alert("Missing email", "Enter the email tied to your account.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: RESET_REDIRECT }
      );

      if (error) throw error;

      Alert.alert("Email sent", "Check your inbox for a password reset link.");
    } catch (error: any) {
      console.error("Password reset request failed", error);
      Alert.alert("Reset failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Card style={styles.card}>
              <View style={styles.logoContainer}>
                <BrandLogo size={80} />
              </View>
              <Title style={styles.title}>Reset your password</Title>
              <Subtitle style={styles.subtitle}>
                Enter the email linked to your account and we'll send reset
                instructions.
              </Subtitle>

              <Input
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                label="Email"
                value={email}
                onChangeText={setEmail}
              />

              <Button
                label="Send reset link"
                onPress={handleReset}
                loading={loading}
              />

              <View style={styles.linksRow}>
                <Link href="/(auth)/login">
                  <Body style={styles.link}>Back to sign in</Body>
                </Link>
              </View>
            </Card>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    keyboardAvoider: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    card: {
      gap: theme.spacing.lg,
    },
    logoContainer: {
      alignItems: "center",
      marginBottom: theme.spacing.xs,
    },
    title: {
      textAlign: "center",
      color: theme.colors.primaryText,
    },
    subtitle: {
      textAlign: "center",
    },
    linksRow: {
      flexDirection: "row",
      justifyContent: "center",
    },
    link: {
      color: theme.colors.accent,
      fontWeight: "600",
    },
  });
}
