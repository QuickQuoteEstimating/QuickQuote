import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import LogoPicker from "../../components/LogoPicker";

const THEME_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
];

const HAPTIC_LABELS = ["Subtle", "Balanced", "Bold"];

export default function Settings() {
  const { user, signOut, signOutLoading } = useAuth();
  const {
    settings,
    isHydrated,
    resolvedTheme,
    setThemePreference,
    setMaterialMarkup,
    setLaborMarkup,
    setHourlyRate,
    setTaxRate,
    setHapticsEnabled,
    setHapticIntensity,
    setNotificationsEnabled,
    setAutoSyncEnabled,
    setCompanyProfile,
    triggerHaptic,
    resetToDefaults,
  } = useSettings();

  const [materialMarkupInput, setMaterialMarkupInput] = useState(settings.materialMarkup.toString());
  const [laborMarkupInput, setLaborMarkupInput] = useState(settings.laborMarkup.toString());
  const [hourlyRateInput, setHourlyRateInput] = useState(settings.hourlyRate.toFixed(2));
  const [taxRateInput, setTaxRateInput] = useState(() =>
    settings.taxRate % 1 === 0 ? settings.taxRate.toFixed(0) : settings.taxRate.toString()
  );

  useEffect(() => {
    setMaterialMarkupInput(settings.materialMarkup.toString());
  }, [settings.materialMarkup]);

  useEffect(() => {
    setLaborMarkupInput(settings.laborMarkup.toString());
  }, [settings.laborMarkup]);

  useEffect(() => {
    setHourlyRateInput(settings.hourlyRate.toFixed(2));
  }, [settings.hourlyRate]);

  useEffect(() => {
    setTaxRateInput(settings.taxRate % 1 === 0 ? settings.taxRate.toFixed(0) : settings.taxRate.toString());
  }, [settings.taxRate]);

  const colors = useMemo(() => {
    const isDark = resolvedTheme === "dark";
    return {
      isDark,
      background: isDark ? "#0f172a" : "#f1f5f9",
      card: isDark ? "#1e293b" : "#fff",
      primaryText: isDark ? "#f8fafc" : "#0f172a",
      secondaryText: isDark ? "#cbd5f5" : "#475569",
      border: isDark ? "#334155" : "#e2e8f0",
      accent: "#2563eb",
      destructive: "#ef4444",
    };
  }, [resolvedTheme]);

  const handleUpdateMarkup = (value: string, updater: (parsed: number) => void) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) {
      updater(0);
      return;
    }

    updater(Math.max(0, Math.min(parsed, 1000)));
  };

  const handleUpdateHourlyRate = (value: string) => {
    const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(parsed)) {
      setHourlyRate(0);
      return;
    }

    setHourlyRate(Math.max(0, Math.round(parsed * 100) / 100));
  };

  const hapticLabel = HAPTIC_LABELS[settings.hapticIntensity] ?? HAPTIC_LABELS[1];

  if (!isHydrated) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Loading your preferences…</Text>
      </View>
    );
  }

  const themedStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 24,
      gap: 20,
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
      gap: 16,
      shadowColor: colors.isDark ? "#000" : "#0f172a",
      shadowOpacity: colors.isDark ? 0.4 : 0.08,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 18,
      elevation: 4,
    },
    sectionHeader: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.primaryText,
    },
    sectionDescription: {
      fontSize: 14,
      color: colors.secondaryText,
      lineHeight: 20,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
    },
    rowLabel: {
      fontSize: 16,
      color: colors.primaryText,
      fontWeight: "500",
    },
    rowCaption: {
      fontSize: 13,
      color: colors.secondaryText,
      marginTop: 6,
      lineHeight: 18,
    },
    themeOptions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    themeChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.isDark ? "rgba(148, 163, 184, 0.08)" : "#f8fafc",
    },
    themeChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.isDark ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.08)",
    },
    themeChipText: {
      color: colors.primaryText,
      fontWeight: "600",
    },
    textFieldContainer: {
      flex: 1,
    },
    textField: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.primaryText,
      backgroundColor: colors.isDark ? "rgba(15, 23, 42, 0.7)" : "#f8fafc",
    },
    textArea: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.primaryText,
      backgroundColor: colors.isDark ? "rgba(15, 23, 42, 0.7)" : "#f8fafc",
      minHeight: 90,
      textAlignVertical: "top",
    },
    fieldLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primaryText,
      marginBottom: 6,
    },
    logoSection: {
      gap: 16,
    },
    percentSuffix: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.secondaryText,
      marginLeft: 8,
    },
    currencyPrefix: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.secondaryText,
      marginRight: 8,
    },
    sliderLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
    },
    sliderLabel: {
      fontSize: 13,
      color: colors.secondaryText,
    },
    destructiveButton: {
      backgroundColor: colors.destructive,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    destructiveText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    footerActions: {
      gap: 16,
    },
    resetButton: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.isDark ? "rgba(148, 163, 184, 0.08)" : "#fff",
    },
    resetText: {
      color: colors.primaryText,
      fontSize: 16,
      fontWeight: "600",
    },
  });

  const handleSignOut = () => {
    triggerHaptic();
    signOut();
  };

  return (
    <View style={themedStyles.container}>
      <ScrollView contentContainerStyle={themedStyles.content} showsVerticalScrollIndicator={false}>
        <View style={[themedStyles.section, themedStyles.logoSection]}>
          <Text style={themedStyles.sectionHeader}>Company profile</Text>
          <Text style={themedStyles.sectionDescription}>
            Keep these details current so new estimates automatically display your brand.
          </Text>
          <LogoPicker
            value={settings.companyProfile.logoUri}
            onChange={(uri) => setCompanyProfile({ logoUri: uri })}
          />
          <View style={{ gap: 16 }}>
            <View>
              <Text style={themedStyles.fieldLabel}>Company name</Text>
              <TextInput
                value={settings.companyProfile.name}
                onChangeText={(text) => setCompanyProfile({ name: text })}
                placeholder="QuickQuote Construction"
                placeholderTextColor={colors.secondaryText}
                style={themedStyles.textField}
              />
            </View>
            <View>
              <Text style={themedStyles.fieldLabel}>Email</Text>
              <TextInput
                value={settings.companyProfile.email}
                onChangeText={(text) => setCompanyProfile({ email: text })}
                placeholder="hello@quickquote.com"
                placeholderTextColor={colors.secondaryText}
                keyboardType="email-address"
                autoCapitalize="none"
                style={themedStyles.textField}
              />
            </View>
            <View>
              <Text style={themedStyles.fieldLabel}>Phone</Text>
              <TextInput
                value={settings.companyProfile.phone}
                onChangeText={(text) => setCompanyProfile({ phone: text })}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.secondaryText}
                keyboardType="phone-pad"
                style={themedStyles.textField}
              />
            </View>
            <View>
              <Text style={themedStyles.fieldLabel}>Website</Text>
              <TextInput
                value={settings.companyProfile.website}
                onChangeText={(text) => setCompanyProfile({ website: text })}
                placeholder="quickquote.com"
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                style={themedStyles.textField}
              />
            </View>
            <View>
              <Text style={themedStyles.fieldLabel}>Address</Text>
              <TextInput
                value={settings.companyProfile.address}
                onChangeText={(text) => setCompanyProfile({ address: text })}
                placeholder="123 Main Street, Springfield, USA"
                placeholderTextColor={colors.secondaryText}
                multiline
                style={themedStyles.textArea}
              />
            </View>
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Appearance</Text>
          <Text style={themedStyles.sectionDescription}>
            Choose how QuickQuote should look. You can follow your device, or force a specific mode.
          </Text>
          <View style={themedStyles.themeOptions}>
            {THEME_OPTIONS.map((option) => {
              const isActive = settings.themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${option.label.toLowerCase()} theme`}
                  onPress={() => {
                    setThemePreference(option.value);
                    triggerHaptic();
                  }}
                  style={[themedStyles.themeChip, isActive && themedStyles.themeChipActive]}
                >
                  <Text style={themedStyles.themeChipText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Markup defaults</Text>
          <Text style={themedStyles.sectionDescription}>
            Adjust the default markup percentages for new estimates. You can still override these on a per-estimate
            basis.
          </Text>
          <View>
            <Text style={themedStyles.rowLabel}>Material markup</Text>
            <View style={styles.inputRow}>
              <View style={themedStyles.textFieldContainer}>
                <TextInput
                  value={materialMarkupInput}
                  onChangeText={setMaterialMarkupInput}
                  onBlur={() => handleUpdateMarkup(materialMarkupInput, setMaterialMarkup)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  style={themedStyles.textField}
                  placeholder="0"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
              <Text style={themedStyles.percentSuffix}>%</Text>
            </View>
          </View>
          <View style={styles.fieldSpacer} />
          <View>
            <Text style={themedStyles.rowLabel}>Labor markup</Text>
            <View style={styles.inputRow}>
              <View style={themedStyles.textFieldContainer}>
                <TextInput
                  value={laborMarkupInput}
                  onChangeText={setLaborMarkupInput}
                  onBlur={() => handleUpdateMarkup(laborMarkupInput, setLaborMarkup)}
                  keyboardType="numeric"
                  returnKeyType="done"
                  style={themedStyles.textField}
                  placeholder="0"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
              <Text style={themedStyles.percentSuffix}>%</Text>
            </View>
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Tax defaults</Text>
          <Text style={themedStyles.sectionDescription}>
            Set the default sales tax rate that will be applied to new estimates. You can still adjust it per project.
          </Text>
          <View>
            <Text style={themedStyles.rowLabel}>Tax rate</Text>
            <View style={styles.inputRow}>
              <View style={themedStyles.textFieldContainer}>
                <TextInput
                  value={taxRateInput}
                  onChangeText={setTaxRateInput}
                  onBlur={() => handleUpdateMarkup(taxRateInput, setTaxRate)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={themedStyles.textField}
                  placeholder="0"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
              <Text style={themedStyles.percentSuffix}>%</Text>
            </View>
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Labor defaults</Text>
          <Text style={themedStyles.sectionDescription}>
            Set the standard hourly rate used when calculating project labor totals. You can adjust this on individual
            estimates when needed.
          </Text>
          <View>
            <Text style={themedStyles.rowLabel}>Hourly rate</Text>
            <View style={styles.inputRow}>
              <Text style={themedStyles.currencyPrefix}>$</Text>
              <View style={[themedStyles.textFieldContainer, { flex: 0, flexGrow: 1 }]}>
                <TextInput
                  value={hourlyRateInput}
                  onChangeText={setHourlyRateInput}
                  onBlur={() => handleUpdateHourlyRate(hourlyRateInput)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={themedStyles.textField}
                  placeholder="0.00"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Haptics</Text>
          <Text style={themedStyles.sectionDescription}>
            Feel a tactile tap when you interact with buttons and toggles. Tune the intensity to what feels best.
          </Text>
          <View style={themedStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={themedStyles.rowLabel}>Enable haptic feedback</Text>
              <Text style={themedStyles.rowCaption}>Disabling this turns off vibration for buttons throughout the app.</Text>
            </View>
            <Switch
              value={settings.hapticsEnabled}
              onValueChange={(value) => {
                setHapticsEnabled(value);
                triggerHaptic();
              }}
              thumbColor={settings.hapticsEnabled ? colors.accent : undefined}
            />
          </View>
          <View>
            <Text style={themedStyles.rowLabel}>Tap intensity</Text>
            <Slider
              minimumValue={0}
              maximumValue={2}
              step={1}
              value={settings.hapticIntensity}
              onValueChange={(value) => setHapticIntensity(value as 0 | 1 | 2)}
              onSlidingComplete={() => triggerHaptic()}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.accent}
            />
            <View style={themedStyles.sliderLabelRow}>
              <Text style={themedStyles.sliderLabel}>Subtle</Text>
              <Text style={[themedStyles.sliderLabel, { color: colors.primaryText, fontWeight: "600" }]}>{hapticLabel}</Text>
              <Text style={themedStyles.sliderLabel}>Bold</Text>
            </View>
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>General</Text>
          <View style={themedStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={themedStyles.rowLabel}>Email notifications</Text>
              <Text style={themedStyles.rowCaption}>Get a daily digest of new estimates and approvals.</Text>
            </View>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(value) => {
                setNotificationsEnabled(value);
                triggerHaptic();
              }}
              thumbColor={settings.notificationsEnabled ? colors.accent : undefined}
            />
          </View>
          <View style={styles.rowSeparator} />
          <View style={themedStyles.row}>
            <View style={{ flex: 1 }}>
              <Text style={themedStyles.rowLabel}>Auto-sync data</Text>
              <Text style={themedStyles.rowCaption}>Automatically sync estimates when QuickQuote opens.</Text>
            </View>
            <Switch
              value={settings.autoSyncEnabled}
              onValueChange={(value) => {
                setAutoSyncEnabled(value);
                triggerHaptic();
              }}
              thumbColor={settings.autoSyncEnabled ? colors.accent : undefined}
            />
          </View>
        </View>

        <View style={themedStyles.section}>
          <Text style={themedStyles.sectionHeader}>Account</Text>
          <Text style={themedStyles.sectionDescription}>You are signed in as</Text>
          <Text style={[themedStyles.rowLabel, { fontSize: 17 }]}>{user?.email ?? "Unknown"}</Text>
          <View style={themedStyles.footerActions}>
            <Pressable
              onPress={() => {
                triggerHaptic();
                resetToDefaults();
              }}
              style={themedStyles.resetButton}
              accessibilityRole="button"
              accessibilityLabel="Reset all preferences"
            >
              <Text style={themedStyles.resetText}>Reset preferences</Text>
            </Pressable>
            <Pressable
              style={[themedStyles.destructiveButton, signOutLoading && themedStyles.buttonDisabled]}
              onPress={handleSignOut}
              disabled={signOutLoading}
              accessibilityRole="button"
              accessibilityLabel="Sign out of QuickQuote"
            >
              <Text style={themedStyles.destructiveText}>{signOutLoading ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  inputRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  fieldSpacer: {
    height: 12,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148, 163, 184, 0.4)",
    marginVertical: 4,
  },
});
