import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, ColorSchemeName } from "react-native";
import * as Haptics from "expo-haptics";
import type { MarkupMode } from "../lib/estimateMath";

export type ThemePreference = "light" | "dark" | "system";
export type HapticIntensity = 0 | 1 | 2;

export interface CompanyProfile {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  logoUri: string | null;
}

export interface SettingsState {
  themePreference: ThemePreference;
  materialMarkup: number;
  materialMarkupMode: MarkupMode;
  laborMarkup: number;
  laborMarkupMode: MarkupMode;
  hourlyRate: number;
  taxRate: number;
  hapticsEnabled: boolean;
  hapticIntensity: HapticIntensity;
  notificationsEnabled: boolean;
  autoSyncEnabled: boolean;
  companyProfile: CompanyProfile;
  termsAndConditions: string;
  paymentDetails: string;
}

interface SettingsContextValue {
  settings: SettingsState;
  isHydrated: boolean;
  resolvedTheme: "light" | "dark";
  setThemePreference: (v: ThemePreference) => void;
  setMaterialMarkup: (v: number) => void;
  setMaterialMarkupMode: (v: MarkupMode) => void;
  setLaborMarkup: (v: number) => void;
  setLaborMarkupMode: (v: MarkupMode) => void;
  setHourlyRate: (v: number) => void;
  setTaxRate: (v: number) => void;
  setHapticsEnabled: (v: boolean) => void;
  setHapticIntensity: (v: HapticIntensity) => void;
  setNotificationsEnabled: (v: boolean) => void;
  setAutoSyncEnabled: (v: boolean) => void;
  setCompanyProfile: (
    updater: Partial<CompanyProfile> | ((prev: CompanyProfile) => CompanyProfile)
  ) => void;
  setTermsAndConditions: (v: string) => void;
  setPaymentDetails: (v: string) => void;
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => void;
  resetToDefaults: () => void;
}

const DEFAULT_TERMS = [
  "Estimates are valid for 30 days unless otherwise noted.",
  "Work will be scheduled upon approval and receipt of the required deposit.",
  "Any additional work not listed will require a separate change order.",
  "Manufacturer warranties apply to supplied products. Labor is warranted for one year.",
].join("\n");

const DEFAULT_PAYMENT =
  "A deposit may be required prior to scheduling. Final balance is due upon completion.\n\nPlease make payments to QuickQuote Services. We accept major credit cards and checks.";

const DEFAULT_COMPANY: CompanyProfile = {
  name: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  logoUri: null,
};

const DEFAULT_SETTINGS: SettingsState = {
  themePreference: "system",
  materialMarkup: 35,
  materialMarkupMode: "percentage",
  laborMarkup: 20,
  laborMarkupMode: "percentage",
  hourlyRate: 100,
  taxRate: 6.35,
  hapticsEnabled: true,
  hapticIntensity: 1,
  notificationsEnabled: true,
  autoSyncEnabled: true,
  companyProfile: DEFAULT_COMPANY,
  termsAndConditions: DEFAULT_TERMS,
  paymentDetails: DEFAULT_PAYMENT,
};

