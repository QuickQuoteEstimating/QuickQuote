
import { useCallback, useEffect, useMemo, useState } from "react";

import React, { useCallback, useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,

  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Sharing from "expo-sharing";
import {
  EstimateRecord,
  fetchEstimatesWithDetails,
  logEstimateDelivery,
  saveGeneratedPdfMetadata,
} from "../../lib/estimates";
import { generateEstimatePdf } from "../../lib/pdf";
import { sendEstimateEmail } from "../../lib/deliveries";

type ProcessingState = {
  id: string;
  action: "generate" | "share" | "email";
};

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Never";
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.warn("Failed to format timestamp", error);
    return value;
  }
}

export default function Estimates() {
  const [estimates, setEstimates] = useState<EstimateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEstimates = useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setLoading(true);
      }

      try {
        setError(null);
        const data = await fetchEstimatesWithDetails();
        setEstimates(data);
      } catch (err) {
        console.error("Failed to load estimates", err);
        setError(err instanceof Error ? err.message : "Unable to load estimates");
      } finally {
        if (showLoader) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadEstimates(true);
  }, [loadEstimates]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEstimates(false);
  }, [loadEstimates]);

  const updateEstimate = useCallback((id: string, updates: Partial<EstimateRecord>) => {
    setEstimates((prev) =>
      prev.map((estimate) => (estimate.id === id ? { ...estimate, ...updates } : estimate))
    );
  }, []);

  const isProcessing = useCallback(
    (estimateId: string, action?: ProcessingState["action"]) => {
      if (!processing) {
        return false;
      }

      if (processing.id !== estimateId) {
        return false;
      }

      if (!action) {
        return true;
      }

      return processing.action === action;
    },
    [processing]
  );

  const handleGeneratePdf = useCallback(
    async (estimate: EstimateRecord) => {
      try {
        setProcessing({ id: estimate.id, action: "generate" });
        const pdfUri = await generateEstimatePdf(estimate);
        const generatedAt = await saveGeneratedPdfMetadata(estimate.id, pdfUri);
        updateEstimate(estimate.id, {
          pdf_last_generated_uri: pdfUri,
          pdf_last_generated_at: generatedAt,
        });
        Alert.alert("PDF ready", "The estimate PDF has been generated.");
      } catch (err) {
        console.error("Failed to generate PDF", err);
        const message =
          err instanceof Error ? err.message : "Unable to generate estimate PDF";
        Alert.alert("PDF error", message);
      } finally {
        setProcessing(null);
      }
    },
    [updateEstimate]
  );

  const handleShareEstimate = useCallback(
    async (estimate: EstimateRecord) => {
      try {
        setProcessing({ id: estimate.id, action: "share" });
        const pdfUri = await generateEstimatePdf(estimate);
        const generatedAt = await saveGeneratedPdfMetadata(estimate.id, pdfUri);
        updateEstimate(estimate.id, {
          pdf_last_generated_uri: pdfUri,
          pdf_last_generated_at: generatedAt,
        });

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          throw new Error("Native sharing is not available on this platform.");
        }

        await Sharing.shareAsync(pdfUri, {
          dialogTitle: `Share estimate for ${estimate.customer.name}`,
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
        });

        const sentAt = await logEstimateDelivery(estimate.id, {
          via: "share",
          status: "sent",
        });

        updateEstimate(estimate.id, {
          pdf_last_sent_at: sentAt,
          pdf_last_sent_status: "sent",
          pdf_last_sent_via: "share",
        });
      } catch (err) {
        console.error("Failed to share estimate", err);
        const message =
          err instanceof Error ? err.message : "Unable to share estimate PDF";

        try {
          const sentAt = await logEstimateDelivery(estimate.id, {
            via: "share",
            status: "failed",
            metadata: { message },
          });

          updateEstimate(estimate.id, {
            pdf_last_sent_at: sentAt,
            pdf_last_sent_status: "failed",
            pdf_last_sent_via: "share",
          });
        } catch (logError) {
          console.error("Failed to log share error", logError);
        }

        Alert.alert("Share failed", message);
      } finally {
        setProcessing(null);
      }
    },
    [updateEstimate]
  );

  const handleEmailEstimate = useCallback(
    async (estimate: EstimateRecord) => {
      const recipient = estimate.customer.email;

      if (!recipient) {
        Alert.alert(
          "No email on file",
          "Add an email address for this customer to send the estimate."
        );
        return;
      }

      try {
        setProcessing({ id: estimate.id, action: "email" });
        const pdfUri = await generateEstimatePdf(estimate);
        const generatedAt = await saveGeneratedPdfMetadata(estimate.id, pdfUri);
        updateEstimate(estimate.id, {
          pdf_last_generated_uri: pdfUri,
          pdf_last_generated_at: generatedAt,
        });

        await sendEstimateEmail({
          estimate,
          pdfUri,
          toEmail: recipient,
          subject: `Estimate for ${estimate.customer.name}`,
        });

        const sentAt = await logEstimateDelivery(estimate.id, {
          via: "email",
          status: "sent",
          metadata: { to: recipient },
        });

        updateEstimate(estimate.id, {
          pdf_last_sent_at: sentAt,
          pdf_last_sent_status: "sent",
          pdf_last_sent_via: "email",
        });

        Alert.alert("Email sent", `Estimate emailed to ${recipient}.`);
      } catch (err) {
        console.error("Failed to email estimate", err);
        const message =
          err instanceof Error ? err.message : "Unable to email estimate PDF";

        try {
          const sentAt = await logEstimateDelivery(estimate.id, {
            via: "email",
            status: "failed",
            metadata: { message, to: recipient },
          });

          updateEstimate(estimate.id, {
            pdf_last_sent_at: sentAt,
            pdf_last_sent_status: "failed",
            pdf_last_sent_via: "email",
          });
        } catch (logError) {
          console.error("Failed to log email error", logError);
        }

        Alert.alert("Email failed", message);
      } finally {
        setProcessing(null);
      }
    },
    [updateEstimate]
  );

  const renderEstimate = useCallback(
    ({ item }: { item: EstimateRecord }) => {
      const busy = isProcessing(item.id);

      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>{item.customer.name}</Text>
              <Text style={styles.cardSubtitle}>{item.customer.email ?? "No email"}</Text>
            </View>
            <View>
              <Text style={styles.cardTotal}>{formatCurrency(item.total)}</Text>
              <Text style={styles.cardDate}>{formatTimestamp(item.date)}</Text>
            </View>
          </View>

          <View style={styles.metaSection}>
            <Text style={styles.metaText}>
              Last generated: {formatTimestamp(item.pdf_last_generated_at)}
            </Text>
            <Text style={styles.metaText}>
              Last sent: {formatTimestamp(item.pdf_last_sent_at)}
              {item.pdf_last_sent_via ? ` via ${item.pdf_last_sent_via}` : ""}
              {item.pdf_last_sent_status ? ` (${item.pdf_last_sent_status})` : ""}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={() => handleGeneratePdf(item)}
              disabled={busy}
            >
              {isProcessing(item.id, "generate") ? (
                <ActivityIndicator color="#1f2937" size="small" />
              ) : (
                <Text style={styles.secondaryButtonText}>Generate PDF</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={() => handleShareEstimate(item)}
              disabled={busy}
            >
              {isProcessing(item.id, "share") ? (
                <ActivityIndicator color="#1f2937" size="small" />
              ) : (
                <Text style={styles.secondaryButtonText}>Share</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={() => handleEmailEstimate(item)}
              disabled={busy}
            >
              {isProcessing(item.id, "email") ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Email</Text>
              )}
            </Pressable>
          </View>
        </View>
      );
    },
    [handleEmailEstimate, handleGeneratePdf, handleShareEstimate, isProcessing]
  );

  const listContentStyle = useMemo(
    () => ({
      padding: 16,
      flexGrow: estimates.length === 0 ? 1 : undefined,
    }),
    [estimates.length]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading estimates…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <FlatList
        data={estimates}
        keyExtractor={(item) => item.id}
        renderItem={renderEstimate}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={listContentStyle}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No estimates yet</Text>
            <Text style={styles.emptySubtitle}>
              Create an estimate to start generating and sharing PDFs.
            </Text>
          </View>
        }
      />
=======
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#374151",
  },
  errorBanner: {
    backgroundColor: "#fee2e2",
    padding: 12,
    margin: 16,
    borderRadius: 8,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  cardSubtitle: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 14,
  },
  cardTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2563eb",
    textAlign: "right",
  },
  cardDate: {
    marginTop: 4,
    fontSize: 12,
    color: "#6b7280",
    textAlign: "right",
  },
  metaSection: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: "#2563eb",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    backgroundColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: "#2563eb",
    fontWeight: "600",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#4b5563",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
