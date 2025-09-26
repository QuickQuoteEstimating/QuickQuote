import React, { useState } from "react";
import { router } from "expo-router";
import {
  Alert,
  Button,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import CustomerPicker from "../../../components/CustomerPicker";
import { useAuth } from "../../../context/AuthContext";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

export default function NewEstimateScreen() {
  const { user, session } = useAuth();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [estimateDate, setEstimateDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);

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

    const userId = user?.id ?? session?.user?.id;
    if (!userId) {
      Alert.alert("Authentication required", "Please sign in to continue.");
      return;
    }

    setSaving(true);

    try {
      const parsedTotal = parseFloat(total);
      const safeTotal = Number.isFinite(parsedTotal) ? parsedTotal : 0;
      const now = new Date().toISOString();
      let isoDate: string | null = null;
      if (estimateDate) {
        const parsedDate = new Date(estimateDate);
        isoDate = isNaN(parsedDate.getTime())
          ? now
          : new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      }

      const newEstimate = {
        id: uuidv4(),
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

      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: "600" }}>Total</Text>
        <TextInput
          placeholder="0.00"
          value={total}
          onChangeText={setTotal}
          keyboardType="decimal-pad"
          style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
        />
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
