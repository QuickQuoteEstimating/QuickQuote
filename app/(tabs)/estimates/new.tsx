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
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import CustomerPicker from "../../../components/CustomerPicker";
import BrandLogo from "../../../components/BrandLogo";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { Button, Card, Input } from "../../../components/ui";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import {
  listItemCatalog,
  upsertItemCatalog,
  type ItemCatalogRecord,
} from "../../../lib/itemCatalog";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { formatPercentageInput } from "../../../lib/numberFormat";
import { useTheme, type Theme } from "../../../lib/theme";

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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: 24,
      paddingBottom: 140,
      gap: 24,
    },
    card: {
      gap: 20,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 20,
    },
    companyInfo: {
      flex: 1,
      flexDirection: "row",
      gap: 16,
    },
    logoWrapper: {
      width: 80,
      height: 80,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceSubtle,
      overflow: "hidden",
    },
    companyText: {
      flex: 1,
      gap: 6,
    },
    companyName: {
      fontSize: 22,
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
      color: theme.mutedText,
      marginTop: 6,
    },
    estimateMeta: {
      width: 220,
      gap: 14,
    },
    estimateNumber: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.secondaryText,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    estimateDateInput: {
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.primaryText,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: theme.secondaryText,
      lineHeight: 20,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.secondaryText,
    },
    savedItemsRow: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
    },
    savedPickerContainer: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSubtle,
      overflow: "hidden",
    },
    savedAction: {
      flexShrink: 0,
    },
    fullWidthButton: {
      alignSelf: "stretch",
    },
    itemList: {
      gap: 16,
    },
    itemCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSubtle,
      padding: 18,
      gap: 16,
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
      color: theme.danger,
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
    saveToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    mutedText: {
      fontSize: 13,
      color: theme.mutedText,
    },
    totalsCard: {
      borderRadius: 18,
      backgroundColor: theme.surfaceSubtle,
      padding: 18,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    totalsRow: {
      gap: 12,
    },
    totalsLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalsLabel: {
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.mutedText,
    },
    totalsValue: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.primaryText,
    },
    totalsGrand: {
      fontSize: 22,
      fontWeight: "700",
      color: theme.primaryText,
    },
    actionRow: {
      flexDirection: "row",
      gap: 16,
    },
    flex1: {
      flex: 1,
    },
    statusPicker: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSubtle,
      overflow: "hidden",
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
  const { settings } = useSettings();
  const theme = useTheme();
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

  const styles = useMemo(() => createStyles(theme), [theme]);

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
      <Card style={styles.card}>
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
            <Input
              label="Date"
              placeholder="YYYY-MM-DD"
              value={estimateDate}
              onChangeText={setEstimateDate}
              containerStyle={styles.estimateDateInput}
            />
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Client information</Text>
        <Text style={styles.sectionSubtitle}>
          Choose an existing customer or add a new one so the estimate is addressed correctly.
        </Text>
        <CustomerPicker selectedCustomer={customerId} onSelect={setCustomerId} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Estimate items</Text>
        <Text style={styles.sectionSubtitle}>
          Build out the work you&apos;re quoting. Saved items let you reuse common tasks in seconds.
        </Text>
        {savedItems.length > 0 ? (
          <View style={styles.savedItemsRow}>
            <View style={styles.savedPickerContainer}>
              <Picker
                selectedValue={selectedTemplateId}
                onValueChange={(value) =>
                  setSelectedTemplateId(value ? String(value) : "")
                }
              >
                <Picker.Item label="Add from saved items" value="" />
                {savedItems.map((item) => (
                  <Picker.Item
                    key={item.id}
                    label={item.description}
                    value={item.id}
                  />
                ))}
              </Picker>
            </View>
            <Button
              label="Add saved item"
              variant="secondary"
              size="small"
              onPress={handleAddSavedItem}
              style={styles.savedAction}
            />
          </View>
        ) : null}

        <Button
          label="Add line item"
          onPress={handleAddItem}
          variant="secondary"
          style={styles.fullWidthButton}
        />

        {items.length === 0 ? (
          <Text style={styles.mutedText}>
            No items yet. Start with a blank line or pull from your saved
            library.
          </Text>
        ) : null}

        <View style={styles.itemList}>
          {computedItems.map((item, index) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>Item {index + 1}</Text>
                <Pressable onPress={() => handleRemoveItem(item.id)}>
                  <Text style={styles.removeButton}>Remove</Text>
                </Pressable>
              </View>
              <Input
                label="Description"
                placeholder="Describe the work"
                value={item.description}
                onChangeText={(text) =>
                  updateItem(item.id, { description: text })
                }
              />
              <View style={styles.itemRow}>
                <Input
                  label="Quantity"
                  placeholder="Qty"
                  value={items[index].quantityText}
                  onChangeText={(text) =>
                    updateItem(item.id, { quantityText: text })
                  }
                  keyboardType="numeric"
                  containerStyle={styles.itemInputHalf}
                />
                <Input
                  label="Unit cost"
                  placeholder="$0.00"
                  value={items[index].unitPriceText}
                  onChangeText={(text) =>
                    updateItem(item.id, { unitPriceText: text })
                  }
                  keyboardType="decimal-pad"
                  containerStyle={styles.itemInputHalf}
                />
              </View>
              <View style={styles.itemFooter}>
                <Text style={styles.fieldLabel}>
                  Line total: {formatCurrency(item.total)}
                </Text>
                <View style={styles.saveToggleRow}>
                  <Text style={styles.mutedText}>Save to library</Text>
                  <Switch
                    value={items[index].saveToLibrary}
                    onValueChange={(value) =>
                      updateItem(item.id, { saveToLibrary: value })
                    }
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Labor & totals</Text>
        <Text style={styles.sectionSubtitle}>
          QuickQuote automatically calculates your labor and tax totals as you fill in the details.
        </Text>
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
        />
        <Input
          label="Tax rate (%)"
          placeholder="0"
          value={taxRateText}
          onChangeText={setTaxRateText}
          keyboardType="decimal-pad"
        />
        <View style={styles.totalsCard}>
          <View style={styles.totalsRow}>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>Materials</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(totals.materialTotal)}
              </Text>
            </View>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>Labor</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(totals.laborTotal)}
              </Text>
            </View>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsLabel}>Tax</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(totals.taxTotal)}
              </Text>
            </View>
            <View style={styles.totalsLine}>
              <Text style={styles.totalsGrand}>Project total</Text>
              <Text style={styles.totalsGrand}>{formatCurrency(total)}</Text>
            </View>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Notes & status</Text>
        <Text style={styles.sectionSubtitle}>
          Internal notes stay private to your team. Status helps you track progress.
        </Text>
        <Input
          label="Notes"
          placeholder="Internal notes"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
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
      </Card>

      <View style={styles.actionRow}>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={handleCancel}
          disabled={saving}
          style={styles.flex1}
        />
        <Button
          label={saving ? "Saving…" : "Save & Preview"}
          onPress={handleSave}
          disabled={saving}
          style={styles.flex1}
        />
      </View>
    </ScrollView>
  );
}
