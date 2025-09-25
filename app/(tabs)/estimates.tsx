import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import EstimateEditor, {
  EstimateStatus,
} from "../../components/EstimateEditor";
import { openDB } from "../../lib/sqlite";

type EstimateListItem = {
  id: string;
  customer_name: string | null;
  date: string;
  status: EstimateStatus;
  total: number;
  notes: string | null;
 };

const STATUS_STYLES: Record<EstimateStatus, { backgroundColor: string; color: string }> = {
  draft: { backgroundColor: "#F3F4F6", color: "#1F2937" },
  sent: { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  accepted: { backgroundColor: "#DCFCE7", color: "#166534" },
};

function StatusBadge({ status }: { status: EstimateStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: style.backgroundColor,
      }}
    >
      <Text style={{ color: style.color, fontWeight: "600" }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

type EditorState =
  | { mode: "new" }
  | { mode: "edit"; estimateId: string };

export default function Estimates() {
  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);

  const loadEstimates = useCallback(async () => {
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<EstimateListItem & { updated_at?: string }>(
        `SELECT e.id, e.date, e.status, e.total, e.notes, c.name as customer_name
         FROM estimates e
         LEFT JOIN customers c ON c.id = e.customer_id
         WHERE e.deleted_at IS NULL
         ORDER BY e.updated_at DESC`
      );

      setEstimates(
        rows.map((row) => ({
          ...row,
          customer_name: row.customer_name ?? "Unknown Customer",
          status: (row.status ?? "draft") as EstimateStatus,
        }))
      );
    } catch (error) {
      console.error("Failed to load estimates", error);
      Alert.alert("Error", "Unable to load estimates. Please try again later.");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadEstimates();
      setLoading(false);
    })();
  }, [loadEstimates]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEstimates();
    setRefreshing(false);
  }, [loadEstimates]);

  const closeEditor = useCallback(() => {
    setEditorState(null);
  }, []);

  const editorVisible = Boolean(editorState);
  const editorEstimateId =
    editorState && editorState.mode === "edit" ? editorState.estimateId : undefined;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "700" }}>Estimates</Text>
        <Pressable
          onPress={() => setEditorState({ mode: "new" })}
          style={{
            backgroundColor: "#2563EB",
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>New Estimate</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 12 }}>Loading estimates…</Text>
        </View>
      ) : estimates.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: "#6B7280", textAlign: "center" }}>
            No estimates yet. Tap “New Estimate” to create your first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={estimates}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setEditorState({ mode: "edit", estimateId: item.id })}
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                backgroundColor: "#fff",
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "600", flex: 1 }}>
                  {item.customer_name}
                </Text>
                <Text style={{ fontWeight: "700" }}>{formatCurrency(item.total)}</Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#6B7280" }}>
                  {item.date ? new Date(item.date).toLocaleDateString() : "—"}
                </Text>
                <StatusBadge status={item.status} />
              </View>
              {item.notes ? (
                <Text style={{ color: "#4B5563" }} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <Modal visible={editorVisible} animationType="slide" onRequestClose={closeEditor}>
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <EstimateEditor
            estimateId={editorEstimateId}
            onClose={closeEditor}
            onSaved={async () => {
              await loadEstimates();
              closeEditor();
            }}
            onDeleted={async () => {
              await loadEstimates();
              closeEditor();
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
