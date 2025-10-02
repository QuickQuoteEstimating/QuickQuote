import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Button, Card, Input } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import {
  listSavedItems,
  softDeleteSavedItem,
  upsertSavedItem,
  type SavedItemRecord,
} from "../../../lib/savedItems";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";

function formatCurrency(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

type EditorState = {
  id: string | null;
  name: string;
  quantityText: string;
  unitPriceText: string;
  markupApplicable: boolean;
};

function createEmptyEditor(): EditorState {
  return {
    id: null,
    name: "",
    quantityText: "1",
    unitPriceText: "0.00",
    markupApplicable: true,
  };
}

function parseQuantity(value: string): number {
  const normalized = value.replace(/[^0-9]/g, "");
  const parsed = parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(1, parsed);
}

function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.round(parsed * 100) / 100);
}

function formatUnitPriceInput(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.00";
  }
  return (Math.round(value * 100) / 100).toFixed(2);
}

export default function SavedItemsScreen() {
  const { user } = useAuth();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [savedItems, setSavedItems] = useState<SavedItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const userId = user?.id ?? null;

  const loadSavedItems = useCallback(async () => {
    if (!userId) {
      setSavedItems([]);
      return;
    }

    try {
      const records = await listSavedItems(userId);
      setSavedItems(records);
    } catch (error) {
      console.error("Failed to load saved items", error);
      Alert.alert(
        "Error",
        "We couldn't load your saved items. Pull down to refresh once you're back online.",
      );
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      await loadSavedItems();
      if (isMounted) {
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadSavedItems]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        return;
      }

      loadSavedItems().catch((error) => {
        console.error("Failed to refresh saved items on focus", error);
      });
    }, [loadSavedItems, userId]),
  );

  const beginCreate = () => {
    setEditor(createEmptyEditor());
  };

  const beginEdit = (item: SavedItemRecord) => {
    setEditor({
      id: item.id,
      name: item.name,
      quantityText: String(item.default_quantity ?? 1),
      unitPriceText: formatUnitPriceInput(item.default_unit_price ?? 0),
      markupApplicable: item.default_markup_applicable !== 0,
    });
  };

  const handleCancelEdit = () => {
    setEditor(null);
  };

  const handleSubmit = async () => {
    if (!editor) {
      return;
    }

    const trimmedName = editor.name.trim();
    if (!trimmedName) {
      Alert.alert("Validation", "Please provide a name for this saved item.");
      return;
    }

    const quantity = parseQuantity(editor.quantityText);
    if (quantity <= 0) {
      Alert.alert("Validation", "Quantity must be at least 1.");
      return;
    }

    const unitPrice = parseCurrencyInput(editor.unitPriceText);

    if (!userId) {
      Alert.alert("Authentication", "You need to be signed in to manage saved items.");
      return;
    }

    try {
      setSubmitting(true);
      await upsertSavedItem({
        id: editor.id ?? undefined,
        userId,
        name: trimmedName,
        unitPrice,
        defaultQuantity: quantity,
        markupApplicable: editor.markupApplicable,
      });
      await loadSavedItems();
      setEditor(null);
    } catch (error) {
      console.error("Failed to save item template", error);
      Alert.alert("Error", "We couldn't save this item. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (item: SavedItemRecord) => {
    Alert.alert(
      "Delete saved item",
      `Are you sure you want to delete "${item.name}"? You can save it again later if needed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await softDeleteSavedItem(item.id);
              await loadSavedItems();
            } catch (error) {
              console.error("Failed to delete saved item", error);
              Alert.alert("Error", "We couldn't delete this saved item. Please try again.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Saved items</Text>
          <Text style={styles.subtitle}>
            Create reusable material templates so you can quickly add them to any estimate.
          </Text>
          <Button
            label={editor ? "Add another saved item" : "Add saved item"}
            onPress={beginCreate}
            alignment="inline"
            leadingIcon={<Feather name="plus" size={18} color={theme.colors.surface} />}
          />
        </View>

        {editor ? (
          <Card style={styles.editorCard}>
            <Text style={styles.editorTitle}>{editor.id ? "Edit saved item" : "New saved item"}</Text>
            <View style={styles.editorForm}>
              <Input
                label="Name"
                placeholder="Example: Premium vinyl flooring"
                value={editor.name}
                onChangeText={(text) => setEditor((prev) => (prev ? { ...prev, name: text } : prev))}
              />
              <View style={styles.row}>
                <View style={styles.rowField}>
                  <Input
                    label="Default quantity"
                    placeholder="1"
                    value={editor.quantityText}
                    onChangeText={(text) =>
                      setEditor((prev) => (prev ? { ...prev, quantityText: text } : prev))
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.rowField}>
                  <Input
                    label="Default unit price"
                    placeholder="0.00"
                    value={editor.unitPriceText}
                    onChangeText={(text) =>
                      setEditor((prev) => (prev ? { ...prev, unitPriceText: text } : prev))
                    }
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Apply markup by default</Text>
                  <Text style={styles.toggleHint}>
                    When enabled, this item will use your material markup when added to an estimate.
                  </Text>
                </View>
                <Switch
                  value={editor.markupApplicable}
                  onValueChange={(value) =>
                    setEditor((prev) => (prev ? { ...prev, markupApplicable: value } : prev))
                  }
                  trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
                  thumbColor={editor.markupApplicable ? theme.colors.primary : undefined}
                />
              </View>
              <View style={styles.editorActions}>
                <Button
                  label="Cancel"
                  onPress={handleCancelEdit}
                  variant="secondary"
                  alignment="inline"
                  disabled={submitting}
                />
                <Button
                  label={editor.id ? "Update saved item" : "Save saved item"}
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={submitting}
                  alignment="inline"
                />
              </View>
            </View>
          </Card>
        ) : null}

        <View style={styles.listSection}>
          {loading ? (
            <Card style={styles.messageCard}>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.messageText}>Loading saved items…</Text>
              </View>
            </Card>
          ) : savedItems.length === 0 ? (
            <Card style={styles.messageCard}>
              <Text style={styles.messageText}>
                You haven't saved any items yet. Add one above to start building your library.
              </Text>
            </Card>
          ) : (
            savedItems.map((item) => (
              <Card key={item.id} style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {formatCurrency(item.default_unit_price ?? 0)} • Qty {item.default_quantity ?? 1}
                  </Text>
                </View>
                <Text style={styles.itemMarkup}>
                  Markup {item.default_markup_applicable !== 0 ? "enabled" : "disabled"}
                </Text>
                <View style={styles.itemActions}>
                  <Button
                    label="Edit"
                    variant="secondary"
                    alignment="inline"
                    onPress={() => beginEdit(item)}
                  />
                  <Button
                    label="Delete"
                    variant="danger"
                    alignment="inline"
                    onPress={() => confirmDelete(item)}
                  />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: theme.spacing.xl,
      gap: theme.spacing.xl,
    },
    headerBlock: {
      gap: theme.spacing.md,
    },
    title: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    subtitle: {
      fontSize: 15,
      color: theme.colors.textMuted,
      lineHeight: 22,
    },
    editorCard: {
      padding: theme.spacing.xl,
      gap: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
    },
    editorTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    editorForm: {
      gap: theme.spacing.lg,
    },
    row: {
      flexDirection: "row",
      gap: theme.spacing.lg,
      flexWrap: "wrap",
    },
    rowField: {
      flex: 1,
      minWidth: 160,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    toggleCopy: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    toggleTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    toggleHint: {
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    editorActions: {
      flexDirection: "row",
      gap: theme.spacing.md,
      justifyContent: "flex-end",
      flexWrap: "wrap",
    },
    listSection: {
      gap: theme.spacing.lg,
    },
    messageCard: {
      padding: theme.spacing.xl,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
    },
    messageText: {
      fontSize: 15,
      color: theme.colors.text,
      lineHeight: 22,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    itemCard: {
      padding: theme.spacing.xl,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      gap: theme.spacing.md,
    },
    itemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    itemName: {
      flex: 1,
      fontSize: 17,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    itemMeta: {
      fontSize: 15,
      color: theme.colors.textMuted,
    },
    itemMarkup: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    itemActions: {
      flexDirection: "row",
      gap: theme.spacing.md,
      flexWrap: "wrap",
      justifyContent: "flex-end",
    },
  });
}

