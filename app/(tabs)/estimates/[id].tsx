import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-native-get-random-values";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
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
import { useItemEditor, type ItemEditorConfig } from "../../../context/ItemEditorContext";
import { logEstimateDelivery, openDB, queueChange } from "../../../lib/sqlite";
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
  Badge,
  Body,
  Button,
  Card,
  Input,
  ListItem,
  Subtitle,
  Title,
  type BadgeTone,
} from "../../../components/ui";
import { useTheme, type Theme } from "../../../theme";
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

function getEstimateFormDraft(estimateId: string): EstimateFormDraftState | null {
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

function setEstimateFormDraft(estimateId: string, draft: EstimateFormDraftState) {
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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const previewStyles = useMemo(() => createPreviewStyles(theme), [theme]);
  const colors = theme.colors;
  const userId = user?.id ?? session?.user?.id ?? null;
  const { openEditor } = useItemEditor();
  const draftRef = useRef<EstimateFormDraftState | null>(
    estimateId ? getEstimateFormDraft(estimateId) : null,
  );
  const hasRestoredDraftRef = useRef(Boolean(draftRef.current));
  const preserveDraftRef = useRef(false);

  const [estimate, setEstimate] = useState<EstimateListItem | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(draftRef.current?.customerId ?? null);
  const [estimateDate, setEstimateDate] = useState(draftRef.current?.estimateDate ?? "");
  const [notes, setNotes] = useState(draftRef.current?.notes ?? "");
  const [status, setStatus] = useState(draftRef.current?.status ?? "draft");
  const [items, setItems] = useState<EstimateItemRecord[]>(
    () => draftRef.current?.items.map((item) => ({ ...item })) ?? [],
  );
  const [savedItems, setSavedItems] = useState<ItemCatalogRecord[]>([]);
  const [laborHoursText, setLaborHoursText] = useState(draftRef.current?.laborHoursText ?? "0");
  const [hourlyRateText, setHourlyRateText] = useState(
    draftRef.current?.hourlyRateText ?? settings.hourlyRate.toFixed(2),
  );
  const [taxRateText, setTaxRateText] = useState(
    () => draftRef.current?.taxRateText ?? formatPercentageInput(settings.taxRate),
  );
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string>>(() => ({
    ...(draftRef.current?.photoDrafts ?? {}),
  }));
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  const [photoDeletingId, setPhotoDeletingId] = useState<string | null>(null);
  const [photoSyncing, setPhotoSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [customerContact, setCustomerContact] = useState<CustomerRecord | null>(null);

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
    return customerContact?.name ?? estimate?.customer_name ?? "Client not assigned";
  }, [customerContact?.name, estimate?.customer_name]);
  const previewDate = useMemo(() => {
    return estimateDate ? new Date(estimateDate).toLocaleDateString() : "Date not set";
  }, [estimateDate]);
  const previewLineItems = useMemo(() => {
    const count = items.length;
    if (count === 0) {
      return "No line items";
    }
    return count === 1 ? "1 line item" : `${count} line items`;
  }, [items]);
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
    [hourlyRate, items, laborHours, taxRate],
  );

  const savedItemTemplates = useMemo<EstimateItemTemplate[]>(
    () =>
      savedItems.map((item) => ({
        id: item.id,
        description: item.description,
        unit_price: item.unit_price,
        default_quantity: item.default_quantity,
      })),
    [savedItems],
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
          if (existing === undefined || existing === dbValue || photoSavingId === row.id) {
            next[row.id] = dbValue;
          } else {
            next[row.id] = existing;
          }
        }
        return next;
      });
    },
    [photoSavingId],
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
          [customerId],
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
      [estimateId],
    );

    const activePhotos = rows.filter((row) => !row.deleted_at);
    applyPhotoState(activePhotos);
  }, [estimateId, applyPhotoState]);

  const pdfOptions = useMemo<EstimatePdfOptions | null>(() => {
    if (!estimate) {
      return null;
    }

    const isoDate = estimateDate ? new Date(estimateDate).toISOString() : estimate.date;

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
          name: customerContact?.name ?? estimate.customer_name ?? "Customer",
          email: customerContact?.email ?? estimate.customer_email ?? null,
          phone: customerContact?.phone ?? estimate.customer_phone ?? null,
          address: customerContact?.address ?? estimate.customer_address ?? null,
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
        localUri: photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri),
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
        const currentValue = typeof incoming === "number" ? Math.round(incoming * 100) / 100 : 0;
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
          ],
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

        await queueChange("estimates", "update", sanitizeEstimateForQueue(updatedEstimate));
        return true;
      } catch (error) {
        console.error("Failed to update estimate totals", error);
        Alert.alert("Error", "Unable to update the estimate totals. Please try again.");
        return false;
      }
    },
    [],
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
                return [...prev, record].sort((a, b) => a.description.localeCompare(b.description));
              });
            } catch (error) {
              console.error("Failed to update item catalog", error);
              Alert.alert(
                "Saved items",
                "We couldn't update your saved items library. The estimate item was still updated.",
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
              ],
            );

            await queueChange("estimate_items", "update", updatedItem);

            setItems((prev) => {
              nextItems = prev.map((item) => (item.id === updatedItem.id ? updatedItem : item));
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
              ],
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
    [hourlyRate, laborHours, persistEstimateTotals, taxRate, userId],
  );

  const handleDeleteItem = useCallback(
    (item: EstimateItemRecord) => {
      Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
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
                  [now, now, nextVersion, item.id],
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
                Alert.alert("Error", "Unable to delete the item. Please try again.");
                setItems(previousItems);
                try {
                  await persistEstimateTotals(previousTotals);
                  await db.runAsync(
                    `UPDATE estimate_items
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                    [item.updated_at, item.version ?? 1, item.id],
                  );
                } catch (recoveryError) {
                  console.error("Failed to revert local item deletion", recoveryError);
                }
              }
            })();
          },
        },
      ]);
    },
    [hourlyRate, items, laborHours, persistEstimateTotals, taxRate],
  );

  const renderItem = useCallback(
    ({ item }: { item: EstimateItemRecord }) => (
      <View style={styles.lineItemRow}>
        <ListItem
          title={item.description}
          subtitle={`Qty: ${item.quantity} @ ${formatCurrency(item.unit_price)}`}
          rightContent={<Body style={styles.lineItemTotal}>{formatCurrency(item.total)}</Body>}
          style={styles.lineItem}
        />
        <View style={styles.lineItemActions}>
          <Button
            label="Edit"
            variant="secondary"
            alignment="inline"
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
            style={styles.lineItemActionButton}
          />
          <Button
            label="Remove"
            variant="danger"
            alignment="inline"
            onPress={() => handleDeleteItem(item)}
            style={styles.lineItemActionButton}
          />
        </View>
      </View>
    ),
    [handleDeleteItem, makeItemSubmitHandler, openItemEditorScreen, savedItemTemplates],
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
          "Photo library access is required to attach photos to this estimate.",
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
        ],
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
          [normalized, nextVersion, now, photo.id],
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
        Alert.alert("Error", "Unable to update the photo description. Please try again.");
      } finally {
        setPhotoSavingId(null);
      }
    },
    [photoDrafts, refreshPhotosFromDb],
  );

  const handleDeletePhoto = useCallback(
    (photo: PhotoRecord) => {
      Alert.alert("Remove Photo", "Are you sure you want to remove this photo?", [
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
                  [now, now, nextVersion, photo.id],
                );

                await deleteLocalPhoto(photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri));

                await queueChange("photos", "delete", { id: photo.id });

                void runSync().catch((error) => {
                  console.error("Failed to sync photo deletion", error);
                });
                await refreshPhotosFromDb();
              } catch (error) {
                console.error("Failed to delete photo", error);
                Alert.alert("Error", "Unable to delete the photo. Please try again.");
                applyPhotoState(previousPhotos);
                try {
                  await db.runAsync(
                    `UPDATE photos
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                    [photo.updated_at, photo.version ?? 1, photo.id],
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
      ]);
    },
    [applyPhotoState, photos, refreshPhotosFromDb],
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
      if (Platform.OS === "web" && typeof URL !== "undefined" && result.uri.startsWith("blob:")) {
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
        setSendSuccessMessage(
          channel === "email"
            ? "Estimate sent to your client via email."
            : "Estimate sent to your client via text message.",
        );
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
          ["sent", nextVersion, now, current.id],
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
        setSendSuccessMessage(
          channel === "email"
            ? "Estimate sent to your client via email."
            : "Estimate sent to your client via text message.",
        );

        await queueChange("estimates", "update", sanitizeEstimateForQueue(updated));
        await runSync();
      } catch (error) {
        console.error("Failed to update estimate status", error);
        Alert.alert(
          "Status",
          `Your estimate was ${channel === "email" ? "emailed" : "texted"}, but we couldn't update the status automatically. Please review it manually.`,
        );
      }
    },
    [setEstimate, setSendSuccessMessage, setStatus, status],
  );

  const handleShareEmail = useCallback(async () => {
    if (!estimate) {
      return;
    }

    if (!customerContact?.email) {
      Alert.alert(
        "Missing email",
        "Add an email address for this customer to share the estimate via email.",
      );
      return;
    }

    try {
      setSendSuccessMessage(null);
      setPdfWorking(true);
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }
      const emailAddress = customerContact.email;
      const subject = encodeURIComponent(`Estimate ${estimate.id} from QuickQuote`);
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
      const mailto = `mailto:${encodeURIComponent(emailAddress)}?subject=${subject}&body=${body}`;

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
        estimateId: estimate.id,
        channel: "email",
        recipient: emailAddress,
        messagePreview: bodyPlain.length > 240 ? `${bodyPlain.slice(0, 237)}...` : bodyPlain,
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
    setSendSuccessMessage,
  ]);

  const handleShareSms = useCallback(async () => {
    if (!estimate) {
      return;
    }

    if (!customerContact?.phone) {
      Alert.alert(
        "Missing phone",
        "Add a mobile number for this customer to share the estimate via SMS.",
      );
      return;
    }

    if (!(await SMS.isAvailableAsync())) {
      Alert.alert("Unavailable", "SMS is not supported on this device.");
      return;
    }

    try {
      setSendSuccessMessage(null);
      setSmsSending(true);
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }
      const message = `Estimate ${estimate.id} total ${formatCurrency(
        totals.grandTotal,
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
            : undefined,
        );
      } catch (error) {
        console.warn("Failed to send SMS with attachment", error);
        smsResponse = await SMS.sendSMSAsync([customerContact.phone], message);
      }

      await logEstimateDelivery({
        estimateId: estimate.id,
        channel: "sms",
        recipient: customerContact.phone,
        messagePreview: message.length > 240 ? `${message.slice(0, 237)}...` : message,
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
    setSendSuccessMessage,
  ]);

  const handleSendToClient = useCallback(() => {
    const hasEmail = Boolean(customerContact?.email);
    const hasPhone = Boolean(customerContact?.phone);

    if (!hasEmail && !hasPhone) {
      Alert.alert(
        "Add client contact",
        "Add an email address or mobile number before sending this estimate.",
      );
      return;
    }

    const sendEmail = () => {
      void handleShareEmail();
    };
    const sendSms = () => {
      void handleShareSms();
    };

    if (hasEmail && hasPhone) {
      Alert.alert("Send estimate", "Choose how you'd like to send the estimate.", [
        { text: "Cancel", style: "cancel" },
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
  }, [customerContact?.email, customerContact?.phone, handleShareEmail, handleShareSms]);

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
          [estimateId],
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
          setEstimateDate(record.date ? new Date(record.date).toISOString().split("T")[0] : "");
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
            laborHoursValue % 1 === 0 ? laborHoursValue.toFixed(0) : laborHoursValue.toString(),
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
          [estimateId],
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
          [estimateId],
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
        ],
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
        }>(`SELECT name, email, phone, address, notes FROM customers WHERE id = ? LIMIT 1`, [
          customerId,
        ]);
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

      await queueChange("estimates", "update", sanitizeEstimateForQueue(updatedEstimate));
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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!estimate) {
    return null;
  }

  const sendingToClient = pdfWorking || smsSending;

  return (
    <View style={styles.screenContainer}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <ListItem
            title="Edit Estimate"
            subtitle="Update pricing, attach photos, and send a polished quote in seconds."
            style={styles.headerIntro}
            titleStyle={styles.headerTitle}
            subtitleStyle={styles.headerSubtitle}
          />
          <View style={styles.headerField}>
            <Body style={styles.headerLabel}>Customer</Body>
            <CustomerPicker selectedCustomer={customerId} onSelect={(id) => setCustomerId(id)} />
          </View>
          <Input
            label="Date"
            placeholder="YYYY-MM-DD"
            value={estimateDate}
            onChangeText={setEstimateDate}
            autoCapitalize="none"
          />
        </Card>

        <Card style={styles.photosCard}>
          <View style={styles.photosHeader}>
            <Title style={styles.sectionTitle}>Photos</Title>
            <Subtitle style={styles.sectionSubtitle}>
              Give your crew context with job site reference shots.
            </Subtitle>
          </View>
          {photos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Body style={styles.emptyText}>No photos attached yet.</Body>
            </View>
          ) : (
            <View style={styles.photosList}>
              {photos.map((photo) => {
                const draft = photoDrafts[photo.id] ?? "";
                const isSaving = photoSavingId === photo.id;
                const isDeleting = photoDeletingId === photo.id;

                return (
                  <Card key={photo.id} style={styles.photoCard} elevated={false}>
                    {photo.local_uri ? (
                      <Image
                        source={{ uri: photo.local_uri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Body style={styles.photoPlaceholderText}>
                          Photo unavailable offline. Use sync to restore the local copy.
                        </Body>
                      </View>
                    )}
                    <Input
                      placeholder="Add a description"
                      value={draft}
                      onChangeText={(text) => handlePhotoDraftChange(photo.id, text)}
                      multiline
                      containerStyle={styles.photoInput}
                    />
                    <View style={styles.photoButtonRow}>
                      <Button
                        label="Save"
                        variant="secondary"
                        onPress={() => handleSavePhotoDescription(photo)}
                        disabled={isSaving}
                        loading={isSaving}
                        style={styles.photoButton}
                        alignment="inline"
                      />
                      <Button
                        label="Remove"
                        variant="danger"
                        onPress={() => handleDeletePhoto(photo)}
                        disabled={isDeleting}
                        loading={isDeleting}
                        style={styles.photoButton}
                        alignment="inline"
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
          {photos.length > 0 ? (
            <Button
              label={photoSyncing ? "Syncing photos..." : "Sync photos"}
              onPress={handleRetryPhotoSync}
              disabled={photoSyncing}
              loading={photoSyncing}
              variant="secondary"
            />
          ) : null}
          <Button
            label={addingPhoto ? "Adding photo..." : "Add Photo"}
            onPress={handleAddPhoto}
            disabled={addingPhoto}
            loading={addingPhoto}
          />
        </Card>

        <Card style={styles.lineItemsCard}>
          <View style={styles.lineItemsHeader}>
            <Title style={styles.sectionTitle}>Estimate items</Title>
            <Subtitle style={styles.sectionSubtitle}>
              Track the work you&apos;re quoting. Saved items help you move fast.
            </Subtitle>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.lineItemSeparator} />}
            contentContainerStyle={styles.lineItemsList}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Body style={styles.emptyText}>No items added yet.</Body>
              </View>
            }
          />
          <Button
            label="Add line item"
            onPress={() =>
              openItemEditorScreen({
                title: "Add line item",
                submitLabel: "Add line item",
                templates: () => savedItemTemplates,
                initialTemplateId: null,
                onSubmit: makeItemSubmitHandler(null),
              })
            }
            style={styles.lineItemAddButton}
          />
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Labor &amp; tax</Title>
          <Input
            label="Project hours"
            placeholder="0"
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="decimal-pad"
          />
          <Input
            label="Hourly rate"
            placeholder="0.00"
            value={hourlyRateText}
            onChangeText={setHourlyRateText}
            keyboardType="decimal-pad"
            leftElement={<Body style={styles.inputAdornment}>$</Body>}
            caption={`Labor total (not shown to customers): ${formatCurrency(totals.laborTotal)}`}
          />
          <Input
            label="Tax rate"
            placeholder="0"
            value={taxRateText}
            onChangeText={setTaxRateText}
            keyboardType="decimal-pad"
            rightElement={<Body style={styles.inputAdornment}>%</Body>}
          />
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Estimate summary</Title>
          <View style={styles.summaryList}>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Materials</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.materialTotal)}</Body>
            </View>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Labor</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.laborTotal)}</Body>
            </View>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Tax</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.taxTotal)}</Body>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Subtitle style={styles.summaryTotalLabel}>Project total</Subtitle>
              <Title style={styles.summaryTotalValue}>{formatCurrency(totals.grandTotal)}</Title>
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Status &amp; notes</Title>
          <View style={styles.fieldGroup}>
            <Body style={styles.fieldLabel}>Status</Body>
            <View style={styles.pickerShell}>
              <Picker selectedValue={status} onValueChange={(value) => setStatus(value)}>
                {STATUS_OPTIONS.map((option) => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Input
              label="Internal notes"
              placeholder="Add private notes for your team"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              inputStyle={styles.notesInput}
            />
          </View>
        </Card>
        <View style={previewStyles.previewSection}>
          <Title style={previewStyles.previewTitle}>Send to client preview</Title>
          <Subtitle style={previewStyles.previewSubtitle}>
            Double-check the essentials before sharing the full PDF with your client.
          </Subtitle>
          {sendSuccessMessage ? (
            <View style={previewStyles.successBanner}>
              <Body style={previewStyles.successText}>{sendSuccessMessage}</Body>
            </View>
          ) : null}
          <Card style={previewStyles.previewCard}>
            <View style={previewStyles.previewHeader}>
              <View style={previewStyles.brandBlock}>
                <Title style={previewStyles.brandName}>QuickQuote</Title>
                <Subtitle style={previewStyles.brandTagline}>Estimate summary</Subtitle>
              </View>
              <View style={previewStyles.metaBlock}>
                <Subtitle style={previewStyles.metaLabel}>Estimate #</Subtitle>
                <Title style={previewStyles.metaValue}>{previewEstimateNumber}</Title>
              </View>
            </View>
            <Badge tone={statusBadgeTone} style={previewStyles.statusBadge}>
              {statusLabel}
            </Badge>
            <View style={previewStyles.summaryRows}>
              <View style={previewStyles.summaryRow}>
                <Body style={previewStyles.summaryLabel}>Client</Body>
                <Body style={previewStyles.summaryValue}>{previewCustomerName}</Body>
              </View>
              <View style={previewStyles.summaryRow}>
                <Body style={previewStyles.summaryLabel}>Line items</Body>
                <Body style={previewStyles.summaryValue}>{previewLineItems}</Body>
              </View>
              <View style={previewStyles.summaryRow}>
                <Body style={previewStyles.summaryLabel}>Estimate date</Body>
                <Body style={previewStyles.summaryValue}>{previewDate}</Body>
              </View>
            </View>
            <View style={previewStyles.totalBlock}>
              <Subtitle style={previewStyles.totalLabel}>Total amount</Subtitle>
              <Title style={previewStyles.totalValue}>{formatCurrency(totals.grandTotal)}</Title>
            </View>
          </Card>
          <Body style={previewStyles.previewHint}>
            A polished PDF and this summary will be included when you send the estimate.
          </Body>
          <View style={previewStyles.previewActions}>
            <Button
              label="Save & Preview PDF"
              onPress={handleSaveAndPreview}
              disabled={pdfWorking || smsSending || saving}
              loading={pdfWorking}
            />
            <Button
              label="Share via Email"
              variant="secondary"
              onPress={handleShareEmail}
              disabled={pdfWorking || smsSending}
            />
            <Button
              label="Share via SMS"
              variant="secondary"
              onPress={handleShareSms}
              disabled={smsSending || pdfWorking}
            />
          </View>
        </View>
        <View style={styles.footerButtons}>
          <Button
            label="Cancel"
            variant="secondary"
            alignment="inline"
            onPress={handleCancel}
            disabled={saving}
            style={styles.footerButton}
          />
          <Button
            label={saving ? "Saving…" : "Save Draft"}
            alignment="inline"
            onPress={handleSaveDraft}
            disabled={saving}
            loading={saving}
            style={styles.footerButton}
          />
        </View>
      </ScrollView>
      <View style={previewStyles.bottomBar}>
        <Button
          label={sendingToClient ? "Sending…" : "Send to Client"}
          onPress={handleSendToClient}
          disabled={sendingToClient}
          loading={sendingToClient}
          alignment="full"
        />
      </View>
    </View>
  );
}

function createPreviewStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    previewSection: {
      marginTop: spacing.xxl,
      alignItems: "center",
      alignSelf: "stretch",
      gap: spacing.lg,
    },
    previewTitle: {
      textAlign: "center",
      color: colors.text,
      letterSpacing: 0,
    },
    previewSubtitle: {
      textAlign: "center",
      color: colors.textMuted,
      maxWidth: 520,
    },
    successBanner: {
      width: "100%",
      maxWidth: 520,
      backgroundColor: colors.successSoft,
      borderColor: colors.success,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    successText: {
      color: colors.success,
      fontWeight: "600",
      textAlign: "center",
    },
    previewCard: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      gap: spacing.lg,
    },
    previewHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.lg,
    },
    brandBlock: {
      flexShrink: 1,
      gap: spacing.xs,
    },
    brandName: {
      fontSize: 22,
      color: colors.primaryText,
    },
    brandTagline: {
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.textMuted,
      fontSize: 13,
    },
    metaBlock: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    metaLabel: {
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.textMuted,
      fontSize: 12,
    },
    metaValue: {
      fontSize: 20,
      color: colors.primaryText,
    },
    statusBadge: {
      alignSelf: "flex-end",
    },
    summaryRows: {
      width: "100%",
      gap: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
    },
    summaryLabel: {
      color: colors.textMuted,
      fontWeight: "500",
    },
    summaryValue: {
      color: colors.text,
      fontWeight: "600",
      textAlign: "right",
      flexShrink: 1,
    },
    totalBlock: {
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    totalLabel: {
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.textMuted,
      fontSize: 12,
    },
    totalValue: {
      fontSize: 30,
      color: colors.primaryText,
    },
    previewHint: {
      color: colors.textMuted,
      textAlign: "center",
      maxWidth: 520,
    },
    previewActions: {
      width: "100%",
      maxWidth: 520,
      gap: spacing.md,
    },
    bottomBar: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      ...cardShadow(16, theme.mode),
    },
  });
}

function createStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    loadingState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    screenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.xl,
      gap: spacing.xl,
      paddingBottom: spacing.xxl * 7,
    },
    headerCard: {
      gap: spacing.xl,
    },
    headerIntro: {
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: "transparent",
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.primaryText,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
    },
    headerField: {
      gap: spacing.sm,
    },
    headerLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    card: {
      gap: spacing.lg,
    },
    sectionTitle: {
      color: colors.primaryText,
      fontSize: 20,
    },
    sectionSubtitle: {
      color: colors.textMuted,
    },
    fieldGroup: {
      gap: spacing.sm,
    },
    fieldLabel: {
      color: colors.textMuted,
      fontWeight: "600",
    },
    notesInput: {
      minHeight: spacing.xxl * 4,
    },
    photosCard: {
      gap: spacing.lg,
    },
    photosHeader: {
      gap: spacing.xs,
    },
    photosList: {
      gap: spacing.lg,
    },
    photoCard: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    photoInput: {
      gap: spacing.xs,
    },
    photoButtonRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    photoButton: {
      flex: 1,
    },
    photoImage: {
      width: "100%",
      height: spacing.xxl * 5 + spacing.xl,
      borderRadius: radii.sm,
    },
    photoPlaceholder: {
      minHeight: spacing.xxl * 5 + spacing.xl,
      borderRadius: radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    photoPlaceholderText: {
      textAlign: "center",
      color: colors.textMuted,
    },
    emptyCard: {
      padding: spacing.xl,
      borderRadius: radii.md,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    emptyText: {
      color: colors.textMuted,
    },
    lineItemsCard: {
      gap: spacing.lg,
    },
    lineItemsHeader: {
      gap: spacing.xs,
    },
    lineItemsList: {
      paddingVertical: spacing.xs,
    },
    lineItemRow: {
      gap: spacing.sm,
    },
    lineItem: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
    },
    lineItemTotal: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    lineItemActions: {
      flexDirection: "row",
      gap: spacing.md,
    },
    lineItemActionButton: {
      flex: 1,
    },
    lineItemSeparator: {
      height: spacing.md,
    },
    lineItemAddButton: {
      marginTop: spacing.sm,
    },
    inputAdornment: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textMuted,
    },
    pickerShell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: "hidden",
      backgroundColor: colors.surfaceMuted,
    },
    summaryList: {
      gap: spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    summaryTotalRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryTotalLabel: {
      color: colors.textMuted,
      fontWeight: "600",
    },
    summaryTotalValue: {
      color: colors.primaryText,
      fontSize: 22,
    },
    footerButtons: {
      flexDirection: "row",
      gap: spacing.md,
      paddingBottom: spacing.lg,
    },
    footerButton: {
      flex: 1,
    },
  });
}
