const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add .wasm support if not present
config.resolver.assetExts = [...(config.resolver.assetExts || []), "wasm"];
config.resolver.sourceExts = (config.resolver.sourceExts || []).filter(
  (ext) => ext !== "wasm"
);

module.exports = config;
