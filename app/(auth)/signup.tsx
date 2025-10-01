import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { BrandLogo } from "../../components/BrandLogo";
import LogoPicker from "../../components/LogoPicker";
import { useSettings } from "../../context/SettingsContext";

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

      if (error) {
        throw error;
      }

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
      console.error("Sign-up failed", error);
      Alert.alert("Sign up failed", error.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", android: undefined })}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <BrandLogo size={80} />
          </View>
          <Text style={styles.title}>Create your account</Text>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account details</Text>
            <Text style={styles.sectionSubtitle}>
              Sign in with your work email so we can keep your estimates in sync.
            </Text>
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
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              placeholder="Password"
              placeholderTextColor="#888"
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              placeholder="Confirm password"
              placeholderTextColor="#888"
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Company profile</Text>
            <Text style={styles.sectionSubtitle}>
              We’ll preload every estimate with this information. You can tweak it anytime in Settings.
            </Text>
            <LogoPicker value={logoUri} onChange={setLogoUri} />
            <TextInput
              placeholder="Company name"
              placeholderTextColor="#888"
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
            />
            <TextInput
              placeholder="Company email"
              placeholderTextColor="#888"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              value={companyEmail}
              onChangeText={setCompanyEmail}
            />
            <TextInput
              placeholder="Phone"
              placeholderTextColor="#888"
              keyboardType="phone-pad"
              style={styles.input}
              value={companyPhone}
              onChangeText={setCompanyPhone}
            />
            <TextInput
              placeholder="Website"
              placeholderTextColor="#888"
              autoCapitalize="none"
              style={styles.input}
              value={companyWebsite}
              onChangeText={setCompanyWebsite}
            />
            <TextInput
              placeholder="Business address"
              placeholderTextColor="#888"
              style={[styles.input, styles.textArea]}
              value={companyAddress}
              onChangeText={setCompanyAddress}
              multiline
            />
          </View>

          <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "Creating account..." : "Sign up"}</Text>
          </Pressable>
          <View style={styles.linksRow}>
            <Link href="/(auth)/login" style={styles.link}>
              Already have an account?
            </Link>
          </View>
        </View>
      </ScrollView>
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
    gap: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 12,
    elevation: 6,
  },
  scrollContent: {
    paddingVertical: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#475569",
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
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: "#1e40af",
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
    color: "#1e40af",
    fontSize: 14,
    fontWeight: "500",
  },
});
