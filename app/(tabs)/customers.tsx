import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomerForm from "../../components/CustomerForm";
import { Badge, Button, Card, FAB, Input, ListItem } from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";

export type CustomerRecord = {
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
  onDelete: (customer: CustomerRecord) => void;
};

type AlertWithConfirmation = typeof Alert & {
  confirmation?: (
    title: string,
    message?: string,
    buttons?: Parameters<typeof Alert.alert>[2],
    options?: Parameters<typeof Alert.alert>[3],
  ) => void;
};

function showDeletionConfirmation(entityLabel: string, onConfirm: () => void) {
  const title = `Delete this ${entityLabel}?`;
  const message =
    "This action cannot be undone. This will permanently delete this record and all related data. Are you sure?";
  const alertModule = Alert as AlertWithConfirmation;
  if (alertModule.confirmation) {
    alertModule.confirmation(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ]);
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ]);
  }
}

function EditCustomerForm({ customer, onCancel, onSaved, onDelete }: EditCustomerFormProps) {
  const { theme } = useThemeContext();
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
      <View style={styles.headerRow}>
        <Text style={styles.title}>Edit customer</Text>
        <Badge style={styles.editBadge}>Updating</Badge>
      </View>
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
          label={saving ? "Saving…" : "Save"}
          onPress={saveChanges}
          loading={saving}
          disabled={saving}
          alignment="full"
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onCancel}
          disabled={saving}
          alignment="full"
        />
      </View>
      <View style={styles.deleteSection}>
        <Button
          label="Delete"
          variant="danger"
          onPress={() => onDelete(customer)}
          disabled={saving}
          alignment="full"
        />
      </View>
    </Card>
  );
}

