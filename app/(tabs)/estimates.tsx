import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Sharing from "expo-sharing";

import EstimateEditor from "../../components/EstimateEditor";
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
  if (!value) return "Never";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.warn("Failed to format timestamp", error);
    return value;
  }
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return "Draft";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Estimates() {
  const [estimates, setEstimates] = useState<EstimateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(null);

  const loadEstimates = useCallback(
    async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        setError(null);
        const data = await fetchEstimatesWithDetails();
        setEstimates(data);
      } catch (err) {
        console.error("Failed to load estimates", err);
        setError(err instanceof Error ? err.message : "Unable to load estimates");
      } finally {
        if (showLoader) setLoading(false);
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

  const closeEditor = useCallback(() => {
    setEditorVisible(false);
    setEditingEstimateId(null);
  }, []);

  const openNewEstimate = useCallback(() => {
    setEditingEstimateId(null);
    setEditorVisible(true);
  }, []);

  const openExistingEstimate = useCallback((estimateId: string) => {
    setEditingEstimateId(estimateId);
    setEditorVisible(true);
  }, []);

  const handleEditorSaved = useCallback(() => {
    closeEditor();
    loadEstimates(true);
  }, [closeEditor, loadEstimates]);

  const handleEditorDeleted = useCallback(() => {
    closeEditor();
    loadEstimates(true);
  }, [closeEditor, loadEstimates]);

  const updateEstimate = useCallback((id: string, updates: Partial<EstimateRecord>) => {
    setEstimates((prev) =>
      prev.map((estimate) => (estimate.id === id ? { ...estimate, ...updates } : estimate))
    );
  }, []);

  const isProcessing = useCallback(
    (estimateId: string, action?: ProcessingState["action"]) => {
      if (!processing) return false;
      if (processing.id !== estimateId) return false;
      if (!action) return true;
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
        Alert.alert(
          "PDF error",
          err instanceof Error ? err.message : "Unable to generate estimate PDF"
        );
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
        if (!available) throw new Error("Native sharing is not available on this platform.");

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
        Alert.alert(
          "Share failed",
          err instanceof Error ? err.message : "Unable to share estimate PDF"
        );
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
        Alert.alert("No email on file", "Add an email address for this customer.");
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
        Alert.alert(
          "Email failed",
          err instanceof Error ? err.message : "Unable to email estimate PDF"
        );
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
            <Text style={styles.metaText}>Status: {formatStatus(item.status)}</Text>
          </View>

          <Pressable
            style={styles.manageLink}
            onPress={() => openExistingEstimate(item.id)}
          >
            <Text style={styles.manageLinkText}>View & edit estimate</Text>
          </Pressable>

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
    [
      handleEmailEstimate,
      handleGeneratePdf,
      handleShareEstimate,
      isProcessing,
      openExistingEstimate,
    ]
  );

  const listContentStyle = useMemo(
    () => ({
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 24,
      flexGrow: estimates.length === 0 ? 1 : undefined,
    }),
    [estimates.length]
  );

  const listHeaderComponent = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.headerTextGroup}>
          <Text style={styles.screenTitle}>Estimates</Text>
          <Text style={styles.screenSubtitle}>
            Create, edit, and send detailed proposals for every customer.
          </Text>
        </View>
        <Pressable style={styles.createButton} onPress={openNewEstimate}>
          <Text style={styles.createButtonText}>Create estimate</Text>
        </Pressable>
      </View>
    ),
    [openNewEstimate]
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
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No estimates yet</Text>
            <Text style={styles.emptySubtitle}>
              Create an estimate to start generating and sharing PDFs.
            </Text>
            <Pressable style={styles.emptyButton} onPress={openNewEstimate}>
              <Text style={styles.emptyButtonText}>Create estimate</Text>
            </Pressable>
          </View>
        }
      />
      {editorVisible ? (
        <Modal
          animationType="slide"
          visible={editorVisible}
          onRequestClose={closeEditor}
        >
          <View style={styles.editorContainer}>
            <EstimateEditor
              estimateId={editingEstimateId}
              onClose={closeEditor}
              onSaved={handleEditorSaved}
              onDeleted={handleEditorDeleted}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: "#374151" },
  errorBanner: { backgroundColor: "#fee2e2", padding: 12, margin: 16, borderRadius: 8 },
  errorText: { color: "#b91c1c", fontSize: 14 },
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  cardSubtitle: { marginTop: 4, color: "#6b7280", fontSize: 14 },
  cardTotal: { fontSize: 18, fontWeight: "700", color: "#2563eb", textAlign: "right" },
  cardDate: { marginTop: 4, fontSize: 12, color: "#6b7280", textAlign: "right" },
  metaSection: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
  },
  metaText: { fontSize: 13, color: "#4b5563", marginBottom: 4 },
  manageLink: { marginTop: 8, alignSelf: "flex-start" },
  manageLinkText: { color: "#2563eb", fontWeight: "600" },
  buttonRow: { flexDirection: "row", marginTop: 16 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  primaryButton: { backgroundColor: "#2563eb" },
  secondaryButton: { borderWidth: 1, borderColor: "#2563eb", backgroundColor: "transparent" },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: "#ffffff", fontWeight: "600" },
  secondaryButtonText: { color: "#2563eb", fontWeight: "600" },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
    color: "#4b5563",
    textAlign: "center",
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  listHeader: {
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerTextGroup: {
    gap: 4,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
  },
  screenSubtitle: {
    fontSize: 14,
    color: "#4b5563",
  },
  createButton: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  createButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingTop: 0,
  },
});
