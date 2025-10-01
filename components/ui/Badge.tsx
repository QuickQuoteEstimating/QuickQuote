import { PropsWithChildren, useMemo } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { useTheme } from "../../theme";

export type BadgeTone = "info" | "warning" | "success" | "danger" | "muted";

export interface BadgeProps {
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Badge({ children, style, textStyle }: PropsWithChildren<BadgeProps>) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.label, textStyle]}>{children}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.highlight,
      borderRadius: theme.radii.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.4,
      color: theme.colors.primaryText,
      textTransform: "uppercase",
    },
  });
}

export default Badge;
