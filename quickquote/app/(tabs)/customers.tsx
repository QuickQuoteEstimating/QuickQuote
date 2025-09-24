import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Text,
  TextInput,
  View,
} from "react-native";
import CustomerForm from "../../components/CustomerForm";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";

type CustomerRecord = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setEmail(customer.email ?? "");
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
      const updatedAt = new Date().toISOString();
      const nextVersion = (customer.version ?? 1) + 1;

      const db = await openDB();
      await db.runAsync(
        `UPDATE customers
         SET name = ?, phone = ?, email = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          trimmedName,
          trimmedPhone,
          trimmedEmail,
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
  }, [customer, email, name, phone, onSaved]);

  return (
    <View style={{ gap: 8, padding: 12, borderWidth: 1, borderRadius: 8 }}>
      <Text style={{ fontWeight: "600", fontSize: 16 }}>Edit Customer</Text>
      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
      />
      <TextInput
        placeholder="Phone"
        value={phone}
        onChangeText={setPhone}
        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
      />
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderRadius: 6, padding: 10 }}
      />
      <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
        <Button title="Cancel" onPress={onCancel} disabled={saving} />
        <Button title="Save" onPress={saveChanges} disabled={saving} />
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
        `SELECT id, user_id, name, phone, email, address, version, updated_at, deleted_at
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
      return nameMatch || emailMatch || phoneMatch;
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
      <View
        style={{
          padding: 16,
          borderWidth: 1,
          borderRadius: 10,
          marginBottom: 12,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{item.name}</Text>
        {item.email ? (
          <Text style={{ color: "#555", marginTop: 4 }}>{item.email}</Text>
        ) : null}
        {item.phone ? (
          <Text style={{ color: "#555", marginTop: 2 }}>{item.phone}</Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Edit"
              onPress={() => {
                setEditingCustomer(item);
                setShowAddForm(false);
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="Delete"
              color="#b00020"
              onPress={() => handleDelete(item)}
            />
          </View>
        </View>
      </View>
    ),
    [handleDelete]
  );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#f5f5f5" }}>
      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: "700" }}>
              Customer Management
            </Text>
            <TextInput
              placeholder="Search by name, email, or phone"
              value={search}
              onChangeText={setSearch}
              style={{
                borderWidth: 1,
                borderRadius: 8,
                padding: 10,
                backgroundColor: "#fff",
              }}
            />
            <Button
              title={showAddForm ? "Hide Add Customer" : "Add Customer"}
              onPress={() => {
                setShowAddForm((prev) => !prev);
                setEditingCustomer(null);
              }}
            />
            {showAddForm ? (
              <View style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
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
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={{ paddingVertical: 40 }}>
              <Text style={{ textAlign: "center", color: "#666" }}>
                No customers found.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
}
