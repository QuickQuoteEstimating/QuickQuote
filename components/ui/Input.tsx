import {
  ForwardedRef,
  ReactNode,
  forwardRef,
  useCallback,
  useMemo,
  useState,
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
import { useTheme } from "../../lib/theme";

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
  const theme = useTheme();
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
      <View
        style={[
          styles.fieldShell,
          multiline ? styles.multilineShell : null,
          fieldState,
        ]}
      >
        {leftElement ? <View style={styles.adornment}>{leftElement}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={theme.mutedText}
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

function createStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    container: {
      gap: 6,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.secondaryText,
    },
    fieldShell: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 16,
      minHeight: 52,
      gap: 12,
    },
    multilineShell: {
      alignItems: "flex-start",
      paddingVertical: 12,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.primaryText,
      paddingVertical: 12,
    },
    multilineInput: {
      textAlignVertical: "top",
      minHeight: 100,
    },
    caption: {
      fontSize: 12,
      color: theme.mutedText,
    },
    errorText: {
      fontSize: 12,
      color: theme.danger,
    },
    adornment: {
      justifyContent: "center",
      alignItems: "center",
    },
    rightAdornment: {
      marginLeft: "auto",
    },
    focusedState: {
      borderColor: theme.accent,
      shadowColor: theme.accent,
      shadowOpacity: Platform.OS === "ios" ? 0.16 : 0,
      shadowOffset: { width: 0, height: 6 },
      shadowRadius: 12,
    },
    errorState: {
      borderColor: theme.danger,
    },
  });
}

export default Input;
