module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // 👇 change this line for Reanimated v3
      "react-native-worklets/plugin",
      "expo-router/babel",
    ],
  };
};