const STORAGE_KEY = "@quickquote/settings";
const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>({ ...DEFAULT_SETTINGS });
  const [isHydrated, setIsHydrated] = useState(false);
  const [systemTheme, setSystemTheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );
  const hydrationRef = useRef(false);

  // -------- Load settings once --------
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<SettingsState>;
          setSettings((prev) => ({
            ...prev,
            ...parsed,
            companyProfile: { ...prev.companyProfile, ...(parsed.companyProfile ?? {}) },
          }));
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      } finally {
        hydrationRef.current = true;
        setIsHydrated(true);
      }
    })();
  }, []);

  // -------- Watch for system theme changes --------
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  // -------- Debounced persist (prevents router resets while typing) --------
  useEffect(() => {
    if (!hydrationRef.current) return;

    const timeout = setTimeout(async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error("Failed to persist settings", e);
      }
    }, 600); // only write after 600ms of no changes

    return () => clearTimeout(timeout);
  }, [settings]);

  // -------- Derived theme --------
  const resolvedTheme: "light" | "dark" = useMemo(() => {
    if (settings.themePreference === "system") {
      return systemTheme === "dark" ? "dark" : "light";
    }
    return settings.themePreference;
  }, [settings.themePreference, systemTheme]);

  // -------- Generic updater --------
  const updateSettings = useCallback(
    (updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => {
      setSettings((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const mergedCompany =
          next.companyProfile !== undefined
            ? { ...prev.companyProfile, ...next.companyProfile }
            : prev.companyProfile;
        return { ...prev, ...next, companyProfile: mergedCompany };
      });
    },
    []
  );

  // -------- Setter wrappers --------
  const setThemePreference = useCallback(
    (v: ThemePreference) => updateSettings({ themePreference: v }),
    [updateSettings]
  );
  const setMaterialMarkup = useCallback(
    (v: number) => updateSettings({ materialMarkup: Math.max(0, v) }),
    [updateSettings]
  );
  const setMaterialMarkupMode = useCallback(
    (v: MarkupMode) =>
      updateSettings({ materialMarkupMode: v === "flat" ? "flat" : "percentage" }),
    [updateSettings]
  );
  const setLaborMarkup = useCallback(
    (v: number) => updateSettings({ laborMarkup: Math.max(0, v) }),
    [updateSettings]
  );
  const setLaborMarkupMode = useCallback(
    (v: MarkupMode) =>
      updateSettings({ laborMarkupMode: v === "flat" ? "flat" : "percentage" }),
    [updateSettings]
  );
  const setHourlyRate = useCallback(
    (v: number) => updateSettings({ hourlyRate: Math.max(0, v) }),
    [updateSettings]
  );
  const setTaxRate = useCallback(
    (v: number) => updateSettings({ taxRate: Math.max(0, v) }),
    [updateSettings]
  );
  const setHapticsEnabled = useCallback(
    (v: boolean) => updateSettings({ hapticsEnabled: v }),
    [updateSettings]
  );

   const setHapticIntensity = useCallback(
  (v: HapticIntensity) =>
    updateSettings({
      hapticIntensity: Math.min(2, Math.max(0, Math.round(v))) as HapticIntensity,
    }),
  [updateSettings]
  );

  const setNotificationsEnabled = useCallback(
    (v: boolean) => updateSettings({ notificationsEnabled: v }),
    [updateSettings]
  );
  const setAutoSyncEnabled = useCallback(
    (v: boolean) => updateSettings({ autoSyncEnabled: v }),
    [updateSettings]
  );
  const setCompanyProfile = useCallback(
    (
      updater: Partial<CompanyProfile> | ((prev: CompanyProfile) => CompanyProfile)
    ) => {
      updateSettings((prev) => ({
        ...prev,
        companyProfile:
          typeof updater === "function"
            ? updater(prev.companyProfile)
            : { ...prev.companyProfile, ...updater },
      }));
    },
    [updateSettings]
  );
  const setTermsAndConditions = useCallback(
    (v: string) => updateSettings({ termsAndConditions: v }),
    [updateSettings]
  );
  const setPaymentDetails = useCallback(
    (v: string) => updateSettings({ paymentDetails: v }),
    [updateSettings]
  );
  const triggerHaptic = useCallback(
    (style?: Haptics.ImpactFeedbackStyle) => {
      if (!settings.hapticsEnabled) return;
      const lvl = Math.min(2, Math.max(0, Math.round(settings.hapticIntensity)));
      const chosen =
        style ??
        [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy][
          lvl
        ];
      Haptics.impactAsync(chosen).catch(() => {});
    },
    [settings.hapticsEnabled, settings.hapticIntensity]
  );
  const resetToDefaults = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      isHydrated,
      resolvedTheme,
      setThemePreference,
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
    }),
    [settings, isHydrated, resolvedTheme]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
