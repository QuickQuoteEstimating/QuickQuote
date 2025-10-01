import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomerForm from "../../components/CustomerForm";
import { Button, Card, Input } from "../../components/ui";
import { useTheme, type Theme } from "../../lib/theme";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";

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

const NEW_CUSTOMER_VALUE = "__new__";

function EditCustomerForm({ customer, onCancel, onSaved }: EditCustomerFormProps) {
  const theme = useTheme();
  const styles = useMemo(() => createEditStyles(theme), [theme]);
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
        ],
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
    <Card style={styles.card}>
      <Text style={styles.title}>Edit Customer</Text>
      <Input
        label="Name"
        placeholder="Customer name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <Input
        label="Phone"
        placeholder="(555) 123-4567"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Input
        label="Email"
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Input
        label="Address"
        placeholder="Job site or billing address"
        value={address}
        onChangeText={setAddress}
      />
      <Input
        label="Account notes"
        placeholder="Notes, preferences, or job history"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onCancel}
          disabled={saving}
        />
        <Button
          label="Save Changes"
          onPress={saveChanges}
          loading={saving}
          disabled={saving}
        />
      </View>
    </Card>
  );
}

export default function Customers() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<CustomerRecord>(
        `SELECT id, user_id, name, phone, email, address, notes, version, updated_at, deleted_at
         FROM customers
         WHERE deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`,
      );
      setCustomers(rows);
      setSelectedCustomerId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return rows.length > 0 ? rows[0].id : null;
      });
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert("Error", "Unable to load customers. Please try again.");
    }
  }, []);

  const reloadCustomers = useCallback(async () => {
    setLoading(true);
    await loadCustomers();
    setLoading(false);
  }, [loadCustomers]);

  useEffect(() => {
    void reloadCustomers();
  }, [reloadCustomers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCustomers();
    setRefreshing(false);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
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

    return customers.filter((customer) => {
      const nameMatch = normalize(customer.name).includes(query);
      const emailMatch = normalize(customer.email).includes(query);
      const phoneMatch = normalize(customer.phone).includes(query);
      const addressMatch = normalize(customer.address).includes(query);
      const notesMatch = normalize(customer.notes).includes(query);
      return nameMatch || emailMatch || phoneMatch || addressMatch || notesMatch;
    });
  }, [customers, search]);

  const displayedCustomers = useMemo(() => {
    if (!selectedCustomerId) {
      return filteredCustomers;
    }

    if (filteredCustomers.some((customer) => customer.id === selectedCustomerId)) {
      return filteredCustomers;
    }

    const selected = customers.find((customer) => customer.id === selectedCustomerId);
    return selected ? [selected, ...filteredCustomers] : filteredCustomers;
  }, [customers, filteredCustomers, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const getDisplayName = useCallback((customer: CustomerRecord) => {
    const trimmed = customer.name?.trim();
    return trimmed ? trimmed : "Unnamed customer";
  }, []);

  const handleSelectCustomer = useCallback((value: string | number) => {
    const stringValue = String(value);

    if (stringValue === NEW_CUSTOMER_VALUE) {
      setShowAddForm(true);
      setEditingCustomer(null);
      setSelectedCustomerId(null);
      return;
    }

    if (!stringValue) {
      setSelectedCustomerId(null);
      return;
    }

    setShowAddForm(false);
    setEditingCustomer(null);
    setSelectedCustomerId(stringValue);
  }, []);

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
            onPress: () => {
              (async () => {
                try {
                  const db = await openDB();
                  const deletedAt = new Date().toISOString();
                  const nextVersion = (customer.version ?? 1) + 1;

                  await db.runAsync(
                    `UPDATE customers
                     SET deleted_at = ?, updated_at = ?, version = ?
                     WHERE id = ?`,
                    [deletedAt, deletedAt, nextVersion, customer.id],
                  );

                  const deletedCustomer: CustomerRecord = {
                    ...customer,
                    deleted_at: deletedAt,
                    updated_at: deletedAt,
                    version: nextVersion,
                  };

                  await queueChange("customers", "update", deletedCustomer);
                  await runSync().catch((error) => {
                    console.error("Failed to sync customer deletion", error);
                  });

                  setEditingCustomer((current) =>
                    current?.id === customer.id ? null : current,
                  );
                  setSelectedCustomerId((current) =>
                    current === customer.id ? null : current,
                  );

                  await reloadCustomers();
                } catch (error) {
                  console.error("Failed to delete customer", error);
                  Alert.alert(
                    "Error",
                    "Unable to delete customer. Please try again.",
                  );
                  await reloadCustomers();
                }
              })();
            },
          },
        ],
      );
    },
    [reloadCustomers],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Customer management</Text>
          <Text style={styles.subtitle}>
            Keep every relationship organized with quick notes and contact details.
          </Text>
        </View>

        <Card style={styles.directoryCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Customer directory</Text>
            <Text style={styles.sectionCaption}>
              Search by name, email, phone, address, or notes to jump to the right
              client fast.
            </Text>
          </View>
          <Input
            label="Search"
            placeholder="Name, email, phone, address, or notes"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.pickerShell}>
            <Picker
              selectedValue={selectedCustomerId ?? ""}
              onValueChange={handleSelectCustomer}
              style={styles.picker}
              dropdownIconColor={theme.accent}
            >
              <Picker.Item label="-- Select --" value="" />
              {displayedCustomers.length === 0 ? (
                <Picker.Item label="No matching customers" value="" enabled={false} />
              ) : null}
              {displayedCustomers.map((customer) => (
                <Picker.Item
                  key={customer.id}
                  label={getDisplayName(customer)}
                  value={customer.id}
                />
              ))}
              <Picker.Item label="➕ Add New Customer" value={NEW_CUSTOMER_VALUE} />
            </Picker>
          </View>
          <Button
            label={showAddForm ? "Hide Add Customer" : "Add Customer"}
            variant={showAddForm ? "secondary" : "primary"}
            onPress={() => {
              setShowAddForm((prev) => {
                const next = !prev;
                if (next) {
                  setEditingCustomer(null);
                  setSelectedCustomerId(null);
                }
                return next;
              });
            }}
          />
        </Card>

        {showAddForm ? (
          <CustomerForm
            onSaved={(customer) => {
              setShowAddForm(false);
              setEditingCustomer(null);
              setSelectedCustomerId(customer.id);
              void reloadCustomers();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        ) : null}

        {editingCustomer ? (
          <EditCustomerForm
            customer={editingCustomer}
            onCancel={() => setEditingCustomer(null)}
            onSaved={(updated) => {
              setEditingCustomer(null);
              setCustomers((prev) =>
                prev.map((existing) =>
                  existing.id === updated.id ? updated : existing,
                ),
              );
              setSelectedCustomerId(updated.id);
              void reloadCustomers();
            }}
          />
        ) : null}

        {loading ? (
          <Card style={styles.infoCard}>
            <ActivityIndicator color={theme.accent} />
            <Text style={styles.infoText}>Loading customers…</Text>
          </Card>
        ) : null}

        {!loading && customers.length === 0 ? (
          <Card style={styles.infoCard}>
            <Text style={styles.infoText}>No customers found.</Text>
            <Text style={styles.infoHint}>
              Add your first contact to start building quick quotes faster.
            </Text>
          </Card>
        ) : null}

        {selectedCustomer ? (
          <Card style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.customerName}>
                {getDisplayName(selectedCustomer)}
              </Text>
              <Text style={styles.customerSubtitle}>Primary contact details</Text>
            </View>
            {selectedCustomer.email ? (
              <Text style={styles.customerMeta}>{selectedCustomer.email}</Text>
            ) : null}
            {selectedCustomer.phone ? (
              <Text style={styles.customerMeta}>{selectedCustomer.phone}</Text>
            ) : null}
            {selectedCustomer.address ? (
              <Text style={styles.customerMeta}>{selectedCustomer.address}</Text>
            ) : null}
            {selectedCustomer.notes ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>Notes</Text>
                <Text style={styles.notesText}>{selectedCustomer.notes}</Text>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <Button
                label="Edit"
                variant="secondary"
                onPress={() => {
                  setEditingCustomer(selectedCustomer);
                  setShowAddForm(false);
                }}
              />
              <Button
                label="Delete"
                variant="ghost"
                onPress={() => handleDelete(selectedCustomer)}
                textStyle={{ color: theme.danger }}
              />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 24,
      paddingBottom: 160,
      gap: 24,
    },
    header: {
      gap: 12,
    },
    title: {
      fontSize: 30,
      fontWeight: "700",
      color: theme.primaryText,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.secondaryText,
    },
    directoryCard: {
      gap: 16,
    },
    sectionHeader: {
      gap: 6,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.secondaryText,
    },
    sectionCaption: {
      fontSize: 13,
      lineHeight: 18,
      color: theme.mutedText,
    },
    pickerShell: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceSubtle,
      overflow: "hidden",
    },
    picker: {
      height: 52,
      color: theme.primaryText,
    },
    infoCard: {
      alignItems: "center",
      gap: 12,
    },
    infoText: {
      fontSize: 15,
      color: theme.secondaryText,
      textAlign: "center",
    },
    infoHint: {
      fontSize: 13,
      color: theme.mutedText,
      textAlign: "center",
    },
    detailCard: {
      gap: 12,
    },
    detailHeader: {
      gap: 4,
    },
    customerName: {
      fontSize: 22,
      fontWeight: "700",
      color: theme.primaryText,
    },
    customerSubtitle: {
      fontSize: 13,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      color: theme.mutedText,
    },
    customerMeta: {
      fontSize: 15,
      color: theme.secondaryText,
    },
    notesBlock: {
      marginTop: 8,
      gap: 4,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.surfaceSubtle,
    },
    notesLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.secondaryText,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    notesText: {
      fontSize: 15,
      color: theme.primaryText,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: "row",
      gap: 12,
    },
  });
}

function createEditStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      gap: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.primaryText,
    },
    actions: {
      flexDirection: "row",
      gap: 12,
    },
  });
}
