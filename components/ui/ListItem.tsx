import { useMemo, type ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export interface ListItemProps {
  title: string;
  subtitle?: string;
  amount?: string;
  badge?: ReactNode;
  rightContent?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  amountStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function ListItem({
  title,
  subtitle,
  amount,
  badge,
  rightContent,
  onPress,
  style,
  titleStyle,
  subtitleStyle,
  amountStyle,
  accessibilityHint,
  accessibilityLabel,
}: ListItemProps) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  let resolvedRightContent: ReactNode | null = rightContent ?? null;
  if (!resolvedRightContent) {
    if (badge) {
      resolvedRightContent = badge;
    } else if (amount) {
      resolvedRightContent = <Text style={[styles.amount, amountStyle]}>{amount}</Text>;
    }
  }
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed ? styles.pressed : null, style]}
      >
        <View style={styles.textColumn}>
          <Text style={[styles.title, titleStyle]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rightColumn}>{resolvedRightContent}</View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.textColumn}>
        <Text style={[styles.title, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.rightColumn}>{resolvedRightContent}</View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      gap: theme.spacing.md,
    },
    pressed: {
      opacity: 0.9,
    },
    textColumn: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    rightColumn: {
      marginLeft: theme.spacing.md,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    title: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.secondaryText,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.mutedText,
    },
    amount: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
  });
}

export default ListItem;
