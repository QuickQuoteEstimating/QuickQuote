import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "QuickQuote",
  slug: "quickquote",
  version: "1.0.0",
  scheme: "quickquote",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
  supportsTablet: true,
  "bundleIdentifier": "com.quickquote.app"
},
android: {
  package: "com.bstreeter.quickquote",
  adaptiveIcon: {
    foregroundImage: "./assets/adaptive-icon.png",
    backgroundColor: "#ffffff",
  },
  softwareKeyboardLayoutMode: "pan", // <— important: avoids jumpy resize issues
  permissions: [],
},

  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [["expo-router"], "expo-secure-store", "expo-sqlite"],
  experiments: {
    ...(config.experiments ?? {}),
    typedRoutes: true,
  },
  extra: {
    ...(config.extra ?? {}),
    eas: {
      projectId: "c054357c-4a4c-4f27-8cf3-f17dba5914be",
    },
  },
});
