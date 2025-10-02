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
  surfaceMuted: string;
  primary: string;
  primarySoft: string;
  primaryText: string;
  text: string;
  textMuted: string;
  border: string;
  separator: string;
  highlight: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
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
    surfaceMuted: "#EDF1F8",
    primary: "#2D74FF",
    primarySoft: "#E3EDFF",
    primaryText: "#0B1A37",
    text: "#1F2933",
    textMuted: "#5B667A",
    border: "#D3DBE8",
    separator: "#E4E8F0",
    highlight: "#F5B700",
    success: "#2FBF71",
    successSoft: "#E3F7ED",
    warning: "#F59E0B",
    warningSoft: "#FEF3C7",
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
    surfaceMuted: "#1F2A44",
    primary: "#5A8BFF",
    primarySoft: "#243560",
    primaryText: "#EEF3FF",
    text: "#E7ECF7",
    textMuted: "#94A3B8",
    border: "#243049",
    separator: "#1D2740",
    highlight: "#F5B700",
    success: "#3DD68C",
    successSoft: "#123D2C",
    warning: "#FBBF24",
    warningSoft: "#3B2A11",
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
