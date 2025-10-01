module.exports = {
  root: true,
  extends: ["@react-native/eslint-config", "plugin:@typescript-eslint/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "prettier"],
  ignorePatterns: ["node_modules/", ".expo/", "coverage/", "dist/", "build/"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", ignoreRestSiblings: true },
    ],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-require-imports": "off",
    "@typescript-eslint/no-shadow": "off",
    "no-void": "off",
    "no-useless-escape": "off",
    "prettier/prettier": "warn",
    "eslint-comments/no-unused-disable": "off",
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/rules-of-hooks": "off",
    "react/no-unstable-nested-components": "off",
  },
};
