module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // DO NOT include 'expo-router/babel' (deprecated since SDK 50)
      'react-native-reanimated/plugin', // must be last
    ],
  };
};
