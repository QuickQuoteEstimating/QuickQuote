import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Button } from "../components/ui";
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
const mockUpsertSavedItem = jest.fn();

jest.mock("../context/ItemEditorContext", () => ({
  useItemEditor: () => ({
    openEditor: mockOpenEditor,
  }),
}));

jest.mock("../lib/savedItems", () => ({
  listSavedItems: jest.fn().mockResolvedValue([]),
  upsertSavedItem: (...args: any[]) => mockUpsertSavedItem(...args),
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
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    mockRouter.back.mockClear();
    authState.user = { id: "user-123" };
    authState.session = null;
    mockOpenEditor.mockReset();
    (listSavedItems as jest.Mock).mockClear().mockResolvedValue([]);
    mockUpsertSavedItem.mockReset().mockResolvedValue({
      id: "saved-1",
      user_id: "user-123",
      name: "Test item",
      default_quantity: 2,
      default_unit_price: 50,
      default_markup_applicable: 1,
      version: 1,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
      deleted_at: null,
    });
  });

  it("renders markup totals when adding a line item", async () => {
    const screen = render(<NewEstimateScreen />);

    fireEvent.press(screen.getByLabelText("Add line item"));
    await waitFor(() => {
      expect(mockOpenEditor).toHaveBeenCalled();
    });

    const addConfig = mockOpenEditor.mock.calls.pop()?.[0];
    await act(async () => {
      await addConfig?.onSubmit({
        values: {
          description: "Test item",
          quantity: 2,
          unit_price: 50,
          apply_markup: true,
          base_total: 100,
          total: 115,
        },
        saveToLibrary: false,
        templateId: null,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Test item")).toBeTruthy();
    });
    expect(screen.getByText("Qty: 2 @ $57.50")).toBeTruthy();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(screen.getByText("$15.00")).toBeTruthy();
  });

  it("shows a validation message when no customer is selected", async () => {
    const screen = render(<NewEstimateScreen />);

    const saveButton = screen
      .UNSAFE_getAllByType(Button)
      .find((instance) => instance.props.label === "Save & Continue");
    await act(async () => {
      await saveButton?.props.onPress?.();
    });

    expect(screen.getByText("Select a customer before saving.")).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("saves new line items to the library when requested", async () => {
    const screen = render(<NewEstimateScreen />);

    fireEvent.press(screen.getByLabelText("Add line item"));
    await waitFor(() => {
      expect(mockOpenEditor).toHaveBeenCalled();
    });

    const addConfig = mockOpenEditor.mock.calls.pop()?.[0];
    await act(async () => {
      await addConfig?.onSubmit({
        values: {
          description: "Library item",
          quantity: 3,
          unit_price: 25,
          apply_markup: true,
          base_total: 75,
          total: 86.25,
        },
        saveToLibrary: true,
        templateId: null,
      });
    });

    await waitFor(() => {
      expect(mockUpsertSavedItem).toHaveBeenCalledWith({
        id: undefined,
        userId: "user-123",
        name: "Library item",
        unitPrice: 25,
        defaultQuantity: 3,
        markupApplicable: true,
      });
      expect(screen.getByText("Add from saved items")).toBeTruthy();
    });
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
    const customerPressable = customerRow.parent?.parent ?? customerRow;
    fireEvent.press(customerPressable);
    await waitFor(() => {
      expect(screen.getByText("Change")).toBeTruthy();
    });
    fireEvent.press(screen.getByLabelText("Add line item"));
    await waitFor(() => {
      expect(mockOpenEditor).toHaveBeenCalled();
    });
    const unauthConfig = mockOpenEditor.mock.calls.pop()?.[0];
    if (unauthConfig) {
      await act(async () => {
        await unauthConfig.onSubmit({
          values: {
            description: "Auth item",
            quantity: 1,
            unit_price: 75,
            apply_markup: true,
            base_total: 75,
            total: 86.25,
          },
          saveToLibrary: false,
          templateId: null,
        });
      });
    }
    await waitFor(() => {
      expect(screen.getByText("Auth item")).toBeTruthy();
    });
    const saveButton = screen
      .UNSAFE_getAllByType(Button)
      .find((instance) => instance.props.label === "Save & Continue");
    await act(async () => {
      await saveButton?.props.onPress?.();
    });

    expect(await findByText("You need to be signed in to create a new estimate.")).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      "Estimate",
      "You need to be signed in to create a new estimate.",
    );
    expect(mockRunAsync).not.toHaveBeenCalled();
    expect(queueChange).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("opens the item editor with saved item defaults", async () => {
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
    const savedItemButton = await screen.findByTestId("picker-item-saved-1");
    fireEvent.press(savedItemButton);

    await waitFor(() => {
      expect(mockOpenEditor).toHaveBeenCalled();
    });

    const editorConfig = mockOpenEditor.mock.calls[0][0];
    expect(editorConfig.initialTemplateId).toBe("saved-1");
    expect(typeof editorConfig.onSubmit).toBe("function");
    expect(editorConfig.title).toBe("Add line item");
    expect(mockRouter.push).toHaveBeenCalledWith("/(tabs)/estimates/item-editor");
  });
});
