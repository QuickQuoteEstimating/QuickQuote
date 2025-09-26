import React, { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
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
import CustomerPicker from "../../../components/CustomerPicker";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import type { EstimateListItem } from "./index";

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
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

        setEstimate(record);
        setCustomerId(record.customer_id);
        setEstimateDate(
          record.date ? new Date(record.date).toISOString().split("T")[0] : ""
        );
        setTotal(
          typeof record.total === "number" ? record.total.toString() : ""
        );
        setNotes(record.notes ?? "");
        setStatus(record.status ?? "draft");
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
  }, [estimateId]);

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
