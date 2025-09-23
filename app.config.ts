import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "QuickQuote",
  slug: "quickquote",
  scheme: "quickquote",
  plugins: ["expo-router"]
});
