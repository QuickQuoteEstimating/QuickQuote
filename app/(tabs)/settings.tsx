import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import { Slider } from "@miblanchard/react-native-slider";

import { Badge, Button, Card, Input, ListItem } from "../../components/ui";
import LogoPicker from "../../components/LogoPicker";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import type { HapticIntensity } from "../../context/SettingsContext";
import type { MarkupMode } from "../../lib/estimateMath";
import type { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import { resetLocalDatabase } from "../../lib/sqlite";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { openDB } from "../../lib/sqlite";
import * as Print from "expo-print";
import { renderEstimatePdf } from "../../lib/pdf";


const HAPTIC_LABELS = ["Subtle", "Balanced", "Bold"];

export default function Settings() {
  const [sliderValue, setSliderValue] = useState<number>(0.5);
  const { theme, isDark, toggleTheme } = useThemeContext();
  const { user, signOut, signOutLoading, needsBootstrapRetry } = useAuth();
  const {
    settings,
    isHydrated,
    setMaterialMarkup,
    setMaterialMarkupMode,
    setLaborMarkup,
    setLaborMarkupMode,
    setHourlyRate,
    setTaxRate,
    setHapticsEnabled,
    setHapticIntensity,
    setNotificationsEnabled,
    setAutoSyncEnabled,
    setCompanyProfile,
    setTermsAndConditions,
    setPaymentDetails,
    triggerHaptic,
    resetToDefaults,
  } = useSettings();

  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const formatMarkupInput = useCallback((value: number, mode: MarkupMode) => {
    if (mode === "flat") {
      return Math.max(0, value).toFixed(2);
    }
    const safe = Math.max(0, value);
    return safe % 1 === 0 ? safe.toFixed(0) : safe.toString();
  }, []);

  const [materialMarkupInput, setMaterialMarkupInput] = useState(
    formatMarkupInput(settings.materialMarkup, settings.materialMarkupMode),
  );
  const [laborMarkupInput, setLaborMarkupInput] = useState(
    formatMarkupInput(settings.laborMarkup, settings.laborMarkupMode),
  );
  const [hourlyRateInput, setHourlyRateInput] = useState(settings.hourlyRate.toFixed(2));
  const [taxRateInput, setTaxRateInput] = useState(() =>
    settings.taxRate % 1 === 0 ? settings.taxRate.toFixed(0) : settings.taxRate.toString(),
  );
  const [isEditingTaxRate, setIsEditingTaxRate] = useState(false);

  useEffect(() => {
    setMaterialMarkupInput(formatMarkupInput(settings.materialMarkup, settings.materialMarkupMode));
  }, [formatMarkupInput, settings.materialMarkup, settings.materialMarkupMode]);

  useEffect(() => {
    setLaborMarkupInput(formatMarkupInput(settings.laborMarkup, settings.laborMarkupMode));
  }, [formatMarkupInput, settings.laborMarkup, settings.laborMarkupMode]);

  useEffect(() => {
    setHourlyRateInput(settings.hourlyRate.toFixed(2));
  }, [settings.hourlyRate]);

  useEffect(() => {
    setTaxRateInput(
      settings.taxRate % 1 === 0 ? settings.taxRate.toFixed(0) : settings.taxRate.toString(),
    );
  }, [settings.taxRate]);

  const hapticLabel = HAPTIC_LABELS[settings.hapticIntensity] ?? HAPTIC_LABELS[1];

  const handleUpdateMarkup = useCallback(
    (value: string, mode: MarkupMode, updater: (parsed: number) => void) => {
      const normalized = value.replace(/[^0-9.]/g, "");
      const parsed = Number.parseFloat(normalized);
      if (Number.isNaN(parsed)) {
        updater(0);
        return;
      }

      if (mode === "flat") {
        updater(Math.max(0, Math.round(parsed * 100) / 100));
        return;
      }

      updater(Math.max(0, Math.min(parsed, 1000)));
    },
    [],
  );

  const handleUpdateHourlyRate = useCallback(
    (value: string) => {
      const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
      if (Number.isNaN(parsed)) {
        setHourlyRate(0);
        return;
      }

      setHourlyRate(Math.max(0, Math.round(parsed * 100) / 100));
    },
    [setHourlyRate],
  );

  const handleUpdateTaxRate = useCallback(
    (value: string) => {
      const normalized = value.replace(/[^0-9.]/g, "");
      const parsed = Number.parseFloat(normalized);
      if (Number.isNaN(parsed)) {
        setTaxRate(0);
        return;
      }

      const clamped = Math.max(0, Math.min(parsed, 100));
      setTaxRate(clamped);
    },
    [setTaxRate],
  );

  const handleSavePreferences = useCallback(() => {
    triggerHaptic();
    Alert.alert("Preferences saved", "Your settings have been updated.");
  }, [triggerHaptic]);

  const handleResetPreferences = useCallback(() => {
    triggerHaptic();
    resetToDefaults();
  }, [resetToDefaults, triggerHaptic]);

  const handleSignOut = useCallback(() => {
    triggerHaptic();
    void signOut();
  }, [signOut, triggerHaptic]);

  const accountName =
    (user?.user_metadata as { full_name?: string } | null)?.full_name ??
    user?.email?.split("@")[0] ??
    "QuickQuote";
  const accountEmail = user?.email ?? "Unknown";
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    "N/A";
  const environment = __DEV__ ? "Development" : "Production";

  if (!user) return null; // Prevent redirect/flicker while reloading session

  if (!isHydrated) {
    return (
      <View style={[styles.loadingContainer]}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading your preferences…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Card>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.accountHeader}>
          <View style={styles.avatarShell}>
            <Image source={require("../../assets/icon.png")} style={styles.avatarImage} />
          </View>
          <View style={styles.accountDetails}>
            <Text style={styles.accountName}>{accountName}</Text>
            <Text style={styles.accountEmail}>{accountEmail}</Text>
          </View>
        </View>
<Text style={styles.mutedText}>Signed in via Supabase</Text>

        <View style={styles.sectionDivider} />
        <Text style={styles.sectionHeading}>Company profile</Text>
        <LogoPicker
          value={settings.companyProfile.logoUri}
          onChange={(uri) => setCompanyProfile({ logoUri: uri })}
        />
        <View style={styles.fieldGroup}>
          <Input
            label="Company name"
            value={settings.companyProfile.name}
            onChangeText={(text) => setCompanyProfile((prev) => ({ ...prev, name: text }))}
            placeholder="QuickQuote Construction"
          />
          <Input
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={settings.companyProfile.email}
            onChangeText={(text) => setCompanyProfile((prev) => ({ ...prev, email: text }))}
            placeholder="hello@quickquote.com"
          />
          <Input
            label="Phone"
            keyboardType="phone-pad"
            value={settings.companyProfile.phone}
            onChangeText={(text) => setCompanyProfile((prev) => ({ ...prev, phone: text }))}
            placeholder="(555) 123-4567"
          />
          <Input
            label="Website"
            autoCapitalize="none"
            value={settings.companyProfile.website}
            onChangeText={(text) => setCompanyProfile((prev) => ({ ...prev, website: text }))}
            placeholder="quickquote.com"
          />
          <Input
            label="Address"
            multiline
            value={settings.companyProfile.address}
            onChangeText={(text) => setCompanyProfile((prev) => ({ ...prev, address: text }))}
            placeholder="123 Main Street, Springfield, USA"
          />
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Preferences</Text>
        <View style={styles.listGroup}>
          <ListItem
            title="Haptic feedback"
            subtitle={settings.hapticsEnabled ? `Intensity: ${hapticLabel}` : "Currently disabled"}
            badge={
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={(value) => {
                  setHapticsEnabled(value);
                  triggerHaptic();
                }}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor={theme.colors.surface}
              />
            }
            style={styles.listItem}
          />
          {settings.hapticsEnabled ? (
            <View style={styles.sliderSection}>
              <Text style={styles.sliderLabel}>Adjust how strong interactions should feel.</Text>
              <Slider
  minimumValue={0}
  maximumValue={HAPTIC_LABELS.length - 1}
  step={1}
  value={[settings.hapticIntensity]} // wrap in array
  onSlidingComplete={(valueArray: number[] | number) => {
    const intensity = Array.isArray(valueArray)
      ? Math.round(valueArray[0])
      : Math.round(valueArray);
    setHapticIntensity(intensity as HapticIntensity);
    triggerHaptic();
  }}
  minimumTrackTintColor={theme.colors.accent}
  maximumTrackTintColor={theme.colors.border}
/>

            </View>
          ) : null}
          <View style={styles.listDivider} />
          <ListItem
            title="Email notifications"
            subtitle="Receive a daily digest of estimate activity."
            badge={
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={(value) => {
                  setNotificationsEnabled(value);
                  triggerHaptic();
                }}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor={theme.colors.surface}
              />
            }
            style={styles.listItem}
          />
          <View style={styles.listDivider} />
          <ListItem
            title="Auto-sync data"
            subtitle="Refresh estimates automatically when opening the app."
            badge={
              <Switch
                value={settings.autoSyncEnabled}
                onValueChange={(value) => {
                  setAutoSyncEnabled(value);
                  triggerHaptic();
                }}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor={theme.colors.surface}
              />
            }
            style={styles.listItem}
          />
<View style={styles.listDivider} />
</View>
{/* ===== Pricing Settings ===== */}
<View style={{ marginTop: 20, padding: 16, backgroundColor: theme.colors.surface, borderRadius: 8 }}>
  <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 4 }}>Pricing Settings</Text>
  <Text style={{ color: "#666", marginBottom: 12 }}>
    These values are used for your internal calculations only. Customers never see them.
  </Text>

  {/* Sales Tax */}
  <ListItem
    title="Default Tax Rate"
    subtitle="How new estimates handle sales tax."
    onPress={() => setIsEditingTaxRate((prev) => !prev)}
    badge={
      <Badge style={styles.badge} textStyle={styles.badgeTextMuted}>
        {`${settings.taxRate}%`}
      </Badge>
    }
    style={styles.listItem}
  />
  {isEditingTaxRate ? (
    <Input
      label="Sales Tax Percentage"
      value={taxRateInput}
      onChangeText={setTaxRateInput}
      onBlur={() => handleUpdateTaxRate(taxRateInput)}
      keyboardType="decimal-pad"
      rightElement={<Text style={styles.inputAdornment}>%</Text>}
      style={{ marginTop: 8 }}
    />
  ) : null}

  {/* Hourly Rate */}
  <Input
    label="Default Hourly Rate"
    placeholder="e.g. 85.00"
    keyboardType="decimal-pad"
    value={hourlyRateInput}
    onChangeText={setHourlyRateInput}
    onBlur={() => handleUpdateHourlyRate(hourlyRateInput)}
    leftElement={<Text style={styles.inputAdornment}>$</Text>}
    style={{ marginTop: 20 }}
  />

  {/* Markup Settings */}
  <View style={styles.inlineFieldGroup}>
    <View style={styles.markupGroup}>
      <Input
        label={`Material Markup (${settings.materialMarkupMode === "percentage" ? "%" : "$"})`}
        value={materialMarkupInput}
        onChangeText={setMaterialMarkupInput}
        onBlur={() =>
          handleUpdateMarkup(
            materialMarkupInput,
            settings.materialMarkupMode,
            setMaterialMarkup
          )
        }
        keyboardType="decimal-pad"
        leftElement={
          settings.materialMarkupMode === "flat" ? (
            <Text style={styles.inputAdornment}>$</Text>
          ) : undefined
        }
        rightElement={
          settings.materialMarkupMode === "percentage" ? (
            <Text style={styles.inputAdornment}>%</Text>
          ) : undefined
        }
      />
      <Button
        label={
          settings.materialMarkupMode === "percentage"
            ? "Use flat markup"
            : "Use percentage markup"
        }
        variant="ghost"
        alignment="inline"
        onPress={() => {
          const nextMode: MarkupMode =
            settings.materialMarkupMode === "percentage" ? "flat" : "percentage";
          setMaterialMarkupMode(nextMode);
          setMaterialMarkupInput(
            formatMarkupInput(settings.materialMarkup, nextMode)
          );
        }}
        style={styles.markupToggle}
        textStyle={styles.markupToggleLabel}
      />
    </View>

    <View style={styles.markupGroup}>
      <Input
        label={`Labor Markup (${settings.laborMarkupMode === "percentage" ? "%" : "$"})`}
        value={laborMarkupInput}
        onChangeText={setLaborMarkupInput}
        onBlur={() =>
          handleUpdateMarkup(
            laborMarkupInput,
            settings.laborMarkupMode,
            setLaborMarkup
          )
        }
        keyboardType="decimal-pad"
        leftElement={
          settings.laborMarkupMode === "flat" ? (
            <Text style={styles.inputAdornment}>$</Text>
          ) : undefined
        }
        rightElement={
          settings.laborMarkupMode === "percentage" ? (
            <Text style={styles.inputAdornment}>%</Text>
          ) : undefined
        }
      />
      <Button
        label={
          settings.laborMarkupMode === "percentage"
            ? "Use flat markup"
            : "Use percentage markup"
        }
        variant="ghost"
        alignment="inline"
        onPress={() => {
          const nextMode: MarkupMode =
            settings.laborMarkupMode === "percentage" ? "flat" : "percentage";
          setLaborMarkupMode(nextMode);
          setLaborMarkupInput(
            formatMarkupInput(settings.laborMarkup, nextMode)
          );
        }}
        style={styles.markupToggle}
        textStyle={styles.markupToggleLabel}
      />
    </View>
  </View>
</View>


{/* ===== Theme Settings ===== */}
<View style={styles.buttonRow}>
  <Button
    label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    alignment="inline"
    onPress={toggleTheme}
  />
</View>

        <Text style={styles.sectionHeading}>Estimate fine print</Text>
        <Input
          label="Terms & conditions"
          value={settings.termsAndConditions}
          onChangeText={setTermsAndConditions}
          multiline
          placeholder="List each term on a new line"
          caption="Each new line becomes a bullet point on the PDF."
        />
        <Input
          label="Payment details"
          value={settings.paymentDetails}
          onChangeText={setPaymentDetails}
          multiline
          placeholder="Add payment instructions"
          caption="Use blank lines to create new paragraphs."
        />
        <View style={styles.buttonRow}>
          <Button label="Save changes" onPress={handleSavePreferences} />
          <Button label="Reset to defaults" variant="secondary" onPress={handleResetPreferences} />
        </View>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Data & Sync</Text>
        <ListItem
          title="Sync status"
          subtitle={
            needsBootstrapRetry
              ? "We couldn't refresh data automatically. Try again when you're back online."
              : "Your workspace is up to date."
          }
          badge={
            <Badge
              style={[
                styles.badge,
                needsBootstrapRetry ? styles.badgeWarning : styles.badgeSuccess,
              ]}
              textStyle={needsBootstrapRetry ? styles.badgeTextWarning : styles.badgeTextSuccess}
            >
              {needsBootstrapRetry ? "Offline" : "Online"}
            </Badge>
          }
          style={styles.listItem}
        />
        <View style={styles.listDivider} />
        <ListItem
          title="Backup now"
          subtitle="Trigger a manual sync to Supabase."
          onPress={() => Alert.alert("Coming soon", "Manual backups will arrive in a future update.")}
          badge={<Badge style={styles.badge} textStyle={styles.badgeTextMuted}>TODO</Badge>}
          style={styles.listItem}
        />
        <View style={styles.listDivider} />
        <ListItem
  title="Export data (PDF/CSV)"
  subtitle="Create a report of your quotes and customers."
  onPress={async () => {
    try {
      const db = await openDB();

      // --- Export customers as CSV ---
      const customers = await db.getAllAsync<any>(
        `SELECT name, phone, email, address, notes FROM customers WHERE deleted_at IS NULL`
      );
      const customerCsvHeader = "Name,Phone,Email,Address,Notes\n";
      const customerCsvRows = customers
        .map(c =>
          [
            c.name ?? "",
            c.phone ?? "",
            c.email ?? "",
            c.address ?? "",
            (c.notes ?? "").replace(/\n/g, " "),
          ]
            .map(v => `"${v.replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");
      const csvContent = customerCsvHeader + customerCsvRows;

      // Save CSV to local file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const documentDir =
  (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory ?? "";
const fileUri = `${documentDir}quickquote-export-${timestamp}.csv`;
await FileSystem.writeAsStringAsync(fileUri, csvContent, {
  encoding: (FileSystem as any).EncodingType?.UTF8 ?? "utf8",
});

      // Try to share
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv" });
      } else {
        Alert.alert("Export complete", `File saved to: ${fileUri}`);
      }
    } catch (err) {
      console.error("Export failed", err);
      Alert.alert("Export failed", "We couldn’t export your data. Please try again.");
    }
  }}
  badge={<Badge style={styles.badge} textStyle={styles.badgeTextSuccess}>LIVE</Badge>}
  style={styles.listItem}
/>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>About QuickQuote</Text>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>{appVersion}</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Build</Text>
          <Text style={styles.aboutValue}>{buildNumber}</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Environment</Text>
          <Text style={styles.aboutValue}>{environment}</Text>
        </View>
        <ListItem
          title="Help & FAQ"
          subtitle="Browse documentation, tips, and troubleshooting."
          onPress={() => Alert.alert("Help center", "A dedicated help center is coming soon.")}
          badge={<Badge style={styles.badge} textStyle={styles.badgeTextMuted}>TODO</Badge>}
          style={styles.listItem}
        />
        <Text style={styles.mutedText}>
          Need a hand right away? Email us at info.quickquote@gmail.com and we'll get back within one
          business day.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Danger zone</Text>
        <Button
          label={signOutLoading ? "Signing out…" : "Sign out"}
          variant="danger"
          loading={signOutLoading}
          onPress={handleSignOut}
          accessibilityLabel="Sign out of QuickQuote"
        />
      </Card>

      <Card>
  <Text style={styles.cardTitle}>Developer Tools</Text>
  <Button
    label="🧹 Reset Local DB"
    variant="secondary"
    onPress={() => {
      Alert.alert(
        "Reset Local Database",
        "This will delete your local data and rebuild from scratch.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            style: "destructive",
            onPress: async () => {
              await resetLocalDatabase();
              Alert.alert("Database reset complete", "Restart the app to reload cleanly.");
            },
          },
        ]
      );
    }}
  />
</Card>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    contentContainer: {
      padding: theme.spacing.xl,
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl * 1.5,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.md,
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      fontSize: 16,
      color: theme.colors.mutedText,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.secondaryText,
    },
    accountHeader: {
      flexDirection: "row",
      gap: theme.spacing.lg,
      alignItems: "center",
    },
    avatarShell: {
      width: 56,
      height: 56,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    avatarImage: {
      width: 40,
      height: 40,
      resizeMode: "contain",
    },
    accountDetails: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    accountName: {
      fontSize: 17,
      fontWeight: "700",
      color: theme.colors.secondaryText,
    },
    accountEmail: {
      fontSize: 15,
      color: theme.colors.mutedText,
    },
    mutedText: {
      fontSize: 14,
      color: theme.colors.mutedText,
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    sectionHeading: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.secondaryText,
    },
    fieldGroup: {
      gap: theme.spacing.md,
    },
    listGroup: {
      borderRadius: theme.radii.md,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    listItem: {
      backgroundColor: theme.colors.surface,
      borderRadius: 0,
      paddingHorizontal: theme.spacing.xl,
    },
    listDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginLeft: theme.spacing.xl,
      marginRight: theme.spacing.xl,
    },
    sliderSection: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    sliderLabel: {
      fontSize: 13,
      color: theme.colors.mutedText,
    },
    inputAdornment: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.mutedText,
    },
    inlineFieldGroup: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    markupGroup: {
      gap: theme.spacing.xs,
    },
    markupToggle: {
      alignSelf: "flex-start",
      paddingHorizontal: 0,
    },
    markupToggleLabel: {
      fontSize: 13,
      color: theme.colors.accent,
    },
    buttonRow: {
      flexDirection: "column",
      gap: theme.spacing.md,
    },
    badge: {
      backgroundColor: theme.colors.surfaceAlt,
    },
    badgeSuccess: {
      backgroundColor: theme.colors.successSoft,
    },
    badgeWarning: {
      backgroundColor: theme.colors.accentSoft,
    },
    badgeTextMuted: {
      color: theme.colors.mutedText,
    },
    badgeTextSuccess: {
      color: theme.colors.success,
    },
    badgeTextWarning: {
      color: theme.colors.accent,
    },
    aboutRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    aboutLabel: {
      fontSize: 14,
      color: theme.colors.mutedText,
    },
    aboutValue: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.colors.secondaryText,
    },
  });
}