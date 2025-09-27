import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
  Button,
} from "react-native";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";

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
            onPress: async () => {
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

                const { customer_name: _customerName, ...queuePayload } =
                  deletedEstimate;

                await queueChange("estimates", "update", queuePayload);
                await runSync();

                setEstimates((prev) =>
                  prev.filter((existing) => existing.id !== estimate.id)
                );
              } catch (error) {
                console.error("Failed to delete estimate", error);
                Alert.alert(
                  "Error",
                  "Unable to delete the estimate. Please try again."
                );
              }
            },
          },
        ]
      );
    },
    []
  );

  const renderEstimate = useCallback(
    ({ item }: { item: EstimateListItem }) => (
      <View
        style={{
          padding: 16,
          borderWidth: 1,
          borderRadius: 10,
          marginBottom: 12,
          backgroundColor: "#fff",
          gap: 8,
        }}
      >
        <Pressable onPress={() => router.push(`/(tabs)/estimates/${item.id}`)}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            {item.customer_name ?? "Unknown customer"}
          </Text>
          <Text style={{ color: "#555", marginTop: 4 }}>
            Status: {formatStatus(item.status)}
          </Text>
          <Text style={{ color: "#555", marginTop: 2 }}>
            Total: {formatCurrency(item.total)}
          </Text>
          {item.date ? (
            <Text style={{ color: "#777", marginTop: 2 }}>
              Date: {new Date(item.date).toLocaleDateString()}
            </Text>
          ) : null}
        </Pressable>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Edit"
              onPress={() => router.push(`/(tabs)/estimates/${item.id}`)}
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

  const listHeader = useMemo(
    () => (
      <View style={{ gap: 12, marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>Estimates</Text>
        <Button
          title="Create Estimate"
          onPress={() => router.push("/(tabs)/estimates/new")}
        />
        {loading ? (
          <View style={{ paddingVertical: 20 }}>
            <ActivityIndicator />
          </View>
        ) : null}
      </View>
    ),
    [loading]
  );

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#f5f5f5" }}>
      <FlatList
        data={estimates}
        keyExtractor={(item) => item.id}
        renderItem={renderEstimate}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loading ? (
            <View style={{ paddingVertical: 40 }}>
              <Text style={{ textAlign: "center", color: "#666" }}>
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
