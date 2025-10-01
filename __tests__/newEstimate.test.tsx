import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

jest.mock("expo-router", () => {
  const push = jest.fn();
  const back = jest.fn();
  const replace = jest.fn();
  const router = { push, back, replace };
  return {
    __esModule: true,
    router,
    useRouter: () => router,
  };
});

import { router as expoRouter } from "expo-router";

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

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
      companyProfile: {
        name: "QuickQuote Co.",
        email: "hello@example.com",
        phone: "555-000-1111",
        website: "quickquote.test",
        address: "123 Main St",
        logoUri: null,
      },
    },
    resolvedTheme: "light",
  }),
}));

let mockUpsertItem: jest.Mock;

jest.mock("../lib/itemCatalog", () => {
  mockUpsertItem = jest.fn().mockResolvedValue({
    id: "catalog-item-1",
    user_id: "user-123",
    description: "Widget",
    default_quantity: 1,
    unit_price: 40,
    notes: null,
    version: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  });

  return {
    listItemCatalog: jest.fn().mockResolvedValue([]),
    upsertItemCatalog: mockUpsertItem,
  };
});

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

describe("NewEstimateScreen", () => {
  beforeEach(() => {
    alertSpy.mockClear();
    mockDbInstance.runAsync.mockClear();
    mockDbInstance.execAsync.mockClear();
    (queueChange as jest.Mock).mockClear();
    (openDB as jest.Mock).mockResolvedValue(mockDbInstance);
    expoRouter.replace.mockClear();
  });

  it("adds a new line item inline", async () => {
    const { getByText, getByPlaceholderText } = render(<NewEstimateScreen />);

    fireEvent.press(getByText("Add line item"));

    const descriptionInput = getByPlaceholderText("Describe the work");
    const quantityInput = getByPlaceholderText("Qty");
    const unitInput = getByPlaceholderText("$0.00");

    fireEvent.changeText(descriptionInput, "Demo Item");
    fireEvent.changeText(quantityInput, "2");
    fireEvent.changeText(unitInput, "25");

    await waitFor(() => {
      expect(getByText("Line total: $50.00")).toBeTruthy();
    });
  });

  it("saves the estimate and queues database operations", async () => {
    const { getByText, getByPlaceholderText } = render(<NewEstimateScreen />);

    fireEvent.press(getByText("Add line item"));

    fireEvent.changeText(getByPlaceholderText("Describe the work"), "Widget");
    fireEvent.changeText(getByPlaceholderText("Qty"), "3");
    fireEvent.changeText(getByPlaceholderText("$0.00"), "40");

    await act(async () => {
      fireEvent.press(getByText("Save & Preview"));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        "Estimate created",
        "We'll open it so you can review the details and send it to your customer.",
        expect.arrayContaining([
          expect.objectContaining({
            text: "Review & send",
            onPress: expect.any(Function),
          }),
        ]),
        expect.objectContaining({ cancelable: false })
      );
    });

    const [, , buttons] = alertSpy.mock.calls[0];
    const primaryAction = Array.isArray(buttons) ? buttons[0] : undefined;
    primaryAction?.onPress?.();

    expect(expoRouter.replace).toHaveBeenCalledWith({
      pathname: "/(tabs)/estimates/[id]",
      params: { id: expect.any(String) },
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
