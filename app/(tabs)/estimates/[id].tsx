import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-native-get-random-values";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as SMS from "expo-sms";
import CustomerPicker from "../../../components/CustomerPicker";
import {
  type EstimateItemFormSubmit,
  type EstimateItemTemplate,
} from "../../../components/EstimateItemForm";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import {
  useItemEditor,
  type ItemEditorConfig,
} from "../../../context/ItemEditorContext";
import {
  logEstimateDelivery,
  openDB,
  queueChange,
} from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import {
  listItemCatalog,
  upsertItemCatalog,
  type ItemCatalogRecord,
} from "../../../lib/itemCatalog";
import {
  createPhotoStoragePath,
  deleteLocalPhoto,
  deriveLocalPhotoUri,
  persistLocalPhotoCopy,
  syncPhotoBinaries,
} from "../../../lib/storage";
import {
  renderEstimatePdf,
  type EstimatePdfOptions,
  type EstimatePdfResult,
} from "../../../lib/pdf";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { formatPercentageInput } from "../../../lib/numberFormat";
import {
  Button as ThemedButton,
  Card as ThemedCard,
  Badge,
  type BadgeTone,
} from "../../../components/ui";
import { cardShadow, palette, useTheme, type Theme } from "../../../lib/theme";
import type { EstimateListItem } from "./index";
import { v4 as uuidv4 } from "uuid";

type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  catalog_item_id: string | null;
  version: number | null;
  updated_at: string;
  deleted_at: string | null;
};

type PhotoRecord = {
  id: string;
  estimate_id: string;
  uri: string;
  local_uri: string | null;
  description: string | null;
  version: number | null;
  updated_at: string;
  deleted_at: string | null;
};

type CustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

type EstimateFormDraftState = {
  customerId: string | null;
  estimateDate: string;
  notes: string;
  status: string;
  items: EstimateItemRecord[];
  laborHoursText: string;
  hourlyRateText: string;
  taxRateText: string;
  photoDrafts: Record<string, string>;
};

const estimateDraftStore = new Map<string, EstimateFormDraftState>();

function getEstimateFormDraft(
  estimateId: string,
): EstimateFormDraftState | null {
  const draft = estimateDraftStore.get(estimateId);
  if (!draft) {
    return null;
  }
  return {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    photoDrafts: { ...draft.photoDrafts },
  };
}

function setEstimateFormDraft(
  estimateId: string,
  draft: EstimateFormDraftState,
) {
  estimateDraftStore.set(estimateId, {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    photoDrafts: { ...draft.photoDrafts },
  });
}

