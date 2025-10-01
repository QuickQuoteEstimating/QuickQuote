import { Platform } from "react-native";

export const palette = {
  background: "#0b1220",
  surface: "#16213a",
  surfaceSubtle: "#1b2742",
  border: "rgba(148, 163, 184, 0.18)",
  primaryText: "#f8fafc",
  secondaryText: "rgba(226, 232, 240, 0.8)",
  mutedText: "rgba(148, 163, 184, 0.7)",
  accent: "#38bdf8",
  accentMuted: "#0ea5e9",
  danger: "#f87171",
  success: "#34d399",
};

export function cardShadow(depth: number = 12) {
  if (Platform.OS === "web") {
    return {};
  }

  const opacity = depth >= 16 ? 0.28 : 0.2;
  const height = Math.max(6, Math.round(depth / 3));
  const radius = Math.max(10, Math.round(depth / 2));

  return {
    shadowColor: "rgba(8, 47, 73, 0.65)",
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height: height },
    elevation: Math.max(4, Math.round(depth / 4)),
  } as const;
}

export const textVariants = {
  title: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: palette.primaryText,
  },
  subtitle: {
    fontSize: 14,
    color: palette.secondaryText,
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: palette.secondaryText,
    textTransform: "uppercase" as const,
  },
};
