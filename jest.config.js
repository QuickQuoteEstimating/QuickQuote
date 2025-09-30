module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!(jest-)?react-native|@react-native|expo(nent)?|@expo|@unimodules|unimodules|@react-native-community|@react-navigation/.*|expo-router|uuid)",
  ],
};
