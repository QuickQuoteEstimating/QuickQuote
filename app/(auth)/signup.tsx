import { Link, router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";
import type {
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
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

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);
  const confirmPasswordRef = useRef<TextInput | null>(null);
  const companyNameRef = useRef<TextInput | null>(null);
  const companyEmailRef = useRef<TextInput | null>(null);
  const companyPhoneRef = useRef<TextInput | null>(null);
  const companyWebsiteRef = useRef<TextInput | null>(null);
  const companyAddressRef = useRef<TextInput | null>(null);

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

      Alert.alert("Check your inbox", "We sent a confirmation email. Confirm your address and then sign in.");
      router.replace("/(auth)/login");
    } catch (error: any) {
      Alert.alert("Sign up failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardStickyView style={styles.keyboard}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="always"
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
                ref={emailRef}
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
                autoComplete="password"
                placeholder="Confirm your password"
                secureTextEntry
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyNameRef.current?.focus()}
              />
            </View>

            <View style={styles.section}>
              <Subtitle style={styles.sectionTitle}>Company profile</Subtitle>
              <Body style={styles.sectionSubtitle}>
                We’ll preload every estimate with this information. You can tweak it anytime in Settings.
              </Body>
              <LogoPicker value={logoUri} onChange={setLogoUri} />

              <Input
                ref={companyNameRef}
                label="Company name"
                value={companyName}
                onChangeText={setCompanyName}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyEmailRef.current?.focus()}
              />
              <Input
                ref={companyEmailRef}
                placeholder="hello@acme.com"
                keyboardType="email-address"
                autoCapitalize="none"
                label="Company email"
                value={companyEmail}
                onChangeText={setCompanyEmail}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyPhoneRef.current?.focus()}
              />
              <Input
                ref={companyPhoneRef}
                placeholder="(555) 555-0199"
                keyboardType="phone-pad"
                label="Phone"
                value={companyPhone}
                onChangeText={setCompanyPhone}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyWebsiteRef.current?.focus()}
              />
              <Input
                ref={companyWebsiteRef}
                placeholder="https://acme.com"
                autoCapitalize="none"
                label="Website"
                value={companyWebsite}
                onChangeText={setCompanyWebsite}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyAddressRef.current?.focus()}
              />
              <Input
                ref={companyAddressRef}
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

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardStickyView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    keyboard: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xl,
    },
    card: { gap: theme.spacing.xl },
    logoContainer: { alignItems: "center", marginBottom: theme.spacing.xs },
    title: { textAlign: "center", color: theme.colors.primaryText },
    section: { gap: theme.spacing.md },
    sectionTitle: { color: theme.colors.primaryText },
    sectionSubtitle: { color: theme.colors.mutedText },
    linksRow: { flexDirection: "row", justifyContent: "center" },
    link: { color: theme.colors.accent, fontWeight: "600" },
  });
}

type NativeTextInputProps = ComponentProps<typeof TextInput>;

export interface InputProps {
  label?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: NativeTextInputProps["autoCapitalize"];
  autoCorrect?: boolean;
  autoComplete?: NativeTextInputProps["autoComplete"];
  multiline?: boolean;
  returnKeyType?: ReturnKeyTypeOptions;
  blurOnSubmit?: boolean;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  editable?: boolean;
  testID?: string;
  value?: string;
}
