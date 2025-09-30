import React, { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Alert, Button, FlatList, ScrollView, Text, TextInput, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
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
  const { openEditor } = useItemEditor();
  const [estimateId] = useState(() => uuidv4());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<EstimateItemRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [laborHoursText, setLaborHoursText] = useState("0");
  const [hourlyRateText, setHourlyRateText] = useState(settings.hourlyRate.toFixed(2));
  const [taxRateText, setTaxRateText] = useState(() => formatPercentageInput(settings.taxRate));
  const [savedItems, setSavedItems] = useState<ItemCatalogRecord[]>([]);

  const userId = user?.id ?? session?.user?.id ?? null;

  useEffect(() => {
    setHourlyRateText(settings.hourlyRate.toFixed(2));
  }, [settings.hourlyRate]);

  useEffect(() => {
    setTaxRateText(formatPercentageInput(settings.taxRate));
  }, [settings.taxRate]);

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

  const total = totals.grandTotal;

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

  const openItemEditorScreen = useCallback(
    (config: ItemEditorConfig) => {
      openEditor(config);
      router.push("/(tabs)/estimates/item-editor");
    },
    [openEditor],
  );

  const makeItemSubmitHandler = useCallback(
    (existingItem?: EstimateItemRecord | null) =>
      async ({ values, saveToLibrary, templateId }: EstimateItemFormSubmit) => {
        const now = new Date().toISOString();
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
            console.error("Failed to save item to catalog", error);
            Alert.alert(
              "Saved items",
              "We couldn't update your saved items library. The estimate item was still added."
            );
          }
        }

        if (existingItem) {
          const updated: EstimateItemRecord = {
            ...existingItem,
            description: values.description,
            quantity: values.quantity,
            unit_price: values.unit_price,
            total: values.total,
            catalog_item_id: resolvedTemplateId,
            updated_at: now,
            deleted_at: null,
          };

          setItems((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        } else {
          const newItem: EstimateItemRecord = {
            id: uuidv4(),
            estimate_id: estimateId,
            description: values.description,
            quantity: values.quantity,
            unit_price: values.unit_price,
            total: values.total,
            catalog_item_id: resolvedTemplateId,
            version: 1,
            updated_at: now,
            deleted_at: null,
          };

          setItems((prev) => [...prev, newItem]);
        }
      },
    [estimateId, userId],
  );

  const handleDeleteItem = (item: EstimateItemRecord) => {
    Alert.alert(
      "Delete Item",
      "Are you sure you want to remove this item?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setItems((prev) =>
              prev.filter((existing) => existing.id !== item.id)
            );
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: EstimateItemRecord }) => (
    <View
      style={{
        padding: 12,
        borderWidth: 1,
        borderRadius: 8,
        backgroundColor: "#fafafa",
        gap: 8,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text style={{ fontWeight: "600" }}>{item.description}</Text>
        <Text style={{ color: "#555" }}>
          Qty: {item.quantity} @ {formatCurrency(item.unit_price)}
        </Text>
        <Text style={{ color: "#555" }}>Line Total: {formatCurrency(item.total)}</Text>
      </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Edit"
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
                  templates: savedItemTemplates,
                  onSubmit: makeItemSubmitHandler(item),
                })
              }
            />
          </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Remove"
            color="#b00020"
            onPress={() => handleDeleteItem(item)}
          />
        </View>
      </View>
    </View>
  );

  const handleCancel = () => {
    if (!saving) {
      router.back();
    }
  };

  const handleSave = async () => {
    if (saving) return;

    if (!customerId) {
      Alert.alert("Validation", "Please select a customer.");
      return;
    }

    if (items.length === 0) {
      Alert.alert("Validation", "Please add at least one item to the estimate.");
      return;
    }

    if (!userId) {
      Alert.alert("Authentication required", "Please sign in to continue.");
      return;
    }

    setSaving(true);

    try {
      const safeTotal = Math.round(total * 100) / 100;
      const now = new Date().toISOString();
      let isoDate: string | null = null;
      if (estimateDate) {
        const parsedDate = new Date(estimateDate);
        isoDate = isNaN(parsedDate.getTime())
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

      for (const item of items) {
        const itemRecord: EstimateItemRecord = {
          ...item,
          estimate_id: estimateId,
          version: item.version ?? 1,
          updated_at: item.updated_at ?? now,
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

      Alert.alert("Success", "Estimate created successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Failed to create estimate", error);
      Alert.alert("Error", "Unable to save the estimate. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600" }}>New Estimate</Text>
      <CustomerPicker selectedCustomer={customerId} onSelect={setCustomerId} />

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Date</Text>
        <TextInput
          placeholder="YYYY-MM-DD"
          value={estimateDate}
          onChangeText={setEstimateDate}
          style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
      </View>

      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "600" }}>Items</Text>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={
            <View
              style={{
                padding: 16,
                borderWidth: 1,
                borderRadius: 8,
                borderStyle: "dashed",
                alignItems: "center",
                backgroundColor: "#fafafa",
              }}
            >
              <Text style={{ color: "#666" }}>No items added yet.</Text>
            </View>
          }
        />
        <Button
          title="Add Item"
          onPress={() =>
            openItemEditorScreen({
              title: "Add Item",
              submitLabel: "Add Item",
              templates: savedItemTemplates,
              initialTemplateId: null,
              onSubmit: makeItemSubmitHandler(null),
            })
          }
        />
      </View>

      <View style={{ gap: 12 }}>
        <Text style={{ fontWeight: "600" }}>Labor</Text>
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "500" }}>Project hours</Text>
          <TextInput
            placeholder="0"
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="decimal-pad"
            style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "500" }}>Hourly rate</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontWeight: "600", marginRight: 8 }}>$</Text>
            <TextInput
              placeholder="0.00"
              value={hourlyRateText}
              onChangeText={setHourlyRateText}
              keyboardType="decimal-pad"
              style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 }}
            />
          </View>
          <Text style={{ color: "#555", fontSize: 12 }}>
            Labor total (not shown to customers): {formatCurrency(totals.laborTotal)}
          </Text>
        </View>
      </View>


      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Tax rate</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TextInput
            placeholder="0"
            value={taxRateText}
            onChangeText={setTaxRateText}
            keyboardType="decimal-pad"
            style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 }}
          />
          <Text style={{ fontWeight: "600", marginLeft: 8 }}>%</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Estimate summary</Text>
        <View style={{ gap: 4 }}>
          <Text>Materials: {formatCurrency(totals.materialTotal)}</Text>
          <Text>Labor: {formatCurrency(totals.laborTotal)}</Text>
          <Text>Tax: {formatCurrency(totals.taxTotal)}</Text>
          <Text style={{ fontWeight: "700" }}>Project total: {formatCurrency(total)}</Text>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Status</Text>
        <View style={{ borderWidth: 1, borderRadius: 8 }}>
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

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Notes</Text>
        <TextInput
          placeholder="Internal notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          style={{
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
            textAlignVertical: "top",
            minHeight: 100,
          }}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" onPress={handleCancel} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Save" onPress={handleSave} disabled={saving} />
        </View>
      </View>
    </ScrollView>
  );
}
