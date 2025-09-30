import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import CustomerPicker from "../../../components/CustomerPicker";
import BrandLogo from "../../../components/BrandLogo";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import {
  listItemCatalog,
  upsertItemCatalog,
  type ItemCatalogRecord,
} from "../../../lib/itemCatalog";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { formatPercentageInput } from "../../../lib/numberFormat";

type EstimateItemRecord = {
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

type EstimateItemDraft = {
  id: string;
  description: string;
  quantityText: string;
  unitPriceText: string;
  catalogItemId: string | null;
  saveToLibrary: boolean;
};

type NewEstimateDraftState = {
  estimateId: string;
  customerId: string | null;
  estimateDate: string;
  notes: string;
  status: string;
  items: EstimateItemDraft[];
  laborHoursText: string;
  hourlyRateText: string;
  taxRateText: string;
};

let newEstimateDraft: NewEstimateDraftState | null = null;

function getNewEstimateDraft(): NewEstimateDraftState | null {
  if (!newEstimateDraft) {
    return null;
  }

  return {
    ...newEstimateDraft,
    items: newEstimateDraft.items.map((item) => ({ ...item })),
  };
}

function setNewEstimateDraft(nextDraft: NewEstimateDraftState) {
  newEstimateDraft = {
    ...nextDraft,
    items: nextDraft.items.map((item) => ({ ...item })),
  };
}

function clearNewEstimateDraft() {
  newEstimateDraft = null;
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed));
}

function parseCurrency(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

type ThemePalette = {
  background: string;
  card: string;
  border: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  muted: string;
  inputBackground: string;
};

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 24,
      gap: 24,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 18,
      padding: 20,
      gap: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      shadowColor: theme.primaryText,
      shadowOpacity: theme.background === "#0f172a" ? 0.4 : 0.08,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      elevation: 4,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 16,
    },
    companyInfo: {
      flex: 1,
      flexDirection: "row",
      gap: 16,
    },
    logoWrapper: {
      width: 76,
      height: 76,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: theme.inputBackground,
    },
    companyText: {
      flex: 1,
      gap: 4,
    },
    companyName: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.primaryText,
    },
    companyMeta: {
      fontSize: 14,
      color: theme.secondaryText,
      lineHeight: 20,
    },
    emptyCompanyHint: {
      fontSize: 13,
      color: theme.muted,
      marginTop: 4,
    },
    estimateMeta: {
      minWidth: 140,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: 16,
      gap: 12,
      backgroundColor: theme.inputBackground,
    },
    estimateNumber: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.primaryText,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.primaryText,
    },
    textField: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: theme.primaryText,
      backgroundColor: theme.inputBackground,
    },
    textArea: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: theme.primaryText,
      backgroundColor: theme.inputBackground,
      minHeight: 100,
      textAlignVertical: "top",
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.primaryText,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.secondaryText,
      lineHeight: 20,
    },
    savedItemsRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    savedPickerContainer: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: theme.inputBackground,
    },
    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
    },
    secondaryButtonText: {
      color: theme.primaryText,
      fontWeight: "600",
    },
    addButton: {
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    addButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    itemCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      backgroundColor: theme.inputBackground,
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.primaryText,
    },
    removeButton: {
      color: "#ef4444",
      fontSize: 14,
      fontWeight: "600",
    },
    itemRow: {
      flexDirection: "row",
      gap: 12,
    },
    itemInputHalf: {
      flex: 1,
    },
    itemFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    mutedText: {
      fontSize: 13,
      color: theme.muted,
    },
    totalsRow: {
      gap: 8,
    },
    totalsLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalsLabel: {
      fontSize: 15,
      color: theme.secondaryText,
    },
    totalsValue: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.primaryText,
    },
    totalsGrand: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.primaryText,
    },
    actionRow: {
      flexDirection: "row",
      gap: 16,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
    },
    cancelText: {
      color: theme.primaryText,
      fontSize: 16,
      fontWeight: "600",
    },
    primaryAction: {
      flex: 1,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    primaryActionText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    statusPicker: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: theme.inputBackground,
    },
  });
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

