import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { v4 as uuidv4 } from "uuid";
import { useRouter, useFocusEffect } from "expo-router";
import { openDB, queueChange } from "../../lib/sqlite";
import { runSync } from "../../lib/sync";
import { Button, Card, Input } from "../../components/ui";
import { useThemeContext } from "../../theme/ThemeProvider";

type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  deleted_at?: string | null;
};

type Estimate = {
  id: string;
  estimate_number?: string | null;
  total?: number | null;
  billing_address?: string | null;
  job_address?: string | null;
};

export default function CustomersScreen() {
  const router = useRouter();
  const { theme } = useThemeContext();
  const { colors } = theme;
  const styles = createStyles(colors);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomers = async () => {
  setLoading(true);
  try {
    const db = await openDB();
    const rows: Customer[] = await db.getAllAsync(`
      SELECT id, name, email, phone, street, city, state, zip
      FROM customers
      WHERE deleted_at IS NULL
      ORDER BY COALESCE(updated_at, created_at, '1970-01-01') DESC
    `);
    setCustomers(rows);
  } catch (err) {
    console.error("❌ Error loading customers:", err);
  } finally {
    setLoading(false);
  }
};

  const loadEstimates = async (customerId: string) => {
    const db = await openDB();
    const rows: Estimate[] = await db.getAllAsync(
      `SELECT id, estimate_number, total, billing_address, job_address
       FROM estimates
       WHERE customer_id = ? AND deleted_at IS NULL
       ORDER BY COALESCE(updated_at, '1970-01-01') DESC`,
      [customerId]
    );
    setEstimates(rows);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [])
  );

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      [c.city, c.state, c.zip].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  });

