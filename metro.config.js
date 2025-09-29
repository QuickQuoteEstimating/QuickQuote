const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts = config.resolver.assetExts ?? [];
config.resolver.sourceExts = config.resolver.sourceExts ?? [];

if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== "wasm");

module.exports = config;
