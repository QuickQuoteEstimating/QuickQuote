import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("expo-router", () => {
  const push = jest.fn();
  const back = jest.fn();
  const router = { push, back };
  return {
    __esModule: true,
    router,
    useRouter: () => router,
  };
});

const mockOpenEditor = jest.fn();

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

jest.mock("../context/ItemEditorContext", () => ({
  useItemEditor: () => ({
    config: null,
    openEditor: mockOpenEditor,
    closeEditor: jest.fn(),
  }),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123" },
    session: null,
  }),
}));

jest.mock("../context/SettingsContext", () => ({
  useSettings: () => ({
    settings: {
      hourlyRate: 50,
      taxRate: 8,
    },
  }),
}));

jest.mock("../lib/itemCatalog", () => ({
  listItemCatalog: jest.fn().mockResolvedValue([]),
  upsertItemCatalog: jest.fn(),
}));

jest.mock("../components/CustomerPicker", () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (id: string) => void }) => {
    const React = require("react");
    React.useEffect(() => {
      onSelect("customer-1");
    }, [onSelect]);
    return null;
  },
}));

const mockDbInstance = {
  getAllAsync: jest.fn().mockResolvedValue([]),
  runAsync: jest.fn().mockResolvedValue(undefined),
  execAsync: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../lib/sqlite", () => ({
  __esModule: true,
  openDB: jest.fn().mockResolvedValue(mockDbInstance),
  queueChange: jest.fn(),
}));

jest.mock("../lib/sync", () => ({
  runSync: jest.fn(),
}));

import NewEstimateScreen from "../app/(tabs)/estimates/new";
import { openDB, queueChange } from "../lib/sqlite";

function submitConfigItem(index = 0) {
  const call = mockOpenEditor.mock.calls[index];
  if (!call) {
    throw new Error("No item editor config captured");
  }
  return call[0];
}

describe("NewEstimateScreen", () => {
  beforeEach(() => {
    mockOpenEditor.mockClear();
    alertSpy.mockClear();
    mockDbInstance.runAsync.mockClear();
    mockDbInstance.execAsync.mockClear();
    (queueChange as jest.Mock).mockClear();
    (openDB as jest.Mock).mockResolvedValue(mockDbInstance);
  });

  it("adds a new line item to the quote when the editor submits", async () => {
    const { getByText } = render(<NewEstimateScreen />);

    fireEvent.press(getByText("Add Item"));

    expect(mockOpenEditor).toHaveBeenCalledTimes(1);

    const config = submitConfigItem();

    await act(async () => {
      await config.onSubmit({
        values: {
          description: "Demo Item",
          quantity: 2,
          unit_price: 25,
          total: 50,
        },
        saveToLibrary: false,
        templateId: null,
      });
    });

    await waitFor(() => {
      expect(getByText("Demo Item")).toBeTruthy();
      expect(getByText(/Line Total: \$50.00/)).toBeTruthy();
    });
  });

  it("saves the estimate and queues database operations", async () => {
    const { getByText } = render(<NewEstimateScreen />);

    fireEvent.press(getByText("Add Item"));
    const config = submitConfigItem();

    await act(async () => {
      await config.onSubmit({
        values: {
          description: "Widget",
          quantity: 3,
          unit_price: 40,
          total: 120,
        },
        saveToLibrary: false,
        templateId: null,
      });
    });

    await waitFor(() => {
      expect(getByText("Widget")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByText("Save"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Success",
        "Estimate created successfully.",
        expect.any(Array)
      );
    });

    expect(mockDbInstance.runAsync).toHaveBeenCalledTimes(2);

    const [estimateInsertArgs, itemInsertArgs] = mockDbInstance.runAsync.mock.calls;
    const estimateParams = estimateInsertArgs[1];
    const itemParams = itemInsertArgs[1];

    expect(estimateInsertArgs[0]).toContain("INSERT OR REPLACE INTO estimates");
    expect(estimateParams[1]).toBe("user-123");
    expect(estimateParams[2]).toBe("customer-1");

    expect(itemInsertArgs[0]).toContain("INSERT OR REPLACE INTO estimate_items");
    expect(itemParams[1]).toBe(estimateParams[0]);
    expect(itemParams[3]).toBe(3);
    expect(itemParams[4]).toBe(40);
    expect(itemParams[5]).toBe(120);

    expect((queueChange as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          "estimate_items",
          "insert",
          expect.objectContaining({ estimate_id: estimateParams[0], total: 120 }),
        ]),
        expect.arrayContaining([
          "estimates",
          "insert",
          expect.objectContaining({ id: estimateParams[0], customer_id: "customer-1" }),
        ]),
      ])
    );
  });
});
