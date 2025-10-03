import { Link, router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
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
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

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

      if (error) throw error;

      router.replace("/(tabs)/home");
    } catch (error: any) {
      Alert.alert("Login failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={24}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
            ref={emailRef}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="you@example.com"
            label="Email"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Input
            ref={passwordRef}
            autoCapitalize="none"
            autoComplete="password"
            placeholder="••••••••"
            secureTextEntry
            label="Password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
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
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xl,
    },
    scrollView: {
      flex: 1,
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
      color: theme.colors.accent,
      fontWeight: "600",
    },
  });
}
