import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ListRenderItem } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomerForm from "../../components/CustomerForm";
import { Badge, Button, Card, Input, ListItem } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import { confirmDelete } from "../../lib/confirmDelete";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";
import type { CustomerRecord } from "../../types/customers";

type EditCustomerFormProps = {
  customer: CustomerRecord;
  onCancel: () => void;
  onSaved: (customer: CustomerRecord) => void;
  onDelete: (customer: CustomerRecord) => void;
};

function EditCustomerForm({ customer, onCancel, onSaved, onDelete }: EditCustomerFormProps) {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createEditStyles(theme), [theme]);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [email, setEmail] = useState(customer.email ?? "");
  const [notes, setNotes] = useState(customer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setEmail(customer.email ?? "");
    setNotes(customer.notes ?? "");
    if (customer.address) {
      const parts = customer.address.split(",").map((p) => p.trim());
      setStreet(parts[0] ?? "");
      setCity(parts[1] ?? "");
      const stateZip = parts[2]?.split(" ") ?? [];
      setState(stateZip[0] ?? "");
      setZip(stateZip[1] ?? "");
    }
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
      const trimmedNotes = notes.trim() || null;
      const fullAddress = [street, city, state, zip].filter(Boolean).join(", ") || null;
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
          fullAddress,
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
        address: fullAddress ?? "",
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
  }, [name, phone, email, notes, street, city, state, zip, customer, onSaved]);

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Edit customer</Text>
        <Badge style={styles.editBadge}>Updating</Badge>
      </View>

      <Input label="Name" placeholder="Customer name" value={name} onChangeText={setName} />
      <Input label="Phone" placeholder="(555) 123-4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />

      <View style={{ gap: 12 }}>
        <Input label="Street" value={street} onChangeText={setStreet} placeholder="123 Main Street" />
        <Input label="City" value={city} onChangeText={setCity} placeholder="Springfield" />
        <Input label="State" value={state} onChangeText={setState} placeholder="RI" />
        <Input label="ZIP Code" value={zip} onChangeText={setZip} placeholder="02893" keyboardType="numeric" />
      </View>

      <Input
        label="Notes"
        placeholder="Notes, preferences, or job history"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <View style={styles.actions}>
        <Button label={saving ? "Saving…" : "Save"} onPress={saveChanges} loading={saving} disabled={saving} alignment="full" />
        <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={saving} alignment="full" />
        <Button
          label="Create Estimate"
          variant="primary"
          onPress={() => router.push("/(tabs)/estimates")}
          alignment="full"
        />
      </View>

      <View style={styles.deleteSection}>
        <Button label="Delete" variant="danger" onPress={() => onDelete(customer)} disabled={saving} alignment="full" />
      </View>
    </Card>
  );
}

