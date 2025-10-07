import React, {
  ForwardedRef,
  ReactNode,
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  Platform,
  NativeSyntheticEvent,
  TextInputFocusEventData,
  FocusEvent,
  BlurEvent,
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
    onFocus,
    onBlur,
    ...textInputProps
  }: InputProps,
  ref: ForwardedRef<TextInput>
) {
  const { theme } = useThemeContext();
  const [isFocused, setFocused] = useState(false);
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ✅ Correctly typed handlers for React Native (avoids web FocusEvent conflicts)
  const handleFocus: TextInputProps["onFocus"] = useCallback(
    (event: FocusEvent) => {
      setFocused(true);
      onFocus?.(event);
    },
    [onFocus]
  );

  const handleBlur: TextInputProps["onBlur"] = useCallback(
    (event: BlurEvent) => {
      setFocused(false);
      onBlur?.(event);
    },
    [onBlur]
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View
        style={[
          styles.fieldShell,
          multiline && styles.multilineShell,
          isFocused && styles.focusedState,
          error && styles.errorState,
        ]}
      >
        {leftElement ? <View style={styles.adornment}>{leftElement}</View> : null}

        <TextInput
          ref={ref}
          style={[styles.input, multiline && styles.multilineInput, inputStyle]}
          placeholderTextColor={theme.colors.mutedText}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...textInputProps}
        />

        {rightElement ? (
          <View style={[styles.adornment, styles.rightAdornment]}>
            {rightElement}
          </View>
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
      paddingVertical: Platform.OS === "ios" ? theme.spacing.sm : 0,
      paddingHorizontal: 0,
      textAlignVertical: "center",
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
      shadowOpacity: Platform.OS === "ios" ? 0.1 : 0,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
    },
    errorState: {
      borderColor: theme.colors.danger,
    },
  });
}
Input.displayName = "Input";
export default React.memo(Input);

