// components/CustomerPicker.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { openDB } from "../lib/sqlite";
import CustomerForm from "./CustomerForm";
import { useTheme, type Theme } from "../theme";
import { Button, Card, Input } from "./ui";

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<Customer>(
        "SELECT id, name, phone, email, address, notes FROM customers WHERE deleted_at IS NULL ORDER BY name ASC",
      );
      setCustomers(rows);
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert(
        "Unable to load customers",
        "Please try again later or contact support if the issue persists.",
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

      return Boolean(nameMatch || phoneMatch || emailMatch || addressMatch || notesMatch);
    });

    if (selectedCustomer && !matches.some((customer) => customer.id === selectedCustomer)) {
      const selected = customers.find((customer) => customer.id === selectedCustomer);
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
      <Card style={styles.loadingCard}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading customers…</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Customer</Text>
        <Text style={styles.caption}>
          Search existing contacts or create a new profile without leaving the estimate.
        </Text>
      </View>
      <Input
        label="Search"
        placeholder="Name, phone, email, or address"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      <View style={styles.pickerShell}>
        <Picker
          selectedValue={selectedCustomer ?? ""}
          onValueChange={handleSelect}
          style={styles.picker}
          dropdownIconColor={theme.colors.primary}
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
      </View>
      <Button label="Add New Customer" variant="secondary" onPress={() => setAddingNew(true)} />
    </Card>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    card: {
      gap: 16,
    },
    header: {
      gap: 6,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.primaryText,
    },
    caption: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textMuted,
    },
    pickerShell: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      overflow: "hidden",
    },
    picker: {
      height: 52,
      color: colors.primaryText,
    },
    loadingCard: {
      alignItems: "center",
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: colors.textMuted,
    },
  });
}
