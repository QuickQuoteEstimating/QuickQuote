import { PropsWithChildren, useMemo } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export type BadgeTone = "info" | "warning" | "success" | "danger" | "muted";

export interface BadgeProps {
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Badge({ children, tone = "info", style, textStyle }: PropsWithChildren<BadgeProps>) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const toneStyles = styles.tones[tone];

  return (
    <View style={[styles.container, toneStyles.container, style]}>
      <Text style={[styles.label, toneStyles.label, textStyle]}>{children}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  const base = StyleSheet.create({
    container: {
      alignSelf: "flex-start",
      borderRadius: theme.radii.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
  });

  const tones: Record<BadgeTone, { container: ViewStyle; label: TextStyle }> = {
    info: {
      container: { backgroundColor: theme.colors.accentSoft },
      label: { color: theme.colors.accent },
    },
    warning: {
      container: { backgroundColor: theme.colors.accentSoft },
      label: { color: theme.colors.accent },
    },
    success: {
      container: { backgroundColor: theme.colors.successSoft },
      label: { color: theme.colors.success },
    },
    danger: {
      container: { backgroundColor: theme.colors.dangerSoft },
      label: { color: theme.colors.danger },
    },
    muted: {
      container: { backgroundColor: theme.colors.surfaceAlt },
      label: { color: theme.colors.mutedText },
    },
  };

  return { ...base, tones };
}

export default Badge;
