import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, ColorSchemeName } from "react-native";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Haptics from "expo-haptics";

export type ThemePreference = "light" | "dark" | "system";

export type HapticIntensity = 0 | 1 | 2;

export interface SettingsState {
  themePreference: ThemePreference;
  materialMarkup: number;
  laborMarkup: number;
  hourlyRate: number;
  taxRate: number;
  hapticsEnabled: boolean;
  hapticIntensity: HapticIntensity;
  notificationsEnabled: boolean;
  autoSyncEnabled: boolean;
}

interface SettingsContextValue {
  settings: SettingsState;
  isHydrated: boolean;
  resolvedTheme: "light" | "dark";
  setThemePreference: (preference: ThemePreference) => void;
  setMaterialMarkup: (value: number) => void;
  setLaborMarkup: (value: number) => void;
  setHourlyRate: (value: number) => void;
  setTaxRate: (value: number) => void;
  setHapticsEnabled: (value: boolean) => void;
  setHapticIntensity: (value: HapticIntensity) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setAutoSyncEnabled: (value: boolean) => void;
  triggerHaptic: (style?: Haptics.ImpactFeedbackStyle) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS: SettingsState = {
  themePreference: "system",
  materialMarkup: 15,
  laborMarkup: 20,
  hourlyRate: 85,
  taxRate: 8,
  hapticsEnabled: true,
  hapticIntensity: 1,
  notificationsEnabled: true,
  autoSyncEnabled: true,
};

const STORAGE_KEY = "@quickquote/settings";

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isHydrated, setIsHydrated] = useState(false);
  const [systemTheme, setSystemTheme] = useState<ColorSchemeName>(Appearance.getColorScheme());
  const hydrationRef = useRef(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<SettingsState>;
          setSettings((current) => ({ ...current, ...parsed }));
        }
      } catch (error) {
        console.error("Failed to load settings from storage", error);
      } finally {
        hydrationRef.current = true;
        setIsHydrated(true);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!hydrationRef.current) {
      return;
    }

    const persist = async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (error) {
        console.error("Failed to persist settings", error);
      }
    };

    persist();
  }, [settings]);

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (settings.themePreference === "system") {
      return systemTheme === "dark" ? "dark" : "light";
    }

    return settings.themePreference;
  }, [settings.themePreference, systemTheme]);

  const updateSettings = useCallback((updater: Partial<SettingsState> | ((prev: SettingsState) => SettingsState)) => {
    setSettings((prev) => {
      if (typeof updater === "function") {
        return updater(prev);
      }

      return { ...prev, ...updater };
    });
  }, []);

  const setThemePreference = useCallback(
    (preference: ThemePreference) => {
      updateSettings({ themePreference: preference });
    },
    [updateSettings]
  );

  const setMaterialMarkup = useCallback(
    (value: number) => {
      updateSettings({ materialMarkup: Number.isFinite(value) ? Math.max(0, value) : 0 });
    },
    [updateSettings]
  );

  const setLaborMarkup = useCallback(
    (value: number) => {
      updateSettings({ laborMarkup: Number.isFinite(value) ? Math.max(0, value) : 0 });
    },
    [updateSettings]
  );

  const setHourlyRate = useCallback(
    (value: number) => {
      updateSettings({ hourlyRate: Number.isFinite(value) ? Math.max(0, value) : 0 });
    },
    [updateSettings]
  );

  const setTaxRate = useCallback(
    (value: number) => {
      updateSettings({ taxRate: Number.isFinite(value) ? Math.max(0, value) : 0 });
    },
    [updateSettings]
  );

  const setHapticsEnabled = useCallback(
    (value: boolean) => {
      updateSettings({ hapticsEnabled: value });
    },
    [updateSettings]
  );

  const setHapticIntensity = useCallback(
    (value: HapticIntensity) => {
      updateSettings({ hapticIntensity: Math.min(2, Math.max(0, Math.round(value))) as HapticIntensity });
    },
    [updateSettings]
  );

  const setNotificationsEnabled = useCallback(
    (value: boolean) => {
      updateSettings({ notificationsEnabled: value });
    },
    [updateSettings]
  );

  const setAutoSyncEnabled = useCallback(
    (value: boolean) => {
      updateSettings({ autoSyncEnabled: value });
    },
    [updateSettings]
  );

  const triggerHaptic = useCallback(
    (style?: Haptics.ImpactFeedbackStyle) => {
      if (!settings.hapticsEnabled) {
        return;
      }

      const normalizedIntensity = Math.min(2, Math.max(0, Math.round(settings.hapticIntensity)));
      const inferredStyle = (() => {
        switch (normalizedIntensity) {
          case 0:
            return Haptics.ImpactFeedbackStyle.Light;
          case 2:
            return Haptics.ImpactFeedbackStyle.Heavy;
          default:
            return Haptics.ImpactFeedbackStyle.Medium;
        }
      })();

      Haptics.impactAsync(style ?? inferredStyle).catch((error) => {
        console.warn("Unable to trigger haptic feedback", error);
      });
    },
    [settings.hapticsEnabled, settings.hapticIntensity]
  );

  const resetToDefaults = useCallback(() => {
    updateSettings(DEFAULT_SETTINGS);
  }, [updateSettings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
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
      triggerHaptic,
      resetToDefaults,
    }),
    [
      isHydrated,
      resolvedTheme,
      setAutoSyncEnabled,
      setHapticIntensity,
      setHapticsEnabled,
      setLaborMarkup,
      setMaterialMarkup,
      setHourlyRate,
      setTaxRate,
      setNotificationsEnabled,
      setThemePreference,
      settings,
      triggerHaptic,
      resetToDefaults,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }

  return context;
}
