// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { v4 as uuidv4 } from "uuid";

import CustomerForm from "../../../components/CustomerForm";
import { type EstimateItemFormSubmit, type EstimateItemTemplate } from "../../../components/EstimateItemForm";
import { Button, Card, Input, ListItem } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import { useItemEditor, type ItemEditorConfig } from "../../../context/ItemEditorContext";
import { useSettings } from "../../../context/SettingsContext";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import {
  applyMarkup,
  calculateEstimateTotals,
  roundCurrency,
  type MarkupMode,
} from "../../../lib/estimateMath";
import { openDB, queueChange } from "../../../lib/sqlite";
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
  description: string;
  quantity: number;
  unitPrice: number;
  applyMarkup: boolean;
  templateId: string | null;
};

type PhotoDraft = {
  id: string;
  storagePath: string;
  localUri: string;
  description: string;
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
  taxRate: number;
  photos: {
    id: string;
    localUri: string | null;
    remoteUri: string | null;
    description: string | null;
  }[];
};

type FormErrors = {
  customer?: string;
  lineItems?: string;
};

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(Math.round(value * 100) / 100);
}

function formatQuantityDisplay(quantity: number): string {
  if (!Number.isFinite(quantity)) {
    return "0";
  }

  const normalized = Math.round(quantity * 1000) / 1000;
  if (Number.isInteger(normalized)) {
    return normalized.toFixed(0);
  }
  return normalized.toString();
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
  const base = roundCurrency((item.quantity || 0) * (item.unitPrice || 0));
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
    lineItemHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    lineItemHeaderInfo: {
      flex: 1,
      gap: 4,
    },
    lineItemTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    lineItemMeta: {
      fontSize: 13,
      color: theme.colors.mutedText,
    },
    savedItemsPicker: {
      gap: theme.spacing.sm,
    },
    sectionCard: {
      gap: theme.spacing.lg,
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
    photoDescriptionInput: {
      paddingHorizontal: 0,
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
  const { openEditor } = useItemEditor();
  const navigation = useRouter();
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
  const [taxRateInput, setTaxRateInput] = useState(
    defaultTaxRate > 0 ? defaultTaxRate.toFixed(2) : "",
  );

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItemRecord[]>([]);
  const [selectedSavedItemId, setSelectedSavedItemId] = useState<string>("");

  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([]);
  const [pendingPhotoDeletes, setPendingPhotoDeletes] = useState<PhotoDraft[]>([]);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [persistedData, setPersistedData] = useState<{
    estimate: PersistedEstimateRecord;
    items: PersistedEstimateItem[];
  } | null>(null);

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

  const savedItemTemplates = useMemo<EstimateItemTemplate[]>(
    () =>
      savedItems.map((item) => ({
        id: item.id,
        description: item.name,
        unit_price: item.default_unit_price,
        default_quantity: item.default_quantity,
        default_markup_applicable: item.default_markup_applicable !== 0,
      })),
    [savedItems],
  );

  const computedLineItems = useMemo(
    () =>
      lineItems.map((item) => {
        const { baseTotal, total, markupAmount } = computeLineItemTotals(
          item,
          settings.materialMarkupMode,
          settings.materialMarkup,
        );
        const unitPriceWithMarkup =
          item.quantity > 0 ? roundCurrency(total / item.quantity) : total;
        return { ...item, baseTotal, total, markupAmount, unitPriceWithMarkup };
      }),
    [lineItems, settings.materialMarkup, settings.materialMarkupMode],
  );

  const laborRateValue = useMemo(() => parseDecimal(laborRateInput) ?? 0, [laborRateInput]);
  const laborHoursValue = useMemo(() => parseDecimal(laborHoursInput) ?? 0, [laborHoursInput]);
  const taxRateValue = useMemo(() => parseDecimal(taxRateInput) ?? 0, [taxRateInput]);

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
      taxRate: taxRateValue,
    });
  }, [
    computedLineItems,
    laborHoursValue,
    laborRateValue,
    settings.laborMarkup,
    settings.laborMarkupMode,
    settings.materialMarkup,
    settings.materialMarkupMode,
    taxRateValue,
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

  const openLineItemEditor = useCallback(
    (config: ItemEditorConfig) => {
      openEditor(config);
      if (typeof navigation.push === "function") {
        navigation.push("/(tabs)/estimates/item-editor");
      }
    },
    [navigation, openEditor],
  );

  const makeLineItemSubmitHandler = useCallback(
    (existingItem?: LineItemDraft | null) =>
      async ({ values, saveToLibrary, templateId }: EstimateItemFormSubmit) => {
        let resolvedTemplateId = templateId ?? null;

        if (saveToLibrary) {
          if (!userId) {
            Alert.alert(
              "Saved items",
              "You need to be signed in to save items to your library.",
            );
          } else {
            try {
              const record = await upsertSavedItem({
                id: templateId ?? undefined,
                userId,
                name: values.description,
                unitPrice: values.unit_price,
                defaultQuantity: values.quantity,
                markupApplicable: values.apply_markup,
              });
              resolvedTemplateId = record.id;
              setSavedItems((current) => {
                const next = [...current];
                const index = next.findIndex((item) => item.id === record.id);
                if (index >= 0) {
                  next[index] = record;
                } else {
                  next.push(record);
                }
                return next.sort((a, b) => a.name.localeCompare(b.name));
              });
            } catch (error) {
              console.error("Failed to save item to library", error);
              Alert.alert(
                "Saved items",
                "We couldn't save this item to your library. The line item was still updated.",
              );
            }
          }
        }

        const nextItem: LineItemDraft = {
          id: existingItem?.id ?? uuidv4(),
          description: values.description,
          quantity: values.quantity,
          unitPrice: values.unit_price,
          applyMarkup: values.apply_markup,
          templateId: resolvedTemplateId,
        };

        setLineItems((current) => {
          if (existingItem) {
            return current.map((item) => (item.id === existingItem.id ? nextItem : item));
          }
          return [...current, nextItem];
        });
      },
    [userId],
  );

  const handleAddLineItem = useCallback(() => {
    openLineItemEditor({
      title: "Add line item",
      submitLabel: "Add line item",
      templates: () => savedItemTemplates,
      materialMarkupValue: settings.materialMarkup,
      materialMarkupMode: settings.materialMarkupMode,
      showLibraryToggle: true,
      onSubmit: makeLineItemSubmitHandler(null),
    });
  }, [makeLineItemSubmitHandler, openLineItemEditor, savedItemTemplates, settings.materialMarkup, settings.materialMarkupMode]);

  const handleEditLineItem = useCallback(
    (item: LineItemDraft) => {
      openLineItemEditor({
        title: "Edit line item",
        submitLabel: "Update line item",
        initialValue: {
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          apply_markup: item.applyMarkup,
        },
        initialTemplateId: item.templateId,
        templates: () => savedItemTemplates,
        materialMarkupValue: settings.materialMarkup,
        materialMarkupMode: settings.materialMarkupMode,
        showLibraryToggle: true,
        onSubmit: makeLineItemSubmitHandler(item),
      });
    },
    [
      makeLineItemSubmitHandler,
      openLineItemEditor,
      savedItemTemplates,
      settings.materialMarkup,
      settings.materialMarkupMode,
    ],
  );

  const handleRemoveLineItem = useCallback((itemId: string) => {
    setLineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const handleApplySavedItem = useCallback(
    (savedItemId: string) => {
      const template = savedItemTemplates.find((item) => item.id === savedItemId);
      if (!template) {
        setSelectedSavedItemId("");
        return;
      }

      openLineItemEditor({
        title: "Add line item",
        submitLabel: "Add line item",
        initialTemplateId: template.id,
        templates: () => savedItemTemplates,
        materialMarkupValue: settings.materialMarkup,
        materialMarkupMode: settings.materialMarkupMode,
        showLibraryToggle: true,
        onSubmit: async (payload) => {
          await makeLineItemSubmitHandler(null)(payload);
          setSelectedSavedItemId("");
        },
        onCancel: () => setSelectedSavedItemId(""),
      });
    },
    [
      makeLineItemSubmitHandler,
      openLineItemEditor,
      savedItemTemplates,
      settings.materialMarkup,
      settings.materialMarkupMode,
    ],
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
          description: "",
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

  const handlePhotoDescriptionChange = useCallback((photoId: string, value: string) => {
    setPhotoDrafts((current) =>
      current.map((photo) => (photo.id === photoId ? { ...photo, description: value } : photo)),
    );
  }, []);

  const handleSaveAndContinue = useCallback(async () => {
    if (saving) {
      return;
    }

    try {
      setSaving(true);
      const context = await saveEstimate();
      if (!context) {
        return;
      }
      if (typeof navigation.replace === "function") {
        navigation.replace(`/(tabs)/estimates/${context.estimate.id}`);
      }
    } finally {
      setSaving(false);
    }
  }, [navigation, saveEstimate, saving]);

  const handleCancel = useCallback(() => {
    Alert.alert("Discard estimate?", "Your current changes will be lost.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          if (typeof navigation.back === "function") {
            navigation.back();
          }
        },
      },
    ]);
  }, [navigation]);

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
    const normalizedLineItems = lineItems.map((item) => {
      const description = item.description.trim();
      const quantity = Math.max(0, Math.round(item.quantity * 1000) / 1000);
      const unitPrice = Math.max(0, Math.round(item.unitPrice * 100) / 100);

      if (!description || quantity <= 0) {
        lineItemError = true;
      }

      const sanitized: LineItemDraft = {
        ...item,
        description,
        quantity,
        unitPrice,
      };

      const totals = computeLineItemTotals(
        sanitized,
        settings.materialMarkupMode,
        settings.materialMarkup,
      );

      return {
        description,
        quantity,
        unitPrice,
        baseTotal: totals.baseTotal,
        total: totals.total,
        applyMarkup: sanitized.applyMarkup,
        templateId: sanitized.templateId,
      };
    });

    if (lineItemError) {
      setFormErrors({ lineItems: "Fill in each item with a description, quantity, and price." });
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
      taxRate: taxRateValue,
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
          description: item.description,
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
        const normalizedDescription = photo.description.trim()
          ? photo.description.trim()
          : null;
        const photoRecord = {
          id: photo.id,
          estimate_id: newEstimate.id,
          uri: photo.storagePath,
          local_uri: photo.localUri,
          description: normalizedDescription,
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
        current.map((photo) => {
          if (!photosToInsert.some((item) => item.id === photo.id)) {
            return photo;
          }
          const trimmedDescription = photo.description.trim();
          return {
            ...photo,
            description: trimmedDescription,
            persisted: true,
          };
        }),
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
        taxRate: estimateTotals.taxRate,
        photos: photoDrafts
          .filter((photo) => !pendingPhotoDeletes.some((pending) => pending.id === photo.id))
          .map((photo) => ({
            id: photo.id,
            localUri: photo.localUri,
            remoteUri: photo.storagePath,
            description: photo.description.trim() ? photo.description.trim() : null,
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
    taxRateValue,
    userId,
  ]);

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

          <Card style={styles.sectionCard}>
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

          <Card style={styles.sectionCard}>
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

          <Card style={styles.sectionCard}>
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

          <Card style={styles.sectionCard}>
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
                  const quantityDisplay = formatQuantityDisplay(item.quantity);
                  return (
                    <View key={item.id} style={styles.lineItemCard}>
                      <View style={styles.lineItemHeaderRow}>
                        <View style={styles.lineItemHeaderInfo}>
                          <Text style={styles.lineItemTitle}>{item.description}</Text>
                          <Text style={styles.lineItemMeta}>
                            Qty: {quantityDisplay} @ {formatCurrency(item.unitPriceWithMarkup)}
                          </Text>
                        </View>
                        <Text style={styles.lineItemSummaryTotal}>{formatCurrency(item.total)}</Text>
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
                      <View style={styles.inlineActions}>
                        <Button
                          label="Edit"
                          variant="secondary"
                          alignment="inline"
                          onPress={() => handleEditLineItem(item)}
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
          <Text style={styles.caption}>Adjust the tax rate above to match this project.</Text>
        </View>
      </Card>

          <Card style={styles.sectionCard}>
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
          <Input
            label="Tax rate (%)"
            placeholder="0"
            value={taxRateInput}
            onChangeText={setTaxRateInput}
            keyboardType="decimal-pad"
            rightElement={<Text>%</Text>}
          />
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Labor charge</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.laborTotal)}</Text>
            </View>
            <Text style={styles.caption}>
              Labor and tax entries automatically feed into your estimate grand total.
            </Text>
          </View>
        </Card>

          <Card style={styles.sectionCard}>
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
                {photoDrafts.map((photo, index) => (
                  <View key={photo.id} style={styles.photoCard}>
                    <Image source={{ uri: photo.localUri }} style={styles.photoImage} />
                    <View style={styles.photoFooter}>
                      <Text style={styles.caption}>Photo {index + 1}</Text>
                      <Input
                        label="Description"
                        placeholder="Add helpful context"
                        value={photo.description}
                        onChangeText={(value) => handlePhotoDescriptionChange(photo.id, value)}
                        multiline
                        numberOfLines={2}
                        containerStyle={styles.photoDescriptionInput}
                      />
                      <Button
                        label="Remove photo"
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
              label={saving ? "Saving…" : "Save & Continue"}
              onPress={handleSaveAndContinue}
              loading={saving}
              disabled={saving}
            />
            <Button
              label="Cancel"
              variant="ghost"
              onPress={handleCancel}
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
