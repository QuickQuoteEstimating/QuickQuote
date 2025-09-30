import { Platform } from "react-native";

export const palette = {
  background: "#f1f5f9",
  surface: "#ffffff",
  surfaceSubtle: "#f8fafc",
  border: "#d0d7e6",
  primaryText: "#0f172a",
  secondaryText: "#475569",
  mutedText: "#64748b",
  accent: "#2563eb",
  accentMuted: "#1d4ed8",
  danger: "#dc2626",
  success: "#16a34a",
};

export function cardShadow(depth: number = 12) {
  if (Platform.OS === "web") {
    return {};
  }

  const opacity = depth >= 16 ? 0.18 : 0.12;
  const height = Math.max(4, Math.round(depth / 3));
  const radius = Math.max(8, Math.round(depth / 2));

  return {
    shadowColor: "rgba(15, 23, 42, 0.35)",
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