// --- MAIN CUSTOMERS SCREEN ---
export default function Customers() {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const loadCustomers = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const db = await openDB();
      const rows = await db.getAllAsync<CustomerRecord>(
        `SELECT id, user_id, name, phone, email, address, notes, version, updated_at, deleted_at
         FROM customers
         WHERE deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`
      );
      setCustomers(rows);
      if (!selectedCustomerId && rows.length > 0) {
        setSelectedCustomerId(rows[0].id);
      }
    } catch (err) {
      console.error("Failed to load customers", err);
      setError("We couldn’t load your customers. Pull to refresh or try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return customers;
    const normalize = (v?: string | null) => (v ? v.toLowerCase().trim() : "");
    return customers.filter((c) =>
      [c.name, c.email, c.phone, c.address, c.notes].map(normalize).some((v) => v.includes(q))
    );
  }, [customers, searchInput]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;

  const handleDelete = useCallback(
    (customer: CustomerRecord) => {
      confirmDelete("Delete this Customer?", "This action cannot be undone.", async () => {
        try {
          const db = await openDB();
          await db.runAsync(
            `UPDATE customers SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, version = COALESCE(version, 0) + 1 WHERE id = ?`,
            [customer.id]
          );
          await queueChange("customers", "delete", { id: customer.id });
          await runSync();
          setCustomers((cur) => cur.filter((c) => c.id !== customer.id));
          router.replace("/(tabs)/customers");
        } catch (e) {
          console.error("Delete failed", e);
          Alert.alert("Error", "Unable to delete customer.");
        }
      });
    },
    []
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList<CustomerRecord>
          data={loading ? [] : filteredCustomers}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <ListItem
              title={item.name || "Unnamed customer"}
              subtitle={item.phone || item.email || "No contact info"}
              onPress={() => {
                setEditingCustomer(null);
                setShowAddForm(false);
                setSelectedCustomerId(item.id);
              }}
              style={[
                styles.listItem,
                item.id === selectedCustomerId ? styles.listItemActive : null,
              ]}
            />
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.headerTitle}>Customers</Text>
              <Card style={styles.searchCard}>
                <Input
                  label="Search customers…"
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Search by name, email, phone, or notes"
                />
              </Card>

              {selectedCustomer && (
                <Card style={styles.detailCard}>
                  <Text style={styles.detailName}>{selectedCustomer.name}</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.email || selectedCustomer.phone}</Text>
                  <Text style={styles.detailValue}>{selectedCustomer.address || "No address provided"}</Text>
                  {selectedCustomer.notes ? <Text style={styles.detailValue}>{selectedCustomer.notes}</Text> : null}
                  <View style={styles.detailActions}>
                    <Button label="Edit" variant="secondary" onPress={() => setEditingCustomer(selectedCustomer)} />
                    <Button label="Delete" variant="ghost" onPress={() => handleDelete(selectedCustomer)} textStyle={styles.deleteLabel} />
                  </View>
                </Card>
              )}

              {showAddForm && (
                <CustomerForm
                  onSaved={() => void loadCustomers()}
                  onCancel={() => setShowAddForm(false)}
                  style={styles.inlineForm}
                />
              )}

              {editingCustomer && (
                <EditCustomerForm
                  customer={editingCustomer}
                  onCancel={() => setEditingCustomer(null)}
                  onSaved={() => void loadCustomers()}
                  onDelete={handleDelete}
                />
              )}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />

        {/* ✅ Centered Add Customer Pill */}
        <View style={styles.centeredButtonContainer}>
         <Button
  label="Create Estimate"
  variant="primary"
  style={{ backgroundColor: theme.colors.accent }}
  textStyle={{ color: "#fff" }}
  onPress={() =>
    selectedCustomer &&
    router.push({
      pathname: "/(tabs)/estimates/[id]",
      params: {
        id: "new",
        customer_id: selectedCustomer.id,
        name: selectedCustomer.name,
        mode: "new",
      },
    })
  }
/>

        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.background },
    container: { flex: 1 },
    listContent: { padding: theme.spacing.xl },
    listHeader: { gap: theme.spacing.xl },
    headerTitle: { fontSize: 28, fontWeight: "700", color: theme.colors.primaryText },
    searchCard: { gap: theme.spacing.md },
    detailCard: { gap: theme.spacing.md, padding: theme.spacing.md },
    detailName: { fontSize: 20, fontWeight: "700", color: theme.colors.secondaryText },
    detailValue: { fontSize: 16, color: theme.colors.secondaryText },
    detailActions: { flexDirection: "row", gap: theme.spacing.sm, flexWrap: "wrap" },
    deleteLabel: { color: theme.colors.danger },
    listItem: { borderRadius: theme.radii.md },
    listItemActive: { borderColor: theme.colors.accent, borderWidth: 1 },
    emptyContainer: { paddingVertical: theme.spacing.xl, alignItems: "center" },
    inlineForm: { marginTop: theme.spacing.lg },
    centeredButtonContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.lg,
    },
    pillButton: {
      borderRadius: 30,
      paddingHorizontal: 24,
      alignSelf: "center",
      minWidth: 180,
    },
  });
}

function createEditStyles(theme: Theme) {
  return StyleSheet.create({
    card: { gap: theme.spacing.lg },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    title: { fontSize: 18, fontWeight: "600", color: theme.colors.secondaryText },
    editBadge: { backgroundColor: theme.colors.accentSoft },
    actions: { flexDirection: "column", gap: theme.spacing.sm },
    deleteSection: { marginTop: theme.spacing.lg, alignSelf: "stretch" },
  });
}
