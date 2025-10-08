import React, {
  ForwardedRef,
  ReactNode,
  forwardRef,
  memo,
  useMemo,
  useCallback,
} from "react";
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

type FocusEvt = Parameters<NonNullable<TextInputProps["onFocus"]>>[0];
type BlurEvt  = Parameters<NonNullable<TextInputProps["onBlur"]>>[0];

const InputImpl = forwardRef<TextInput, InputProps>(function Input(
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
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Pass-through handlers without triggering local state updates
  const handleFocus = useCallback(
    (e: FocusEvt) => {
      onFocus?.(e);
    },
    [onFocus]
  );
  const handleBlur = useCallback(
    (e: BlurEvt) => {
      onBlur?.(e);
    },
    [onBlur]
  );

  const inputFinalStyle = useMemo(
    () => [styles.input, multiline && styles.multilineInput, inputStyle],
    [styles.input, styles.multilineInput, inputStyle, multiline]
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.fieldShell, multiline && styles.multilineShell, error && styles.errorState]}>
        {leftElement ? <View style={styles.adornment}>{leftElement}</View> : null}

        <TextInput
          ref={ref}
          style={inputFinalStyle}
          placeholderTextColor={theme.colors.mutedText}
          multiline={multiline}
          onFocus={handleFocus}
          onBlur={handleBlur}
          // keep our handlers, then spread remaining props
          {...textInputProps}
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

export const Input = memo(InputImpl);
export default Input;

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { gap: theme.spacing.xs },
    label: { fontSize: 14, fontWeight: "600", color: theme.colors.mutedText },
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
    multilineShell: { alignItems: "flex-start", paddingVertical: theme.spacing.sm },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.colors.secondaryText,
      paddingVertical: Platform.OS === "ios" ? theme.spacing.sm : 0,
      paddingHorizontal: 0,
      textAlignVertical: "center",
    },
    multilineInput: { textAlignVertical: "top", minHeight: theme.spacing.xxl * 3 },
    caption: { fontSize: 12, color: theme.colors.mutedText },
    errorText: { fontSize: 12, color: theme.colors.danger },
    adornment: { justifyContent: "center", alignItems: "center" },
    rightAdornment: { marginLeft: "auto" },
    errorState: { borderColor: theme.colors.danger },
  });
}
