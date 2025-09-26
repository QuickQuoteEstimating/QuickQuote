import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "QuickQuote",
  slug: "quickquote",
  scheme: "quickquote",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    bundleIdentifier: "com.quickquote",
    supportsTablet: true,
  },
  android: {
    package: "com.quickquote", // 👈 correct placement
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  updates: {
    enabled: false, // 👈 disables OTA during dev
    fallbackToCacheTimeout: 0,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
  ],
  platforms: ["ios", "android", "web"],
  assetBundlePatterns: ["**/*"],
});
