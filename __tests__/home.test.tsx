import React from "react";
import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useFocusEffect: (effect: () => void) => {
      React.useEffect(effect, []);
    },
  };
});

jest.mock("../theme", () => {
  const actual = jest.requireActual("../theme");
  return {
    ...actual,
    useTheme: () => ({
      mode: "light" as const,
      theme: actual.light,
      setMode: jest.fn(),
      toggleMode: jest.fn(),
    }),
  };
});

import Home from "../app/(tabs)/home";

describe("Home screen", () => {
  it("renders the welcome message", async () => {
    const { findByText } = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <Home />
      </SafeAreaProvider>,
    );
    await expect(findByText("Good to see you")).resolves.toBeTruthy();
  });
});
