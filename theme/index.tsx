import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

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

type ThemeContextValue = {
  mode: ThemeMode;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const defaultThemeContext: ThemeContextValue = {
  mode: "light",
  theme: light,
  setMode: () => {},
  toggleMode: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultThemeContext);

export type ThemeProviderProps = {
  children: ReactNode;
  defaultMode?: ThemeMode;
};

export function ThemeProvider({ children, defaultMode = "light" }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = mode === "light" ? light : dark;

    return {
      mode,
      theme,
      setMode,
      toggleMode: () => setMode((prev) => (prev === "light" ? "dark" : "light")),
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
