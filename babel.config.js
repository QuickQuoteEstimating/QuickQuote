module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Ensure Reanimated uses the official Babel plugin shipped with the
      // library. This keeps Expo SDK 54 in sync with react-native-reanimated
      // v3 and prevents "Cannot find module 'react-native-worklets/plugin'"
      // errors during bundling.
      "react-native-reanimated/plugin",
      "expo-router/babel",
    ],
  };
};
