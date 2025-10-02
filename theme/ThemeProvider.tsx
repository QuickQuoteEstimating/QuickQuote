import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import { dark, light, type Theme, type ThemeMode } from "./index";

export type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: light,
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(colorScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    if (colorScheme === "dark" || colorScheme === "light") {
      setMode(colorScheme);
    }
  }, [colorScheme]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const theme = mode === "dark" ? dark : light;

    return {
      theme,
      isDark: mode === "dark",
      toggleTheme,
    };
  }, [mode, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  return useContext(ThemeContext);
}
