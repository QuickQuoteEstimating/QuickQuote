import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import CustomerPicker from "../../../components/CustomerPicker";
import EstimateItemForm, {
  type EstimateItemFormValues,
} from "../../../components/EstimateItemForm";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import type { EstimateListItem } from "./index";
import { v4 as uuidv4 } from "uuid";

type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  version: number | null;
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

function calculateTotal(items: EstimateItemRecord[]): number {
  const sum = items.reduce((acc, item) => acc + item.total, 0);
  return Math.round(sum * 100) / 100;
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

export default function EditEstimateScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const estimateId = params.id ?? "";

  const [estimate, setEstimate] = useState<EstimateListItem | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [estimateDate, setEstimateDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<EstimateItemRecord[]>([]);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateItemRecord | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const estimateRef = useRef<EstimateListItem | null>(null);

  useEffect(() => {
    estimateRef.current = estimate;
  }, [estimate]);

  const computedTotal = useMemo(() => {
    const sum = items.reduce((acc, item) => acc + item.total, 0);
    return Math.round(sum * 100) / 100;
  }, [items]);

  const closeItemModal = useCallback(() => {
    setItemModalVisible(false);
    setEditingItem(null);
  }, []);

  const persistEstimateTotal = useCallback(async (nextTotal: number) => {
    const current = estimateRef.current;
    if (!current) {
      return;
    }

    const normalizedTotal = Math.round(nextTotal * 100) / 100;
    const currentTotal =
      typeof current.total === "number"
        ? Math.round(current.total * 100) / 100
        : 0;

    if (Math.abs(currentTotal - normalizedTotal) < 0.005) {
      return;
    }

    try {
      const now = new Date().toISOString();
      const nextVersion = (current.version ?? 1) + 1;
      const db = await openDB();
      await db.runAsync(
        `UPDATE estimates
         SET total = ?, version = ?, updated_at = ?
         WHERE id = ?`,
        [normalizedTotal, nextVersion, now, current.id]
      );

      const updatedEstimate: EstimateListItem = {
        ...current,
        total: normalizedTotal,
        version: nextVersion,
        updated_at: now,
      };

      estimateRef.current = updatedEstimate;
      setEstimate(updatedEstimate);

      const { customer_name: _customerName, ...queuePayload } = updatedEstimate;
      await queueChange("estimates", "update", queuePayload);
    } catch (error) {
      console.error("Failed to update estimate total", error);
      Alert.alert(
        "Error",
        "Unable to update the estimate total. Please try again."
      );
    }
  }, []);

  const handleSubmitItem = useCallback(
    async (values: EstimateItemFormValues) => {
      const currentEstimate = estimateRef.current;
      if (!currentEstimate) {
        return;
      }

      try {
        const now = new Date().toISOString();
        const db = await openDB();

        if (editingItem) {
          const nextVersion = (editingItem.version ?? 1) + 1;
          const updatedItem: EstimateItemRecord = {
            ...editingItem,
            description: values.description,
            quantity: values.quantity,
            unit_price: values.unit_price,
            total: values.total,
            version: nextVersion,
            updated_at: now,
            deleted_at: null,
          };

          await db.runAsync(
            `UPDATE estimate_items
             SET description = ?, quantity = ?, unit_price = ?, total = ?, version = ?, updated_at = ?, deleted_at = NULL
             WHERE id = ?`,
            [
              updatedItem.description,
              updatedItem.quantity,
              updatedItem.unit_price,
              updatedItem.total,
              nextVersion,
              now,
              updatedItem.id,
            ]
          );

          await queueChange("estimate_items", "update", updatedItem);

          const nextItems = items.map((item) =>
            item.id === updatedItem.id ? updatedItem : item
          );
          setItems(nextItems);
          await persistEstimateTotal(calculateTotal(nextItems));
        } else {
          const newItem: EstimateItemRecord = {
            id: uuidv4(),
            estimate_id: currentEstimate.id,
            description: values.description,
            quantity: values.quantity,
            unit_price: values.unit_price,
            total: values.total,
            version: 1,
            updated_at: now,
            deleted_at: null,
          };

          await db.runAsync(
            `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newItem.id,
              newItem.estimate_id,
              newItem.description,
              newItem.quantity,
              newItem.unit_price,
              newItem.total,
              newItem.version,
              newItem.updated_at,
              newItem.deleted_at,
            ]
          );

          await queueChange("estimate_items", "insert", newItem);

          const nextItems = [...items, newItem];
          setItems(nextItems);
          await persistEstimateTotal(calculateTotal(nextItems));
        }

        closeItemModal();
        await runSync();
      } catch (error) {
        console.error("Failed to save estimate item", error);
        Alert.alert("Error", "Unable to save the item. Please try again.");
      }
    },
    [editingItem, items, closeItemModal, persistEstimateTotal]
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
            onPress: async () => {
              try {
                const db = await openDB();
                const now = new Date().toISOString();
                const nextVersion = (item.version ?? 1) + 1;

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

                const nextItems = items.filter(
                  (existing) => existing.id !== item.id
                );
                setItems(nextItems);
                setEditingItem((current) =>
                  current?.id === item.id ? null : current
                );

                await persistEstimateTotal(calculateTotal(nextItems));
                await runSync();
              } catch (error) {
                console.error("Failed to delete estimate item", error);
                Alert.alert(
                  "Error",
                  "Unable to delete the item. Please try again."
                );
              }
            },
          },
        ]
      );
    },
    [items, persistEstimateTotal]
  );

  const renderItem = useCallback(
    ({ item }: { item: EstimateItemRecord }) => (
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
          <Text style={{ color: "#555" }}>
            Line Total: {formatCurrency(item.total)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Edit"
              onPress={() => {
                setEditingItem(item);
                setItemModalVisible(true);
              }}
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
    ),
    [handleDeleteItem]
  );

  useEffect(() => {
    let isMounted = true;

    const loadEstimate = async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<EstimateListItem>(
          `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.notes, e.status, e.version, e.updated_at, e.deleted_at, c.name AS customer_name
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
        setCustomerId(record.customer_id);
        setEstimateDate(
          record.date ? new Date(record.date).toISOString().split("T")[0] : ""
        );
        setNotes(record.notes ?? "");
        setStatus(record.status ?? "draft");

        const itemRows = await db.getAllAsync<EstimateItemRecord>(
          `SELECT id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at
           FROM estimate_items
           WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY datetime(updated_at) ASC`,
          [estimateId]
        );

        const activeItems = itemRows.filter((item) => !item.deleted_at);

        if (isMounted) {
          setItems(activeItems);
        }

        const recalculatedTotal = calculateTotal(activeItems);
        if (
          Math.abs((record.total ?? 0) - recalculatedTotal) >= 0.005 &&
          isMounted
        ) {
          await persistEstimateTotal(recalculatedTotal);
          await runSync();
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
  }, [estimateId, persistEstimateTotal]);

  const handleCancel = () => {
    if (!saving) {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!estimate || saving) {
      return;
    }

    if (!customerId) {
      Alert.alert("Validation", "Please select a customer.");
      return;
    }

    setSaving(true);

    try {
      const safeTotal = Math.round(computedTotal * 100) / 100;
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
         SET customer_id = ?, date = ?, total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          customerId,
          isoDate,
          safeTotal,
          trimmedNotes,
          status,
          nextVersion,
          now,
          estimate.id,
        ]
      );

      let customerName = estimate.customer_name;
      if (customerId !== estimate.customer_id) {
        const customerRows = await db.getAllAsync<{ name: string }>(
          `SELECT name FROM customers WHERE id = ? LIMIT 1`,
          [customerId]
        );
        customerName = customerRows[0]?.name ?? customerName ?? null;
      }

      const updatedEstimate: EstimateListItem = {
        ...estimate,
        customer_id: customerId,
        customer_name: customerName,
        date: isoDate,
        total: safeTotal,
        notes: trimmedNotes,
        status,
        version: nextVersion,
        updated_at: now,
        deleted_at: null,
      };

      const { customer_name: _customerName, ...queuePayload } = updatedEstimate;

      await queueChange("estimates", "update", queuePayload);
      await runSync();

      setEstimate(updatedEstimate);

      Alert.alert("Success", "Estimate updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Failed to update estimate", error);
      Alert.alert("Error", "Unable to update the estimate. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!estimate) {
    return null;
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      style={{ flex: 1, backgroundColor: "#fff" }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Edit Estimate</Text>
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
          onPress={() => {
            setEditingItem(null);
            setItemModalVisible(true);
          }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Estimate Total</Text>
        <Text>{formatCurrency(computedTotal)}</Text>
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

      <Modal
        visible={itemModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeItemModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>
              {editingItem ? "Edit Item" : "Add Item"}
            </Text>
            <EstimateItemForm
              initialValue={
                editingItem
                  ? {
                      description: editingItem.description,
                      quantity: editingItem.quantity,
                      unit_price: editingItem.unit_price,
                    }
                  : undefined
              }
              onSubmit={handleSubmitItem}
              onCancel={closeItemModal}
              submitLabel={editingItem ? "Update Item" : "Add Item"}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
