import { useCallback, useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonAlignment = "inline" | "full";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  alignment?: ButtonAlignment;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  alignment = "full",
  leadingIcon,
  trailingIcon,
  style,
  textStyle,
  contentStyle,
  accessibilityLabel,
}: ButtonProps) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDisabled = disabled || loading;
  const handlePress = useCallback(() => {
    if (isDisabled || typeof onPress !== "function") {
      return;
    }

    onPress();
  }, [isDisabled, onPress]);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        alignment === "full" ? styles.fullWidth : null,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>
        {loading ? (
          <ActivityIndicator
            color={
              variant === "primary" || variant === "danger"
                ? theme.colors.surface
                : theme.colors.accent
            }
          />
        ) : (
          <>
            {leadingIcon ? <View style={styles.icon}>{leadingIcon}</View> : null}
            <Text style={[styles.label, styles[`${variant}Label`], textStyle]}>{label}</Text>
            {trailingIcon ? <View style={styles.icon}>{trailingIcon}</View> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    base: {
      borderRadius: theme.radii.lg,
      overflow: "hidden",
      minHeight: 48,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
    },
    icon: {
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      fontSize: 16,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    primary: {
      backgroundColor: theme.colors.accent,
    },
    primaryLabel: {
      color: theme.colors.surface,
    },
    secondary: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accent,
      backgroundColor: "transparent",
    },
    secondaryLabel: {
      color: theme.colors.accent,
    },
    ghost: {
      backgroundColor: "transparent",
    },
    ghostLabel: {
      color: theme.colors.accent,
    },
    danger: {
      backgroundColor: theme.colors.danger,
    },
    dangerLabel: {
      color: theme.colors.surface,
    },
    fullWidth: {
      alignSelf: "stretch",
      width: "100%",
    },
    pressed: {
      opacity: 0.9,
    },
  });
}

export default Button;
