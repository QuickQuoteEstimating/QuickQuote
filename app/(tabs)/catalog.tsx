import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeContext } from "../../theme/ThemeProvider";
import { openDB, queueChange } from "../../lib/sqlite";
import { Card, Button, Input, ListItem } from "../../components/ui";
import { v4 as uuidv4 } from "uuid";
import { TouchableOpacity } from "react-native-gesture-handler";

export default function CatalogScreen() {
  const { theme } = useThemeContext();
  const { colors } = theme;
  const styles = createStyles(colors);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "" });
  const [loading, setLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const db = await openDB();
      const rows = await db.getAllAsync(`
        SELECT id, name, unit_price
        FROM item_catalog
        WHERE deleted_at IS NULL
        ORDER BY COALESCE(updated_at, created_at, '1970-01-01') DESC;
      `);
      setCatalog(rows);
    } catch (err) {
      console.error("Catalog load failed:", err);
      Alert.alert("Error", "Could not load your catalog items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const addItem = async () => {
    if (!newItem.name.trim() || !newItem.price.trim()) {
      Alert.alert("Missing info", "Please enter both name and price.");
      return;
    }

    try {
      const db = await openDB();
      const id = uuidv4();
      const price = parseFloat(newItem.price);

      if (isNaN(price)) {
        Alert.alert("Invalid price", "Please enter a valid number.");
        return;
      }

      await db.runAsync(
        `INSERT INTO item_catalog (id, name, unit_price)
         VALUES (?, ?, ?)`,
        [id, newItem.name.trim(), price]
      );

      await queueChange("item_catalog", "insert", { id, ...newItem });
      setNewItem({ name: "", price: "" });
      await loadCatalog();
    } catch (err) {
      console.error("Add item failed:", err);
      Alert.alert("Error", "Could not add the item. Try again.");
    }
  };

  const deleteItem = async (id: string) => {
    Alert.alert("Delete Item", "Are you sure you want to remove this?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const db = await openDB();
            await db.runAsync(
              `UPDATE item_catalog SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [id]
            );
            await queueChange("item_catalog", "delete", { id });
            await loadCatalog();
          } catch (err) {
            console.error("Delete failed:", err);
            Alert.alert("Error", "Could not delete this item.");
          }
        },
      },
    ]);
  };

  const filtered = catalog.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.header}>Item Catalog</Text>

      <Input
        placeholder="Search catalog..."
        value={search}
        onChangeText={setSearch}
        style={{ marginBottom: 12 }}
      />

      {filtered.length === 0 && !loading ? (
  <View style={styles.emptyState}>
    <Ionicons name="cube-outline" size={48} color={colors.mutedText} />
    <Text style={styles.emptyText}>No items yet</Text>
    <Text style={styles.emptySubtext}>Add your first item below!</Text>
    <Button label="Add Item" onPress={() => {}} style={{ marginTop: 16 }} />
  </View>
) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.price}>${item.unit_price.toFixed(2)}</Text>
                </View>
                <TouchableOpacity onPress={() => deleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={22} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </Card>
          )}
        />
      )}

      {/* Floating Add Section */}
      <View style={styles.addRow}>
        <Input
          placeholder="Item name"
          value={newItem.name}
          onChangeText={(v) => setNewItem({ ...newItem, name: v })}
          style={{ flex: 1 }}
        />
        <Input
          placeholder="Price"
          keyboardType="numeric"
          value={newItem.price}
          onChangeText={(v) => setNewItem({ ...newItem, price: v })}
          style={{ width: 100, marginLeft: 8 }}
        />
        <Button
          label="Add"
          onPress={addItem}
          style={{ marginLeft: 8, paddingHorizontal: 16 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 16 },
    header: { fontSize: 22, fontWeight: "700", color: colors.primaryText, marginBottom: 8 },
    card: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      shadowColor: colors.overlay,
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    name: { color: colors.primaryText, fontWeight: "600", fontSize: 16 },
    price: { color: colors.accent, fontWeight: "600", marginTop: 2 },
    addRow: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surfaceAlt,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 40,
    },
    emptyText: { fontSize: 18, fontWeight: "600", color: colors.primaryText, marginTop: 8 },
    emptySubtext: { fontSize: 14, color: colors.mutedText, marginTop: 2 },
  });
}
