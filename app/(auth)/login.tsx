import { Link, router } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import { Body, Button, Card, Input, Subtitle, Title } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import KeyboardAwareContainer from "../../components/KeyboardAwareContainer";


export default function LoginScreen() {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = useCallback((key: "email" | "password", value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleLogin = useCallback(async () => {
    const { email, password } = form;
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
      if (error) throw error;
      router.replace("/(tabs)/home");
    } catch (error: any) {
      Alert.alert("Login failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [form]);

  return (
    <KeyboardAwareContainer>
      <View style={styles.content}>
        <Card style={styles.card}>
          <View style={styles.logoContainer}>
            <BrandLogo size={80} />
          </View>

          <Title style={styles.title}>Welcome back</Title>
          <Subtitle style={styles.subtitle}>
            Sign in to manage estimates, customers, and your team from anywhere.
          </Subtitle>

          <Input
            ref={emailRef}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            label="Email"
            value={form.email}
            onChangeText={(v) => handleChange("email", v)}
            returnKeyType="next"
            blurOnSubmit={false}
            onFocus={() => console.log("Email input focused")}
            onBlur={() => console.log("Email input blurred")}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Input
            ref={passwordRef}
            autoCapitalize="none"
            autoComplete="password"
            placeholder="••••••••"
            secureTextEntry
            label="Password"
            value={form.password}
            onChangeText={(v) => handleChange("password", v)}
            returnKeyType="done"
            onFocus={() => console.log("Password input focused")}
            onBlur={() => console.log("Password input blurred")}
            onSubmitEditing={handleLogin}
          />

          <Button label="Sign in" onPress={handleLogin} loading={loading} />

          <View style={styles.linksRow}>
            <Link href="/(auth)/forgot-password">
              <Body style={styles.link}>Forgot password?</Body>
            </Link>
            <Link href="/(auth)/signup">
              <Body style={styles.link}>Create account</Body>
            </Link>
          </View>
        </Card>
      </View>
    </KeyboardAwareContainer>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    content: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: theme.colors.background,
      padding: theme.spacing.xl,
    },
    card: { gap: theme.spacing.lg },
    logoContainer: { alignItems: "center", marginBottom: theme.spacing.xs },
    title: { textAlign: "center", color: theme.colors.primaryText },
    subtitle: { textAlign: "center" },
    linksRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    link: { color: theme.colors.accent, fontWeight: "600" },
  });
}
