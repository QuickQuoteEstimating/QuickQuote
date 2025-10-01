import { PropsWithChildren, useMemo } from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../theme";

export interface CardProps {
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

export function Card({ children, style, elevated = true }: PropsWithChildren<CardProps>) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme, elevated), [theme, elevated]);

  return <View style={[styles.container, style]}>{children}</View>;
}

function createStyles(
  theme: ReturnType<typeof useTheme>["theme"],
  elevated: boolean,
) {
  const shadow: ViewStyle = elevated
    ? {
        shadowColor: theme.colors.overlay,
        shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.12,
        shadowRadius: theme.spacing.xl,
        shadowOffset: { width: 0, height: theme.spacing.xs },
        elevation: 6,
      }
    : {};

  return StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      gap: theme.spacing.lg,
      ...shadow,
    },
  });
}

export default Card;
