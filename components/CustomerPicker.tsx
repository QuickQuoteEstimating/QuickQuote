// components/CustomerPicker.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const loadCustomers = useCallback(async () => {
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return customers;
    }

    const normalize = (value?: string | null) => {
      if (typeof value === "string") {
        return value.toLowerCase().trim();
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value).toLowerCase().trim();
    };

    const matches = customers.filter((customer) => {
      const nameMatch = normalize(customer.name).includes(query);
      const phoneMatch = normalize(customer.phone).includes(query);
      const emailMatch = normalize(customer.email).includes(query);
      const addressMatch = normalize(customer.address).includes(query);
      const notesMatch = normalize(customer.notes).includes(query);

      return Boolean(
        nameMatch || phoneMatch || emailMatch || addressMatch || notesMatch
      );
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

  const getDisplayName = useCallback((customer: Customer) => {
    const trimmedName = customer.name?.trim();
    if (trimmedName) {
      return trimmedName;
    }
    return "Unnamed customer";
  }, []);

  if (addingNew) {
    return (
      <CustomerForm
        onSaved={(c) => {
          setAddingNew(false);
          setSearchQuery("");
          loadCustomers().then(() => {
            onSelect(c.id);
          });
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
          <Picker.Item key={c.id} label={getDisplayName(c)} value={c.id} />
        ))}
        <Picker.Item label="➕ Add New Customer" value="new" />
      </Picker>

      <Button title="Add New Customer" onPress={() => setAddingNew(true)} />
    </View>
  );
}
