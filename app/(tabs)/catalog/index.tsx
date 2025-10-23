import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { useThemeContext } from "../../../theme/ThemeProvider";
import { openDB, queueChange } from "../../../lib/sqlite";
import { Card, Button, Input } from "../../../components/ui";
import { v4 as uuidv4 } from "uuid";

export default function CatalogScreen() {
  const { theme } = useThemeContext();
  const { colors } = theme;
  const styles = createStyles(colors);

  const [catalog, setCatalog] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({ name: "", price: "" });

  const loadCatalog = async () => {
    const db = await openDB();
    const rows = await db.getAllAsync(`
      SELECT id, name, unit_price
      FROM item_catalog
      WHERE deleted_at IS NULL
      ORDER BY COALESCE(updated_at, '1970-01-01') DESC;
    `);
    setCatalog(rows);
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const addItem = async () => {
    if (!newItem.name || !newItem.price) return;
    const db = await openDB();
    const id = uuidv4();
    await db.runAsync(
      `INSERT INTO item_catalog (id, name, unit_price)
       VALUES (?, ?, ?)`,
      [id, newItem.name, parseFloat(newItem.price)]
    );
    await queueChange("item_catalog", "insert", { id, ...newItem });
    setNewItem({ name: "", price: "" });
    loadCatalog();
  };

  const deleteItem = async (id: string) => {
    Alert.alert("Delete Item", "Remove this from your catalog?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const db = await openDB();
          await db.runAsync(
            `UPDATE item_catalog SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id]
          );
          await queueChange("item_catalog", "delete", { id });
          loadCatalog();
        },
      },
    ]);
  };

  const filtered = catalog.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Item Catalog</Text>

      <TextInput
        placeholder="Search catalog..."
        value={search}
        onChangeText={setSearch}
        style={styles.search}
        placeholderTextColor={colors.mutedText}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.price}>${item.unit_price.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => deleteItem(item.id)}>
              <Text style={styles.delete}>🗑️</Text>
            </TouchableOpacity>
          </Card>
        )}
      />

      <View style={styles.addRow}>
        <Input
          placeholder="Item name"
          value={newItem.name}
          onChangeText={(v) => setNewItem({ ...newItem, name: v })}
        />
        <Input
          placeholder="Price"
          keyboardType="numeric"
          value={newItem.price}
          onChangeText={(v) => setNewItem({ ...newItem, price: v })}
        />
        <Button label="➕ Add" onPress={addItem} />
      </View>
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, padding: 16 },
    header: { fontSize: 22, fontWeight: "700", color: colors.primaryText, marginBottom: 8 },
    search: {
      backgroundColor: colors.surface,
      padding: 10,
      borderRadius: 10,
      borderColor: colors.border,
      borderWidth: 1,
      marginBottom: 12,
      color: colors.primaryText,
    },
    card: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    name: { color: colors.primaryText, fontWeight: "600" },
    price: { color: colors.accent, fontWeight: "600" },
    delete: { color: colors.danger, fontSize: 18 },
    addRow: { marginTop: 16 },
  });
}
