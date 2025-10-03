import { Appearance, Platform } from "react-native";

export type ThemeSpacing = {
  none: number;
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type ThemeRadii = {
  none: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  full: number;
};

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  overlay: string;
};

export type Theme = {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radii: ThemeRadii;
};

export type ThemeMode = "light" | "dark";

const spacing: ThemeSpacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const radii: ThemeRadii = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  full: 999,
};

export const light: Theme = {
  mode: "light",
  colors: {
    background: "#F5F7FB",
    surface: "#FFFFFF",
    surfaceAlt: "#EDF1F8",
    border: "#D3DBE8",
    primaryText: "#0B1A37",
    secondaryText: "#1F2933",
    mutedText: "#5B667A",
    accent: "#2D74FF",
    accentSoft: "#E3EDFF",
    success: "#2FBF71",
    successSoft: "#E3F7ED",
    danger: "#EF4444",
    dangerSoft: "#FEE2E2",
    overlay: "rgba(9, 17, 34, 0.4)",
  },
  spacing,
  radii,
};

export const dark: Theme = {
  mode: "dark",
  colors: {
    background: "#0F172A",
    surface: "#16213C",
    surfaceAlt: "#1F2A44",
    border: "#243049",
    primaryText: "#EEF3FF",
    secondaryText: "#E7ECF7",
    mutedText: "#94A3B8",
    accent: "#5A8BFF",
    accentSoft: "#243560",
    success: "#3DD68C",
    successSoft: "#123D2C",
    danger: "#F87171",
    dangerSoft: "#3A1B1B",
    overlay: "rgba(9, 17, 34, 0.65)",
  },
  spacing,
  radii,
};

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
    } as const;
  }

  const resolvedMode: ThemeMode =
    mode ?? (Appearance.getColorScheme() === "dark" ? "dark" : "light");
  const baseOpacity = depth >= 16 ? 0.28 : 0.18;
  const shadowOpacity = resolvedMode === "dark" ? baseOpacity + 0.12 : baseOpacity;
  const height = Math.max(4, Math.round(depth / 3));
  const radius = Math.max(12, Math.round(depth / 2));

  const shadowColor =
    resolvedMode === "dark" ? "rgba(0, 0, 0, 0.6)" : "rgba(15, 23, 42, 0.12)";

  return {
    shadowColor,
    shadowOpacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height },
    elevation: Math.max(4, Math.round(depth / 2)),
  } as const;
}
