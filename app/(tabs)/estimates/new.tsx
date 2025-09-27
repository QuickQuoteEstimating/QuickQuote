import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import {
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
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import CustomerPicker from "../../../components/CustomerPicker";
import EstimateItemForm, {
  type EstimateItemFormValues,
} from "../../../components/EstimateItemForm";
import { useAuth } from "../../../context/AuthContext";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";

type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
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
  const [estimateId] = useState(() => uuidv4());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<EstimateItemRecord[]>([]);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EstimateItemRecord | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => {
    const sum = items.reduce((acc, item) => acc + item.total, 0);
    return Math.round(sum * 100) / 100;
  }, [items]);

  const closeItemModal = () => {
    setItemModalVisible(false);
    setEditingItem(null);
  };

  const handleSubmitItem = (values: EstimateItemFormValues) => {
    const now = new Date().toISOString();

    if (editingItem) {
      const updated: EstimateItemRecord = {
        ...editingItem,
        description: values.description,
        quantity: values.quantity,
        unit_price: values.unit_price,
        total: values.total,
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
        version: 1,
        updated_at: now,
        deleted_at: null,
      };

      setItems((prev) => [...prev, newItem]);
    }

    closeItemModal();
  };

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
            setItems((prev) => prev.filter((existing) => existing.id !== item.id));
            if (editingItem?.id === item.id) {
              setEditingItem(null);
            }
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

    const userId = user?.id ?? session?.user?.id;
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
        notes: notes.trim() ? notes.trim() : null,
        status,
        version: 1,
        updated_at: now,
        deleted_at: null,
      };

      const db = await openDB();
      await db.runAsync(
        `INSERT OR REPLACE INTO estimates
         (id, user_id, customer_id, date, total, notes, status, version, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newEstimate.id,
          newEstimate.user_id,
          newEstimate.customer_id,
          newEstimate.date,
          newEstimate.total,
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
          `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemRecord.id,
            itemRecord.estimate_id,
            itemRecord.description,
            itemRecord.quantity,
            itemRecord.unit_price,
            itemRecord.total,
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
          onPress={() => {
            setEditingItem(null);
            setItemModalVisible(true);
          }}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Estimate Total</Text>
        <Text>{formatCurrency(total)}</Text>
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
