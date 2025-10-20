// --- MAIN CUSTOMERS SCREEN (Modal-based UI, no gesture handler) ---
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeContext } from "../../theme/ThemeProvider";
import { useAuth } from "../../context/AuthContext";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";
import { confirmDelete } from "../../lib/confirmDelete";
import { Button, Card, Input } from "../../components/ui";
import CustomerForm from "../../components/CustomerForm";
import type { CustomerRecord } from "../../types/customers";
import { Theme } from "../../theme";
import { router } from "expo-router";

export default function Customers() {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);

  // ---- Load customers ----
  const loadCustomers = useCallback(async () => {
    try {
      setError(null);
      const db = await openDB();
      const rows = await db.getAllAsync<CustomerRecord>(
        `SELECT id, user_id, name, phone, email, street, city, state, zip, notes, version, updated_at, deleted_at
         FROM customers
         WHERE deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`
      );
      setCustomers(rows);
    } catch (err) {
      console.error("Failed to load customers", err);
      setError("We couldn’t load your customers. Pull to refresh or try again.");
    } finally {
      setLoading(false);
    }
  }, []);

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
      [c.name, c.email, c.phone, c.street, c.city, c.state, c.zip, c.notes]
        .map(normalize)
        .some((v) => v.includes(q))
    );
  }, [customers, searchInput]);

  const handleDelete = useCallback((customer: CustomerRecord) => {
    confirmDelete("Delete this customer?", "This action cannot be undone.", async () => {
      try {
        const db = await openDB();
        await db.runAsync(
          `UPDATE customers
           SET deleted_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               version = COALESCE(version,0)+1
           WHERE id = ?`,
          [customer.id]
        );
        await queueChange("customers", "delete", { id: customer.id });
        await runSync();
        setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
        setSelectedCustomer(null);
      } catch (e) {
        console.error("Delete failed", e);
        Alert.alert("Error", "Unable to delete customer.");
      }
    });
  }, []);

  // ---- UI ----
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Customers</Text>
          <Input
            placeholder="Search customers..."
            value={searchInput}
            onChangeText={setSearchInput}
          />
        </View>

        <FlatList
          data={filteredCustomers}
          keyExtractor={(i) => i.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.emptyText}>No customers found. Add one below.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedCustomer(item)}
              style={styles.cardTouchable}
            >
              <Card style={styles.listCard}>
                <Text style={styles.name}>{item.name || "Unnamed customer"}</Text>
                {item.email && <Text style={styles.sub}>{item.email}</Text>}
                {item.phone && <Text style={styles.sub}>{item.phone}</Text>}
              </Card>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16 }}
        />

        <View style={styles.footer}>
          <Button
            label="+ Add New Customer"
            onPress={() => setShowAddForm(true)}
            alignment="full"
          />
        </View>

        {/* --- Modal for Add Form --- */}
        <Modal visible={showAddForm} animationType="slide">
          <SafeAreaView style={styles.modalSafe}>
            <CustomerForm
              onSaved={() => {
                setShowAddForm(false);
                void loadCustomers();
              }}
              onCancel={() => setShowAddForm(false)}
            />
          </SafeAreaView>
        </Modal>

        {/* --- Modal for Customer Details (replaces BottomSheet) --- */}
        <Modal
          visible={!!selectedCustomer}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setSelectedCustomer(null)}
        >
          <View style={styles.overlay}>
            <View style={styles.detailModal}>
              <Text style={styles.detailName}>{selectedCustomer?.name}</Text>
              {selectedCustomer?.email && (
                <Text style={styles.detailText}>{selectedCustomer.email}</Text>
              )}
              {selectedCustomer?.phone && (
                <Text style={styles.detailText}>{selectedCustomer.phone}</Text>
              )}
              {[selectedCustomer?.street, selectedCustomer?.city, selectedCustomer?.state, selectedCustomer?.zip]
                .filter(Boolean).length > 0 ? (
                <Text style={styles.detailText}>
                  {[
                    selectedCustomer?.street,
                    selectedCustomer?.city,
                    selectedCustomer?.state,
                    selectedCustomer?.zip,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              ) : (
                <Text style={styles.detailText}>No address on file</Text>
              )}

              {selectedCustomer?.notes && (
                <Text style={styles.detailNotes}>{selectedCustomer.notes}</Text>
              )}

              <View style={styles.detailActions}>
                <Button
  label="Create Estimate"
  onPress={() => {
    if (!selectedCustomer) return;
    const params = encodeURIComponent(JSON.stringify(selectedCustomer));
    setSelectedCustomer(null);
    router.push(`/(tabs)/estimates/new?customer=${params}`);
  }}
/>

                <Button
                  label="Delete"
                  variant="danger"
                  onPress={() => handleDelete(selectedCustomer!)}
                />
                <Button
                  label="Close"
                  variant="secondary"
                  onPress={() => setSelectedCustomer(null)}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: { padding: spacing.lg, gap: spacing.md },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.primaryText,
    },
    listCard: {
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      marginBottom: spacing.md,
    },
    cardTouchable: { borderRadius: radii.lg },
    name: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    sub: { fontSize: 14, color: colors.mutedText, marginTop: 2 },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      backgroundColor: colors.background,
    },
    emptyText: {
      textAlign: "center",
      marginTop: 40,
      color: colors.mutedText,
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    detailModal: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.xxl *2,
      gap: spacing.sm,
    },
    detailName: { fontSize: 20, fontWeight: "700", color: colors.primaryText },
    detailText: { fontSize: 16, color: colors.secondaryText },
    detailNotes: {
      marginTop: spacing.sm,
      fontSize: 15,
      color: colors.secondaryText,
      fontStyle: "italic",
    },
    detailActions: { marginTop: spacing.lg, gap: spacing.sm },
    modalSafe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  });
}

