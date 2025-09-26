// components/CustomerPicker.tsx
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, Button, Alert } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { openDB } from "../lib/sqlite";
import CustomerForm from "./CustomerForm";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

type Props = {
  selectedCustomer: string | null;
  onSelect: (id: string) => void;
};

export default function CustomerPicker({ selectedCustomer, onSelect }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);

  async function loadCustomers() {
    setLoading(true);
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<Customer>(
        "SELECT id, name, phone, email FROM customers WHERE deleted_at IS NULL ORDER BY name ASC"
      );
      setCustomers(rows);
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert(
        "Unable to load customers",
        "Please try again later or contact support if the issue persists."
      );
      throw error;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers().catch(() => {
      // Error is already handled within loadCustomers; this catch prevents unhandled rejections.
    });
  }, []);

  if (addingNew) {
    return (
      <CustomerForm
        onSaved={(c) => {
          setAddingNew(false);
          // add to the list and select it
          setCustomers((prev) =>
            [...prev, { id: c.id, name: c.name }].sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
          onSelect(c.id);
        }}
        onCancel={() => setAddingNew(false)}
      />
    );
  }

  if (loading) {
    return (
      <View style={{ padding: 10 }}>
        <ActivityIndicator />
        <Text>Loading customers…</Text>
      </View>
    );
  }

  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={{ marginBottom: 6, fontWeight: "600" }}>Select Customer</Text>
      <Picker
        selectedValue={selectedCustomer ?? ""}
        onValueChange={(value: string) => {
          if (value === "new") setAddingNew(true);
          else onSelect(value);
        }}
      >
        <Picker.Item label="-- Select --" value="" />
        {customers.map((c: Customer) => (
          <Picker.Item key={c.id} label={c.name} value={c.id} />
        ))}
        <Picker.Item label="➕ Add New Customer" value="new" />
      </Picker>

      <Button title="Add New Customer" onPress={() => setAddingNew(true)} />
    </View>
  );
}
