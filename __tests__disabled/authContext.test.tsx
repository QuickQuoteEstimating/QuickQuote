import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { Alert, AppState, AppStateStatus } from "react-native";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { bootstrapUserData } from "../lib/bootstrap";

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock("../lib/bootstrap", () => ({
  bootstrapUserData: jest.fn(),
  clearLocalData: jest.fn(),
}));

type CapturedAuthValue = ReturnType<typeof useAuth>;

type CaptureProps = {
  onValue: (value: CapturedAuthValue) => void;
};

const Capture: React.FC<CaptureProps> = ({ onValue }) => {
  const value = useAuth();

  useEffect(() => {
    onValue(value);
  }, [value, onValue]);

  return null;
};

const mockGetSession = supabase.auth.getSession as jest.Mock;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange as jest.Mock;
const mockBootstrapUserData = bootstrapUserData as jest.Mock;
const mockAppStateAddEventListener = jest.spyOn(AppState, "addEventListener");
const mockAlert = jest.spyOn(Alert, "alert");

const appStateListeners: Array<(state: AppStateStatus) => void> = [];

beforeEach(() => {
  appStateListeners.length = 0;
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-123" } } },
    error: null,
  });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  mockBootstrapUserData.mockReset();
  mockAppStateAddEventListener.mockReset();
  mockAlert.mockReset();
  mockAlert.mockImplementation(jest.fn());
  mockAppStateAddEventListener.mockImplementation(
    (_, listener: (state: AppStateStatus) => void) => {
      appStateListeners.push(listener);
      return {
        remove: () => {
          const index = appStateListeners.indexOf(listener);
          if (index !== -1) {
            appStateListeners.splice(index, 1);
          }
        },
      };
    },
  );
});

afterEach(() => {
  appStateListeners.length = 0;
});

afterAll(() => {
  mockAppStateAddEventListener.mockRestore();
  mockAlert.mockRestore();
});

describe("AuthProvider bootstrap retry logic", () => {
  it("retries bootstrapping when the app returns to the foreground", async () => {
    mockBootstrapUserData
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined);

    let latestValue: CapturedAuthValue | undefined;

    const handleValue = (value: CapturedAuthValue) => {
      latestValue = value;
    };

    render(
      <AuthProvider>
        <Capture onValue={handleValue} />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockBootstrapUserData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(latestValue?.needsBootstrapRetry).toBe(true));

    await act(async () => {
      appStateListeners.forEach((listener) => listener("active"));
    });

    await waitFor(() => expect(mockBootstrapUserData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(latestValue?.needsBootstrapRetry).toBe(false));
  });

  it("allows manual bootstrap retries", async () => {
    mockBootstrapUserData
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined);

    let latestValue: CapturedAuthValue | undefined;

    const handleValue = (value: CapturedAuthValue) => {
      latestValue = value;
    };

    render(
      <AuthProvider>
        <Capture onValue={handleValue} />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockBootstrapUserData).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(latestValue?.needsBootstrapRetry).toBe(true));

    await act(async () => {
      await latestValue?.retryBootstrap();
    });

    await waitFor(() => expect(mockBootstrapUserData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(latestValue?.needsBootstrapRetry).toBe(false));
  });
});