const handleAddCustomer = async () => {
  try {
    const db = await openDB();
    const id = uuidv4();
    const newCustomer: Customer = {
      id,
      name: "New Customer",
      email: null,
      phone: null,
      street: null,
      city: null,
      state: null,
      zip: null,
    };

    // Ensure columns exist and use defaults where possible
    await db.runAsync(
      `INSERT INTO customers (
        id, user_id, name, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [id, "local-user", newCustomer.name]
    );

    await queueChange("customers", "insert", newCustomer);
    await runSync();
    await loadCustomers();
  setSelected(newCustomer);
  } catch (err) {
    console.error("❌ Error adding customer:", err);
  }
};


  const handleDeleteCustomer = async (id: string) => {
    Alert.alert("Delete Customer", "Are you sure you want to delete this customer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const db = await openDB();
          await db.runAsync(
            `UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id]
          );
          await queueChange("customers", "delete", { id });
          await runSync();
          setSelected(null);
          loadCustomers();
        },
      },
    ]);
  };

  const handleSelectCustomer = async (customer: Customer) => {
    setSelected(customer);
    await loadEstimates(customer.id);
  };

  const handleSaveCustomer = async (updated: Customer) => {
  try {
    setSaving(true);
    const db = await openDB();
    await db.runAsync(
      `UPDATE customers
       SET name = ?, email = ?, phone = ?, street = ?, city = ?, state = ?, zip = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        updated.name ?? null,
        updated.email ?? null,
        updated.phone ?? null,
        updated.street ?? null,
        updated.city ?? null,
        updated.state ?? null,
        updated.zip ?? null,
        updated.id,
      ]
    );

    await queueChange("customers", "update", updated);
    await runSync();
    await loadCustomers();

    setSelected(updated);

    // ✅ Show temporary feedback
    setSaveMessage("✅ Saved!");
    setTimeout(() => setSaveMessage(null), 2000);
  } catch (err) {
    console.error("❌ Error saving customer:", err);
    setSaveMessage("❌ Save failed");
    setTimeout(() => setSaveMessage(null), 2500);
  } finally {
    setSaving(false);
  }
};

  // back button for detail mode
  if (selected) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity onPress={() => setSelected(null)}>
          <Text style={styles.backLink}>← Back to all customers</Text>
        </TouchableOpacity>

        <Card style={styles.card}>
          <Text style={styles.header}>{selected.name || "Unnamed Customer"}</Text>
          <Input label="Name" value={selected.name ?? ""} onChangeText={(v) => setSelected({ ...selected, name: v })} />
          <Input label="Email" value={selected.email ?? ""} onChangeText={(v) => setSelected({ ...selected, email: v })} />
          <Input label="Phone" value={selected.phone ?? ""} onChangeText={(v) => setSelected({ ...selected, phone: v })} />
          <Input label="Street" value={selected.street ?? ""} onChangeText={(v) => setSelected({ ...selected, street: v })} />
          <Input label="City" value={selected.city ?? ""} onChangeText={(v) => setSelected({ ...selected, city: v })} />
          <Input label="State" value={selected.state ?? ""} onChangeText={(v) => setSelected({ ...selected, state: v })} />
          <Input label="ZIP" value={selected.zip ?? ""} onChangeText={(v) => setSelected({ ...selected, zip: v })} />
          <Button
  label={saving ? "Saving..." : "💾 Save Changes"}
  onPress={() => handleSaveCustomer(selected)}
  disabled={saving}
/>
{saveMessage && (
  <Text style={{ color: colors.accent, marginTop: 8 }}>{saveMessage}</Text>
)}

          <Button label="🗑️ Delete Customer" variant="danger" onPress={() => handleDeleteCustomer(selected.id)} />
        </Card>

        <Text style={styles.sectionTitle}>Estimates for {selected.name}</Text>
        {estimates.length === 0 ? (
          <Text style={styles.muted}>No estimates yet.</Text>
        ) : (
          estimates.map((est) => (
            <TouchableOpacity
              key={est.id}
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/estimates/[id]",
                  params: { id: est.id },
                })
              }
            >
              <Card style={{ padding: 12, marginBottom: 8 }}>
                <Text style={{ fontWeight: "600", color: colors.primaryText }}>
                  Estimate #{est.estimate_number || "N/A"}
                </Text>
                <Text style={{ color: colors.secondaryText }}>
                  {est.job_address || est.billing_address || "No address"}
                </Text>
                <Text style={{ color: colors.mutedText, marginTop: 4 }}>
                  Total: ${est.total?.toFixed(2) ?? "0.00"}
                </Text>
              </Card>
            </TouchableOpacity>
          ))
        )}

        <Button
          label="➕ Create New Estimate"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/(tabs)/estimates/[id]",
              params: { id: uuidv4(), customer: JSON.stringify(selected) },
            })
          }
        />
      </ScrollView>
    );
  }

  // main list mode
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Customers</Text>
      <TextInput
        style={styles.search}
        placeholder="Search customers..."
        value={search}
        onChangeText={setSearch}
        placeholderTextColor={colors.mutedText}
      />

      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => handleSelectCustomer(item)}>
              <Card style={styles.card}>
                <Text style={styles.name}>{item.name || "Unnamed"}</Text>
                {item.email && <Text style={styles.secondary}>{item.email}</Text>}
                {item.phone && <Text style={styles.secondary}>{item.phone}</Text>}
                {(item.city || item.state) && (
                  <Text style={styles.tertiary}>
                    {[item.city, item.state].filter(Boolean).join(", ")}
                  </Text>
                )}
              </Card>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleAddCustomer}>
        <Text style={styles.fabPlus}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 16 },
    header: { fontSize: 20, fontWeight: "700", color: colors.primaryText, marginBottom: 10 },
    search: {
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 12,
      borderColor: colors.border,
      borderWidth: 1,
      marginBottom: 12,
      color: colors.primaryText,
    },
    card: {
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginVertical: 6,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    name: { fontWeight: "700", fontSize: 16, color: colors.primaryText },
    secondary: { color: colors.secondaryText },
    tertiary: { color: colors.mutedText, fontSize: 13 },
    sectionTitle: {
      fontWeight: "700",
      fontSize: 16,
      marginTop: 20,
      marginBottom: 10,
      color: colors.primaryText,
    },
    muted: { color: colors.mutedText, fontStyle: "italic" },
    backLink: {
      color: colors.accent,
      fontSize: 15,
      marginBottom: 10,
    },
    fab: {
      position: "absolute",
      right: 16,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
    },
    fabPlus: { color: "white", fontSize: 28, lineHeight: 28, marginTop: -2 },
  });
}
