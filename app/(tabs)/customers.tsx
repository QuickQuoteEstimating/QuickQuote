import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import CustomerForm from "../../components/CustomerForm";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";
import { cardShadow, palette } from "../../lib/theme";

type CustomerRecord = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

type EditCustomerFormProps = {
  customer: CustomerRecord;
  onCancel: () => void;
  onSaved: (customer: CustomerRecord) => void;
};

function EditCustomerForm({ customer, onCancel, onSaved }: EditCustomerFormProps) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setEmail(customer.email ?? "");
    setAddress(customer.address ?? "");
    setNotes(customer.notes ?? "");
  }, [customer]);

  const saveChanges = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }

    try {
      setSaving(true);
      const trimmedName = name.trim();
      const trimmedPhone = phone.trim() || null;
      const trimmedEmail = email.trim() || null;
      const trimmedAddress = address.trim() || null;
      const trimmedNotes = notes.trim() || null;
      const updatedAt = new Date().toISOString();
      const nextVersion = (customer.version ?? 1) + 1;

      const db = await openDB();
      await db.runAsync(
        `UPDATE customers
         SET name = ?, phone = ?, email = ?, address = ?, notes = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          trimmedName,
          trimmedPhone,
          trimmedEmail,
          trimmedAddress,
          trimmedNotes,
          nextVersion,
          updatedAt,
          customer.id,
        ]
      );

      const updatedCustomer: CustomerRecord = {
        ...customer,
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        address: trimmedAddress,
        notes: trimmedNotes,
        version: nextVersion,
        updated_at: updatedAt,
        deleted_at: null,
      };

      await queueChange("customers", "update", updatedCustomer);
      await runSync();

      Alert.alert("Success", "Customer updated.");
      onSaved(updatedCustomer);
    } catch (error) {
      console.error("Failed to update customer", error);
      Alert.alert("Error", "Unable to update customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [address, customer, email, name, notes, phone, onSaved]);

  return (
    <View style={styles.editCard}>
      <Text style={styles.editTitle}>Edit Customer</Text>
      <TextInput
        placeholder="Name"
        placeholderTextColor={palette.mutedText}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Phone"
        placeholderTextColor={palette.mutedText}
        value={phone}
        onChangeText={setPhone}
        style={styles.input}
      />
      <TextInput
        placeholder="Email"
        placeholderTextColor={palette.mutedText}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        placeholder="Address"
        placeholderTextColor={palette.mutedText}
        value={address}
        onChangeText={setAddress}
        style={styles.input}
      />
      <TextInput
        placeholder="Account notes"
        placeholderTextColor={palette.mutedText}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />
      <View style={styles.inlineButtons}>
        <View style={styles.buttonFlex}>
          <Button
            title="Cancel"
            onPress={onCancel}
            disabled={saving}
            color={palette.secondaryText}
          />
        </View>
        <View style={styles.buttonFlex}>
          <Button
            title="Save"
            onPress={saveChanges}
            disabled={saving}
            color={palette.accent}
          />
        </View>
      </View>
    </View>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(
    null
  );

  const loadCustomers = useCallback(async () => {
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<CustomerRecord>(
        `SELECT id, user_id, name, phone, email, address, notes, version, updated_at, deleted_at
         FROM customers
         WHERE deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`
      );
      setCustomers(rows);
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert("Error", "Unable to load customers. Please try again.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCustomers();
      setLoading(false);
    })();
  }, [loadCustomers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) => {
      const nameMatch = customer.name.toLowerCase().includes(query);
      const emailMatch = (customer.email ?? "").toLowerCase().includes(query);
      const phoneMatch = (customer.phone ?? "").toLowerCase().includes(query);
      const addressMatch = (customer.address ?? "").toLowerCase().includes(query);
      const notesMatch = (customer.notes ?? "").toLowerCase().includes(query);
      return nameMatch || emailMatch || phoneMatch || addressMatch || notesMatch;
    });
  }, [customers, search]);

  const handleDelete = useCallback(
    (customer: CustomerRecord) => {
      Alert.alert(
        "Delete Customer",
        `Are you sure you want to delete ${customer.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const db = await openDB();
                const deletedAt = new Date().toISOString();
                const nextVersion = (customer.version ?? 1) + 1;

                await db.runAsync(
                  `UPDATE customers
                   SET deleted_at = ?, updated_at = ?, version = ?
                   WHERE id = ?`,
                  [deletedAt, deletedAt, nextVersion, customer.id]
                );

                const deletedCustomer: CustomerRecord = {
                  ...customer,
                  deleted_at: deletedAt,
                  updated_at: deletedAt,
                  version: nextVersion,
                };

                await queueChange("customers", "update", deletedCustomer);
                await runSync();

                setCustomers((prev) =>
                  prev.filter((existing) => existing.id !== customer.id)
                );
                if (editingCustomer?.id === customer.id) {
                  setEditingCustomer(null);
                }
              } catch (error) {
                console.error("Failed to delete customer", error);
                Alert.alert(
                  "Error",
                  "Unable to delete customer. Please try again."
                );
              }
            },
          },
        ]
      );
    },
    [editingCustomer]
  );

  const renderCustomer = useCallback(
    ({ item }: { item: CustomerRecord }) => (
      <View style={styles.customerCard}>
        <Text style={styles.customerName}>{item.name}</Text>
        {item.email ? (
          <Text style={styles.customerMeta}>{item.email}</Text>
        ) : null}
        {item.phone ? (
          <Text style={styles.customerMeta}>{item.phone}</Text>
        ) : null}
        {item.address ? (
          <Text style={styles.customerMeta}>{item.address}</Text>
        ) : null}
        {item.notes ? (
          <Text style={styles.customerNotes}>{item.notes}</Text>
        ) : null}
        <View style={styles.inlineButtons}>
          <View style={styles.buttonFlex}>
            <Button
              title="Edit"
              color={palette.accent}
              onPress={() => {
                setEditingCustomer(item);
                setShowAddForm(false);
              }}
            />
          </View>
          <View style={styles.buttonFlex}>
            <Button
              title="Delete"
              color={palette.danger}
              onPress={() => handleDelete(item)}
            />
          </View>
        </View>
      </View>
    ),
    [handleDelete]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Customer management</Text>
            <Text style={styles.subtitle}>
              Keep every relationship organized with quick notes and contact details.
            </Text>
            <TextInput
              placeholder="Search by name, email, phone, address, or notes"
              placeholderTextColor={palette.mutedText}
              value={search}
              onChangeText={setSearch}
              style={styles.input}
            />
            <Button
              title={showAddForm ? "Hide Add Customer" : "Add Customer"}
              onPress={() => {
                setShowAddForm((prev) => !prev);
                setEditingCustomer(null);
              }}
              color={palette.accent}
            />
            {showAddForm ? (
              <View style={styles.formCard}>
                <CustomerForm
                  onSaved={() => {
                    setShowAddForm(false);
                    loadCustomers();
                  }}
                  onCancel={() => setShowAddForm(false)}
                />
              </View>
            ) : null}
            {editingCustomer ? (
              <EditCustomerForm
                customer={editingCustomer}
                onCancel={() => setEditingCustomer(null)}
                onSaved={(updated) => {
                  setEditingCustomer(null);
                  setCustomers((prev) =>
                    prev.map((existing) =>
                      existing.id === updated.id ? updated : existing
                    )
                  );
                  loadCustomers();
                }}
              />
            ) : null}
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={palette.accent} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No customers found.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: palette.background,
  },
  header: {
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: palette.primaryText,
  },
  subtitle: {
    fontSize: 14,
    color: palette.secondaryText,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    color: palette.primaryText,
    ...cardShadow(4),
  },
  textArea: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: palette.surface,
    color: palette.primaryText,
    minHeight: 90,
    textAlignVertical: "top",
  },
  formCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(10),
  },
  editCard: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(10),
  },
  editTitle: {
    fontWeight: "600",
    fontSize: 16,
    color: palette.primaryText,
  },
  inlineButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  buttonFlex: {
    flex: 1,
  },
  customerCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...cardShadow(12),
    gap: 6,
  },
  customerName: {
    fontSize: 18,
    fontWeight: "600",
    color: palette.primaryText,
  },
  customerMeta: {
    color: palette.secondaryText,
  },
  customerNotes: {
    marginTop: 6,
    color: palette.mutedText,
    fontStyle: "italic",
  },
  loadingRow: {
    paddingVertical: 16,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    color: palette.mutedText,
  },
  listContent: {
    paddingBottom: 24,
  },
});
