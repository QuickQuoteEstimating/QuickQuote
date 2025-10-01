import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { ReactNode, useMemo } from "react";
import { useTheme } from "../../lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonSize = "default" | "small";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  size?: ButtonSize;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  icon,
  trailingIcon,
  style,
  contentStyle,
  textStyle,
  size = "default",
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();

  const styles = useMemo(() => createStyles(theme), [theme]);
  const sizeStyles = size === "small" ? styles.small : styles.default;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        sizeStyles,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={[styles.content, sizeStyles, contentStyle]}>
        {loading ? (
          <ActivityIndicator color={variant === "secondary" ? theme.accent : theme.surface} />
        ) : (
          <>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <Text
              style={[
                styles.label,
                styles[`${variant}Text` as const],
                size === "small" ? styles.smallText : null,
                textStyle,
              ]}
            >
              {label}
            </Text>
            {trailingIcon ? <View style={styles.icon}>{trailingIcon}</View> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    base: {
      borderRadius: 16,
      overflow: "hidden",
    },
    default: {
      minHeight: 56,
    },
    small: {
      minHeight: 44,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
      gap: 10,
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
    smallText: {
      fontSize: 14,
    },
    primary: {
      backgroundColor: theme.accent,
    },
    primaryText: {
      color: theme.surface,
    },
    secondary: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: theme.accent,
    },
    secondaryText: {
      color: theme.accent,
    },
    ghost: {
      backgroundColor: "transparent",
    },
    ghostText: {
      color: theme.primaryText,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.6,
    },
  });
}

export default Button;
