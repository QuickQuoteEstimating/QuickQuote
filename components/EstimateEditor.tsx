import "react-native-get-random-values";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { v4 as uuidv4 } from "uuid";
import CustomerPicker from "./CustomerPicker";
import { openDB, queueChange } from "../lib/sqlite";
import { runSync } from "../lib/sync";
import { useAuth } from "../context/AuthContext";

export type EstimateStatus = "draft" | "sent" | "accepted";

type EstimateRecord = {
  id: string;
  user_id: string;
  customer_id: string;
  date: string;
  status: EstimateStatus;
  total: number;
  notes: string | null;
  version: number;
  updated_at: string;
  deleted_at?: string | null;
};

type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  version: number;
  updated_at: string;
  deleted_at?: string | null;
};

type EditableLineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type EstimateEditorProps = {
  estimateId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
};

const STATUSES: EstimateStatus[] = ["draft", "sent", "accepted"];

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function createEmptyLineItem(): EditableLineItem {
  return {
    id: uuidv4(),
    description: "",
    quantity: "1",
    unitPrice: "0",
  };
}

export default function EstimateEditor({
  estimateId,
  onClose,
  onSaved,
  onDeleted,
}: EstimateEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(Boolean(estimateId));
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<EstimateStatus>("draft");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([
    createEmptyLineItem(),
  ]);
  const [persistedEstimate, setPersistedEstimate] =
    useState<EstimateRecord | null>(null);
  const [persistedItems, setPersistedItems] = useState<
    Record<string, EstimateItemRecord>
  >({});

  const subtotal = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) {
        return sum;
      }
      return sum + quantity * unitPrice;
    }, 0);
  }, [lineItems]);

  useEffect(() => {
    if (!estimateId) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadEstimate = async () => {
      try {
        const db = await openDB();
        const estimateRows = await db.getAllAsync<EstimateRecord>(
          `SELECT id, user_id, customer_id, date, status, total, notes, version, updated_at, deleted_at
           FROM estimates
           WHERE id = ?
           LIMIT 1`,
          [estimateId]
        );

        const estimate = estimateRows[0];
        if (!estimate) {
          Alert.alert("Not found", "This estimate could not be found.");
          onClose();
          return;
        }

        const items = await db.getAllAsync<EstimateItemRecord>(
          `SELECT id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at
           FROM estimate_items
           WHERE estimate_id = ?
           ORDER BY updated_at ASC`,
          [estimateId]
        );

        if (!isMounted) return;

        setPersistedEstimate(estimate);
        setCustomerId(estimate.customer_id);
        setEstimateDate(estimate.date?.slice(0, 10) ?? "");
        setStatus((estimate.status as EstimateStatus) ?? "draft");
        setNotes(estimate.notes ?? "");
        setPersistedItems(
          items.reduce((acc, item) => {
            acc[item.id] = item;
            return acc;
          }, {} as Record<string, EstimateItemRecord>)
        );
        if (items.length > 0) {
          setLineItems(
            items.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: String(item.quantity),
              unitPrice: String(item.unit_price),
            }))
          );
        } else {
          setLineItems([createEmptyLineItem()]);
        }
      } catch (error) {
        console.error("Failed to load estimate", error);
        Alert.alert(
          "Error",
          "Unable to load this estimate. Please try again later."
        );
        onClose();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadEstimate();

    return () => {
      isMounted = false;
    };
  }, [estimateId, onClose]);

  const updateLineItem = useCallback(
    (id: string, patch: Partial<EditableLineItem>) => {
      setLineItems((items) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
    },
    []
  );

  const removeLineItem = useCallback((id: string) => {
    setLineItems((items) => {
      const remaining = items.filter((item) => item.id !== id);
      return remaining.length > 0 ? remaining : [createEmptyLineItem()];
    });
  }, []);

  const addLineItem = useCallback(() => {
    setLineItems((items) => [...items, createEmptyLineItem()]);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;

    if (!customerId) {
      Alert.alert("Validation", "Please choose a customer.");
      return;
    }

    const normalizedItems = lineItems
      .map((item) => {
        const description = item.description.trim();
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        if (!description) {
          return null;
        }
        if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) {
          return null;
        }
        if (quantity <= 0 || unitPrice < 0) {
          return null;
        }
        return {
          id: item.id,
          description,
          quantity,
          unit_price: unitPrice,
          total: quantity * unitPrice,
        };
      })
      .filter((item): item is {
        id: string;
        description: string;
        quantity: number;
        unit_price: number;
        total: number;
      } => item !== null);

    if (normalizedItems.length === 0) {
      Alert.alert("Validation", "Please add at least one line item.");
      return;
    }

    const notesValue = notes.trim();
    const total = normalizedItems.reduce((sum, item) => sum + item.total, 0);
    const now = new Date().toISOString();

    const userId = persistedEstimate?.user_id ?? user?.id;

    if (!userId) {
      Alert.alert(
        "Authentication required",
        "Please sign in before saving estimates."
      );
      return;
    }

    setSaving(true);

    try {
      const db = await openDB();

      const estimateRecord: EstimateRecord = {
        id: estimateId ?? uuidv4(),
        user_id: userId,
        customer_id: customerId,
        date: estimateDate,
        status,
        total,
        notes: notesValue.length > 0 ? notesValue : null,
        version: (persistedEstimate?.version ?? 0) + 1,
        updated_at: now,
        deleted_at: null,
      };

      await db.execAsync("BEGIN TRANSACTION;");

      if (persistedEstimate) {
        await db.runAsync(
          `UPDATE estimates
           SET customer_id = ?, date = ?, status = ?, total = ?, notes = ?, version = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
          [
            estimateRecord.customer_id,
            estimateRecord.date,
            estimateRecord.status,
            estimateRecord.total,
            estimateRecord.notes,
            estimateRecord.version,
            estimateRecord.updated_at,
            estimateRecord.id,
          ]
        );
      } else {
        await db.runAsync(
          `INSERT INTO estimates (id, user_id, customer_id, date, status, total, notes, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            estimateRecord.id,
            estimateRecord.user_id,
            estimateRecord.customer_id,
            estimateRecord.date,
            estimateRecord.status,
            estimateRecord.total,
            estimateRecord.notes,
            estimateRecord.version,
            estimateRecord.updated_at,
          ]
        );
      }

      const seenIds = new Set<string>();

      for (const item of normalizedItems) {
        const existing = persistedItems[item.id];
        if (existing) {
          const nextVersion = (existing.version ?? 0) + 1;
          await db.runAsync(
            `UPDATE estimate_items
             SET description = ?, quantity = ?, unit_price = ?, total = ?, version = ?, updated_at = ?, deleted_at = NULL
             WHERE id = ?`,
            [
              item.description,
              item.quantity,
              item.unit_price,
              item.total,
              nextVersion,
              now,
              item.id,
            ]
          );
          seenIds.add(item.id);
        } else {
          await db.runAsync(
            `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
              item.id,
              estimateRecord.id,
              item.description,
              item.quantity,
              item.unit_price,
              item.total,
              1,
              now,
            ]
          );
        }
      }

      const removedIds = Object.keys(persistedItems).filter(
        (itemId) => !seenIds.has(itemId)
      );

      for (const id of removedIds) {
        await db.runAsync("DELETE FROM estimate_items WHERE id = ?", [id]);
      }

      await db.execAsync("COMMIT;");

      await queueChange(
        "estimates",
        persistedEstimate ? "update" : "insert",
        estimateRecord
      );

      for (const item of normalizedItems) {
        const existing = persistedItems[item.id];
        if (existing) {
          await queueChange("estimate_items", "update", {
            ...existing,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            version: (existing.version ?? 0) + 1,
            updated_at: now,
            deleted_at: null,
          });
        } else {
          await queueChange("estimate_items", "insert", {
            id: item.id,
            estimate_id: estimateRecord.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            version: 1,
            updated_at: now,
            deleted_at: null,
          });
        }
      }

      for (const id of removedIds) {
        await queueChange("estimate_items", "delete", {
          id,
          estimate_id: estimateRecord.id,
        });
      }

      await runSync();

      Alert.alert("Success", "Estimate saved.");
      onSaved();
    } catch (error) {
      console.error("Failed to save estimate", error);
      try {
        const db = await openDB();
        await db.execAsync("ROLLBACK;");
      } catch (rollbackError) {
        console.error("Failed to rollback transaction", rollbackError);
      }
      Alert.alert(
        "Error",
        "Unable to save this estimate. Please review your inputs and try again."
      );
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    customerId,
    lineItems,
    notes,
    status,
    estimateDate,
    persistedEstimate,
    persistedItems,
    estimateId,
    onSaved,
    user?.id,
  ]);

  const handleDelete = useCallback(() => {
    if (!persistedEstimate || saving) return;

    Alert.alert("Delete Estimate", "Are you sure you want to delete this estimate?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const db = await openDB();
            await db.execAsync("BEGIN TRANSACTION;");
            await db.runAsync("DELETE FROM estimate_items WHERE estimate_id = ?", [
              persistedEstimate.id,
            ]);
            await db.runAsync("DELETE FROM estimates WHERE id = ?", [
              persistedEstimate.id,
            ]);
            await db.execAsync("COMMIT;");

            await queueChange("estimates", "delete", { id: persistedEstimate.id });
            for (const id of Object.keys(persistedItems)) {
              await queueChange("estimate_items", "delete", {
                id,
                estimate_id: persistedEstimate.id,
              });
            }

            await runSync();

            Alert.alert("Deleted", "Estimate removed.");
            if (onDeleted) onDeleted();
          } catch (error) {
            console.error("Failed to delete estimate", error);
            try {
              const db = await openDB();
              await db.execAsync("ROLLBACK;");
            } catch (rollbackError) {
              console.error("Failed to rollback after delete", rollbackError);
            }
            Alert.alert(
              "Error",
              "Unable to delete this estimate. Please try again later."
            );
          }
        },
      },
    ]);
  }, [persistedEstimate, persistedItems, saving, onDeleted]);

  if (loading) {
    return (
      <View style={{ padding: 16 }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading estimate…</Text>
        <Button title="Close" onPress={onClose} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 80 }}
      style={{ flex: 1, paddingHorizontal: 16 }}
    >
      <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: 12 }}>
        {persistedEstimate ? "Edit Estimate" : "New Estimate"}
      </Text>

      <CustomerPicker
        selectedCustomer={customerId}
        onSelect={(value) => setCustomerId(value)}
      />

      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: "600", marginBottom: 6 }}>Metadata</Text>
        <View style={{ gap: 12 }}>
          <View>
            <Text style={{ marginBottom: 4 }}>Date</Text>
            <TextInput
              value={estimateDate}
              onChangeText={setEstimateDate}
              placeholder="YYYY-MM-DD"
              style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
            />
          </View>
          <View>
            <Text style={{ marginBottom: 4 }}>Status</Text>
            <View style={{ borderWidth: 1, borderRadius: 6 }}>
              <Picker
                selectedValue={status}
                onValueChange={(value) => setStatus(value as EstimateStatus)}
              >
                {STATUSES.map((option) => (
                  <Picker.Item
                    key={option}
                    label={option.charAt(0).toUpperCase() + option.slice(1)}
                    value={option}
                  />
                ))}
              </Picker>
            </View>
          </View>
          <View>
            <Text style={{ marginBottom: 4 }}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Add project notes"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{
                borderWidth: 1,
                borderRadius: 6,
                padding: 10,
                minHeight: 100,
              }}
            />
          </View>
        </View>
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: "600", marginBottom: 12 }}>Line Items</Text>
        <View style={{ gap: 12 }}>
          {lineItems.map((item) => (
            <View
              key={item.id}
              style={{
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                gap: 8,
              }}
            >
              <TextInput
                placeholder="Description"
                value={item.description}
                onChangeText={(text) => updateLineItem(item.id, { description: text })}
                style={{ borderWidth: 1, borderRadius: 6, padding: 8 }}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text>Quantity</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={item.quantity}
                    onChangeText={(text) => updateLineItem(item.id, { quantity: text })}
                    style={{ borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 4 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text>Unit Price</Text>
                  <TextInput
                    keyboardType="numeric"
                    value={item.unitPrice}
                    onChangeText={(text) => updateLineItem(item.id, { unitPrice: text })}
                    style={{ borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 4 }}
                  />
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "600" }}>
                  Line Total: {formatCurrency(Number(item.quantity) * Number(item.unitPrice) || 0)}
                </Text>
                <Button title="Remove" onPress={() => removeLineItem(item.id)} />
              </View>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 12 }}>
          <Button title="Add Line Item" onPress={addLineItem} />
        </View>
      </View>

      <View
        style={{
          padding: 16,
          borderWidth: 1,
          borderRadius: 8,
          marginBottom: 24,
          backgroundColor: "#f8f8f8",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Estimate Total</Text>
        <Text style={{ fontSize: 28, fontWeight: "700", marginTop: 8 }}>
          {formatCurrency(subtotal)}
        </Text>
      </View>

      <View style={{ gap: 12, marginBottom: 48 }}>
        <Button title={saving ? "Saving…" : "Save Estimate"} onPress={handleSave} disabled={saving} />
        {persistedEstimate ? (
          <Button title="Delete Estimate" color="#c1121f" onPress={handleDelete} />
        ) : null}
        <Button title="Close" onPress={onClose} />
      </View>
    </ScrollView>
  );
}
