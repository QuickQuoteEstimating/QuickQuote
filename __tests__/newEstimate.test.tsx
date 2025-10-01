import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, TextInput } from "react-native";

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};

jest.mock("expo-router", () => ({
  __esModule: true,
  router: mockRouter,
  useRouter: () => mockRouter,
}));

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

const authState = {
  user: { id: "user-123" } as { id: string } | null,
  session: null as null,
};

jest.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

const settingsState = {
  settings: {
    hourlyRate: 50,
    taxRate: 8,
  },
  resolvedTheme: "light",
};

jest.mock("../context/SettingsContext", () => ({
  useSettings: () => settingsState,
}));

const mockOpenEditor = jest.fn();

jest.mock("../context/ItemEditorContext", () => ({
  useItemEditor: () => ({
    openEditor: mockOpenEditor,
  }),
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

const mockRunAsync = jest.fn();
const mockOpenDbResult = {
  runAsync: mockRunAsync,
};

jest.mock("../lib/sqlite", () => ({
  __esModule: true,
  openDB: jest.fn(),
  queueChange: jest.fn(),
}));

jest.mock("../lib/sync", () => ({
  runSync: jest.fn().mockResolvedValue(undefined),
}));

import NewEstimateScreen from "../app/(tabs)/estimates/new";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";

describe("NewEstimateScreen", () => {
  beforeEach(() => {
    alertSpy.mockClear();
    mockRunAsync.mockReset();
    (openDB as jest.Mock).mockResolvedValue(mockOpenDbResult);
    (queueChange as jest.Mock).mockClear();
    (runSync as jest.Mock).mockClear().mockResolvedValue(undefined);
    mockRouter.replace.mockClear();
    mockRouter.back.mockClear();
    authState.user = { id: "user-123" };
    authState.session = null;
    mockOpenEditor.mockReset();
  });

  it("saves a draft and navigates to the editor when previewing", async () => {
    mockRunAsync.mockResolvedValue(undefined);

    const screen = render(<NewEstimateScreen />);
    const { getByText } = screen;

    const jobTitleInput = await waitFor(() => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const match = inputs.find((input) => input.props.placeholder === "Describe the job");
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Kitchen Remodel");
    fireEvent.press(getByText("Save & Preview"));

    await waitFor(() => {
      expect(mockRunAsync).toHaveBeenCalled();
    });

    const insertArgs = mockRunAsync.mock.calls[0];
    expect(insertArgs[0]).toContain("INSERT OR REPLACE INTO estimates");

    await waitFor(() => {
      expect(queueChange).toHaveBeenCalledWith(
        "estimates",
        "insert",
        expect.objectContaining({ user_id: "user-123", status: "draft" }),
      );
    });

    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(tabs)/estimates/[id]",
        params: { id: expect.any(String) },
      }),
    );

    expect(alertSpy).not.toHaveBeenCalledWith(
      "Estimate",
      "We couldn't save your estimate. Please try again.",
    );
  });

  it("shows an error message when saving fails", async () => {
    const creationError = new Error("db down");
    mockRunAsync.mockRejectedValueOnce(creationError);

    const screen = render(<NewEstimateScreen />);
    const { getByText, findByText } = screen;

    const jobTitleInput = await waitFor(() => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const match = inputs.find((input) => input.props.placeholder === "Describe the job");
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Roof repair");
    fireEvent.press(getByText("Save & Preview"));

    expect(await findByText("We couldn't save your estimate. Please try again.")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      "Estimate",
      "We couldn't save your estimate. Please try again.",
    );
    expect(queueChange).not.toHaveBeenCalledWith("estimate_items", "insert", expect.anything());
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    authState.user = null;
    authState.session = null;

    const screen = render(<NewEstimateScreen />);
    const { getByText, findByText } = screen;

    const jobTitleInput = await waitFor(() => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const match = inputs.find((input) => input.props.placeholder === "Describe the job");
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Landscaping");
    fireEvent.press(getByText("Save & Preview"));

    expect(await findByText("You need to be signed in to create a new estimate.")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      "Estimate",
      "You need to be signed in to create a new estimate.",
    );
    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(queueChange).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
