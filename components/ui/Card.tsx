import { PropsWithChildren, ReactNode, useMemo } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { cardShadow, useTheme } from "../../lib/theme";

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  padding?: number;
}

export function Card({
  children,
  style,
  elevated = true,
  padding = 20,
}: PropsWithChildren<CardProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme, padding, elevated), [theme, padding, elevated]);

  return <View style={[styles.container, style]}>{children}</View>;
}

function createStyles(theme: ReturnType<typeof useTheme>, padding: number, elevated: boolean) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      gap: 16,
      ...(elevated ? cardShadow(14, theme.mode) : {}),
    },
  });
}

export default Card;
