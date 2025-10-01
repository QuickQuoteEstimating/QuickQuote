import { Platform } from "react-native";

export const palette = {
  background: "#111c2e",
  surface: "#1c2b48",
  surfaceSubtle: "#243456",
  border: "rgba(100, 116, 139, 0.3)",
  primaryText: "#f8fafc",
  secondaryText: "rgba(226, 232, 240, 0.88)",
  mutedText: "rgba(148, 163, 184, 0.78)",
  accent: "#1e40af",
  accentMuted: "#3b82f6",
  danger: "#f87171",
  success: "#34d399",
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
