import { Link, router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import { Body, Button, Card, Input, Subtitle, Title } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import KeyboardAwareContainer from "../../components/KeyboardAwareContainer";


export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const confirmPasswordRef = useRef<TextInput | null>(null);

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert("Missing info", "Please fill out all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Make sure both passwords are the same.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;

      Alert.alert(
        "Check your inbox",
        "We sent a confirmation email. Confirm your address and then sign in."
      );
      router.replace("/(auth)/login");
    } catch (error: any) {
      Alert.alert("Sign up failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareContainer>
      <View style={styles.content}>
        <Card style={styles.card}>
          <View style={styles.logoContainer}>
            <BrandLogo size={80} />
          </View>

          <Title style={styles.title}>Create your account</Title>
          <Subtitle style={styles.subtitle}>
            Sign up to start managing your estimates and customers.
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
            placeholder="Create a password"
            secureTextEntry
            label="Password"
            value={password}
            onChangeText={setPassword}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => confirmPasswordRef.current?.focus()}
          />

          <Input
            ref={confirmPasswordRef}
            placeholder="Confirm password"
            secureTextEntry
            label="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />

          <Button label="Sign up" onPress={handleSignup} loading={loading} />

          <View style={styles.linksRow}>
            <Link href="/(auth)/login">
              <Body style={styles.link}>Already have an account?</Body>
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
      justifyContent: "center",
      alignItems: "center",
    },
    link: { color: theme.colors.accent, fontWeight: "600" },
  });
}
