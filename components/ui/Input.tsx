import { ForwardedRef, ReactNode, forwardRef, useCallback, useMemo, useState } from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

export interface InputProps extends TextInputProps {
  label?: string;
  caption?: string;
  error?: string | null;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    caption,
    error,
    leftElement,
    rightElement,
    containerStyle,
    inputStyle,
    multiline,
    ...textInputProps
  }: InputProps,
  ref: ForwardedRef<TextInput>,
) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isFocused, setFocused] = useState(false);

  const handleFocus = useCallback(
    (event: any) => {
      setFocused(true);
      textInputProps.onFocus?.(event);
    },
    [textInputProps],
  );

  const handleBlur = useCallback(
    (event: any) => {
      setFocused(false);
      textInputProps.onBlur?.(event);
    },
    [textInputProps],
  );

  const fieldState = useMemo(() => {
    if (error) {
      return styles.errorState;
    }
    if (isFocused) {
      return styles.focusedState;
    }
    return null;
  }, [error, isFocused, styles.errorState, styles.focusedState]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.fieldShell, multiline ? styles.multilineShell : null, fieldState]}>
        {leftElement ? <View style={styles.adornment}>{leftElement}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.colors.mutedText}
          {...textInputProps}
          multiline={multiline}
          style={[styles.input, multiline ? styles.multilineInput : null, inputStyle]}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {rightElement ? (
          <View style={[styles.adornment, styles.rightAdornment]}>{rightElement}</View>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!error && caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      gap: theme.spacing.xs,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.mutedText,
    },
    fieldShell: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: theme.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.lg,
      minHeight: theme.spacing.xxl + theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    multilineShell: {
      alignItems: "flex-start",
      paddingVertical: theme.spacing.sm,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.secondaryText,
      paddingVertical: theme.spacing.sm,
    },
    multilineInput: {
      textAlignVertical: "top",
      minHeight: theme.spacing.xxl * 3,
    },
    caption: {
      fontSize: 12,
      color: theme.colors.mutedText,
    },
    errorText: {
      fontSize: 12,
      color: theme.colors.danger,
    },
    adornment: {
      justifyContent: "center",
      alignItems: "center",
    },
    rightAdornment: {
      marginLeft: "auto",
    },
    focusedState: {
      borderColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: Platform.OS === "ios" ? 0.16 : 0,
      shadowOffset: { width: 0, height: theme.spacing.sm },
      shadowRadius: theme.spacing.xl,
    },
    errorState: {
      borderColor: theme.colors.danger,
    },
  });
}

export default Input;
