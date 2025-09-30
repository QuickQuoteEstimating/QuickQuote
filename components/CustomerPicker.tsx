// components/CustomerPicker.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Button,
  Alert,
  TextInput,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { openDB } from "../lib/sqlite";
import CustomerForm from "./CustomerForm";
import { palette } from "../lib/theme";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

type Props = {
  selectedCustomer: string | null;
  onSelect: (id: string | null) => void;
};

export default function CustomerPicker({ selectedCustomer, onSelect }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function loadCustomers() {
    setLoading(true);
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<Customer>(
        "SELECT id, name, phone, email, address, notes FROM customers WHERE deleted_at IS NULL ORDER BY name ASC"
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

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return customers;
    }

    const matches = customers.filter((customer) => {
      const nameMatch = customer.name.toLowerCase().includes(query);
      const phoneMatch = customer.phone?.toLowerCase().includes(query);
      const emailMatch = customer.email?.toLowerCase().includes(query);
      const addressMatch = customer.address?.toLowerCase().includes(query);

      return Boolean(nameMatch || phoneMatch || emailMatch || addressMatch);
    });

    if (
      selectedCustomer &&
      !matches.some((customer) => customer.id === selectedCustomer)
    ) {
      const selected = customers.find(
        (customer) => customer.id === selectedCustomer,
      );
      if (selected) {
        return [selected, ...matches];
      }
    }

    return matches;
  }, [customers, searchQuery, selectedCustomer]);

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
          setSearchQuery("");
          onSelect(c.id);
        }}
        onCancel={() => setAddingNew(false)}
      />
    );
  }

  const handleSelect = (value: string | number) => {
    if (value === "new") {
      setAddingNew(true);
      return;
    }

    if (!value) {
      onSelect(null);
      return;
    }

    onSelect(String(value));
  };

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
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by name, phone, email, or address"
        placeholderTextColor="rgba(255,255,255,0.65)"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 8,
          marginBottom: 8,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          borderColor: "rgba(255, 255, 255, 0.25)",
          color: palette.surface,
        }}
      />
      <Picker
        selectedValue={selectedCustomer ?? ""}
        onValueChange={handleSelect}
      >
        <Picker.Item label="-- Select --" value="" />
        {filteredCustomers.length === 0 ? (
          <Picker.Item label="No matching customers" value="" enabled={false} />
        ) : null}
        {filteredCustomers.map((c: Customer) => (
          <Picker.Item key={c.id} label={c.name} value={c.id} />
        ))}
        <Picker.Item label="➕ Add New Customer" value="new" />
      </Picker>

      <Button title="Add New Customer" onPress={() => setAddingNew(true)} />
    </View>
  );
}
