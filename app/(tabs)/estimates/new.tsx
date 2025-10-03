import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as SMS from "expo-sms";
import { v4 as uuidv4 } from "uuid";

import CustomerForm from "../../../components/CustomerForm";
import { Button, Card, Input, ListItem } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import {
  applyMarkup,
  calculateEstimateTotals,
  roundCurrency,
  type MarkupMode,
} from "../../../lib/estimateMath";
import { logEstimateDelivery, openDB, queueChange } from "../../../lib/sqlite";
import {
  renderEstimatePdf,
  type EstimatePdfOptions,
  type EstimatePdfResult,
} from "../../../lib/pdf";
import { runSync } from "../../../lib/sync";
import {
  createPhotoStoragePath,
  deleteLocalPhoto,
  persistLocalPhotoCopy,
} from "../../../lib/storage";
import { listSavedItems, upsertSavedItem, type SavedItemRecord } from "../../../lib/savedItems";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";
import type { CustomerRecord } from "../../../types/customers";

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
  applyMarkup: boolean;
  templateId: string | null;
};

type PhotoDraft = {
  id: string;
  storagePath: string;
  localUri: string;
  version: number;
  persisted: boolean;
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
  billing_address: string | null;
  job_address: string | null;
  job_details: string | null;
};

type PersistedEstimateItem = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  total: number;
  apply_markup: number | null;
  catalog_item_id: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

