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

jest.mock("@react-native-picker/picker", () => {
  const React = require("react");
  const { View, Pressable, Text } = require("react-native");
  const MockPicker = ({ children, onValueChange }: any) => (
    <View testID="picker">
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) {
          return child;
        }
        return React.cloneElement(child, {
          onSelect: () => onValueChange(child.props.value, index),
        });
      })}
    </View>
  );
  const MockPickerItem = ({ label, value, onSelect }: any) => (
    <Pressable onPress={onSelect} testID={`picker-item-${value ?? "empty"}`}>
      <Text>{label}</Text>
    </Pressable>
  );
  MockPicker.Item = MockPickerItem;
  return { Picker: MockPicker };
});

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
    materialMarkup: 15,
    materialMarkupMode: "percentage" as const,
    laborMarkup: 10,
    laborMarkupMode: "percentage" as const,
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

jest.mock("../lib/savedItems", () => ({
  listSavedItems: jest.fn().mockResolvedValue([]),
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
const mockGetAllAsync = jest.fn();
const mockExecAsync = jest.fn();
const sampleCustomer = {
  id: "cust-123",
  name: "Acme Industries",
  email: "hello@acme.test",
  phone: "555-0100",
  address: "123 Market St",
};
const mockOpenDbResult = {
  runAsync: mockRunAsync,
  getAllAsync: mockGetAllAsync,
  execAsync: mockExecAsync,
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
import { listSavedItems } from "../lib/savedItems";

describe("NewEstimateScreen", () => {
  beforeEach(() => {
    alertSpy.mockClear();
    mockRunAsync.mockReset();
    mockGetAllAsync.mockReset().mockResolvedValue([sampleCustomer]);
    mockExecAsync.mockReset().mockResolvedValue(undefined);
    (openDB as jest.Mock).mockResolvedValue(mockOpenDbResult);
    (queueChange as jest.Mock).mockClear();
    (runSync as jest.Mock).mockClear().mockResolvedValue(undefined);
    mockRouter.replace.mockClear();
    mockRouter.back.mockClear();
    authState.user = { id: "user-123" };
    authState.session = null;
    mockOpenEditor.mockReset();
    (listSavedItems as jest.Mock).mockClear().mockResolvedValue([]);
  });

  it("saves a draft and navigates to the editor when previewing", async () => {
    mockRunAsync.mockResolvedValue(undefined);

    const screen = render(<NewEstimateScreen />);
    const { getByText, findByText } = screen;

    const jobTitleInput = await waitFor(() => {
      const inputs = screen.UNSAFE_getAllByType(TextInput);
      const match = inputs.find(
        (input) => input.props.placeholder === "Describe the work, schedule, and important details",
      );
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Kitchen Remodel");
    const customerRow = await findByText("Acme Industries");
    fireEvent.press(customerRow);
    fireEvent.press(getByText("Save Draft"));

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

    expect(mockRouter.replace).not.toHaveBeenCalled();
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
      const match = inputs.find(
        (input) => input.props.placeholder === "Describe the work, schedule, and important details",
      );
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Roof repair");
    const customerRow = await findByText("Acme Industries");
    fireEvent.press(customerRow);
    fireEvent.press(getByText("Save Draft"));

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
      const match = inputs.find(
        (input) => input.props.placeholder === "Describe the work, schedule, and important details",
      );
      if (!match) {
        throw new Error("Job title input not found");
      }
      return match;
    });
    fireEvent.changeText(jobTitleInput, "Landscaping");
    const customerRow = await findByText("Acme Industries");
    fireEvent.press(customerRow);
    fireEvent.press(getByText("Save Draft"));

    expect(await findByText("You need to be signed in to create a new estimate.")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      "Estimate",
      "You need to be signed in to create a new estimate.",
    );
    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(queueChange).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("prefills a line item when selecting a saved item", async () => {
    (listSavedItems as jest.Mock).mockResolvedValueOnce([
      {
        id: "saved-1",
        user_id: "user-123",
        name: "Premium flooring",
        default_quantity: 3,
        default_unit_price: 42.5,
        default_markup_applicable: 0,
        version: 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    ]);

    const screen = render(<NewEstimateScreen />);
    const savedItemButton = await screen.findByText("Premium flooring");
    fireEvent.press(savedItemButton);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Premium flooring")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("3")).toBeTruthy();
    expect(screen.getByDisplayValue("42.50")).toBeTruthy();
  });
});
