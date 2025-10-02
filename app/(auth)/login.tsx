import { Link, router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import { Body, Button, Card, Input, Subtitle, Title } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter your email and password to continue.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw error;
      }

      router.replace("/(tabs)/home");
    } catch (error: any) {
      console.error("Login failed", error);
      Alert.alert("Login failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.container}
    >
      <Card style={styles.card}>
        <View style={styles.logoContainer}>
          <BrandLogo size={80} />
        </View>
        <Title style={styles.title}>Welcome back</Title>
        <Subtitle style={styles.subtitle}>
          Sign in to manage estimates, customers, and your team from anywhere.
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
        <Input
          autoCapitalize="none"
          autoComplete="password"
          placeholder="••••••••"
          secureTextEntry
          label="Password"
          value={password}
          onChangeText={setPassword}
        />
        <Button
          label="Sign in"
          onPress={handleLogin}
          loading={loading}
          accessibilityLabel="Sign in to QuickQuote"
        />
        <View style={styles.linksRow}>
          <Link href="/(auth)/forgot-password">
            <Body style={styles.link}>Forgot password?</Body>
          </Link>
          <Link href="/(auth)/signup">
            <Body style={styles.link}>Create account</Body>
          </Link>
        </View>
      </Card>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
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
      justifyContent: "space-between",
      alignItems: "center",
    },
    link: {
      color: theme.colors.primary,
      fontWeight: "600",
    },
  });
}
