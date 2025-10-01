import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

let mockRouter: { push: jest.Mock; back: jest.Mock };

jest.mock("expo-router", () => {
  const push = jest.fn();
  const back = jest.fn();
  mockRouter = { push, back };
  return {
    __esModule: true,
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ id: "est-123" }),
  };
});

const mockOpenEditor = jest.fn();

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
      hourlyRate: 55,
      taxRate: 7.5,
      companyProfile: {
        name: "QuickQuote Co.",
        email: "hello@example.com",
        phone: "555-111-2222",
        website: "quickquote.test",
        address: "123 Main St",
        logoUri: null,
      },
    },
    resolvedTheme: "light",
  }),
}));

jest.mock("../lib/itemCatalog", () => ({
  listItemCatalog: jest.fn().mockResolvedValue([]),
  upsertItemCatalog: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  createPhotoStoragePath: jest.fn(),
  deleteLocalPhoto: jest.fn(),
  deriveLocalPhotoUri: jest.fn(() => "file:///local"),
  persistLocalPhotoCopy: jest.fn(),
  syncPhotoBinaries: jest.fn(),
}));

jest.mock("../lib/pdf", () => ({
  renderEstimatePdf: jest.fn().mockResolvedValue({ html: "<html />", uri: "file:///estimate.pdf" }),
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: "granted" }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ cancelled: true }),
  MediaTypeOptions: { Images: "Images" },
}));

jest.mock("expo-print", () => ({
  printAsync: jest.fn(),
}));

jest.mock("expo-sms", () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  sendSMSAsync: jest.fn(),
}));

jest.mock("../components/CustomerPicker", () => ({
  __esModule: true,
  default: ({ onSelect }: { onSelect: (id: string) => void }) => {
    const React = require("react");
    React.useEffect(() => {
      onSelect("customer-123");
    }, [onSelect]);
    return null;
  },
}));

const mockDb = {
  getAllAsync: jest.fn(),
  runAsync: jest.fn().mockResolvedValue(undefined),
  execAsync: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../lib/sqlite", () => ({
  __esModule: true,
  openDB: jest.fn(),
  queueChange: jest.fn(),
  logEstimateDelivery: jest.fn(),
}));

jest.mock("../lib/sync", () => ({
  runSync: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "item-uuid"),
}));

jest.mock("../lib/estimates", () => ({
  sanitizeEstimateForQueue: (estimate: unknown) => estimate,
}));

const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

import EditEstimateScreen from "../app/(tabs)/estimates/[id]";
import { openDB, queueChange } from "../lib/sqlite";

function latestEditorConfig(index = 0) {
  const call = mockOpenEditor.mock.calls[index];
  if (!call) {
    throw new Error("openEditor was not called");
  }
  return call[0];
}

describe("EditEstimateScreen - item editing", () => {
  beforeEach(() => {
    mockRouter.push.mockClear();
    mockRouter.back.mockClear();
    mockOpenEditor.mockClear();
    alertSpy.mockClear();
    mockDb.getAllAsync.mockReset();
    mockDb.runAsync.mockClear();
    mockDb.execAsync.mockClear();
    (queueChange as jest.Mock).mockClear();
    (openDB as jest.Mock).mockResolvedValue(mockDb);

    mockDb.getAllAsync.mockImplementation((sql: string) => {
      if (sql.includes("FROM estimates")) {
        return Promise.resolve([
          {
            id: "est-123",
            user_id: "user-123",
            customer_id: "customer-123",
            customer_name: "Acme Co",
            customer_email: "acme@example.com",
            customer_phone: "555-1234",
            customer_address: "123 Main",
            date: "2024-03-01T00:00:00.000Z",
            total: 100,
            material_total: 80,
            labor_hours: 1,
            labor_rate: 20,
            labor_total: 20,
            subtotal: 100,
            tax_rate: 5,
            tax_total: 5,
            notes: null,
            status: "draft",
            version: 1,
            updated_at: "2024-03-01T00:00:00.000Z",
            deleted_at: null,
          },
        ]);
      }

      if (sql.includes("FROM estimate_items")) {
        return Promise.resolve([]);
      }

      if (sql.includes("FROM photos")) {
        return Promise.resolve([]);
      }

      if (sql.includes("FROM customers")) {
        return Promise.resolve([
          {
            id: "customer-123",
            name: "Acme Co",
            email: "acme@example.com",
            phone: "555-1234",
            address: "123 Main",
            notes: null,
          },
        ]);
      }

      return Promise.resolve([]);
    });
  });

  it("adds a new item to the estimate when the editor submits", async () => {
    const { findByText, getByText } = render(<EditEstimateScreen />);

    await act(async () => {});
    await findByText("Estimate items");

    const addLineItemButton = await findByText("Add line item");
    fireEvent.press(addLineItemButton);

    expect(mockOpenEditor).toHaveBeenCalledTimes(1);
    const config = latestEditorConfig();

    await act(async () => {
      await config.onSubmit({
        values: {
          description: "Service Call",
          quantity: 2,
          unit_price: 50,
          total: 100,
        },
        saveToLibrary: false,
        templateId: null,
      });
    });

    await waitFor(() => {
      expect(getByText("Service Call")).toBeTruthy();
      expect(getByText(/Line Total: \$100.00/)).toBeTruthy();
    });

    expect(mockDb.runAsync).toHaveBeenCalled();
    expect((queueChange as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          "estimate_items",
          "insert",
          expect.objectContaining({ description: "Service Call" }),
        ]),
      ])
    );
  });
});