export default function Customers() {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const previousCustomersRef = useRef<CustomerRecord[] | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSearchTerm(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadCustomers = useCallback(async () => {
    try {
      setError(null);
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
    } catch (err) {
      console.error("Failed to load customers", err);
      setError("We couldn’t load your customers. Pull to refresh or try again.");
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
    const query = searchTerm.toLowerCase();
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
  }, [customers, searchTerm]);

  useEffect(() => {
    if (!searchTerm) {
      return;
    }

    if (filteredCustomers.length === 0) {
      setSelectedCustomerId(null);
      return;
    }

    setSelectedCustomerId((current) => {
      if (current && filteredCustomers.some((customer) => customer.id === current)) {
        return current;
      }
      return filteredCustomers[0]?.id ?? null;
    });
  }, [filteredCustomers, searchTerm]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const getDisplayName = useCallback((customer: CustomerRecord) => {
    const trimmed = customer.name?.trim();
    return trimmed ? trimmed : "Unnamed customer";
  }, []);

  const handleSelectCustomer = useCallback((customerId: string) => {
    setShowAddForm(false);
    setEditingCustomer(null);
    setSelectedCustomerId(customerId);
  }, []);

  const handleDelete = useCallback(
    (customer: CustomerRecord) => {
      showDeletionConfirmation("Customer", () => {
          void (async () => {
            previousCustomersRef.current = customers;
            setCustomers((current) => current.filter((existing) => existing.id !== customer.id));
            setEditingCustomer((current) => (current?.id === customer.id ? null : current));
            setSelectedCustomerId((current) => (current === customer.id ? null : current));

              try {
                const db = await openDB();

                const estimateRows = await db.getAllAsync<{ id: string }>(
                  `SELECT id FROM estimates WHERE customer_id = ? AND deleted_at IS NULL`,
                  [customer.id],
                );
                const estimateIds = estimateRows.map((row) => row.id);
                const placeholders = estimateIds.map(() => "?").join(", ");

                await db.execAsync("BEGIN TRANSACTION");
                try {
                  await db.runAsync(
                    `UPDATE customers
                     SET deleted_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP,
                         version = COALESCE(version, 0) + 1
                     WHERE id = ?`,
                    [customer.id],
                  );

                  if (estimateIds.length) {
                    await db.runAsync(
                      `UPDATE estimates
                       SET deleted_at = CURRENT_TIMESTAMP,
                           updated_at = CURRENT_TIMESTAMP,
                           version = COALESCE(version, 0) + 1
                       WHERE id IN (${placeholders})`,
                      estimateIds,
                    );
                    await db.runAsync(
                      `UPDATE estimate_items
                       SET deleted_at = CURRENT_TIMESTAMP,
                           updated_at = CURRENT_TIMESTAMP,
                           version = COALESCE(version, 0) + 1
                       WHERE estimate_id IN (${placeholders})`,
                      estimateIds,
                    );
                    await db.runAsync(
                      `UPDATE photos
                       SET deleted_at = CURRENT_TIMESTAMP,
                           updated_at = CURRENT_TIMESTAMP,
                           version = COALESCE(version, 0) + 1
                       WHERE estimate_id IN (${placeholders})`,
                      estimateIds,
                    );
                  }

                  await db.execAsync("COMMIT");
                } catch (transactionError) {
                  await db.execAsync("ROLLBACK");
                  throw transactionError;
                }

                await queueChange("customers", "delete", { id: customer.id });

                await Promise.all(
                  estimateIds.map((estimateId) => queueChange("estimates", "delete", { id: estimateId })),
                );

                await runSync().catch((syncError) => {
                  console.error("Failed to sync customer deletion", syncError);
                });

                router.replace("/(tabs)/customers");
                await reloadCustomers();
              } catch (deleteError) {
                console.error("Failed to delete customer", deleteError);
                Alert.alert("Error", "Unable to delete customer. Please try again.");
                if (previousCustomersRef.current) {
                  setCustomers(previousCustomersRef.current);
                }
                await reloadCustomers();
              } finally {
                previousCustomersRef.current = null;
              }
            })();
          
        },
      );
    },
    [customers, reloadCustomers],
  );

  const renderCustomerItem = useCallback(
    ({ item }: { item: CustomerRecord }) => {
      const subtitle = item.phone?.trim() || item.email?.trim() || "No contact info yet";
      const hasNotes = Boolean(item.notes?.trim());

      return (
        <ListItem
          title={getDisplayName(item)}
          subtitle={subtitle}
          onPress={() => handleSelectCustomer(item.id)}
          style={[
            styles.listItem,
            item.id === selectedCustomerId ? styles.listItemActive : null,
          ]}
          badge={hasNotes ? <Badge style={styles.notesBadge}>Notes</Badge> : undefined}
        />
      );
    },
    [getDisplayName, handleSelectCustomer, selectedCustomerId, styles.listItem, styles.listItemActive, styles.notesBadge],
  );

  const itemSeparator = useCallback(() => <View style={styles.separator} />, [styles.separator]);

  const listEmptyComponent = useMemo(() => {
    if (loading) {
      return null;
    }

    return (
      <View style={styles.emptyContainer}>
        <Card style={styles.emptyCard} elevated={false}>
          <Text style={styles.emptyTitle}>No customers yet</Text>
          <Text style={styles.emptyBody}>
            Add your first customer to start estimating faster.
          </Text>
          <Button
            label="Add customer"
            onPress={() => {
              setShowAddForm(true);
              setEditingCustomer(null);
              setSelectedCustomerId(null);
            }}
          />
        </Card>
      </View>
    );
  }, [loading, styles.emptyBody, styles.emptyCard, styles.emptyContainer, styles.emptyTitle]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList
          data={loading ? [] : filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomerItem}
          ItemSeparatorComponent={itemSeparator}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerTitle}>Customers</Text>
                <Text style={styles.headerSubtitle}>
                  Keep every relationship organized with quick notes and contact details.
                </Text>
              </View>
              <Card style={styles.searchCard}>
                <Input
                  label="Search customers…"
                  placeholder="Search customers…"
                  value={searchInput}
                  onChangeText={setSearchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  caption="Search by name, email, phone, address, or notes."
                />
              </Card>

              {loading ? (
                <Card style={styles.statusCard} elevated={false}>
                  <ActivityIndicator color={theme.colors.primary} />
                  <Text style={styles.statusText}>Loading customers…</Text>
                </Card>
              ) : null}

              {error ? (
                <Card style={styles.statusCard} elevated={false}>
                  <Text style={styles.statusText}>{error}</Text>
                  <Button label="Retry" onPress={() => void reloadCustomers()} />
                </Card>
              ) : null}

              {selectedCustomer ? (
                <Card style={styles.detailCard}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailName}>{getDisplayName(selectedCustomer)}</Text>
                    {selectedCustomer.notes ? (
                      <Badge style={styles.notesBadge}>Notes</Badge>
                    ) : null}
                  </View>
                  <View style={styles.detailBody}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Email</Text>
                      <Text style={styles.detailValue}>
                        {selectedCustomer.email || "Not provided"}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>
                        {selectedCustomer.phone || "Not provided"}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Address</Text>
                      <Text style={styles.detailValue}>
                        {selectedCustomer.address || "Not provided"}
                      </Text>
                    </View>
                    {selectedCustomer.notes ? (
                      <View style={[styles.detailRow, styles.notesRow]}>
                        <Text style={styles.detailLabel}>Notes</Text>
                        <Text style={styles.detailValue}>{selectedCustomer.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.detailActions}>
                    <Button
                      label="Edit customer"
                      variant="secondary"
                      onPress={() => {
                        setEditingCustomer(selectedCustomer);
                        setShowAddForm(false);
                      }}
                    />
                    <Button
                      label="Delete customer"
                      variant="ghost"
                      onPress={() => handleDelete(selectedCustomer)}
                      textStyle={styles.deleteLabel}
                    />
                  </View>
                </Card>
              ) : null}

              {showAddForm ? (
                <CustomerForm
                  onSaved={(customer) => {
                    setShowAddForm(false);
                    setEditingCustomer(null);
                    setSelectedCustomerId(customer.id);
                    void reloadCustomers();
                  }}
                  onCancel={() => setShowAddForm(false)}
                  style={styles.inlineForm}
                />
              ) : null}

              {editingCustomer ? (
                <EditCustomerForm
                  customer={editingCustomer}
                  onCancel={() => setEditingCustomer(null)}
                  onSaved={(updated) => {
                    setEditingCustomer(null);
                    setCustomers((prev) =>
                      prev.map((existing) => (existing.id === updated.id ? updated : existing)),
                    );
                    setSelectedCustomerId(updated.id);
                    void reloadCustomers();
                  }}
                  onDelete={handleDelete}
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={listEmptyComponent}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />

        <FAB
          accessibilityLabel="Add customer"
          icon={<Feather name="plus" size={24} color={theme.colors.primaryText} />}
          onPress={() => {
            setShowAddForm(true);
            setEditingCustomer(null);
            setSelectedCustomerId(null);
          }}
          palette="highlight"
          style={styles.fab}
        />
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl * 2,
    },
    listHeader: {
      gap: theme.spacing.xxl,
    },
    headerTextBlock: {
      gap: theme.spacing.sm,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    headerSubtitle: {
      fontSize: 16,
      color: theme.colors.textMuted,
      lineHeight: 22,
    },
    searchCard: {
      gap: theme.spacing.lg,
    },
    statusCard: {
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    statusText: {
      fontSize: 15,
      color: theme.colors.textMuted,
      textAlign: "center",
    },
    detailCard: {
      gap: theme.spacing.lg,
    },
    detailHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    detailName: {
      fontSize: 22,
      fontWeight: "700",
      color: theme.colors.text,
    },
    detailBody: {
      gap: theme.spacing.md,
    },
    detailRow: {
      gap: theme.spacing.xs,
    },
    notesRow: {
      backgroundColor: theme.colors.surfaceMuted,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
    },
    detailLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.textMuted,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    detailValue: {
      fontSize: 16,
      color: theme.colors.text,
      lineHeight: 22,
    },
    detailActions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    deleteLabel: {
      color: theme.colors.danger,
    },
    inlineForm: {
      marginTop: theme.spacing.lg,
    },
    listItem: {
      borderRadius: theme.radii.md,
    },
    listItemActive: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceMuted,
    },
    notesBadge: {
      backgroundColor: theme.colors.primarySoft,
    },
    separator: {
      height: theme.spacing.md,
    },
    emptyContainer: {
      paddingVertical: theme.spacing.xl,
      alignItems: "center",
    },
    emptyCard: {
      alignItems: "center",
      gap: theme.spacing.md,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.colors.text,
    },
    emptyBody: {
      fontSize: 15,
      color: theme.colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    fab: {
      position: "absolute",
      right: theme.spacing.xl,
      bottom: theme.spacing.xl,
    },
  });
}

function createEditStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      gap: theme.spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    title: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.colors.text,
    },
    editBadge: {
      backgroundColor: theme.colors.primarySoft,
    },
    actions: {
      flexDirection: "column",
      gap: theme.spacing.sm,
    },
    deleteSection: {
      marginTop: theme.spacing.lg,
      alignSelf: "stretch",
    },
  });
}
