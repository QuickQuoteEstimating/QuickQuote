import { useMemo, type ReactNode } from "react";
import { Platform, Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

type FABPalette = "auto" | "primary" | "highlight";

export interface FABProps {
  icon: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  palette?: FABPalette;
  style?: StyleProp<ViewStyle>;
}

export function FAB({ icon, onPress, accessibilityLabel, palette = "auto", style }: FABProps) {
  const { theme, isDark } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const resolvedPalette =
    palette === "auto" ? (isDark ? "highlight" : "primary") : palette;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[resolvedPalette],
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      {icon}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.full,
      padding: theme.spacing.lg,
      ...Platform.select({
        ios: {
          shadowColor: theme.colors.overlay,
          shadowOpacity: 0.2,
          shadowRadius: theme.spacing.lg,
          shadowOffset: { width: 0, height: theme.spacing.xs },
        },
        default: {
          elevation: 8,
        },
      }),
    },
    primary: {
      backgroundColor: theme.colors.accent,
    },
    highlight: {
      backgroundColor: theme.colors.accentSoft,
    },
    pressed: {
      opacity: 0.9,
    },
  });
}

export default FAB;
