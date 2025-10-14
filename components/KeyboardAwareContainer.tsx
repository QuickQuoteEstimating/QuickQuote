import React, { PropsWithChildren } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ViewStyle,
  ScrollView,
  ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  scrollProps?: Omit<ScrollViewProps, "contentContainerStyle">;
  /** Extra space to ensure the last input / footer isn’t hidden */
  extraBottomInset?: number;
}>;

/**
 * No-deps keyboard container:
 * - iOS: padding; Android: height (works with adjustResize)
 * - Dismiss on outside tap
 * - Keeps taps working while keyboard is up
 * - Adds safe-area aware bottom padding
 */
export default function KeyboardAwareContainer({
  children,
  contentContainerStyle,
  scrollProps,
  extraBottomInset = 100,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = (contentContainerStyle?.paddingBottom as number | undefined) ?? 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollProps}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: bottomPad + insets.bottom + extraBottomInset,
            ...contentContainerStyle,
          }}
        >
          {children}
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}
