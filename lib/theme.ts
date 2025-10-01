import { Appearance, Platform } from "react-native";
import { useMemo } from "react";
import { useSettings } from "../context/SettingsContext";

export type ThemeMode = "light" | "dark";

export interface Theme {
  mode: ThemeMode;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  border: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accent: string;
  accentMuted: string;
  highlight: string;
  danger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  shadowColor: string;
  inputBackground: string;
  inputBorder: string;
  overlay: string;
}

export const lightTheme: Theme = {
  mode: "light",
  background: "#F5F6F7",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#E3E6EA",
  border: "#C8CFD8",
  primaryText: "#1F2933",
  secondaryText: "#4B5563",
  mutedText: "#9AA1AB",
  accent: "#005BBB",
  accentMuted: "#7BA8D9",
  highlight: "#F5B700",
  danger: "#D64545",
  dangerSurface: "#FBE9E9",
  success: "#2F9E44",
  successSurface: "#E6F4EA",
  shadowColor: "rgba(15, 23, 42, 0.12)",
  inputBackground: "#FFFFFF",
  inputBorder: "#C8CFD8",
  overlay: "rgba(15, 23, 42, 0.2)",
};

export const darkTheme: Theme = {
  mode: "dark",
  background: "#050B14",
  surface: "#101C2B",
  surfaceElevated: "#142334",
  surfaceSubtle: "#1B2C40",
  border: "#22364C",
  primaryText: "#F8FAFC",
  secondaryText: "#C7D1DC",
  mutedText: "#8091A3",
  accent: "#4D9BFF",
  accentMuted: "#7BA8D9",
  highlight: "#F5B700",
  danger: "#F07171",
  dangerSurface: "rgba(214, 69, 69, 0.22)",
  success: "#5DD38A",
  successSurface: "rgba(47, 158, 68, 0.22)",
  shadowColor: "rgba(0, 0, 0, 0.6)",
  inputBackground: "rgba(16, 28, 43, 0.92)",
  inputBorder: "#244058",
  overlay: "rgba(5, 11, 20, 0.5)",
};

export const theme = lightTheme;
export const palette = lightTheme;

export function getTheme(mode: ThemeMode = "light"): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}

export function useTheme(): Theme {
  const { resolvedTheme } = useSettings();

  return useMemo(() => getTheme(resolvedTheme), [resolvedTheme]);
}

export function cardShadow(
  depth: number = 12,
  mode?: ThemeMode,
): {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
} {
  if (Platform.OS === "web") {
    return {
      shadowColor: "transparent",
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      elevation: 0,
    };
  }

  const resolvedMode: ThemeMode =
    mode ?? (Appearance.getColorScheme() === "dark" ? "dark" : "light");
  const baseOpacity = depth >= 16 ? 0.28 : 0.18;
  const shadowOpacity = resolvedMode === "dark" ? baseOpacity + 0.12 : baseOpacity;
  const height = Math.max(4, Math.round(depth / 3));
  const radius = Math.max(12, Math.round(depth / 2));

  const shadowColor = resolvedMode === "dark" ? darkTheme.shadowColor : lightTheme.shadowColor;

  return {
    shadowColor,
    shadowOpacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height },
    elevation: Math.max(4, Math.round(depth / 2)),
  } as const;
}

export function createTextVariants(currentTheme: Theme) {
  return {
    title: {
      fontSize: 20,
      fontWeight: "700" as const,
      color: currentTheme.primaryText,
    },
    subtitle: {
      fontSize: 14,
      color: currentTheme.secondaryText,
    },
    label: {
      fontSize: 13,
      fontWeight: "600" as const,
      color: currentTheme.secondaryText,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
    },
  } as const;
}

export const textVariants = createTextVariants(lightTheme);
