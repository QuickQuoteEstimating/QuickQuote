import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Button,
} from "react-native";
import { openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import { cardShadow, palette } from "../../../lib/theme";

export type EstimateListItem = {
  id: string;
  user_id: string;
  customer_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  date: string | null;
  total: number | null;
  material_total: number | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_total: number | null;
  notes: string | null;
  status: string | null;
  version: number | null;
  updated_at: string;
  deleted_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

function formatStatus(status: string | null): string {
  if (!status) {
    return "Draft";
  }
  const normalized = status.toLowerCase();
  return STATUS_LABELS[normalized] ?? status;
}

function formatCurrency(value: number | null): string {
  const total = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(total);
}

export default function EstimatesScreen() {
  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEstimates = useCallback(
    async (signal?: { cancelled: boolean }) => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<EstimateListItem>(
          `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.notes, e.status, e.version, e.updated_at, e.deleted_at,
                  e.material_total, e.labor_hours, e.labor_rate, e.labor_total, e.subtotal, e.tax_rate, e.tax_total,
                  c.name AS customer_name,
                  c.email AS customer_email,
                  c.phone AS customer_phone,
                  c.address AS customer_address
           FROM estimates e
           LEFT JOIN customers c ON c.id = e.customer_id
           WHERE e.deleted_at IS NULL
           ORDER BY datetime(e.updated_at) DESC`
        );
        if (!signal?.cancelled) {
          setEstimates(rows);
        }
      } catch (error) {
        console.error("Failed to load estimates", error);
        if (!signal?.cancelled) {
          Alert.alert("Error", "Unable to load estimates. Please try again.");
        }
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const controller = { cancelled: false };
      setLoading(true);
      loadEstimates(controller).finally(() => {
        if (!controller.cancelled) {
          setLoading(false);
        }
      });

      return () => {
        controller.cancelled = true;
      };
    }, [loadEstimates])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadEstimates();
    } finally {
      setRefreshing(false);
    }
  }, [loadEstimates]);

  const handleDelete = useCallback(
    (estimate: EstimateListItem) => {
      Alert.alert(
        "Delete Estimate",
        "Are you sure you want to delete this estimate?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              let previousEstimates: EstimateListItem[] = [];

              setEstimates((prev) => {
                previousEstimates = prev;
                return prev.filter((existing) => existing.id !== estimate.id);
              });

              (async () => {
                try {
                  const db = await openDB();
                  const deletedAt = new Date().toISOString();
                  const nextVersion = (estimate.version ?? 1) + 1;
                  await db.runAsync(
                    `UPDATE estimates
                     SET deleted_at = ?, updated_at = ?, version = ?
                     WHERE id = ?`,
                    [deletedAt, deletedAt, nextVersion, estimate.id]
                  );

                  const deletedEstimate = {
                    ...estimate,
                    deleted_at: deletedAt,
                    updated_at: deletedAt,
                    version: nextVersion,
                  };

                  await queueChange(
                    "estimates",
                    "update",
                    sanitizeEstimateForQueue(deletedEstimate)
                  );
                  void runSync().catch((error) => {
                    console.error("Failed to sync estimate deletion", error);
                  });

                  await loadEstimates();
                } catch (error) {
                  console.error("Failed to delete estimate", error);
                  Alert.alert(
                    "Error",
                    "Unable to delete the estimate. Please try again."
                  );
                  setEstimates(() => [...previousEstimates]);
                }
              })();
            },
          },
        ]
      );
    },
    [loadEstimates]
  );

  const renderEstimate = useCallback(
    ({ item }: { item: EstimateListItem }) => (
      <View style={styles.card}>
        <Pressable
          onPress={() => router.push(`/(tabs)/estimates/${item.id}`)}
          style={styles.cardBody}
        >
          <Text style={styles.cardTitle}>
            {item.customer_name ?? "Unknown customer"}
          </Text>
          <Text style={styles.cardMeta}>Status: {formatStatus(item.status)}</Text>
          <Text style={styles.cardMeta}>
            Total: {formatCurrency(item.total)}
          </Text>
          <Text style={styles.cardMeta}>
            Labor: {formatCurrency(item.labor_total ?? 0)}
          </Text>
          <Text style={styles.cardMeta}>
            Materials: {formatCurrency(item.material_total ?? 0)}
          </Text>
          {item.date ? (
            <Text style={styles.cardMeta}>
              Date: {new Date(item.date).toLocaleDateString()}
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.buttonRow}>
          <View style={styles.buttonFlex}>
            <Button
              title="Edit"
              color={palette.accent}
              onPress={() => router.push(`/(tabs)/estimates/${item.id}`)}
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

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Estimates</Text>
        <Text style={styles.headerSubtitle}>
          Review drafts, monitor status changes, and keep your pipeline fresh.
        </Text>
        <Button
          title="Create Estimate"
          color={palette.accent}
          onPress={() => router.push("/(tabs)/estimates/new")}
        />
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : null}
      </View>
    ),
    [loading]
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={estimates}
        keyExtractor={(item) => item.id}
        renderItem={renderEstimate}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No estimates found.
              </Text>
            </View>
          ) : null
        }
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
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: palette.primaryText,
  },
  headerSubtitle: {
    fontSize: 14,
    color: palette.secondaryText,
    lineHeight: 20,
  },
  loadingRow: {
    paddingVertical: 16,
  },
  listContent: {
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 12,
    ...cardShadow(12),
  },
  cardBody: {
    gap: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: palette.primaryText,
  },
  cardMeta: {
    color: palette.secondaryText,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  buttonFlex: {
    flex: 1,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyText: {
    color: palette.mutedText,
  },
});