function clearEstimateFormDraft(estimateId: string) {
  estimateDraftStore.delete(estimateId);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function toPhotoPayload(photo: PhotoRecord) {
  return {
    id: photo.id,
    estimate_id: photo.estimate_id,
    uri: photo.uri,
    description: photo.description,
    version: photo.version ?? 1,
    updated_at: photo.updated_at,
    deleted_at: photo.deleted_at,
  };
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

function getStatusTone(status: string | null): BadgeTone {
  const normalized = status?.toLowerCase();
  switch (normalized) {
    case "accepted":
      return "success";
    case "declined":
      return "danger";
    case "sent":
      return "info";
    default:
      return "warning";
  }
}

export default function EditEstimateScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const estimateId = params.id ?? "";
  const { user, session } = useAuth();
  const { settings } = useSettings();
  const theme = useTheme();
  const previewStyles = useMemo(() => createPreviewStyles(theme), [theme]);
  const userId = user?.id ?? session?.user?.id ?? null;
  const { openEditor } = useItemEditor();
  const draftRef = useRef<EstimateFormDraftState | null>(
    estimateId ? getEstimateFormDraft(estimateId) : null,
  );
  const hasRestoredDraftRef = useRef(Boolean(draftRef.current));
  const preserveDraftRef = useRef(false);

  const [estimate, setEstimate] = useState<EstimateListItem | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(
    draftRef.current?.customerId ?? null,
  );
  const [estimateDate, setEstimateDate] = useState(
    draftRef.current?.estimateDate ?? "",
  );
  const [notes, setNotes] = useState(draftRef.current?.notes ?? "");
  const [status, setStatus] = useState(draftRef.current?.status ?? "draft");
  const [items, setItems] = useState<EstimateItemRecord[]>(
    () => draftRef.current?.items.map((item) => ({ ...item })) ?? [],
  );
  const [savedItems, setSavedItems] = useState<ItemCatalogRecord[]>([]);
  const [laborHoursText, setLaborHoursText] = useState(
    draftRef.current?.laborHoursText ?? "0",
  );
  const [hourlyRateText, setHourlyRateText] = useState(
    draftRef.current?.hourlyRateText ?? settings.hourlyRate.toFixed(2),
  );
  const [taxRateText, setTaxRateText] = useState(() =>
    draftRef.current?.taxRateText ?? formatPercentageInput(settings.taxRate),
  );
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string>>(
    () => ({ ...(draftRef.current?.photoDrafts ?? {}) }),
  );
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  const [photoDeletingId, setPhotoDeletingId] = useState<string | null>(null);
  const [photoSyncing, setPhotoSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [customerContact, setCustomerContact] = useState<CustomerRecord | null>(
    null
  );

  const statusLabel = useMemo(() => {
    const option = STATUS_OPTIONS.find((option) => option.value === status);
    return option?.label ?? "Draft";
  }, [status]);
  const statusBadgeTone = useMemo(() => getStatusTone(status), [status]);
  const previewEstimateNumber = useMemo(() => {
    if (estimate?.id) {
      return estimate.id.slice(0, 8).toUpperCase();
    }
    return "—";
  }, [estimate?.id]);
  const previewCustomerName = useMemo(() => {
    return (
      customerContact?.name ?? estimate?.customer_name ?? "Client not assigned"
    );
  }, [customerContact?.name, estimate?.customer_name]);
  const previewDate = useMemo(() => {
    return estimateDate
      ? new Date(estimateDate).toLocaleDateString()
      : "Date not set";
  }, [estimateDate]);
  const estimateRef = useRef<EstimateListItem | null>(null);
  const lastPdfRef = useRef<EstimatePdfResult | null>(null);
  const releasePdfRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    if (!estimate) {
      setHourlyRateText(settings.hourlyRate.toFixed(2));
    }
  }, [estimate, settings.hourlyRate]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    if (!estimate) {
      setTaxRateText(formatPercentageInput(settings.taxRate));
    }
  }, [estimate, settings.taxRate]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      hasRestoredDraftRef.current = false;
    }
  }, []);

  const loadSavedItems = useCallback(async () => {
    if (!userId) {
      setSavedItems([]);
      return;
    }

    try {
      const records = await listItemCatalog(userId);
      setSavedItems(records);
    } catch (error) {
      console.error("Failed to load saved items", error);
    }
  }, [userId]);

  useEffect(() => {
    loadSavedItems();
  }, [loadSavedItems]);

  const parseNumericInput = useCallback((value: string, fallback = 0) => {
    const normalized = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(normalized)) {
      return fallback;
    }
    return normalized;
  }, []);

  const laborHours = useMemo(() => {
    return Math.max(0, parseNumericInput(laborHoursText, estimate?.labor_hours ?? 0));
  }, [estimate?.labor_hours, laborHoursText, parseNumericInput]);

  const hourlyRate = useMemo(() => {
    const fallback = estimate?.labor_rate ?? settings.hourlyRate;
    const parsed = parseNumericInput(hourlyRateText, fallback);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [estimate?.labor_rate, hourlyRateText, parseNumericInput, settings.hourlyRate]);

  const taxRate = useMemo(() => {
    const fallback = estimate?.tax_rate ?? settings.taxRate;
    const parsed = parseNumericInput(taxRateText, fallback);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [estimate?.tax_rate, parseNumericInput, settings.taxRate, taxRateText]);

  const totals = useMemo(
    () =>
      calculateEstimateTotals({
        materialLineItems: items,
        laborHours,
        laborRate: hourlyRate,
        taxRate,
      }),
    [hourlyRate, items, laborHours, taxRate]
  );

  const savedItemTemplates = useMemo<EstimateItemTemplate[]>(
    () =>
      savedItems.map((item) => ({
        id: item.id,
        description: item.description,
        unit_price: item.unit_price,
        default_quantity: item.default_quantity,
      })),
    [savedItems]
  );

  useEffect(() => {
    estimateRef.current = estimate;
  }, [estimate]);

  const applyPhotoState = useCallback(
    (rows: PhotoRecord[]) => {
      setPhotos(rows);
      setPhotoDrafts((current) => {
        const next: Record<string, string> = {};
        for (const row of rows) {
          const dbValue = row.description ?? "";
          const existing = current[row.id];
          if (
            existing === undefined ||
            existing === dbValue ||
            photoSavingId === row.id
          ) {
            next[row.id] = dbValue;
          } else {
            next[row.id] = existing;
          }
        }
        return next;
      });
    },
    [photoSavingId]
  );

  useEffect(() => {
    if (!customerId) {
      setCustomerContact(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<CustomerRecord>(
          `SELECT id, name, email, phone, address, notes FROM customers WHERE id = ? LIMIT 1`,
          [customerId]
        );

        if (cancelled) {
          return;
        }

        const record = rows[0];
        if (record) {
          setCustomerContact({
            id: record.id,
            name: record.name,
            email: record.email ?? null,
            phone: record.phone ?? null,
            address: record.address ?? null,
            notes: record.notes ?? null,
          });
        } else {
          setCustomerContact(null);
        }
      } catch (error) {
        console.error("Failed to load customer contact", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const refreshPhotosFromDb = useCallback(async () => {
    if (!estimateId) {
      return;
    }

    const db = await openDB();
    const rows = await db.getAllAsync<PhotoRecord>(
      `SELECT id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at
       FROM photos
       WHERE estimate_id = ?
       ORDER BY datetime(updated_at) ASC`,
      [estimateId]
    );

    const activePhotos = rows.filter((row) => !row.deleted_at);
    applyPhotoState(activePhotos);
  }, [estimateId, applyPhotoState]);

  const pdfOptions = useMemo<EstimatePdfOptions | null>(() => {
    if (!estimate) {
      return null;
    }

    const isoDate = estimateDate
      ? new Date(estimateDate).toISOString()
      : estimate.date;

    const trimmedNotes = notes.trim();

    return {
      estimate: {
        id: estimate.id,
        date: isoDate,
        status,
        notes: trimmedNotes ? trimmedNotes : null,
        total: totals.grandTotal,
        materialTotal: totals.materialTotal,
        laborTotal: totals.laborTotal,
        taxTotal: totals.taxTotal,
        subtotal: totals.subtotal,
        customer: {
          name:
            customerContact?.name ?? estimate.customer_name ?? "Customer",
          email: customerContact?.email ?? estimate.customer_email ?? null,
          phone: customerContact?.phone ?? estimate.customer_phone ?? null,
          address:
            customerContact?.address ?? estimate.customer_address ?? null,
        },
      },
      items: items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
      })),
      photos: photos.map((photo) => ({
        id: photo.id,
        description: photo.description,
        localUri:
          photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri),
        remoteUri: photo.uri,
      })),
      termsAndConditions: settings.termsAndConditions,
      paymentDetails: settings.paymentDetails,
    };
  }, [
    customerContact,
    estimate,
    estimateDate,
    items,
    notes,
    photos,
    status,
    totals.grandTotal,
    totals.laborTotal,
    totals.materialTotal,
    totals.subtotal,
    totals.taxTotal,
    settings.paymentDetails,
    settings.termsAndConditions,
  ]);

  useEffect(() => {
    lastPdfRef.current = null;
    if (releasePdfRef.current) {
      releasePdfRef.current();
      releasePdfRef.current = null;
    }
  }, [pdfOptions]);

  useEffect(() => {
    return () => {
      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
    };
  }, []);

  const openItemEditorScreen = useCallback(
    (config: ItemEditorConfig) => {
      preserveDraftRef.current = true;
      openEditor({
        ...config,
        onSubmit: async (payload) => {
          try {
            await config.onSubmit(payload);
          } finally {
            preserveDraftRef.current = false;
          }
        },
        onCancel: () => {
          try {
            config.onCancel?.();
          } finally {
            preserveDraftRef.current = false;
          }
        },
      });
      router.push("/(tabs)/estimates/item-editor");
    },
    [openEditor],
  );

  const persistEstimateTotals = useCallback(
    async (nextTotals: ReturnType<typeof calculateEstimateTotals>) => {
      const current = estimateRef.current;
      if (!current) {
        return false;
      }

      const normalizedTotal = Math.round(nextTotals.grandTotal * 100) / 100;
      const compare = (incoming: number | null | undefined, next: number) => {
        const currentValue =
          typeof incoming === "number" ? Math.round(incoming * 100) / 100 : 0;
        return Math.abs(currentValue - next) >= 0.005;
      };

      const shouldUpdate =
        compare(current.total, normalizedTotal) ||
        compare(current.material_total, nextTotals.materialTotal) ||
        compare(current.labor_total, nextTotals.laborTotal) ||
        compare(current.subtotal, nextTotals.subtotal) ||
        compare(current.tax_total, nextTotals.taxTotal) ||
        Math.abs((current.labor_hours ?? 0) - nextTotals.laborHours) >= 0.005 ||
        Math.abs((current.labor_rate ?? 0) - nextTotals.laborRate) >= 0.005 ||
        Math.abs((current.tax_rate ?? 0) - nextTotals.taxRate) >= 0.005;

      if (!shouldUpdate) {
        return false;
      }

      try {
        const now = new Date().toISOString();
        const nextVersion = (current.version ?? 1) + 1;
        const db = await openDB();
        await db.runAsync(
          `UPDATE estimates
           SET total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, version = ?, updated_at = ?
           WHERE id = ?`,
          [
            normalizedTotal,
            nextTotals.materialTotal,
            nextTotals.laborHours,
            nextTotals.laborRate,
            nextTotals.laborTotal,
            nextTotals.subtotal,
            nextTotals.taxRate,
            nextTotals.taxTotal,
            nextVersion,
            now,
            current.id,
          ]
        );

        const updatedEstimate: EstimateListItem = {
          ...current,
          total: normalizedTotal,
          material_total: nextTotals.materialTotal,
          labor_hours: nextTotals.laborHours,
          labor_rate: nextTotals.laborRate,
          labor_total: nextTotals.laborTotal,
          subtotal: nextTotals.subtotal,
          tax_rate: nextTotals.taxRate,
          tax_total: nextTotals.taxTotal,
          version: nextVersion,
          updated_at: now,
        };

        estimateRef.current = updatedEstimate;
        setEstimate(updatedEstimate);

        await queueChange(
          "estimates",
          "update",
          sanitizeEstimateForQueue(updatedEstimate)
        );
        return true;
      } catch (error) {
        console.error("Failed to update estimate totals", error);
        Alert.alert(
          "Error",
          "Unable to update the estimate totals. Please try again."
        );
        return false;
      }
    },
    []
  );

  const makeItemSubmitHandler = useCallback(
    (existingItem?: EstimateItemRecord | null) =>
      async ({ values, saveToLibrary, templateId }: EstimateItemFormSubmit) => {
        const currentEstimate = estimateRef.current;
        if (!currentEstimate) {
          return;
        }

        try {
          const now = new Date().toISOString();
          const db = await openDB();
          let resolvedTemplateId: string | null = templateId ?? null;

          if (saveToLibrary && userId) {
            try {
              const record = await upsertItemCatalog({
                id: templateId ?? undefined,
                userId,
                description: values.description,
                unitPrice: values.unit_price,
                defaultQuantity: values.quantity,
              });
              resolvedTemplateId = record.id;
              setSavedItems((prev) => {
                const existingIndex = prev.findIndex((item) => item.id === record.id);
                if (existingIndex >= 0) {
                  const next = [...prev];
                  next[existingIndex] = record;
                  return next;
                }
                return [...prev, record].sort((a, b) =>
                  a.description.localeCompare(b.description)
                );
              });
            } catch (error) {
              console.error("Failed to update item catalog", error);
              Alert.alert(
                "Saved items",
                "We couldn't update your saved items library. The estimate item was still updated."
              );
            }
          }

          let nextItems: EstimateItemRecord[] = [];

          if (existingItem) {
            const nextVersion = (existingItem.version ?? 1) + 1;
            const updatedItem: EstimateItemRecord = {
              ...existingItem,
              description: values.description,
              quantity: values.quantity,
              unit_price: values.unit_price,
              total: values.total,
              catalog_item_id: resolvedTemplateId,
              version: nextVersion,
              updated_at: now,
              deleted_at: null,
            };

            await db.runAsync(
              `UPDATE estimate_items
               SET description = ?, quantity = ?, unit_price = ?, total = ?, catalog_item_id = ?, version = ?, updated_at = ?, deleted_at = NULL
               WHERE id = ?`,
              [
                updatedItem.description,
                updatedItem.quantity,
                updatedItem.unit_price,
                updatedItem.total,
                updatedItem.catalog_item_id,
                nextVersion,
                now,
                updatedItem.id,
              ]
            );

            await queueChange("estimate_items", "update", updatedItem);

            setItems((prev) => {
              nextItems = prev.map((item) =>
                item.id === updatedItem.id ? updatedItem : item
              );
              return nextItems;
            });
          } else {
            const newItem: EstimateItemRecord = {
              id: uuidv4(),
              estimate_id: currentEstimate.id,
              description: values.description,
              quantity: values.quantity,
              unit_price: values.unit_price,
              total: values.total,
              catalog_item_id: resolvedTemplateId,
              version: 1,
              updated_at: now,
              deleted_at: null,
            };

            await db.runAsync(
              `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, catalog_item_id, version, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newItem.id,
                newItem.estimate_id,
                newItem.description,
                newItem.quantity,
                newItem.unit_price,
                newItem.total,
                newItem.catalog_item_id,
                newItem.version,
                newItem.updated_at,
                newItem.deleted_at,
              ]
            );

            await queueChange("estimate_items", "insert", newItem);

            setItems((prev) => {
              nextItems = [...prev, newItem];
              return nextItems;
            });
          }

          const nextTotals = calculateEstimateTotals({
            materialLineItems: nextItems,
            laborHours,
            laborRate: hourlyRate,
            taxRate,
          });
          await persistEstimateTotals(nextTotals);
          await runSync();
        } catch (error) {
          console.error("Failed to save estimate item", error);
          Alert.alert("Error", "Unable to save the item. Please try again.");
        }
      },
    [hourlyRate, laborHours, persistEstimateTotals, taxRate, userId]
  );

  const handleDeleteItem = useCallback(
    (item: EstimateItemRecord) => {
      Alert.alert(
        "Delete Item",
        "Are you sure you want to delete this item?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              const previousItems = items;
              const previousTotals = calculateEstimateTotals({
                materialLineItems: previousItems,
                laborHours,
                laborRate: hourlyRate,
                taxRate,
              });
              const nextItems = items.filter((existing) => existing.id !== item.id);
              const nextTotals = calculateEstimateTotals({
                materialLineItems: nextItems,
                laborHours,
                laborRate: hourlyRate,
                taxRate,
              });

              setItems(nextItems);

              (async () => {
                const db = await openDB();
                const now = new Date().toISOString();
                const nextVersion = (item.version ?? 1) + 1;

                try {
                  await db.runAsync(
                    `UPDATE estimate_items
                     SET deleted_at = ?, updated_at = ?, version = ?
                     WHERE id = ?`,
                    [now, now, nextVersion, item.id]
                  );

                  const deletedItem: EstimateItemRecord = {
                    ...item,
                    deleted_at: now,
                    updated_at: now,
                    version: nextVersion,
                  };

                  await queueChange("estimate_items", "update", deletedItem);
                  await persistEstimateTotals(nextTotals);
                  void runSync().catch((error) => {
                    console.error("Failed to sync item deletion", error);
                  });
                } catch (error) {
                  console.error("Failed to delete estimate item", error);
                  Alert.alert(
                    "Error",
                    "Unable to delete the item. Please try again."
                  );
                  setItems(previousItems);
                  try {
                    await persistEstimateTotals(previousTotals);
                    await db.runAsync(
                      `UPDATE estimate_items
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                      [item.updated_at, item.version ?? 1, item.id]
                    );
                  } catch (recoveryError) {
                    console.error("Failed to revert local item deletion", recoveryError);
                  }
                }
              })();
            },
          },
        ]
      );
    },
    [hourlyRate, items, laborHours, persistEstimateTotals, taxRate]
  );

  const renderItem = useCallback(
    ({ item }: { item: EstimateItemRecord }) => (
      <View style={styles.itemCard}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{item.description}</Text>
          <Text style={styles.itemMeta}>
            Qty: {item.quantity} @ {formatCurrency(item.unit_price)}
          </Text>
          <Text style={styles.itemMeta}>
            Line Total: {formatCurrency(item.total)}
          </Text>
        </View>
        <View style={styles.inlineButtons}>
          <View style={styles.buttonFlex}>
            <Button
              title="Edit"
              color={palette.accent}
              onPress={() =>
                openItemEditorScreen({
                  title: "Edit Item",
                  submitLabel: "Update Item",
                  initialValue: {
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                  },
                  initialTemplateId: item.catalog_item_id,
                  templates: () => savedItemTemplates,
                  onSubmit: makeItemSubmitHandler(item),
                })
              }
            />
          </View>
          <View style={styles.buttonFlex}>
            <Button
              title="Remove"
              color={palette.danger}
              onPress={() => handleDeleteItem(item)}
            />
          </View>
        </View>
      </View>
    ),
    [handleDeleteItem, makeItemSubmitHandler, openItemEditorScreen, savedItemTemplates]
  );

  const handlePhotoDraftChange = useCallback((photoId: string, value: string) => {
    setPhotoDrafts((current) => ({
      ...current,
      [photoId]: value,
    }));
  }, []);

  const handleAddPhoto = useCallback(async () => {
    if (!estimateId || addingPhoto) {
      return;
    }

    try {
      setAddingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Photo library access is required to attach photos to this estimate."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        return;
      }

      const db = await openDB();
      const now = new Date().toISOString();
      const id = uuidv4();
      const storagePath = createPhotoStoragePath(estimateId, id, asset.uri);
      const localUri = await persistLocalPhotoCopy(id, storagePath, asset.uri);

      const newPhoto: PhotoRecord = {
        id,
        estimate_id: estimateId,
        uri: storagePath,
        local_uri: localUri,
        description: null,
        version: 1,
        updated_at: now,
        deleted_at: null,
      };

      await db.runAsync(
        `INSERT OR REPLACE INTO photos (id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newPhoto.id,
          newPhoto.estimate_id,
          newPhoto.uri,
          newPhoto.local_uri,
          newPhoto.description,
          newPhoto.version,
          newPhoto.updated_at,
          newPhoto.deleted_at,
        ]
      );

      await queueChange("photos", "insert", toPhotoPayload(newPhoto));

      await runSync();
      await refreshPhotosFromDb();
    } catch (error) {
      console.error("Failed to add photo", error);
      Alert.alert("Error", "Unable to add the photo. Please try again.");
    } finally {
      setAddingPhoto(false);
    }
  }, [estimateId, addingPhoto, refreshPhotosFromDb]);

  const handleSavePhotoDescription = useCallback(
    async (photo: PhotoRecord) => {
      const draft = photoDrafts[photo.id]?.trim() ?? "";
      const normalized = draft ? draft : null;

      if ((photo.description ?? null) === normalized) {
        return;
      }

      try {
        setPhotoSavingId(photo.id);
        const db = await openDB();
        const now = new Date().toISOString();
        const nextVersion = (photo.version ?? 1) + 1;

        await db.runAsync(
          `UPDATE photos
           SET description = ?, version = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
          [normalized, nextVersion, now, photo.id]
        );

        const updated: PhotoRecord = {
          ...photo,
          description: normalized,
          version: nextVersion,
          updated_at: now,
          deleted_at: null,
        };

        await queueChange("photos", "update", toPhotoPayload(updated));

        await runSync();
        await refreshPhotosFromDb();
      } catch (error) {
        console.error("Failed to update photo description", error);
        Alert.alert(
          "Error",
          "Unable to update the photo description. Please try again."
        );
      } finally {
        setPhotoSavingId(null);
      }
    },
    [photoDrafts, refreshPhotosFromDb]
  );

  const handleDeletePhoto = useCallback(
    (photo: PhotoRecord) => {
      Alert.alert(
        "Remove Photo",
        "Are you sure you want to remove this photo?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              setPhotoDeletingId(photo.id);
              const previousPhotos = photos;
              const nextPhotos = photos.filter((existing) => existing.id !== photo.id);
              applyPhotoState(nextPhotos);

              (async () => {
                const db = await openDB();
                const now = new Date().toISOString();
                const nextVersion = (photo.version ?? 1) + 1;

                try {
                  await db.runAsync(
                    `UPDATE photos
                     SET deleted_at = ?, updated_at = ?, version = ?, local_uri = NULL
                     WHERE id = ?`,
                    [now, now, nextVersion, photo.id]
                  );

                  await deleteLocalPhoto(
                    photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri)
                  );

                  await queueChange("photos", "delete", { id: photo.id });

                  void runSync().catch((error) => {
                    console.error("Failed to sync photo deletion", error);
                  });
                  await refreshPhotosFromDb();
                } catch (error) {
                  console.error("Failed to delete photo", error);
                  Alert.alert(
                    "Error",
                    "Unable to delete the photo. Please try again."
                  );
                  applyPhotoState(previousPhotos);
                  try {
                    await db.runAsync(
                      `UPDATE photos
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                      [photo.updated_at, photo.version ?? 1, photo.id]
                    );
                  } catch (recoveryError) {
                    console.error("Failed to revert local photo deletion", recoveryError);
                  }
                } finally {
                  setPhotoDeletingId(null);
                }
              })();
            },
          },
        ]
      );
    },
    [applyPhotoState, photos, refreshPhotosFromDb]
  );

  const handleRetryPhotoSync = useCallback(async () => {
    try {
      setPhotoSyncing(true);
      await syncPhotoBinaries();
      await refreshPhotosFromDb();
    } catch (error) {
      console.error("Failed to sync photos", error);
      Alert.alert("Error", "Unable to sync photos. Please try again later.");
    } finally {
      setPhotoSyncing(false);
    }
  }, [refreshPhotosFromDb]);

  const ensurePdfReady = useCallback(async () => {
    if (!pdfOptions) {
      Alert.alert("Missing data", "Unable to build the estimate PDF.");
      return null;
    }

    try {
      const cached = lastPdfRef.current;
      if (cached) {
        return cached;
      }
      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
      const result = await renderEstimatePdf(pdfOptions);
      if (
        Platform.OS === "web" &&
        typeof URL !== "undefined" &&
        result.uri.startsWith("blob:")
      ) {
        releasePdfRef.current = () => {
          try {
            URL.revokeObjectURL(result.uri);
          } catch (error) {
            console.warn("Failed to release PDF preview", error);
          }
        };
      }
      lastPdfRef.current = result;
      return result;
    } catch (error) {
      console.error("Failed to generate PDF", error);
      Alert.alert("Error", "Unable to prepare the PDF. Please try again.");
      return null;
    }
  }, [pdfOptions]);

  const handlePreviewPdf = useCallback(async () => {
    setPdfWorking(true);
    try {
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }

      if (Platform.OS === "web") {
        if (typeof window === "undefined") {
          Alert.alert(
            "Unavailable",
            "Preview is not supported in this environment."
          );
          return;
        }
        const previewWindow = window.open("", "_blank");
        if (!previewWindow) {
          Alert.alert(
            "Popup blocked",
            "Allow popups to preview the estimate."
          );
          return;
        }
        previewWindow.document.write(pdf.html);
        previewWindow.document.close();
        return;
      }

      await Print.printAsync({ html: pdf.html });
    } catch (error) {
      console.error("Failed to preview PDF", error);
      Alert.alert("Error", "Unable to preview the PDF. Please try again.");
    } finally {
      setPdfWorking(false);
    }
  }, [ensurePdfReady]);

  const markEstimateSent = useCallback(
    async (channel: "email" | "sms") => {
      const current = estimateRef.current;
      if (!current || current.status?.toLowerCase() === "sent") {
        if (status !== "sent") {
          setStatus("sent");
        }
        return;
      }

      try {
        const now = new Date().toISOString();
        const nextVersion = (current.version ?? 1) + 1;
        const db = await openDB();
        await db.runAsync(
          `UPDATE estimates
           SET status = ?, version = ?, updated_at = ?
           WHERE id = ?`,
          ["sent", nextVersion, now, current.id]
        );

        const updated: EstimateListItem = {
          ...current,
          status: "sent",
          version: nextVersion,
          updated_at: now,
        };

        estimateRef.current = updated;
        setEstimate(updated);
        setStatus("sent");

        await queueChange(
          "estimates",
          "update",
          sanitizeEstimateForQueue(updated)
        );
        await runSync();
      } catch (error) {
        console.error("Failed to update estimate status", error);
        Alert.alert(
          "Status",
          `Your estimate was ${channel === "email" ? "emailed" : "texted"}, but we couldn't update the status automatically. Please review it manually.`
        );
      }
    },
    [setEstimate, setStatus, status]
  );

  const handleShareEmail = useCallback(async () => {
    if (!estimate) {
      return;
    }

    if (!customerContact?.email) {
      Alert.alert(
        "Missing email",
        "Add an email address for this customer to share the estimate via email."
      );
      return;
    }

    try {
      setPdfWorking(true);
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }
      const emailAddress = customerContact.email;
      const subject = encodeURIComponent(
        `Estimate ${estimate.id} from QuickQuote`
      );
      const bodyLines = [
        `Hi ${customerContact.name || "there"},`,
        "",
        "Please review your estimate from QuickQuote.",
        `Total: ${formatCurrency(totals.grandTotal)}`,
        `PDF saved at: ${pdf.uri}`,
        "",
        "Thank you!",
      ];
      const bodyPlain = bodyLines.join("\n");
      const body = encodeURIComponent(bodyPlain);
      const mailto = `mailto:${encodeURIComponent(
        emailAddress
      )}?subject=${subject}&body=${body}`;

      let canOpen = true;
      if (Platform.OS !== "web") {
        canOpen = await Linking.canOpenURL(mailto);
      }
      if (!canOpen) {
        Alert.alert(
          "Unavailable",
          "No email client is configured on this device."
        );
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
        estimateId: estimate.id,
        channel: "email",
        recipient: emailAddress,
        messagePreview:
          bodyPlain.length > 240
            ? `${bodyPlain.slice(0, 237)}...`
            : bodyPlain,
        metadata: { pdfUri: pdf.uri, mailto },
      });
      await markEstimateSent("email");
    } catch (error) {
      console.error("Failed to share via email", error);
      Alert.alert("Error", "Unable to share the estimate via email.");
    } finally {
      setPdfWorking(false);
    }
  }, [
    ensurePdfReady,
    customerContact,
    estimate,
    totals.grandTotal,
    logEstimateDelivery,
  ]);

  const handleShareSms = useCallback(async () => {
    if (!estimate) {
      return;
    }

    if (!customerContact?.phone) {
      Alert.alert(
        "Missing phone",
        "Add a mobile number for this customer to share the estimate via SMS."
      );
      return;
    }

    if (!(await SMS.isAvailableAsync())) {
      Alert.alert("Unavailable", "SMS is not supported on this device.");
      return;
    }

    try {
      setSmsSending(true);
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }
      const message = `Estimate ${estimate.id} total ${formatCurrency(
        totals.grandTotal
      )}. PDF: ${pdf.uri}`;

      let smsResponse;
      try {
        smsResponse = await SMS.sendSMSAsync(
          [customerContact.phone],
          message,
          pdf.uri
            ? {
                attachments: [
                  {
                    uri: pdf.uri,
                    mimeType: "application/pdf",
                    filename: pdf.fileName,
                  },
                ],
              }
            : undefined
        );
      } catch (error) {
        console.warn("Failed to send SMS with attachment", error);
        smsResponse = await SMS.sendSMSAsync([customerContact.phone], message);
      }

      await logEstimateDelivery({
        estimateId: estimate.id,
        channel: "sms",
        recipient: customerContact.phone,
        messagePreview:
          message.length > 240 ? `${message.slice(0, 237)}...` : message,
        metadata: {
          pdfUri: pdf.uri,
          smsResult: smsResponse?.result ?? null,
        },
      });
      await markEstimateSent("sms");
    } catch (error) {
      console.error("Failed to share via SMS", error);
      Alert.alert("Error", "Unable to share the estimate via SMS.");
    } finally {
      setSmsSending(false);
    }
  }, [
    ensurePdfReady,
    customerContact,
    estimate,
    totals.grandTotal,
    logEstimateDelivery,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadEstimate = async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<EstimateListItem>(
          `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.material_total, e.labor_hours, e.labor_rate, e.labor_total, e.subtotal, e.tax_rate, e.tax_total, e.notes, e.status, e.version, e.updated_at, e.deleted_at,
                  c.name AS customer_name,
                  c.email AS customer_email,
                  c.phone AS customer_phone,
                  c.address AS customer_address
           FROM estimates e
           LEFT JOIN customers c ON c.id = e.customer_id
           WHERE e.id = ?
           LIMIT 1`,
          [estimateId]
        );

        const record = rows[0];
        if (!record) {
          Alert.alert("Not found", "Estimate could not be found.", [
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }

        if (!isMounted) {
          return;
        }

        estimateRef.current = record;
        setEstimate(record);
        const draft = draftRef.current;
        if (!draft) {
          setCustomerId(record.customer_id);
          setEstimateDate(
            record.date ? new Date(record.date).toISOString().split("T")[0] : ""
          );
          setNotes(record.notes ?? "");
          setStatus(record.status ?? "draft");
        }
        const laborHoursValue =
          typeof record.labor_hours === "number" && Number.isFinite(record.labor_hours)
            ? Math.max(0, Math.round(record.labor_hours * 100) / 100)
            : 0;
        const laborRateValue =
          typeof record.labor_rate === "number" && Number.isFinite(record.labor_rate)
            ? Math.max(0, Math.round(record.labor_rate * 100) / 100)
            : Math.max(0, Math.round(settings.hourlyRate * 100) / 100);
        const taxRateValue =
          typeof record.tax_rate === "number" && Number.isFinite(record.tax_rate)
            ? Math.max(0, Math.round(record.tax_rate * 100) / 100)
            : Math.max(0, Math.round(settings.taxRate * 100) / 100);
        if (!draft) {
          setLaborHoursText(
            laborHoursValue % 1 === 0
              ? laborHoursValue.toFixed(0)
              : laborHoursValue.toString()
          );
          setHourlyRateText(laborRateValue.toFixed(2));
          setTaxRateText(formatPercentageInput(taxRateValue));
          setCustomerContact({
            id: record.customer_id,
            name: record.customer_name ?? "Customer",
            email: record.customer_email ?? null,
            phone: record.customer_phone ?? null,
            address: record.customer_address ?? null,
            notes: null,
          });
        }

        const itemRows = await db.getAllAsync<EstimateItemRecord>(
          `SELECT id, estimate_id, description, quantity, unit_price, total, catalog_item_id, version, updated_at, deleted_at
           FROM estimate_items
           WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY datetime(updated_at) ASC`,
          [estimateId]
        );

        const activeItems = itemRows.filter((item) => !item.deleted_at);

        if (isMounted) {
          setItems(activeItems);
        }

        const photoRows = await db.getAllAsync<PhotoRecord>(
          `SELECT id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at
           FROM photos
           WHERE estimate_id = ?
           ORDER BY datetime(updated_at) ASC`,
          [estimateId]
        );

        const activePhotos = photoRows.filter((photo) => !photo.deleted_at);

        if (isMounted) {
          applyPhotoState(activePhotos);
        }

        const recalculatedTotals = calculateEstimateTotals({
          materialLineItems: activeItems,
          laborHours: laborHoursValue,
          laborRate: laborRateValue,
          taxRate: taxRateValue,
        });
        if (isMounted) {
          const updated = await persistEstimateTotals(recalculatedTotals);
          if (updated) {
            await runSync();
          }
        }
      } catch (error) {
        console.error("Failed to load estimate", error);
        if (isMounted) {
          Alert.alert("Error", "Unable to load the estimate.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (estimateId) {
      loadEstimate();
    } else {
      setLoading(false);
      Alert.alert("Missing estimate", "No estimate ID was provided.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }

    return () => {
      isMounted = false;
    };
  }, [estimateId, persistEstimateTotals, applyPhotoState, settings.hourlyRate]);

  const handleCancel = () => {
    if (!saving) {
      if (estimateId) {
        clearEstimateFormDraft(estimateId);
      }
      router.back();
    }
  };

  const saveEstimate = useCallback(async (): Promise<EstimateListItem | null> => {
    if (!estimate || saving) {
      return null;
    }

    if (!customerId) {
      Alert.alert("Validation", "Please select a customer.");
      return null;
    }

    setSaving(true);

    try {
      const safeTotal = Math.round(totals.grandTotal * 100) / 100;
      const now = new Date().toISOString();
      let isoDate: string | null = null;
      if (estimateDate) {
        const parsedDate = new Date(estimateDate);
        isoDate = isNaN(parsedDate.getTime())
          ? now
          : new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      }

      const trimmedNotes = notes.trim() ? notes.trim() : null;
      const nextVersion = (estimate.version ?? 1) + 1;

      const db = await openDB();
      await db.runAsync(
        `UPDATE estimates
         SET customer_id = ?, date = ?, total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          customerId,
          isoDate,
          safeTotal,
          totals.materialTotal,
          totals.laborHours,
          totals.laborRate,
          totals.laborTotal,
          totals.subtotal,
          totals.taxRate,
          totals.taxTotal,
          trimmedNotes,
          status,
          nextVersion,
          now,
          estimate.id,
        ]
      );

      let customerName = estimate.customer_name;
      let customerEmail = estimate.customer_email;
      let customerPhone = estimate.customer_phone;
      let customerAddress = estimate.customer_address;
      if (customerId !== estimate.customer_id) {
        const customerRows = await db.getAllAsync<{
          name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        }>(
          `SELECT name, email, phone, address, notes FROM customers WHERE id = ? LIMIT 1`,
          [customerId]
        );
        const customerRecord = customerRows[0];
        customerName = customerRecord?.name ?? customerName ?? null;
        customerEmail = customerRecord?.email ?? null;
        customerPhone = customerRecord?.phone ?? null;
        customerAddress = customerRecord?.address ?? null;
      }

      const updatedEstimate: EstimateListItem = {
        ...estimate,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail ?? null,
        customer_phone: customerPhone ?? null,
        customer_address: customerAddress ?? null,
        date: isoDate,
        total: safeTotal,
        material_total: totals.materialTotal,
        labor_hours: totals.laborHours,
        labor_rate: totals.laborRate,
        labor_total: totals.laborTotal,
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_total: totals.taxTotal,
        notes: trimmedNotes,
        status,
        version: nextVersion,
        updated_at: now,
        deleted_at: null,
      };

      await queueChange(
        "estimates",
        "update",
        sanitizeEstimateForQueue(updatedEstimate)
      );
      await runSync();

      estimateRef.current = updatedEstimate;
      setEstimate(updatedEstimate);
      setCustomerContact({
        id: customerId,
        name: customerName ?? "Customer",
        email: customerEmail ?? null,
        phone: customerPhone ?? null,
        address: customerAddress ?? null,
        notes: customerContact?.notes ?? null,
      });

      if (estimateId) {
        clearEstimateFormDraft(estimateId);
      }

      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
      lastPdfRef.current = null;

      return updatedEstimate;
    } catch (error) {
      console.error("Failed to update estimate", error);
      Alert.alert("Error", "Unable to update the estimate. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    customerContact,
    customerId,
    estimate,
    estimateDate,
    estimateId,
    notes,
    runSync,
    saving,
    status,
    totals.grandTotal,
    totals.laborHours,
    totals.laborRate,
    totals.laborTotal,
    totals.materialTotal,
    totals.subtotal,
    totals.taxRate,
    totals.taxTotal,
  ]);

  const handleSaveDraft = useCallback(async () => {
    const updated = await saveEstimate();
    if (updated) {
      Alert.alert("Draft saved", "Your estimate has been saved as a draft.");
    }
  }, [saveEstimate]);

  const handleSaveAndPreview = useCallback(async () => {
    const updated = await saveEstimate();
    if (!updated) {
      return;
    }
    await handlePreviewPdf();
  }, [handlePreviewPdf, saveEstimate]);

  useEffect(() => {
    if (!estimateId) {
      return;
    }
    setEstimateFormDraft(estimateId, {
      customerId,
      estimateDate,
      notes,
      status,
      items,
      laborHoursText,
      hourlyRateText,
      taxRateText,
      photoDrafts,
    });
  }, [
    customerId,
    estimateDate,
    estimateId,
    items,
    laborHoursText,
    hourlyRateText,
    notes,
    photoDrafts,
    status,
    taxRateText,
  ]);

  useEffect(() => {
    return () => {
      if (!estimateId) {
        return;
      }
      if (!preserveDraftRef.current) {
        clearEstimateFormDraft(estimateId);
      }
      preserveDraftRef.current = false;
    };
  }, [estimateId]);

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (!estimate) {
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.pageTitle}>Edit Estimate</Text>
        <Text style={styles.sectionSubtitle}>
          Update pricing, attach photos, and send a polished quote in seconds.
        </Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Customer</Text>
          <CustomerPicker
            selectedCustomer={customerId}
            onSelect={(id) => setCustomerId(id)}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.mutedText}
            value={estimateDate}
            onChangeText={setEstimateDate}
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <Text style={styles.sectionSubtitle}>
          Give your crew context with job site reference shots.
        </Text>
        {photos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No photos attached yet.</Text>
          </View>
        ) : (
          photos.map((photo) => {
            const draft = photoDrafts[photo.id] ?? "";
            const isSaving = photoSavingId === photo.id;
            const isDeleting = photoDeletingId === photo.id;

            return (
              <View key={photo.id} style={styles.photoCard}>
                {photo.local_uri ? (
                  <Image
                    source={{ uri: photo.local_uri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>
                      Photo unavailable offline. Use sync to restore the local
                      copy.
                    </Text>
                  </View>
                )}
                <TextInput
                  placeholder="Add a description"
                  placeholderTextColor={palette.mutedText}
                  value={draft}
                  onChangeText={(text) => handlePhotoDraftChange(photo.id, text)}
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                />
                <View style={styles.inlineButtons}>
                  <View style={styles.buttonFlex}>
                    <Button
                      title="Save"
                      color={palette.accent}
                      onPress={() => handleSavePhotoDescription(photo)}
                      disabled={isSaving}
                    />
                  </View>
                  <View style={styles.buttonFlex}>
                    <Button
                      title="Remove"
                      color={palette.danger}
                      onPress={() => handleDeletePhoto(photo)}
                      disabled={isDeleting}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
        {photos.length > 0 ? (
          <Button
            title={photoSyncing ? "Syncing photos..." : "Sync photos"}
            onPress={handleRetryPhotoSync}
            disabled={photoSyncing}
            color={palette.accent}
          />
        ) : null}
        <Button
          title={addingPhoto ? "Adding photo..." : "Add Photo"}
          onPress={handleAddPhoto}
          disabled={addingPhoto}
          color={palette.accent}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Estimate items</Text>
        <Text style={styles.sectionSubtitle}>
          Track the work you&apos;re quoting. Saved items help you move fast.
        </Text>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No items added yet.</Text>
            </View>
          }
        />
        <Button
          title="Add line item"
          color={palette.accent}
          onPress={() =>
            openItemEditorScreen({
              title: "Add line item",
              submitLabel: "Add line item",
              templates: () => savedItemTemplates,
              initialTemplateId: null,
              onSubmit: makeItemSubmitHandler(null),
            })
          }
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Labor &amp; tax</Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Project hours</Text>
          <TextInput
            placeholder="0"
            placeholderTextColor={palette.mutedText}
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Hourly rate</Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefixSymbol}>$</Text>
            <TextInput
              placeholder="0.00"
              placeholderTextColor={palette.mutedText}
              value={hourlyRateText}
              onChangeText={setHourlyRateText}
              keyboardType="decimal-pad"
              style={[styles.input, styles.inputGrow]}
            />
          </View>
          <Text style={styles.helpText}>
            Labor total (not shown to customers): {formatCurrency(totals.laborTotal)}
          </Text>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Tax rate</Text>
          <View style={styles.inputRow}>
            <TextInput
              placeholder="0"
              placeholderTextColor={palette.mutedText}
              value={taxRateText}
              onChangeText={setTaxRateText}
              keyboardType="decimal-pad"
              style={[styles.input, styles.inputGrow]}
            />
            <Text style={styles.suffixSymbol}>%</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Estimate summary</Text>
        <View style={styles.totalsCard}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Materials</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(totals.materialTotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Labor</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(totals.laborTotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(totals.taxTotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsGrand}>Project total</Text>
            <Text style={styles.totalsGrand}>
              {formatCurrency(totals.grandTotal)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Status &amp; notes</Text>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.pickerShell}>
            <Picker selectedValue={status} onValueChange={(value) => setStatus(value)}>
              {STATUS_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </Picker>
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Internal notes</Text>
          <TextInput
            placeholder="Add private notes for your team"
            placeholderTextColor={palette.mutedText}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />
        </View>
      </View>

      <ThemedCard style={[styles.card, previewStyles.card]}>
        <View style={previewStyles.headerBand}>
          <Text style={previewStyles.headerText}>QuickQuote</Text>
        </View>
        <View style={previewStyles.summaryBlock}>
          <Text style={previewStyles.summaryTitle}>
            Estimate {previewEstimateNumber}
          </Text>
          <Text style={previewStyles.summarySubtitle}>{previewCustomerName}</Text>
          <Text style={previewStyles.summaryMeta}>{previewDate}</Text>
          <View style={previewStyles.summaryRow}>
            <Text style={previewStyles.summaryLabel}>Project total</Text>
            <Text style={previewStyles.summaryTotal}>
              {formatCurrency(totals.grandTotal)}
            </Text>
          </View>
        </View>
        <Badge tone={statusBadgeTone} style={previewStyles.statusBadge}>
          {statusLabel}
        </Badge>
        <Text style={previewStyles.actionHint}>
          Preview your polished PDF and send it straight to the client.
        </Text>
        <View style={previewStyles.actionColumn}>
          <ThemedButton
            label="Save & Preview"
            variant="secondary"
            onPress={handleSaveAndPreview}
            disabled={pdfWorking || smsSending || saving}
            style={previewStyles.fullWidth}
          />
          <ThemedButton
            label="Share via Email"
            onPress={handleShareEmail}
            disabled={pdfWorking || smsSending}
            style={previewStyles.fullWidth}
          />
          <ThemedButton
            label="Share via SMS"
            variant="secondary"
            onPress={handleShareSms}
            disabled={smsSending || pdfWorking}
            style={previewStyles.fullWidth}
          />
        </View>
      </ThemedCard>

      <View style={styles.footerButtons}>
        <View style={styles.buttonFlex}>
          <ThemedButton
            label="Cancel"
            variant="secondary"
            onPress={handleCancel}
            disabled={saving}
            style={previewStyles.fullWidth}
          />
        </View>
        <View style={styles.buttonFlex}>
          <ThemedButton
            label={saving ? "Saving…" : "Save Draft"}
            onPress={handleSaveDraft}
            disabled={saving}
            style={previewStyles.fullWidth}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function createPreviewStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      padding: 0,
      gap: 0,
      overflow: "hidden",
      alignItems: "stretch",
    },
    headerBand: {
      backgroundColor: theme.accent,
      paddingHorizontal: 24,
      paddingVertical: 18,
    },
    headerText: {
      color: theme.surface,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    summaryBlock: {
      paddingHorizontal: 24,
      paddingVertical: 20,
      gap: 8,
      backgroundColor: theme.surface,
    },
    summaryTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: theme.primaryText,
    },
    summarySubtitle: {
      fontSize: 16,
      color: theme.secondaryText,
    },
    summaryMeta: {
      fontSize: 14,
      color: theme.mutedText,
    },
    summaryRow: {
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    summaryLabel: {
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: theme.mutedText,
    },
    summaryTotal: {
      fontSize: 26,
      fontWeight: "700",
      color: theme.primaryText,
    },
    statusBadge: {
      alignSelf: "center",
      marginTop: 20,
    },
    actionHint: {
      paddingHorizontal: 24,
      textAlign: "center",
      fontSize: 14,
      color: theme.secondaryText,
      marginTop: 16,
    },
    actionColumn: {
      padding: 24,
      paddingTop: 12,
      gap: 12,
    },
    fullWidth: {
      alignSelf: "stretch",
    },
  });
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.background,
  },
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
    gap: 20,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 22,
    padding: 20,
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(16),
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: palette.primaryText,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.primaryText,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: palette.secondaryText,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontWeight: "600",
    color: palette.primaryText,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: palette.primaryText,
    backgroundColor: palette.surfaceSubtle,
  },
  textArea: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: palette.primaryText,
    minHeight: 100,
    textAlignVertical: "top",
    backgroundColor: palette.surfaceSubtle,
  },
  inlineButtons: {
    flexDirection: "row",
    gap: 12,
  },
  buttonFlex: {
    flex: 1,
  },
  photoCard: {
    gap: 12,
    backgroundColor: palette.surfaceSubtle,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(8),
  },
  photoImage: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  photoPlaceholder: {
    height: 180,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12,
  },
  photoPlaceholderText: {
    textAlign: "center",
    color: palette.secondaryText,
  },
  emptyCard: {
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderColor: palette.border,
    backgroundColor: palette.surfaceSubtle,
  },
  emptyText: {
    color: palette.mutedText,
  },
  itemSeparator: {
    height: 12,
  },
  itemCard: {
    backgroundColor: palette.surfaceSubtle,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(6),
  },
  itemInfo: {
    gap: 4,
  },
  itemTitle: {
    fontWeight: "600",
    color: palette.primaryText,
  },
  itemMeta: {
    color: palette.secondaryText,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputGrow: {
    flex: 1,
  },
  prefixSymbol: {
    fontWeight: "700",
    color: palette.primaryText,
  },
  suffixSymbol: {
    fontWeight: "700",
    color: palette.primaryText,
  },
  helpText: {
    fontSize: 12,
    color: palette.secondaryText,
  },
  pickerShell: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: palette.surfaceSubtle,
  },
  totalsCard: {
    gap: 10,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalsLabel: {
    color: palette.secondaryText,
  },
  totalsValue: {
    fontWeight: "600",
    color: palette.primaryText,
  },
  totalsGrand: {
    fontSize: 18,
    fontWeight: "700",
    color: palette.primaryText,
  },
  footerButtons: {
    flexDirection: "row",
    gap: 12,
    paddingBottom: 16,
  },
});
