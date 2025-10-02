import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as SMS from "expo-sms";
import { v4 as uuidv4 } from "uuid";

import { Button, Card, Input, ListItem } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { logEstimateDelivery, openDB, queueChange } from "../../../lib/sqlite";
import {
  renderEstimatePdf,
  type EstimatePdfOptions,
  type EstimatePdfResult,
} from "../../../lib/pdf";
import { runSync } from "../../../lib/sync";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

type CustomerOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

type LineItemDraft = {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
};

type PersistedEstimateRecord = {
  id: string;
  user_id: string;
  customer_id: string;
  date: string | null;
  total: number;
  material_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  subtotal: number;
  tax_rate: number;
  tax_total: number;
  notes: string | null;
  status: string;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

type PersistedEstimateItem = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  catalog_item_id: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

type SavedEstimateContext = {
  estimate: PersistedEstimateRecord;
  items: PersistedEstimateItem[];
  customer: CustomerOption;
  jobLocation: string | null;
  jobDescription: string | null;
};

type FormErrors = {
  customer?: string;
  lineItems?: string;
};

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(Math.round(value * 100) / 100);
}

function parseDecimal(value: string): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function computeLineItemTotal(item: LineItemDraft): number {
  const quantity = parseDecimal(item.quantity);
  const unitPrice = parseDecimal(item.unitPrice);

  if (quantity === null || unitPrice === null) {
    return 0;
  }

  return Math.round(quantity * unitPrice * 100) / 100;
}