export default function NewEstimateScreen() {
  const { user, session } = useAuth();
  const { settings, resolvedTheme } = useSettings();
  const draftRef = useRef<NewEstimateDraftState | null>(getNewEstimateDraft());
  const hasRestoredDraftRef = useRef(Boolean(draftRef.current));
  const [estimateId] = useState(() => draftRef.current?.estimateId ?? uuidv4());
  const [customerId, setCustomerId] = useState<string | null>(
    draftRef.current?.customerId ?? null
  );
  const [estimateDate, setEstimateDate] = useState(
    draftRef.current?.estimateDate ?? new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState(draftRef.current?.notes ?? "");
  const [status, setStatus] = useState(draftRef.current?.status ?? "draft");
  const [items, setItems] = useState<EstimateItemDraft[]>(
    () => draftRef.current?.items.map((item) => ({ ...item })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [laborHoursText, setLaborHoursText] = useState(
    draftRef.current?.laborHoursText ?? "0"
  );
  const [hourlyRateText, setHourlyRateText] = useState(
    draftRef.current?.hourlyRateText ?? settings.hourlyRate.toFixed(2)
  );
  const [taxRateText, setTaxRateText] = useState(() =>
    draftRef.current?.taxRateText ?? formatPercentageInput(settings.taxRate)
  );
  const [savedItems, setSavedItems] = useState<ItemCatalogRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const themeColors = useMemo(() => {
    const isDark = resolvedTheme === "dark";
    return {
      background: isDark ? "#0f172a" : "#f8fafc",
      card: isDark ? "#1e293b" : "#fff",
      border: isDark ? "#334155" : "#e2e8f0",
      primaryText: isDark ? "#f8fafc" : "#0f172a",
      secondaryText: isDark ? "#cbd5f5" : "#475569",
      accent: "#2563eb",
      muted: isDark ? "#94a3b8" : "#64748b",
      inputBackground: isDark ? "rgba(15, 23, 42, 0.7)" : "#f8fafc",
    } satisfies ThemePalette;
  }, [resolvedTheme]);

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { companyProfile } = settings;
  const userId = user?.id ?? session?.user?.id ?? null;

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    setHourlyRateText(settings.hourlyRate.toFixed(2));
  }, [settings.hourlyRate]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    setTaxRateText(formatPercentageInput(settings.taxRate));
  }, [settings.taxRate]);

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
    return Math.max(0, parseNumericInput(laborHoursText, 0));
  }, [laborHoursText, parseNumericInput]);

  const hourlyRate = useMemo(() => {
    const parsed = parseNumericInput(hourlyRateText, settings.hourlyRate);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [hourlyRateText, parseNumericInput, settings.hourlyRate]);

  const taxRate = useMemo(() => {
    const parsed = parseNumericInput(taxRateText, settings.taxRate);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [parseNumericInput, settings.taxRate, taxRateText]);

  const computedItems = useMemo(
    () =>
      items.map((item) => {
        const quantity = parseQuantity(item.quantityText);
        const unitPrice = parseCurrency(item.unitPriceText);
        const total = Math.round(quantity * unitPrice * 100) / 100;
        return { ...item, quantity, unitPrice, total };
      }),
    [items]
  );

  const totals = useMemo(
    () =>
      calculateEstimateTotals({
        materialLineItems: computedItems,
        laborHours,
        laborRate: hourlyRate,
        taxRate,
      }),
    [computedItems, hourlyRate, laborHours, taxRate]
  );

  const total = totals.grandTotal;

  const estimateNumber = useMemo(() => {
    return estimateId.split("-").shift()?.toUpperCase() ?? estimateId.substring(0, 8);
  }, [estimateId]);

  useEffect(() => {
    setNewEstimateDraft({
      estimateId,
      customerId,
      estimateDate,
      notes,
      status,
      items,
      laborHoursText,
      hourlyRateText,
      taxRateText,
    });
  }, [
    customerId,
    estimateDate,
    estimateId,
    items,
    laborHoursText,
    hourlyRateText,
    notes,
    status,
    taxRateText,
  ]);

  useEffect(() => {
    return () => {
      clearNewEstimateDraft();
    };
  }, []);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: uuidv4(),
        description: "",
        quantityText: "1",
        unitPriceText: "0",
        catalogItemId: null,
        saveToLibrary: true,
      },
    ]);
  };

  const handleAddSavedItem = () => {
    if (!selectedTemplateId) {
      Alert.alert("Saved items", "Select an item to add to your estimate.");
      return;
    }
    const template = savedItems.find((item) => item.id === selectedTemplateId);
    if (!template) {
      Alert.alert("Saved items", "We couldn't find that saved item.");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: uuidv4(),
        description: template.description,
        quantityText: String(template.default_quantity ?? 1),
        unitPriceText: template.unit_price.toFixed(2),
        catalogItemId: template.id,
        saveToLibrary: false,
      },
    ]);
    setSelectedTemplateId("");
  };

  const updateItem = useCallback((itemId: string, updates: Partial<EstimateItemDraft>) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  }, []);

  const handleRemoveItem = (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    Alert.alert("Remove item", `Remove “${item.description || "New item"}” from this estimate?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setItems((prev) => prev.filter((entry) => entry.id !== itemId));
        },
      },
    ]);
  };

  const handleCancel = () => {
    if (!saving) {
      clearNewEstimateDraft();
      router.back();
    }
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    if (!customerId) {
      Alert.alert("Validation", "Please select a customer before saving.");
      return;
    }

    if (computedItems.length === 0) {
      Alert.alert("Validation", "Add at least one line item to the estimate.");
      return;
    }

    if (!userId) {
      Alert.alert("Authentication required", "Please sign in to continue.");
      return;
    }

    for (const item of computedItems) {
      if (!item.description.trim()) {
        Alert.alert("Validation", "Every line item needs a description.");
        return;
      }
      if (item.quantity <= 0) {
        Alert.alert("Validation", "Item quantities must be greater than zero.");
        return;
      }
    }

    setSaving(true);

    try {
      const safeTotal = Math.round(total * 100) / 100;
      const now = new Date().toISOString();
      let isoDate: string | null = null;
      if (estimateDate) {
        const parsedDate = new Date(estimateDate);
        isoDate = Number.isNaN(parsedDate.getTime())
          ? now
          : new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      }

      const newEstimate = {
        id: estimateId,
        user_id: userId,
        customer_id: customerId,
        date: isoDate,
        total: safeTotal,
        material_total: totals.materialTotal,
        labor_hours: totals.laborHours,
        labor_rate: totals.laborRate,
        labor_total: totals.laborTotal,
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_total: totals.taxTotal,
        notes: notes.trim() ? notes.trim() : null,
        status,
        version: 1,
        updated_at: now,
        deleted_at: null,
      };

      const db = await openDB();
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
        ]
      );

      for (const item of computedItems) {
        let catalogItemId = item.catalogItemId;

        if (item.saveToLibrary) {
          try {
            const record = await upsertItemCatalog({
              id: catalogItemId ?? undefined,
              userId,
              description: item.description,
              unitPrice: item.unitPrice,
              defaultQuantity: item.quantity,
            });
            catalogItemId = record.id;
            setSavedItems((prev) => {
              const next = [...prev];
              const index = next.findIndex((entry) => entry.id === record.id);
              if (index >= 0) {
                next[index] = record;
              } else {
                next.push(record);
              }
              return next.sort((a, b) => a.description.localeCompare(b.description));
            });
          } catch (error) {
            console.error("Failed to save item to catalog", error);
            Alert.alert(
              "Saved items",
              "We couldn't add this line to your saved library. The estimate item was still created."
            );
          }
        }

        const itemRecord: EstimateItemRecord = {
          id: item.id,
          estimate_id: estimateId,
          description: item.description.trim(),
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total: item.total,
          catalog_item_id: catalogItemId,
          version: 1,
          updated_at: now,
          deleted_at: null,
        };

        await db.runAsync(
          `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, catalog_item_id, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemRecord.id,
            itemRecord.estimate_id,
            itemRecord.description,
            itemRecord.quantity,
            itemRecord.unit_price,
            itemRecord.total,
            itemRecord.catalog_item_id,
            itemRecord.version,
            itemRecord.updated_at,
            itemRecord.deleted_at,
          ]
        );

        await queueChange("estimate_items", "insert", itemRecord);
      }

      await queueChange("estimates", "insert", newEstimate);
      await runSync();

      clearNewEstimateDraft();

      Alert.alert(
        "Estimate created",
        "We'll open it so you can review the details and send it to your customer.",
        [
          {
            text: "Review & send",
            onPress: () =>
              router.replace({
                pathname: "/(tabs)/estimates/[id]",
                params: { id: estimateId },
              }),
          },
        ],
        { cancelable: false }
      );

      if (Platform.OS === "web") {
        router.replace({
          pathname: "/(tabs)/estimates/[id]",
          params: { id: estimateId },
        });
      }
    } catch (error) {
      console.error("Failed to create estimate", error);
      Alert.alert("Error", "Unable to save the estimate. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const estimateLines = [companyProfile.phone, companyProfile.email, companyProfile.website].filter(Boolean);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.companyInfo}>
            <View style={styles.logoWrapper}>
              {companyProfile.logoUri ? (
                <Image
                  source={{ uri: companyProfile.logoUri }}
                  resizeMode="contain"
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <BrandLogo size={64} />
              )}
            </View>
            <View style={styles.companyText}>
              <Text style={styles.companyName}>
                {companyProfile.name || "Your company name"}
              </Text>
              {estimateLines.map((line) => (
                <Text key={line} style={styles.companyMeta}>
                  {line}
                </Text>
              ))}
              {companyProfile.address ? (
                <Text style={styles.companyMeta}>{companyProfile.address}</Text>
              ) : null}
              {!companyProfile.name ? (
                <Text style={styles.emptyCompanyHint}>
                  Add your company profile in Settings so every estimate is branded automatically.
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.estimateMeta}>
            <Text style={styles.estimateNumber}>Estimate #{estimateNumber}</Text>
            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              placeholder="YYYY-MM-DD"
              value={estimateDate}
              onChangeText={setEstimateDate}
              style={styles.textField}
            />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Client information</Text>
        <Text style={styles.sectionSubtitle}>
          Choose an existing customer or add a new one so the estimate is addressed correctly.
        </Text>
        <CustomerPicker selectedCustomer={customerId} onSelect={setCustomerId} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Estimate items</Text>
        <Text style={styles.sectionSubtitle}>
          Build out the work you&apos;re quoting. Saved items let you reuse common tasks in seconds.
        </Text>
        {savedItems.length > 0 ? (
          <View style={styles.savedItemsRow}>
            <View style={styles.savedPickerContainer}>
              <Picker
                selectedValue={selectedTemplateId}
                onValueChange={(value) => setSelectedTemplateId(value ? String(value) : "")}
              >
                <Picker.Item label="Add from saved items" value="" />
                {savedItems.map((item) => (
                  <Picker.Item key={item.id} label={item.description} value={item.id} />
                ))}
              </Picker>
            </View>
            <Pressable style={styles.secondaryButton} onPress={handleAddSavedItem}>
              <Text style={styles.secondaryButtonText}>Add saved item</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.addButton} onPress={handleAddItem}>
          <Text style={styles.addButtonText}>Add line item</Text>
        </Pressable>

        {items.length === 0 ? (
          <Text style={styles.mutedText}>
            No items yet. Start with a blank line or pull from your saved library.
          </Text>
        ) : null}

        {computedItems.map((item, index) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>Item {index + 1}</Text>
              <Pressable onPress={() => handleRemoveItem(item.id)}>
                <Text style={styles.removeButton}>Remove</Text>
              </Pressable>
            </View>
            <View>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                placeholder="Describe the work"
                value={item.description}
                onChangeText={(text) => updateItem(item.id, { description: text })}
                style={styles.textField}
              />
            </View>
            <View style={styles.itemRow}>
              <View style={styles.itemInputHalf}>
                <Text style={styles.fieldLabel}>Quantity</Text>
                <TextInput
                  placeholder="Qty"
                  value={items[index].quantityText}
                  onChangeText={(text) => updateItem(item.id, { quantityText: text })}
                  keyboardType="numeric"
                  style={styles.textField}
                />
              </View>
              <View style={styles.itemInputHalf}>
                <Text style={styles.fieldLabel}>Unit cost</Text>
                <TextInput
                  placeholder="$0.00"
                  value={items[index].unitPriceText}
                  onChangeText={(text) => updateItem(item.id, { unitPriceText: text })}
                  keyboardType="decimal-pad"
                  style={styles.textField}
                />
              </View>
            </View>
            <View style={styles.itemFooter}>
              <Text style={styles.fieldLabel}>Line total: {formatCurrency(item.total)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.mutedText}>Save to library</Text>
                <Switch
                  value={items[index].saveToLibrary}
                  onValueChange={(value) => updateItem(item.id, { saveToLibrary: value })}
                />
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Labor & totals</Text>
        <Text style={styles.sectionSubtitle}>
          QuickQuote automatically calculates your labor and tax totals as you fill in the details.
        </Text>
        <View>
          <Text style={styles.fieldLabel}>Project hours</Text>
          <TextInput
            placeholder="0"
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="decimal-pad"
            style={styles.textField}
          />
        </View>
        <View>
          <Text style={styles.fieldLabel}>Hourly rate</Text>
          <TextInput
            placeholder="0.00"
            value={hourlyRateText}
            onChangeText={setHourlyRateText}
            keyboardType="decimal-pad"
            style={styles.textField}
          />
        </View>
        <View>
          <Text style={styles.fieldLabel}>Tax rate (%)</Text>
          <TextInput
            placeholder="0"
            value={taxRateText}
            onChangeText={setTaxRateText}
            keyboardType="decimal-pad"
            style={styles.textField}
          />
        </View>
        <View style={styles.totalsRow}>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>Materials</Text>
            <Text style={styles.totalsValue}>{formatCurrency(totals.materialTotal)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>Labor</Text>
            <Text style={styles.totalsValue}>{formatCurrency(totals.laborTotal)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>{formatCurrency(totals.taxTotal)}</Text>
          </View>
          <View style={styles.totalsLine}>
            <Text style={styles.totalsGrand}>Project total</Text>
            <Text style={styles.totalsGrand}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Notes & status</Text>
        <Text style={styles.sectionSubtitle}>
          Internal notes stay private to your team. Status helps you track progress.
        </Text>
        <View>
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            placeholder="Internal notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={styles.textArea}
          />
        </View>
        <View>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusPicker}>
            <Picker selectedValue={status} onValueChange={(value) => setStatus(String(value))}>
              {STATUS_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.primaryAction} onPress={handleSave} disabled={saving}>
          <Text style={styles.primaryActionText}>{saving ? "Saving…" : "Save estimate"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
