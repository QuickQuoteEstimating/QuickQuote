import { Platform } from "react-native";

export const palette = {
  background: "#ffffff",
  surface: "#0f1f3d",
  surfaceSubtle: "#152a53",
  border: "rgba(15, 31, 61, 0.35)",
  primaryText: "#ffffff",
  secondaryText: "rgba(255, 255, 255, 0.88)",
  mutedText: "rgba(226, 232, 240, 0.72)",
  accent: "#1b4ab3",
  accentMuted: "#2f5fce",
  danger: "#ef4444",
  success: "#22c55e",
};

export function cardShadow(depth: number = 12) {
  if (Platform.OS === "web") {
    return {};
  }

  const opacity = depth >= 16 ? 0.24 : 0.18;
  const height = Math.max(6, Math.round(depth / 3));
  const radius = Math.max(10, Math.round(depth / 2));

  return {
    shadowColor: "rgba(15, 23, 42, 0.45)",
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
