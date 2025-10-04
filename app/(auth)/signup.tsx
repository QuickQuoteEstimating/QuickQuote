import { Link, router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import LogoPicker from "../../components/LogoPicker";
import { useSettings } from "../../context/SettingsContext";
import { Body, Button, Card, Input, Subtitle, Title } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { settings, setCompanyProfile } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const keyboardBehavior = Platform.OS === "ios" ? "padding" : "height";
  const keyboardVerticalOffset = Platform.OS === "ios" ? insets.top : 0;

  // Input refs for better flow between fields
  const refs = {
    email: useRef<TextInput | null>(null),
    password: useRef<TextInput | null>(null),
    confirmPassword: useRef<TextInput | null>(null),
    companyName: useRef<TextInput | null>(null),
    companyEmail: useRef<TextInput | null>(null),
    companyPhone: useRef<TextInput | null>(null),
    companyWebsite: useRef<TextInput | null>(null),
    companyAddress: useRef<TextInput | null>(null),
  };

  useEffect(() => {
    setCompanyName(settings.companyProfile.name ?? "");
    setCompanyEmail(settings.companyProfile.email ?? "");
    setCompanyPhone(settings.companyProfile.phone ?? "");
    setCompanyWebsite(settings.companyProfile.website ?? "");
    setCompanyAddress(settings.companyProfile.address ?? "");
    setLogoUri(settings.companyProfile.logoUri ?? null);
  }, [settings.companyProfile]);

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

      setCompanyProfile({
        name: companyName.trim(),
        email: companyEmail.trim(),
        phone: companyPhone.trim(),
        website: companyWebsite.trim(),
        address: companyAddress.trim(),
        logoUri,
      });

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
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.touchableContainer}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              contentInsetAdjustmentBehavior="always"
              showsVerticalScrollIndicator={false}
            >
            <Card style={styles.card}>
              <View style={styles.logoContainer}>
                <BrandLogo size={80} />
              </View>
              <Title style={styles.title}>Create your account</Title>

              <View style={styles.section}>
                <Subtitle style={styles.sectionTitle}>Account details</Subtitle>
                <Body style={styles.sectionSubtitle}>
                  Sign in with your work email so we can keep your estimates in sync.
                </Body>

                <Input
                  ref={refs.email}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.password.current?.focus()}
                />
                <Input
                  ref={refs.password}
                  autoCapitalize="none"
                  autoComplete="password"
                  placeholder="Create a password"
                  secureTextEntry
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.confirmPassword.current?.focus()}
                />
                <Input
                  ref={refs.confirmPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  placeholder="Confirm your password"
                  secureTextEntry
                  label="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.companyName.current?.focus()}
                />
              </View>

              <View style={styles.section}>
                <Subtitle style={styles.sectionTitle}>Company profile</Subtitle>
                <Body style={styles.sectionSubtitle}>
                  We’ll preload every estimate with this information. You can tweak it anytime in
                  Settings.
                </Body>
                <LogoPicker value={logoUri} onChange={setLogoUri} />

                <Input
                  ref={refs.companyName}
                  placeholder="Acme Landscaping"
                  label="Company name"
                  value={companyName}
                  onChangeText={setCompanyName}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.companyEmail.current?.focus()}
                />
                <Input
                  ref={refs.companyEmail}
                  placeholder="hello@acme.com"
                  keyboardType="email-address"
                  label="Company email"
                  value={companyEmail}
                  onChangeText={setCompanyEmail}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.companyPhone.current?.focus()}
                />
                <Input
                  ref={refs.companyPhone}
                  placeholder="(555) 555-0199"
                  keyboardType="phone-pad"
                  label="Phone"
                  value={companyPhone}
                  onChangeText={setCompanyPhone}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.companyWebsite.current?.focus()}
                />
                <Input
                  ref={refs.companyWebsite}
                  placeholder="https://acme.com"
                  label="Website"
                  autoCapitalize="none"
                  value={companyWebsite}
                  onChangeText={setCompanyWebsite}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => refs.companyAddress.current?.focus()}
                />
                <Input
                  ref={refs.companyAddress}
                  placeholder="123 Main St, Springfield"
                  label="Business address"
                  value={companyAddress}
                  onChangeText={setCompanyAddress}
                  multiline
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
              </View>

              <Button label="Sign up" onPress={handleSignup} loading={loading} />
              <View style={styles.linksRow}>
                <Link href="/(auth)/login">
                  <Body style={styles.link}>Already have an account?</Body>
                </Link>
              </View>
            </Card>
            </ScrollView>
          </View>
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
    keyboardAvoiding: {
      flex: 1,
    },
    touchableContainer: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
    },
    card: {
      gap: theme.spacing.xl,
    },
    logoContainer: {
      alignItems: "center",
      marginBottom: theme.spacing.xs,
    },
    title: {
      textAlign: "center",
      color: theme.colors.primaryText,
    },
    section: {
      gap: theme.spacing.md,
    },
    sectionTitle: {
      color: theme.colors.primaryText,
    },
    sectionSubtitle: {
      color: theme.colors.mutedText,
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
