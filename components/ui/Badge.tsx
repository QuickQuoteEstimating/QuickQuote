import { PropsWithChildren, ReactNode, useMemo } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { useTheme } from "../../lib/theme";

export type BadgeTone = "info" | "warning" | "success" | "danger" | "muted";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: ReactNode;
}

export function Badge({
  children,
  tone = "warning",
  style,
  textStyle,
  icon,
}: PropsWithChildren<BadgeProps>) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.base, styles[tone], style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, styles[`${tone}Text` as const], textStyle]}>{children}</Text>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      gap: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    icon: {
      alignItems: "center",
      justifyContent: "center",
    },
    warning: {
      backgroundColor: theme.highlight,
    },
    warningText: {
      color: theme.primaryText,
    },
    info: {
      backgroundColor: theme.accentMuted,
    },
    infoText: {
      color: theme.surface,
    },
    success: {
      backgroundColor: theme.successSurface,
    },
    successText: {
      color: theme.success,
    },
    danger: {
      backgroundColor: theme.dangerSurface,
    },
    dangerText: {
      color: theme.danger,
    },
    muted: {
      backgroundColor: theme.surfaceSubtle,
    },
    mutedText: {
      color: theme.secondaryText,
    },
  });
}

export default Badge;
