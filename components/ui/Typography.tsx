import { PropsWithChildren, useMemo } from "react";
import { StyleProp, StyleSheet, Text, TextProps, TextStyle } from "react-native";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";

type TypographyProps = TextProps & {
  style?: StyleProp<TextStyle>;
};

function createStyles(theme: Theme) {
  return StyleSheet.create({
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: theme.colors.primaryText,
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 16,
      fontWeight: "500",
      color: theme.colors.mutedText,
      letterSpacing: 0.2,
    },
    body: {
      fontSize: 14,
      color: theme.colors.secondaryText,
      letterSpacing: 0.1,
      lineHeight: 20,
    },
  });
}

export function Title({ style, children, ...props }: PropsWithChildren<TypographyProps>) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Text accessibilityRole="header" {...props} style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Subtitle({ style, children, ...props }: PropsWithChildren<TypographyProps>) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Text {...props} style={[styles.subtitle, style]}>
      {children}
    </Text>
  );
}

export function Body({ style, children, ...props }: PropsWithChildren<TypographyProps>) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Text {...props} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

export type Typography = {
  Title: typeof Title;
  Subtitle: typeof Subtitle;
  Body: typeof Body;
};
