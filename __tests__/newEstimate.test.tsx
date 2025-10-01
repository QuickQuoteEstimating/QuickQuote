import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

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
  });

  it("creates a draft estimate and redirects to the editor", async () => {
    mockRunAsync.mockResolvedValue(undefined);

    render(<NewEstimateScreen />);

    await waitFor(() => {
      expect(mockRunAsync).toHaveBeenCalledTimes(1);
    });

    const insertArgs = mockRunAsync.mock.calls[0];
    expect(insertArgs[0]).toContain("INSERT OR REPLACE INTO estimates");

    expect((queueChange as jest.Mock).mock.calls[0]).toEqual(
      expect.arrayContaining([
        "estimates",
        "insert",
        expect.objectContaining({
          user_id: "user-123",
          status: "draft",
          total: 0,
        }),
      ]),
    );

    expect(mockRouter.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/(tabs)/estimates/[id]",
        params: { id: expect.any(String) },
      }),
    );

    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("shows an error message when creation fails", async () => {
    const creationError = new Error("db down");
    mockRunAsync.mockRejectedValueOnce(creationError);

    render(<NewEstimateScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(queueChange).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  it("requires an authenticated user", async () => {
    authState.user = null;

    const { getByText } = render(<NewEstimateScreen />);

    await waitFor(() => {
      expect(getByText("Unable to create an estimate")).toBeTruthy();
      expect(getByText("You need to be signed in to create a new estimate.")).toBeTruthy();
    });

    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(queueChange).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