function buildNotes(jobLocation: string | null, jobDescription: string | null): string | null {
  const parts: string[] = [];
  if (jobLocation) {
    parts.push(`Job location: ${jobLocation}`);
  }
  if (jobDescription) {
    parts.push(jobDescription);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl * 2,
      gap: theme.spacing.xl,
    },
    sectionHeader: {
      gap: theme.spacing.xs,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    errorCard: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSoft,
    },
    errorText: {
      fontSize: 13,
      color: theme.colors.danger,
    },
    customerResults: {
      gap: theme.spacing.sm,
    },
    customerListItem: {
      paddingHorizontal: theme.spacing.lg,
    },
    customerEmpty: {
      paddingVertical: theme.spacing.lg,
      alignItems: "center",
    },
    customerEmptyText: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: "center",
    },
    selectedCustomerCard: {
      borderRadius: theme.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    selectedCustomerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    selectedCustomerName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    selectedCustomerMeta: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    inlineActions: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    jobSection: {
      gap: theme.spacing.lg,
    },
    lineItemList: {
      gap: theme.spacing.lg,
    },
    lineItemCard: {
      borderRadius: theme.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    lineItemRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    lineItemColumn: {
      flex: 1,
    },
    lineItemFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    lineItemTotalLabel: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    lineItemTotalValue: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    addItemButton: {
      alignSelf: "flex-start",
    },
    summaryCard: {
      borderRadius: theme.radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    summaryTotalLabel: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    summaryTotalValue: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.colors.primary,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    footerButtons: {
      flexDirection: "column",
      gap: theme.spacing.md,
    },
    caption: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
  });
}
export default function NewEstimateScreen() {
  const { user, session } = useAuth();
  const { settings } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const userId = user?.id ?? session?.user?.id ?? null;
  const defaultLaborRate = useMemo(() => {
    const rate = Math.max(0, settings.hourlyRate ?? 0);
    return Math.round(rate * 100) / 100;
  }, [settings.hourlyRate]);
  const defaultTaxRate = useMemo(() => {
    const rate = Math.max(0, settings.taxRate ?? 0);
    return Math.round(rate * 100) / 100;
  }, [settings.taxRate]);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [jobLocation, setJobLocation] = useState("");
  const [jobLocationEdited, setJobLocationEdited] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const autoFilledJobLocationRef = useRef<string | null>(null);

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [persistedData, setPersistedData] = useState<{
    estimate: PersistedEstimateRecord;
    items: PersistedEstimateItem[];
  } | null>(null);

  const taxRate = defaultTaxRate;

  const materialLineItems = useMemo(
    () => lineItems.map((item) => ({ total: computeLineItemTotal(item) })),
    [lineItems],
  );

  const totals = useMemo(() => {
    return calculateEstimateTotals({
      materialLineItems,
      taxRate,
    });
  }, [materialLineItems, taxRate]);

  const fetchCustomers = useCallback(async (query: string) => {
    const db = await openDB();
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      const rows = await db.getAllAsync<CustomerOption>(
        `SELECT id, name, email, phone, address
           FROM customers
           WHERE deleted_at IS NULL
           ORDER BY datetime(updated_at) DESC
           LIMIT 20`,
      );
      return rows;
    }

    const like = `%${trimmed}%`;
    const rows = await db.getAllAsync<CustomerOption>(
      `SELECT id, name, email, phone, address
         FROM customers
         WHERE deleted_at IS NULL
           AND (
             LOWER(name) LIKE ?
             OR LOWER(phone) LIKE ?
             OR LOWER(email) LIKE ?
             OR LOWER(address) LIKE ?
           )
         ORDER BY name ASC
         LIMIT 20`,
      [like, like, like, like],
    );
    return rows;
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setLoadingCustomers(true);
    setCustomerError(null);

    const handle = setTimeout(() => {
      fetchCustomers(customerQuery)
        .then((rows) => {
          if (isCancelled) {
            return;
          }
          let nextRows = rows;
          if (selectedCustomer && !rows.some((row) => row.id === selectedCustomer.id)) {
            nextRows = [selectedCustomer, ...rows];
          }
          setCustomerResults(nextRows);
        })
        .catch((error) => {
          console.error("Failed to search customers", error);
          if (!isCancelled) {
            setCustomerError("We couldn’t load customers. Pull to refresh or try again.");
            setCustomerResults([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setLoadingCustomers(false);
          }
        });
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(handle);
    };
  }, [customerQuery, fetchCustomers, selectedCustomer]);
  const handleSelectCustomer = useCallback(
    (customer: CustomerOption) => {
      setSelectedCustomer(customer);
      setCustomerQuery(customer.name ?? "");
      setShowNewCustomerForm(false);

      const trimmedAddress = customer.address?.trim();
      if (trimmedAddress) {
        const previousAuto = autoFilledJobLocationRef.current;
        const currentValue = jobLocation.trim();
        if (!jobLocationEdited || currentValue === "" || currentValue === previousAuto) {
          autoFilledJobLocationRef.current = trimmedAddress;
          setJobLocation(trimmedAddress);
          setJobLocationEdited(false);
        }
      }
    },
    [jobLocation, jobLocationEdited],
  );

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerQuery("");
  }, []);

  const handleJobLocationChange = useCallback((value: string) => {
    setJobLocation(value);
    setJobLocationEdited(true);
    autoFilledJobLocationRef.current = null;
  }, []);

  const handleCreateCustomer = useCallback(async () => {
    const trimmedName = newCustomerName.trim();
    if (!trimmedName) {
      Alert.alert("Customer", "Customer name is required.");
      return;
    }

    if (!userId) {
      Alert.alert("Sign in required", "You must be signed in before creating customers.");
      return;
    }

    try {
      setCreatingCustomer(true);
      const db = await openDB();
      const now = new Date().toISOString();
      const customerRecord = {
        id: uuidv4(),
        user_id: userId,
        name: trimmedName,
        phone: newCustomerPhone.trim() ? newCustomerPhone.trim() : null,
        email: newCustomerEmail.trim() ? newCustomerEmail.trim() : null,
        address: null as string | null,
        notes: null as string | null,
        version: 1,
        updated_at: now,
        deleted_at: null as string | null,
      };

      await db.runAsync(
        `INSERT OR REPLACE INTO customers
           (id, user_id, name, phone, email, address, notes, version, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerRecord.id,
          customerRecord.user_id,
          customerRecord.name,
          customerRecord.phone,
          customerRecord.email,
          customerRecord.address,
          customerRecord.notes,
          customerRecord.version,
          customerRecord.updated_at,
          customerRecord.deleted_at,
        ],
      );

      await queueChange("customers", "insert", customerRecord);
      void runSync().catch((error) => {
        console.warn("Failed to sync new customer immediately", error);
      });

      const option: CustomerOption = {
        id: customerRecord.id,
        name: customerRecord.name,
        email: customerRecord.email,
        phone: customerRecord.phone,
        address: customerRecord.address,
      };
      setSelectedCustomer(option);
      setCustomerQuery(customerRecord.name);
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
      setCustomerResults((current) => [option, ...current.filter((row) => row.id !== option.id)]);
    } catch (error) {
      console.error("Failed to create customer", error);
      Alert.alert("Customer", "We couldn't save this customer. Please try again.");
    } finally {
      setCreatingCustomer(false);
    }
  }, [newCustomerEmail, newCustomerName, newCustomerPhone, userId]);

  const handleAddLineItem = useCallback(() => {
    setLineItems((current) => [
      ...current,
      { id: uuidv4(), name: "", quantity: "1", unitPrice: "" },
    ]);
  }, []);

  const handleLineItemChange = useCallback(
    (itemId: string, field: keyof LineItemDraft, value: string) => {
      setLineItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const handleRemoveLineItem = useCallback((itemId: string) => {
    setLineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const markEstimateSent = useCallback(
    async (context: SavedEstimateContext, channel: "email" | "sms") => {
      try {
        const db = await openDB();
        const now = new Date().toISOString();
        const nextVersion = (context.estimate.version ?? 1) + 1;
        const updatedEstimate: PersistedEstimateRecord = {
          ...context.estimate,
          status: "sent",
          version: nextVersion,
          updated_at: now,
        };

        await db.runAsync(
          `UPDATE estimates
             SET status = ?, version = ?, updated_at = ?
             WHERE id = ?`,
          [
            updatedEstimate.status,
            updatedEstimate.version,
            updatedEstimate.updated_at,
            updatedEstimate.id,
          ],
        );

        await queueChange("estimates", "update", sanitizeEstimateForQueue(updatedEstimate));
        setPersistedData((current) => {
          if (current && current.estimate.id === updatedEstimate.id) {
            return { estimate: updatedEstimate, items: current.items };
          }
          return current;
        });

        void runSync().catch((error) => {
          console.warn("Failed to sync estimate status", error);
        });
      } catch (error) {
        console.error("Failed to update estimate status", error);
        Alert.alert(
          "Status",
          `Estimate ${channel === "email" ? "emailed" : "texted"}, but we couldn't update the status automatically. Please review it manually.`,
        );
      }
    },
    [],
  );

  const saveEstimate = useCallback(async (): Promise<SavedEstimateContext | null> => {
    if (!userId) {
      setFormError("You need to be signed in to create a new estimate.");
      Alert.alert("Estimate", "You need to be signed in to create a new estimate.");
      return null;
    }

    if (!selectedCustomer) {
      setFormErrors({ customer: "Select a customer before saving." });
      return null;
    }

    let lineItemError = false;
    const normalizedLineItems = lineItems
      .map((item) => {
        const name = item.name.trim();
        const quantityValue = parseDecimal(item.quantity);
        const unitPriceValue = parseDecimal(item.unitPrice);
        const isBlank = !name && quantityValue === null && unitPriceValue === null;

        if (isBlank) {
          return null;
        }

        if (!name || quantityValue === null || unitPriceValue === null) {
          lineItemError = true;
          return null;
        }

        const quantity = Math.max(0, Math.round(quantityValue * 1000) / 1000);
        const unitPrice = Math.max(0, Math.round(unitPriceValue * 100) / 100);
        const total = Math.round(quantity * unitPrice * 100) / 100;
        return { name, quantity, unitPrice, total };
      })
      .filter(
        (item): item is { name: string; quantity: number; unitPrice: number; total: number } =>
          item !== null,
      );

    if (lineItemError) {
      setFormErrors({ lineItems: "Fill in each item with a name, quantity, and price." });
      return null;
    }

    setFormErrors({});
    setFormError(null);

    const jobLocationValue = jobLocation.trim() ? jobLocation.trim() : null;
    const jobDescriptionValue = jobDescription.trim() ? jobDescription.trim() : null;

    const estimateTotals = calculateEstimateTotals({
      materialLineItems: normalizedLineItems.map((item) => ({ total: item.total })),
      taxRate,
    });

    const db = await openDB();
    const now = new Date().toISOString();
    const estimateId = persistedData?.estimate.id ?? uuidv4();
    const baseStatus = persistedData?.estimate.status ?? "draft";
    const nextVersion = persistedData ? (persistedData.estimate.version ?? 1) + 1 : 1;

    const newEstimate: PersistedEstimateRecord = {
      id: estimateId,
      user_id: userId,
      customer_id: selectedCustomer.id,
      date: persistedData?.estimate.date ?? null,
      total: estimateTotals.grandTotal,
      material_total: estimateTotals.materialTotal,
      labor_hours: 0,
      labor_rate: defaultLaborRate,
      labor_total: estimateTotals.laborTotal,
      subtotal: estimateTotals.subtotal,
      tax_rate: estimateTotals.taxRate,
      tax_total: estimateTotals.taxTotal,
      notes: buildNotes(jobLocationValue, jobDescriptionValue),
      status: baseStatus,
      version: nextVersion,
      updated_at: now,
      deleted_at: null,
    };

    try {
      if (!persistedData) {
        await db.runAsync(
          `INSERT OR REPLACE INTO estimates
             (id, user_id, customer_id, date, total, material_total, labor_hours, labor_rate, labor_total, subtotal, tax_rate, tax_total, notes, status, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newEstimate.id,
            newEstimate.user_id,
            newEstimate.customer_id,
            newEstimate.date,
            newEstimate.total,
            newEstimate.material_total,
            newEstimate.labor_hours,
            newEstimate.labor_rate,
            newEstimate.labor_total,
            newEstimate.subtotal,
            newEstimate.tax_rate,
            newEstimate.tax_total,
            newEstimate.notes,
            newEstimate.status,
            newEstimate.version,
            newEstimate.updated_at,
            newEstimate.deleted_at,
          ],
        );
        await queueChange("estimates", "insert", sanitizeEstimateForQueue(newEstimate));
      } else {
        await db.runAsync(
          `UPDATE estimates
             SET customer_id = ?, date = ?, total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL
             WHERE id = ?`,
          [
            newEstimate.customer_id,
            newEstimate.date,
            newEstimate.total,
            newEstimate.material_total,
            newEstimate.labor_hours,
            newEstimate.labor_rate,
            newEstimate.labor_total,
            newEstimate.subtotal,
            newEstimate.tax_rate,
            newEstimate.tax_total,
            newEstimate.notes,
            newEstimate.status,
            newEstimate.version,
            newEstimate.updated_at,
            newEstimate.id,
          ],
        );
        await queueChange("estimates", "update", sanitizeEstimateForQueue(newEstimate));

        for (const existingItem of persistedData.items) {
          const deletedItem: PersistedEstimateItem = {
            ...existingItem,
            version: (existingItem.version ?? 1) + 1,
            updated_at: now,
            deleted_at: now,
          };
          await db.runAsync(
            `UPDATE estimate_items
               SET deleted_at = ?, updated_at = ?, version = ?
               WHERE id = ?`,
            [deletedItem.deleted_at, deletedItem.updated_at, deletedItem.version, deletedItem.id],
          );
          await queueChange("estimate_items", "update", deletedItem);
        }
      }

      const insertedItems: PersistedEstimateItem[] = [];
      for (const item of normalizedLineItems) {
        const record: PersistedEstimateItem = {
          id: uuidv4(),
          estimate_id: newEstimate.id,
          description: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.total,
          catalog_item_id: null,
          version: 1,
          updated_at: now,
          deleted_at: null,
        };

        await db.runAsync(
          `INSERT OR REPLACE INTO estimate_items
             (id, estimate_id, description, quantity, unit_price, total, catalog_item_id, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id,
            record.estimate_id,
            record.description,
            record.quantity,
            record.unit_price,
            record.total,
            record.catalog_item_id,
            record.version,
            record.updated_at,
            record.deleted_at,
          ],
        );
        await queueChange("estimate_items", "insert", record);
        insertedItems.push(record);
      }

      setPersistedData({ estimate: newEstimate, items: insertedItems });

      const context: SavedEstimateContext = {
        estimate: newEstimate,
        items: insertedItems,
        customer: selectedCustomer,
        jobLocation: jobLocationValue,
        jobDescription: jobDescriptionValue,
      };

      void runSync().catch((error) => {
        console.warn("Failed to sync new estimate", error);
      });

      return context;
    } catch (error) {
      console.error("Failed to save estimate", error);
      setFormError("We couldn't save your estimate. Please try again.");
      Alert.alert("Estimate", "We couldn't save your estimate. Please try again.");
      return null;
    }
  }, [
    defaultLaborRate,
    jobDescription,
    jobLocation,
    lineItems,
    persistedData,
    selectedCustomer,
    taxRate,
    userId,
  ]);
  const buildPdfOptions = useCallback(
    (context: SavedEstimateContext): EstimatePdfOptions => ({
      estimate: {
        id: context.estimate.id,
        date: context.estimate.date,
        status: context.estimate.status,
        notes: context.estimate.notes,
        total: context.estimate.total,
        materialTotal: context.estimate.material_total,
        laborTotal: context.estimate.labor_total,
        taxTotal: context.estimate.tax_total,
        subtotal: context.estimate.subtotal,
        customer: {
          name: context.customer.name,
          email: context.customer.email,
          phone: context.customer.phone,
          address: context.jobLocation ?? context.customer.address ?? null,
        },
      },
      items: context.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
      })),
      photos: [],
      termsAndConditions: settings.termsAndConditions,
      paymentDetails: settings.paymentDetails,
    }),
    [settings.paymentDetails, settings.termsAndConditions],
  );

  const shareViaEmail = useCallback(
    async (context: SavedEstimateContext, pdf: EstimatePdfResult) => {
      const email = context.customer.email?.trim();
      if (!email) {
        Alert.alert(
          "Missing email",
          "Add an email address for this customer to share the estimate.",
        );
        return;
      }

      try {
        const subject = encodeURIComponent(`Estimate ${context.estimate.id} from QuickQuote`);
        const greetingName = context.customer.name?.trim() || "there";
        const bodyLines = [
          `Hi ${greetingName},`,
          "",
          "Please review your estimate from QuickQuote.",
          `Total: ${formatCurrency(context.estimate.total)}`,
          `PDF saved at: ${pdf.uri}`,
          "",
          "Thank you!",
        ];
        const bodyPlain = bodyLines.join("\n");
        const body = encodeURIComponent(bodyPlain);
        const mailto = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;

        let canOpen = true;
        if (Platform.OS !== "web") {
          canOpen = await Linking.canOpenURL(mailto);
        }
        if (!canOpen) {
          Alert.alert("Unavailable", "No email client is configured on this device.");
          return;
        }

        await Linking.openURL(mailto);

        if (Platform.OS === "web" && typeof document !== "undefined") {
          const link = document.createElement("a");
          link.href = pdf.uri;
          link.download = pdf.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        await logEstimateDelivery({
          estimateId: context.estimate.id,
          channel: "email",
          recipient: email,
          messagePreview: bodyPlain.length > 240 ? `${bodyPlain.slice(0, 237)}...` : bodyPlain,
          metadata: { pdfUri: pdf.uri, mailto },
        });
        await markEstimateSent(context, "email");
      } catch (error) {
        console.error("Failed to share via email", error);
        Alert.alert("Error", "Unable to share the estimate via email.");
      }
    },
    [markEstimateSent],
  );

  const shareViaSms = useCallback(
    async (context: SavedEstimateContext, pdf: EstimatePdfResult) => {
      const phone = context.customer.phone?.trim();
      if (!phone) {
        Alert.alert(
          "Missing phone",
          "Add a mobile number for this customer to share the estimate.",
        );
        return;
      }

      try {
        const available = await SMS.isAvailableAsync();
        if (!available) {
          Alert.alert("Unavailable", "SMS is not supported on this device.");
          return;
        }

        const message = `Estimate ${context.estimate.id} total ${formatCurrency(
          context.estimate.total,
        )}. PDF: ${pdf.uri}`;
        let smsResponse;
        try {
          smsResponse = await SMS.sendSMSAsync(
            [phone],
            message,
            pdf.uri
              ? {
                  attachments: [
                    { uri: pdf.uri, mimeType: "application/pdf", filename: pdf.fileName },
                  ],
                }
              : undefined,
          );
        } catch (error) {
          console.warn("Failed to send SMS with attachment", error);
          smsResponse = await SMS.sendSMSAsync([phone], message);
        }

        await logEstimateDelivery({
          estimateId: context.estimate.id,
          channel: "sms",
          recipient: phone,
          messagePreview: message.length > 240 ? `${message.slice(0, 237)}...` : message,
          metadata: { pdfUri: pdf.uri, smsResult: smsResponse?.result ?? null },
        });
        await markEstimateSent(context, "sms");
      } catch (error) {
        console.error("Failed to share via SMS", error);
        Alert.alert("Error", "Unable to share the estimate via SMS.");
      }
    },
    [markEstimateSent],
  );

  const presentShareOptions = useCallback(
    async (context: SavedEstimateContext, pdfOptions: EstimatePdfOptions) => {
      const hasEmail = Boolean(context.customer.email?.trim());
      const hasPhone = Boolean(context.customer.phone?.trim());

      if (!hasEmail && !hasPhone) {
        Alert.alert(
          "Add client contact",
          "Add an email address or mobile number before sending this estimate.",
        );
        return;
      }

      const pdf = await renderEstimatePdf(pdfOptions);

      await new Promise<void>((resolve) => {
        const sendEmail = () => {
          void (async () => {
            await shareViaEmail(context, pdf);
            resolve();
          })();
        };
        const sendSms = () => {
          void (async () => {
            await shareViaSms(context, pdf);
            resolve();
          })();
        };

        if (hasEmail && hasPhone) {
          Alert.alert("Send estimate", "Choose how you'd like to send the estimate.", [
            { text: "Cancel", style: "cancel", onPress: () => resolve() },
            { text: "Text message", onPress: sendSms },
            { text: "Email", onPress: sendEmail },
          ]);
          return;
        }

        if (hasEmail) {
          sendEmail();
          return;
        }

        sendSms();
      });
    },
    [shareViaEmail, shareViaSms],
  );

  const handleSaveDraft = useCallback(async () => {
    if (saving || sending) {
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEstimate();
      if (saved) {
        Alert.alert("Draft saved", "Your estimate draft has been saved.");
      }
    } finally {
      setSaving(false);
    }
  }, [saveEstimate, saving, sending]);

  const handleSaveAndSend = useCallback(async () => {
    if (saving || sending) {
      return;
    }
    setSending(true);
    try {
      const saved = await saveEstimate();
      if (!saved) {
        return;
      }
      const options = buildPdfOptions(saved);
      await presentShareOptions(saved, options);
    } finally {
      setSending(false);
    }
  }, [buildPdfOptions, presentShareOptions, saveEstimate, saving, sending]);

  const handlePreview = useCallback(async () => {
    if (previewing || saving || sending) {
      return;
    }
    setPreviewing(true);
    try {
      const saved = await saveEstimate();
      if (!saved) {
        return;
      }
      const pdf = await renderEstimatePdf(buildPdfOptions(saved));
      if (Platform.OS === "web") {
        if (typeof window === "undefined") {
          Alert.alert("Unavailable", "Preview is not supported in this environment.");
          return;
        }
        const previewWindow = window.open("", "_blank");
        if (!previewWindow) {
          Alert.alert("Popup blocked", "Allow popups to preview the estimate.");
          return;
        }
        previewWindow.document.write(pdf.html);
        previewWindow.document.close();
        return;
      }

      await Print.printAsync({ html: pdf.html });
    } catch (error) {
      console.error("Failed to preview estimate", error);
      Alert.alert("Preview", "We couldn't preview this estimate. Please try again.");
    } finally {
      setPreviewing(false);
    }
  }, [buildPdfOptions, previewing, saveEstimate, saving, sending]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formError ? (
            <Card elevated={false} style={[styles.sectionHeader, styles.errorCard]}>
              <Text style={styles.errorText}>{formError}</Text>
            </Card>
          ) : null}

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Customer</Text>
              <Text style={styles.sectionSubtitle}>
                Search your contacts or add a new customer on the fly.
              </Text>
            </View>
            {selectedCustomer ? (
              <View style={styles.selectedCustomerCard}>
                <View style={styles.selectedCustomerHeader}>
                  <Text style={styles.selectedCustomerName}>
                    {selectedCustomer.name?.trim() || "Unnamed customer"}
                  </Text>
                  <Button
                    label="Change"
                    variant="ghost"
                    alignment="inline"
                    onPress={handleClearCustomer}
                  />
                </View>
                {selectedCustomer.email ? (
                  <Text style={styles.selectedCustomerMeta}>{selectedCustomer.email}</Text>
                ) : null}
                {selectedCustomer.phone ? (
                  <Text style={styles.selectedCustomerMeta}>{selectedCustomer.phone}</Text>
                ) : null}
                {selectedCustomer.address ? (
                  <Text style={styles.selectedCustomerMeta}>{selectedCustomer.address}</Text>
                ) : null}
              </View>
            ) : null}
            <Input
              label="Search customers"
              placeholder="Name, phone, email, or address"
              value={customerQuery}
              onChangeText={setCustomerQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {loadingCustomers ? (
              <View style={styles.customerEmpty}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <View style={styles.customerResults}>
                {customerResults.length === 0 ? (
                  <View style={styles.customerEmpty}>
                    <Text style={styles.customerEmptyText}>No matching customers yet.</Text>
                  </View>
                ) : (
                  customerResults.map((customer) => (
                    <ListItem
                      key={customer.id}
                      title={customer.name?.trim() || "Unnamed customer"}
                      subtitle={[customer.email, customer.phone].filter(Boolean).join(" • ")}
                      onPress={() => handleSelectCustomer(customer)}
                      style={styles.customerListItem}
                    />
                  ))
                )}
              </View>
            )}
            {customerError ? <Text style={styles.errorText}>{customerError}</Text> : null}
            {showNewCustomerForm ? (
              <View style={{ gap: theme.spacing.md }}>
                <Input
                  label="Customer name"
                  placeholder="Jane Smith"
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                  autoCapitalize="words"
                />
                <Input
                  label="Phone"
                  placeholder="(555) 123-4567"
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="phone-pad"
                />
                <Input
                  label="Email"
                  placeholder="you@example.com"
                  value={newCustomerEmail}
                  onChangeText={setNewCustomerEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <View style={styles.inlineActions}>
                  <Button
                    label={creatingCustomer ? "Saving…" : "Save customer"}
                    onPress={handleCreateCustomer}
                    loading={creatingCustomer}
                    disabled={creatingCustomer}
                  />
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setShowNewCustomerForm(false)}
                    disabled={creatingCustomer}
                  />
                </View>
              </View>
            ) : (
              <Button
                label="➕ Add New Customer"
                variant="secondary"
                onPress={() => setShowNewCustomerForm(true)}
              />
            )}
            {formErrors.customer ? (
              <Text style={styles.errorText}>{formErrors.customer}</Text>
            ) : null}
          </Card>

          <Card style={styles.jobSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Job location & details</Text>
              <Text style={styles.sectionSubtitle}>Give your crew and client the essentials.</Text>
            </View>
            <Input
              label="Job location"
              placeholder="Where is the job located?"
              value={jobLocation}
              onChangeText={handleJobLocationChange}
              autoCapitalize="words"
              autoCorrect={false}
              caption={
                selectedCustomer?.address && !jobLocationEdited
                  ? "Defaulted to the customer's saved address."
                  : undefined
              }
            />
            <Input
              label="Job description"
              placeholder="Describe the job or add notes for your team"
              value={jobDescription}
              onChangeText={setJobDescription}
              multiline
            />
          </Card>

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Line items</Text>
              <Text style={styles.sectionSubtitle}>
                Add the materials, labor, and services for this estimate.
              </Text>
            </View>
            <View style={styles.lineItemList}>
              {lineItems.length === 0 ? (
                <View style={styles.customerEmpty}>
                  <Text style={styles.customerEmptyText}>
                    No line items yet. Add your first item to build the estimate.
                  </Text>
                </View>
              ) : (
                lineItems.map((item) => (
                  <View key={item.id} style={styles.lineItemCard}>
                    <Input
                      label="Item name"
                      placeholder="Describe the work"
                      value={item.name}
                      onChangeText={(value) => handleLineItemChange(item.id, "name", value)}
                    />
                    <View style={styles.lineItemRow}>
                      <Input
                        label="Quantity"
                        placeholder="0"
                        value={item.quantity}
                        onChangeText={(value) => handleLineItemChange(item.id, "quantity", value)}
                        keyboardType="decimal-pad"
                        containerStyle={styles.lineItemColumn}
                      />
                      <Input
                        label="Unit price"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChangeText={(value) => handleLineItemChange(item.id, "unitPrice", value)}
                        keyboardType="decimal-pad"
                        leftElement={<Text>$</Text>}
                        containerStyle={styles.lineItemColumn}
                      />
                    </View>
                    <View style={styles.lineItemFooter}>
                      <Text style={styles.lineItemTotalLabel}>Line total</Text>
                      <Text style={styles.lineItemTotalValue}>
                        {formatCurrency(computeLineItemTotal(item))}
                      </Text>
                    </View>
                    <View style={styles.inlineActions}>
                      <Button
                        label="Remove"
                        variant="ghost"
                        alignment="inline"
                        onPress={() => handleRemoveLineItem(item.id)}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>
            {formErrors.lineItems ? (
              <Text style={styles.errorText}>{formErrors.lineItems}</Text>
            ) : null}
            <Button
              label="Add line item"
              variant="secondary"
              onPress={handleAddLineItem}
              style={styles.addItemButton}
            />
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax ({totals.taxRate.toFixed(2)}%)</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.taxTotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>Grand total</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(totals.grandTotal)}</Text>
              </View>
              <Text style={styles.caption}>Tax rate comes from your account settings.</Text>
            </View>
          </Card>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
          <View style={styles.footerButtons}>
            <Button
              label={sending ? "Saving…" : "Save & Send"}
              onPress={handleSaveAndSend}
              loading={sending}
              disabled={sending || saving}
            />
            <Button
              label={saving ? "Saving…" : "Save Draft"}
              variant="secondary"
              onPress={handleSaveDraft}
              loading={saving}
              disabled={saving || sending}
            />
            <Button
              label={previewing ? "Preparing preview…" : "Preview"}
              variant="ghost"
              onPress={handlePreview}
              loading={previewing}
              disabled={previewing || saving || sending}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