type SavedEstimateContext = {
  estimate: PersistedEstimateRecord;
  items: PersistedEstimateItem[];
  customer: CustomerOption;
  billingAddress: string | null;
  jobAddress: string | null;
  jobDetails: string | null;
  laborHours: number;
  laborRate: number;
  photos: { id: string; localUri: string | null; remoteUri: string | null }[];
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

function computeLineItemTotals(
  item: LineItemDraft,
  markupMode: MarkupMode,
  markupValue: number,
): { baseTotal: number; total: number; markupAmount: number } {
  const quantity = parseDecimal(item.quantity);
  const unitPrice = parseDecimal(item.unitPrice);

  if (quantity === null || unitPrice === null) {
    return { baseTotal: 0, total: 0, markupAmount: 0 };
  }

  const base = roundCurrency(quantity * unitPrice);
  const result = applyMarkup(base, { mode: markupMode, value: markupValue }, { apply: item.applyMarkup });
  return { baseTotal: base, total: result.total, markupAmount: result.markupAmount };
}

function toPhotoQueuePayload(photo: {
  id: string;
  estimate_id: string;
  uri: string;
  description: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
}) {
  return {
    id: photo.id,
    estimate_id: photo.estimate_id,
    uri: photo.uri,
    description: photo.description,
    version: photo.version,
    updated_at: photo.updated_at,
    deleted_at: photo.deleted_at,
  };
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
      paddingBottom: theme.spacing.xxxl,
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
      color: theme.colors.mutedText,
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
      color: theme.colors.mutedText,
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
      color: theme.colors.mutedText,
    },
    inlineActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
      alignItems: "center",
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.lg,
    },
    toggleLabelGroup: {
      flex: 1,
    },
    toggleLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    toggleCaption: {
      fontSize: 13,
      color: theme.colors.mutedText,
      marginTop: 2,
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
    savedItemsPicker: {
      gap: theme.spacing.sm,
    },
    savedItemsLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    savedItemsPickerShell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      overflow: "hidden",
      backgroundColor: theme.colors.surfaceAlt,
    },
    lineItemRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    lineItemColumn: {
      flex: 1,
    },
    lineItemToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    lineItemToggleInfo: {
      flex: 1,
      gap: 4,
    },
    lineItemToggleLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    lineItemToggleHint: {
      fontSize: 12,
      color: theme.colors.mutedText,
    },
    lineItemSummaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    lineItemSummaryColumn: {
      flex: 1,
      gap: 2,
    },
    lineItemSummaryLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.mutedText,
    },
    lineItemSummaryHint: {
      fontSize: 11,
      color: theme.colors.mutedText,
    },
    lineItemSummaryValue: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    lineItemSummaryTotalRow: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    lineItemSummaryTotal: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.accent,
    },
    addItemButton: {
      alignSelf: "flex-start",
    },
    laborGrid: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    laborColumn: {
      flex: 1,
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
      color: theme.colors.mutedText,
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
      color: theme.colors.accent,
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
      color: theme.colors.mutedText,
    },
    photoGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    photoCard: {
      width: "47%",
      borderRadius: theme.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: "hidden",
    },
    photoImage: {
      width: "100%",
      height: 140,
    },
    photoFooter: {
      padding: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    photoEmpty: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.xl,
    },
    photoEmptyText: {
      fontSize: 14,
      color: theme.colors.mutedText,
      textAlign: "center",
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

  const draftEstimateIdRef = useRef<string>(uuidv4());

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  const [billingAddress, setBillingAddress] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobAddressSameAsBilling, setJobAddressSameAsBilling] = useState(true);
  const jobCustomAddressRef = useRef("");

  const [jobDetails, setJobDetails] = useState("");

  const [laborRateInput, setLaborRateInput] = useState(
    defaultLaborRate > 0 ? defaultLaborRate.toFixed(2) : "",
  );
  const [laborHoursInput, setLaborHoursInput] = useState("");

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItemRecord[]>([]);
  const [selectedSavedItemId, setSelectedSavedItemId] = useState<string>("");
  const [savingLibraryItemIds, setSavingLibraryItemIds] = useState<string[]>([]);

  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState<PhotoDraft[]>([]);
  const [addingPhoto, setAddingPhoto] = useState(false);

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

  useEffect(() => {
    if (jobAddressSameAsBilling) {
      setJobAddress(billingAddress);
    }
  }, [billingAddress, jobAddressSameAsBilling]);

  useEffect(() => {
    let cancelled = false;

    const loadSavedItems = async () => {
      if (!userId) {
        setSavedItems([]);
        return;
      }

      try {
        const records = await listSavedItems(userId);
        if (!cancelled) {
          setSavedItems(records);
        }
      } catch (error) {
        console.error("Failed to load saved items", error);
      }
    };

    void loadSavedItems();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const computedLineItems = useMemo(
    () =>
      lineItems.map((item) => {
        const { baseTotal, total, markupAmount } = computeLineItemTotals(
          item,
          settings.materialMarkupMode,
          settings.materialMarkup,
        );
        return { ...item, baseTotal, total, markupAmount };
      }),
    [lineItems, settings.materialMarkup, settings.materialMarkupMode],
  );

  const laborRateValue = useMemo(() => parseDecimal(laborRateInput) ?? 0, [laborRateInput]);
  const laborHoursValue = useMemo(() => parseDecimal(laborHoursInput) ?? 0, [laborHoursInput]);

  const totals = useMemo(() => {
    return calculateEstimateTotals({
      materialLineItems: computedLineItems.map((item) => ({
        baseTotal: item.baseTotal,
        applyMarkup: item.applyMarkup,
      })),
      materialMarkup: {
        mode: settings.materialMarkupMode,
        value: settings.materialMarkup,
      },
      laborHours: laborHoursValue,
      laborRate: laborRateValue,
      laborMarkup: {
        mode: settings.laborMarkupMode,
        value: settings.laborMarkup,
      },
      taxRate,
    });
  }, [
    computedLineItems,
    laborHoursValue,
    laborRateValue,
    settings.laborMarkup,
    settings.laborMarkupMode,
    settings.materialMarkup,
    settings.materialMarkupMode,
    taxRate,
  ]);

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

  const handleSelectCustomer = useCallback((customer: CustomerOption) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name ?? "");
    setShowNewCustomerForm(false);

    const trimmedAddress = customer.address?.trim() ?? "";
    setBillingAddress(trimmedAddress);
    setJobAddressSameAsBilling(true);
    setJobAddress(trimmedAddress);
    jobCustomAddressRef.current = "";
  }, []);

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setBillingAddress("");
    setJobAddress("");
    setJobAddressSameAsBilling(true);
  }, []);

  const handleCustomerCreated = useCallback(
    (customer: CustomerRecord) => {
      const option: CustomerOption = {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      };

      setSelectedCustomer(option);
      setCustomerQuery(customer.name ?? "");
      setShowNewCustomerForm(false);
      setCustomerResults((current) => [option, ...current.filter((row) => row.id !== option.id)]);

      const trimmedAddress = customer.address?.trim() ?? "";
      setBillingAddress(trimmedAddress);
      setJobAddressSameAsBilling(true);
      setJobAddress(trimmedAddress);
      jobCustomAddressRef.current = "";
    },
    [],
  );

  const handleJobAddressToggle = useCallback(
    (value: boolean) => {
      setJobAddressSameAsBilling(value);
      if (value) {
        setJobAddress(billingAddress);
      } else {
        const previousCustom = jobCustomAddressRef.current.trim();
        setJobAddress(previousCustom || billingAddress);
      }
    },
    [billingAddress],
  );

  const handleJobAddressChange = useCallback((value: string) => {
    setJobAddress(value);
    jobCustomAddressRef.current = value;
  }, []);

  const handleAddLineItem = useCallback(() => {
    setLineItems((current) => [
      ...current,
      { id: uuidv4(), name: "", quantity: "1", unitPrice: "", applyMarkup: true, templateId: null },
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

  const handleLineItemApplyMarkupChange = useCallback((itemId: string, value: boolean) => {
    setLineItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, applyMarkup: value } : item)),
    );
  }, []);

  const handleRemoveLineItem = useCallback((itemId: string) => {
    setLineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const handleApplySavedItem = useCallback(
    (savedItemId: string) => {
      const template = savedItems.find((item) => item.id === savedItemId);
      if (!template) {
        return;
      }

      setLineItems((current) => [
        ...current,
        {
          id: uuidv4(),
          name: template.name,
          quantity:
            template.default_quantity !== undefined && template.default_quantity !== null
              ? String(template.default_quantity)
              : "1",
          unitPrice: template.default_unit_price.toFixed(2),
          applyMarkup: (template.default_markup_applicable ?? 1) !== 0,
          templateId: template.id,
        },
      ]);
      setSelectedSavedItemId("");
    },
    [savedItems],
  );

  const handleSaveLineItemToLibrary = useCallback(
    async (itemId: string) => {
      const draft = lineItems.find((item) => item.id === itemId);
      if (!draft) {
        return;
      }

      const trimmedName = draft.name.trim();
      const quantityValue = parseDecimal(draft.quantity);
      const unitPriceValue = parseDecimal(draft.unitPrice);

      if (!trimmedName || quantityValue === null || unitPriceValue === null) {
        Alert.alert(
          "Saved items",
          "Enter a name, quantity, and unit price before saving this item to your library.",
        );
        return;
      }

      if (!userId) {
        Alert.alert(
          "Saved items",
          "You need to be signed in to save items to your library.",
        );
        return;
      }

      const normalizedQuantity = Math.max(1, Math.round(quantityValue));
      const normalizedUnitPrice = Math.max(0, Math.round(unitPriceValue * 100) / 100);

      setSavingLibraryItemIds((current) =>
        current.includes(itemId) ? current : [...current, itemId],
      );

      try {
        const record = await upsertSavedItem({
          id: draft.templateId ?? undefined,
          userId,
          name: trimmedName,
          unitPrice: normalizedUnitPrice,
          defaultQuantity: normalizedQuantity,
          markupApplicable: draft.applyMarkup,
        });

        setSavedItems((current) => {
          const next = [...current];
          const existingIndex = next.findIndex((item) => item.id === record.id);
          if (existingIndex >= 0) {
            next[existingIndex] = record;
          } else {
            next.push(record);
          }
          next.sort((a, b) => a.name.localeCompare(b.name));
          return next;
        });

        setLineItems((current) =>
          current.map((item) => (item.id === itemId ? { ...item, templateId: record.id } : item)),
        );

        Alert.alert("Saved items", "This line item was saved to your library.");
      } catch (error) {
        console.error("Failed to save line item to library", error);
        Alert.alert(
          "Saved items",
          "We couldn't save this item to your library. Please try again.",
        );
      } finally {
        setSavingLibraryItemIds((current) => current.filter((value) => value !== itemId));
      }
    },
    [lineItems, userId],
  );

  const handleAddPhoto = useCallback(async () => {
    if (addingPhoto) {
      return;
    }

    try {
      setAddingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Photo library access is required to attach photos to this estimate.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const estimateId = persistedData?.estimate.id ?? draftEstimateIdRef.current;
      const nextPhotos: PhotoDraft[] = [];
      for (const asset of result.assets) {
        if (!asset.uri) {
          continue;
        }
        const photoId = uuidv4();
        const storagePath = createPhotoStoragePath(estimateId, photoId, asset.uri);
        const localUri = await persistLocalPhotoCopy(photoId, storagePath, asset.uri);
        nextPhotos.push({
          id: photoId,
          storagePath,
          localUri,
          version: 1,
          persisted: false,
        });
      }

      if (nextPhotos.length > 0) {
        setPhotoDrafts((current) => [...current, ...nextPhotos]);
      }
    } catch (error) {
      console.error("Failed to add photo", error);
      Alert.alert("Error", "Unable to add the selected photos. Please try again.");
    } finally {
      setAddingPhoto(false);
    }
  }, [addingPhoto, persistedData]);

  const handleRemovePhoto = useCallback(
    (photoId: string) => {
      const photo = photoDrafts.find((item) => item.id === photoId);
      if (!photo) {
        return;
      }

      Alert.alert("Remove photo", "Remove this photo from the estimate?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setPhotoDrafts((current) => current.filter((item) => item.id !== photoId));
            if (photo.persisted) {
              setPendingPhotoDeletes((current) => [...current, photo]);
            }
          },
        },
      ]);
    },
    [photoDrafts],
  );

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
        const totals = computeLineItemTotals(
          { ...item, quantity: String(quantity), unitPrice: String(unitPrice) },
          settings.materialMarkupMode,
          settings.materialMarkup,
        );
        return {
          name,
          quantity,
          unitPrice,
          baseTotal: totals.baseTotal,
          total: totals.total,
          applyMarkup: item.applyMarkup,
          templateId: item.templateId,
        };
      })
      .filter(
        (
          item,
        ): item is {
          name: string;
          quantity: number;
          unitPrice: number;
          baseTotal: number;
          total: number;
          applyMarkup: boolean;
          templateId: string | null;
        } => item !== null,
      );

    if (lineItemError) {
      setFormErrors({ lineItems: "Fill in each item with a name, quantity, and price." });
      return null;
    }

    setFormErrors({});
    setFormError(null);

    const billingAddressValue = billingAddress.trim() ? billingAddress.trim() : null;
    const jobAddressValue = jobAddressSameAsBilling
      ? billingAddressValue
      : jobAddress.trim()
        ? jobAddress.trim()
        : null;
    const jobDetailsValue = jobDetails.trim() ? jobDetails.trim() : null;

    const estimateTotals = calculateEstimateTotals({
      materialLineItems: normalizedLineItems.map((item) => ({
        baseTotal: item.baseTotal,
        applyMarkup: item.applyMarkup,
      })),
      materialMarkup: {
        mode: settings.materialMarkupMode,
        value: settings.materialMarkup,
      },
      laborHours: laborHoursValue,
      laborRate: laborRateValue,
      laborMarkup: {
        mode: settings.laborMarkupMode,
        value: settings.laborMarkup,
      },
      taxRate,
    });

    const db = await openDB();
    const now = new Date().toISOString();
    const estimateId = persistedData?.estimate.id ?? draftEstimateIdRef.current;
    const baseStatus = persistedData?.estimate.status ?? "draft";
    const nextVersion = persistedData ? (persistedData.estimate.version ?? 1) + 1 : 1;

    const newEstimate: PersistedEstimateRecord = {
      id: estimateId,
      user_id: userId,
      customer_id: selectedCustomer.id,
      date: persistedData?.estimate.date ?? null,
      total: estimateTotals.grandTotal,
      material_total: estimateTotals.materialTotal,
      labor_hours: estimateTotals.laborHours,
      labor_rate: estimateTotals.laborRate,
      labor_total: estimateTotals.laborTotal,
      subtotal: estimateTotals.subtotal,
      tax_rate: estimateTotals.taxRate,
      tax_total: estimateTotals.taxTotal,
      notes: jobDetailsValue,
      status: baseStatus,
      version: nextVersion,
      updated_at: now,
      deleted_at: null,
      billing_address: billingAddressValue,
      job_address: jobAddressValue,
      job_details: jobDetailsValue,
    };

    try {
      if (!persistedData) {
        await db.runAsync(
          `INSERT OR REPLACE INTO estimates
             (id, user_id, customer_id, date, total, material_total, labor_hours, labor_rate, labor_total, subtotal, tax_rate, tax_total, notes, status, version, updated_at, deleted_at, billing_address, job_address, job_details)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            newEstimate.billing_address,
            newEstimate.job_address,
            newEstimate.job_details,
          ],
        );
        await queueChange("estimates", "insert", sanitizeEstimateForQueue(newEstimate));
      } else {
        await db.runAsync(
          `UPDATE estimates
             SET customer_id = ?, date = ?, total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL, billing_address = ?, job_address = ?, job_details = ?
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
            newEstimate.billing_address,
            newEstimate.job_address,
            newEstimate.job_details,
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
          base_total: item.baseTotal,
          total: item.total,
          apply_markup: item.applyMarkup ? 1 : 0,
          catalog_item_id: item.templateId,
          version: 1,
          updated_at: now,
          deleted_at: null,
        };

        await db.runAsync(
          `INSERT OR REPLACE INTO estimate_items
             (id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup, catalog_item_id, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id,
            record.estimate_id,
            record.description,
            record.quantity,
            record.unit_price,
            record.base_total,
            record.total,
            record.apply_markup,
            record.catalog_item_id,
            record.version,
            record.updated_at,
            record.deleted_at,
          ],
        );
        await queueChange("estimate_items", "insert", record);
        insertedItems.push(record);
      }

      const photosToInsert = photoDrafts.filter((photo) => !photo.persisted);
      for (const photo of photosToInsert) {
        const photoRecord = {
          id: photo.id,
          estimate_id: newEstimate.id,
          uri: photo.storagePath,
          local_uri: photo.localUri,
          description: null as string | null,
          version: photo.version,
          updated_at: now,
          deleted_at: null as string | null,
        };

        await db.runAsync(
          `INSERT OR REPLACE INTO photos (id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            photoRecord.id,
            photoRecord.estimate_id,
            photoRecord.uri,
            photoRecord.local_uri,
            photoRecord.description,
            photoRecord.version,
            photoRecord.updated_at,
            photoRecord.deleted_at,
          ],
        );

        await queueChange("photos", "insert", toPhotoQueuePayload(photoRecord));
      }

      for (const photo of pendingPhotoDeletes) {
        const nextVersion = (photo.version ?? 1) + 1;
        await db.runAsync(
          `UPDATE photos
             SET deleted_at = ?, updated_at = ?, version = ?
             WHERE id = ?`,
          [now, now, nextVersion, photo.id],
        );
        await queueChange("photos", "delete", { id: photo.id });
        await deleteLocalPhoto(photo.localUri);
      }

      setPhotoDrafts((current) =>
        current.map((photo) =>
          photosToInsert.some((item) => item.id === photo.id)
            ? { ...photo, persisted: true }
            : photo,
        ),
      );
      setPendingPhotoDeletes([]);

      setPersistedData({ estimate: newEstimate, items: insertedItems });

      const context: SavedEstimateContext = {
        estimate: newEstimate,
        items: insertedItems,
        customer: selectedCustomer,
        billingAddress: billingAddressValue,
        jobAddress: jobAddressValue,
        jobDetails: jobDetailsValue,
        laborHours: estimateTotals.laborHours,
        laborRate: estimateTotals.laborRate,
        photos: photoDrafts
          .filter((photo) => !pendingPhotoDeletes.some((pending) => pending.id === photo.id))
          .map((photo) => ({
            id: photo.id,
            localUri: photo.localUri,
            remoteUri: photo.storagePath,
          })),
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
    billingAddress,
    jobAddress,
    jobAddressSameAsBilling,
    jobDetails,
    laborHoursValue,
    laborRateValue,
    lineItems,
    pendingPhotoDeletes,
    persistedData,
    photoDrafts,
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
        notes: context.jobDetails,
        total: context.estimate.total,
        materialTotal: context.estimate.material_total,
        laborTotal: context.estimate.labor_total,
        taxTotal: context.estimate.tax_total,
        subtotal: context.estimate.subtotal,
        laborHours: context.laborHours,
        laborRate: context.laborRate,
        billingAddress: context.billingAddress,
        jobAddress: context.jobAddress,
        jobDetails: context.jobDetails,
        customer: {
          name: context.customer.name,
          email: context.customer.email,
          phone: context.customer.phone,
          address: context.billingAddress ?? context.customer.address ?? null,
        },
      },
      items: context.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice:
          item.quantity > 0
            ? Math.round((item.total / item.quantity) * 100) / 100
            : Math.round(item.total * 100) / 100,
        total: Math.round(item.total * 100) / 100,
      })),
      photos: context.photos.map((photo) => ({
        id: photo.id,
        localUri: photo.localUri ?? null,
        remoteUri: photo.remoteUri ?? null,
      })),
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
          "Add a phone number for this customer to send the estimate via text.",
        );
        return;
      }

      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Unavailable", "Text messaging isn't available on this device.");
        return;
      }

      try {
        const message = [
          `Estimate ${context.estimate.id} total: ${formatCurrency(context.estimate.total)}`,
          pdf.uri,
        ].join("\n");

        await SMS.sendSMSAsync([phone], message);
        await logEstimateDelivery({
          estimateId: context.estimate.id,
          channel: "sms",
          recipient: phone,
          messagePreview: message.length > 240 ? `${message.slice(0, 237)}...` : message,
          metadata: { pdfUri: pdf.uri },
        });
        await markEstimateSent(context, "sms");
      } catch (error) {
        console.error("Failed to share via SMS", error);
        Alert.alert("Error", "Unable to send the estimate via text.");
      }
    },
    [markEstimateSent],
  );

  const handleSaveDraft = useCallback(async () => {
    if (saving || sending || previewing) {
      return;
    }

    try {
      setSaving(true);
      const context = await saveEstimate();
      if (!context) {
        return;
      }
      Alert.alert("Estimate saved", "Draft saved successfully.");
    } finally {
      setSaving(false);
    }
  }, [previewing, saveEstimate, saving, sending]);

  const handleSaveAndSend = useCallback(async () => {
    if (saving || sending || previewing) {
      return;
    }

    try {
      setSending(true);
      const context = await saveEstimate();
      if (!context) {
        return;
      }

      const pdf = await renderEstimatePdf(buildPdfOptions(context));
      if (Platform.OS === "ios" || Platform.OS === "android") {
        Alert.alert("Send Estimate", "How would you like to share the estimate?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Email",
            onPress: () => {
              void shareViaEmail(context, pdf);
            },
          },
          {
            text: "Text message",
            onPress: () => {
              void shareViaSms(context, pdf);
            },
          },
        ]);
      } else {
        await shareViaEmail(context, pdf);
      }
    } catch (error) {
      console.error("Failed to send estimate", error);
      Alert.alert("Estimate", "We couldn't send this estimate. Please try again.");
    } finally {
      setSending(false);
    }
  }, [buildPdfOptions, previewing, saveEstimate, saving, sending, shareViaEmail, shareViaSms]);

  const handlePreview = useCallback(async () => {
    if (saving || sending || previewing) {
      return;
    }

    try {
      setPreviewing(true);
      const context = await saveEstimate();
      if (!context) {
        return;
      }

      const pdf = await renderEstimatePdf(buildPdfOptions(context));

      if (Platform.OS === "web") {
        if (!pdf.html) {
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
                Search existing customers or create a new one without leaving this screen.
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
                <ActivityIndicator color={theme.colors.accent} />
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
              <CustomerForm
                wrapInCard={false}
                onSaved={handleCustomerCreated}
                onCancel={() => setShowNewCustomerForm(false)}
              />
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

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Job Location & Billing</Text>
              <Text style={styles.sectionSubtitle}>
                Customize where work happens and where invoices are sent.
              </Text>
            </View>
            <Input
              label="Billing address"
              placeholder="Where should we send the bill?"
              value={billingAddress}
              onChangeText={setBillingAddress}
              multiline
            />
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabelGroup}>
                <Text style={styles.toggleLabel}>Job site same as billing</Text>
                <Text style={styles.toggleCaption}>
                  Turn off to enter a different service location.
                </Text>
              </View>
              <Switch
                value={jobAddressSameAsBilling}
                onValueChange={handleJobAddressToggle}
                trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
                thumbColor={jobAddressSameAsBilling ? theme.colors.accent : undefined}
              />
            </View>
            {!jobAddressSameAsBilling ? (
              <Input
                label="Job site address"
                placeholder="Where is the work happening?"
                value={jobAddress}
                onChangeText={handleJobAddressChange}
                multiline
              />
            ) : null}
          </Card>

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Job Details</Text>
              <Text style={styles.sectionSubtitle}>
                Include scope notes or instructions for your team and customer.
              </Text>
            </View>
            <Input
              label="Notes / Job description"
              placeholder="Describe the work, schedule, and important details"
              value={jobDetails}
              onChangeText={setJobDetails}
              multiline
              numberOfLines={4}
            />
          </Card>

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Line Items</Text>
              <Text style={styles.sectionSubtitle}>
                Add materials and services with inline totals.
              </Text>
            </View>
            {savedItems.length > 0 ? (
              <View style={styles.savedItemsPicker}>
                <Text style={styles.savedItemsLabel}>Add from saved items</Text>
                <View style={styles.savedItemsPickerShell}>
                  <Picker
                    selectedValue={selectedSavedItemId}
                    onValueChange={(value) => {
                      const normalized = value ? String(value) : "";
                      setSelectedSavedItemId(normalized);
                      if (normalized) {
                        handleApplySavedItem(normalized);
                      }
                    }}
                    dropdownIconColor={theme.colors.accent}
                  >
                    <Picker.Item label="Select a saved item" value="" />
                    {savedItems.map((item) => (
                      <Picker.Item key={item.id} label={item.name} value={item.id} />
                    ))}
                  </Picker>
                </View>
              </View>
            ) : null}

            <View style={styles.lineItemList}>
              {computedLineItems.length === 0 ? (
                <View style={styles.customerEmpty}>
                  <Text style={styles.customerEmptyText}>
                    No line items yet. Add your first item to build the estimate.
                  </Text>
                </View>
              ) : (
                computedLineItems.map((item) => {
                  const isSaving = savingLibraryItemIds.includes(item.id);
                  const saveLabel = item.templateId ? "Update saved item" : "Save to library";
                  return (
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
                    <View style={styles.lineItemToggleRow}>
                      <View style={styles.lineItemToggleInfo}>
                        <Text style={styles.lineItemToggleLabel}>Apply markup</Text>
                        <Text style={styles.lineItemToggleHint}>Uses your material markup setting.</Text>
                      </View>
                      <Switch
                        value={item.applyMarkup}
                        onValueChange={(value) => handleLineItemApplyMarkupChange(item.id, value)}
                        trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
                        thumbColor={item.applyMarkup ? theme.colors.accent : undefined}
                      />
                    </View>
                    <View style={styles.lineItemSummaryRow}>
                      <View style={styles.lineItemSummaryColumn}>
                        <Text style={styles.lineItemSummaryLabel}>Base total</Text>
                        <Text style={styles.lineItemSummaryHint}>Quantity × unit price</Text>
                      </View>
                      <Text style={styles.lineItemSummaryValue}>{formatCurrency(item.baseTotal)}</Text>
                    </View>
                    {item.applyMarkup && item.markupAmount > 0 ? (
                      <View style={styles.lineItemSummaryRow}>
                        <View style={styles.lineItemSummaryColumn}>
                          <Text style={styles.lineItemSummaryLabel}>Markup applied</Text>
                          <Text style={styles.lineItemSummaryHint}>
                            {settings.materialMarkupMode === "percentage"
                              ? `${settings.materialMarkup}% material markup`
                              : `${formatCurrency(settings.materialMarkup)} flat markup`}
                          </Text>
                        </View>
                        <Text style={styles.lineItemSummaryValue}>{formatCurrency(item.markupAmount)}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.lineItemSummaryRow, styles.lineItemSummaryTotalRow]}>
                      <Text style={styles.lineItemSummaryLabel}>Line total</Text>
                      <Text style={styles.lineItemSummaryTotal}>{formatCurrency(item.total)}</Text>
                    </View>
                    <View style={styles.inlineActions}>
                      <Button
                        label={saveLabel}
                        variant="secondary"
                        alignment="inline"
                        onPress={() => handleSaveLineItemToLibrary(item.id)}
                        loading={isSaving}
                        disabled={isSaving}
                      />
                      <Button
                        label="Remove"
                        variant="ghost"
                        alignment="inline"
                        onPress={() => handleRemoveLineItem(item.id)}
                      />
                    </View>
                  </View>
                  );
                })
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
                <Text style={styles.summaryLabel}>Materials</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.materialTotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Labor charge</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.laborTotal)}</Text>
              </View>
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

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Labor</Text>
              <Text style={styles.sectionSubtitle}>
                Track crew time with an hourly rate and total hours.
              </Text>
            </View>
            <View style={styles.laborGrid}>
              <Input
                label="Labor rate ($/hour)"
                placeholder="0.00"
                value={laborRateInput}
                onChangeText={setLaborRateInput}
                keyboardType="decimal-pad"
                containerStyle={styles.laborColumn}
                leftElement={<Text>$</Text>}
              />
              <Input
                label="Labor hours"
                placeholder="0"
                value={laborHoursInput}
                onChangeText={setLaborHoursInput}
                keyboardType="decimal-pad"
                containerStyle={styles.laborColumn}
              />
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Labor charge</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.laborTotal)}</Text>
              </View>
              <Text style={styles.caption}>
                The labor charge automatically feeds into your estimate grand total.
              </Text>
            </View>
          </Card>

          <Card style={{ gap: theme.spacing.lg }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Text style={styles.sectionSubtitle}>
                Attach visuals to help customers understand the work.
              </Text>
            </View>
            {photoDrafts.length === 0 ? (
              <View style={styles.photoEmpty}>
                <Text style={styles.photoEmptyText}>No photos attached yet.</Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {photoDrafts.map((photo) => (
                  <View key={photo.id} style={styles.photoCard}>
                    <Image source={{ uri: photo.localUri }} style={styles.photoImage} />
                    <View style={styles.photoFooter}>
                      <Text style={styles.caption}>Photo #{photo.id.slice(0, 6)}</Text>
                      <Button
                        label="Remove"
                        variant="ghost"
                        alignment="inline"
                        onPress={() => handleRemovePhoto(photo.id)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
            <Button
              label={addingPhoto ? "Adding…" : "Attach photos"}
              onPress={handleAddPhoto}
              loading={addingPhoto}
              disabled={addingPhoto}
              variant="secondary"
            />
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
