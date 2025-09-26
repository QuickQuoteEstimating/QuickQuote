import React from "react";
import { render } from "@testing-library/react-native";
import Home from "../app/(tabs)/home";

describe("Home screen", () => {
  it("renders the welcome message", () => {
    const { getByText } = render(<Home />);
    expect(getByText("🏠 Welcome to QuickQuote")).toBeTruthy();
  });
});
