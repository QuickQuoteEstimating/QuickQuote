import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuidv4 } from "uuid";

import { Button, Card, Input } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { useItemEditor, type ItemEditorConfig } from "../../../context/ItemEditorContext";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";
import type { EstimateItemFormSubmit } from "../../../components/EstimateItemForm";

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

type LineItemDraft = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  templateId: string | null;
};

type FormErrors = {
  customer?: string;
  jobTitle?: string;
};

function formatCurrency(value: number): string {
  return CURRENCY_FORMATTER.format(Math.round(value * 100) / 100);
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl * 2,
      gap: theme.spacing.xl,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    cardSpacing: {
      gap: theme.spacing.lg,
    },
    customerActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: theme.spacing.md,
    },
    lineItemList: {
      gap: theme.spacing.md,
    },
    lineItemRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    lineItemInfo: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    lineItemName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    lineItemMeta: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    lineItemTotal: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
      textAlign: "right",
      minWidth: 96,
    },
    emptyState: {
      paddingVertical: theme.spacing.lg,
      alignItems: "center",
    },
    emptyStateText: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: "center",
    },
    summaryCard: {
      gap: theme.spacing.lg,
    },
    summaryRows: {
      gap: theme.spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 16,
      color: theme.colors.textMuted,
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primaryText,
    },
    summaryTotalValue: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    footerButtons: {
      flexDirection: "column",
      gap: theme.spacing.md,
    },
    errorCard: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSoft,
    },
    errorText: {
      fontSize: 14,
      color: theme.colors.danger,
    },
    actionRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
  });
}

export default function NewEstimateScreen() {
  const { user, session } = useAuth();
  const { settings } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openEditor } = useItemEditor();

  const userId = user?.id ?? session?.user?.id ?? null;
  const defaultLaborRate = useMemo(() => {
    const rate = Math.max(0, settings.hourlyRate ?? 0);
    return Math.round(rate * 100) / 100;
  }, [settings.hourlyRate]);
  const defaultTaxRate = useMemo(() => {
    const rate = Math.max(0, settings.taxRate ?? 0);
    return Math.round(rate * 100) / 100;
  }, [settings.taxRate]);

  const [customerName, setCustomerName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const taxRate = defaultTaxRate;
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    return calculateEstimateTotals({
      materialLineItems: lineItems.map((item) => ({ total: item.total })),
      taxRate,
    });
  }, [lineItems, taxRate]);

  const handleOpenItemEditor = useCallback(
    (config: ItemEditorConfig) => {
      openEditor(config);
      router.push("/(tabs)/estimates/item-editor");
    },
    [openEditor, router],
  );

  const handleAddItem = useCallback(() => {
    handleOpenItemEditor({
      title: "Add Item",
      submitLabel: "Add Item",
      onSubmit: async (payload: EstimateItemFormSubmit) => {
        setLineItems((current) => [
          ...current,
          {
            id: uuidv4(),
            description: payload.values.description,
            quantity: payload.values.quantity,
            unitPrice: payload.values.unit_price,
            total: payload.values.total,
            templateId: payload.templateId,
          },
        ]);
      },
      onCancel: () => undefined,
    });
  }, [handleOpenItemEditor]);

  const handleEditItem = useCallback(
    (item: LineItemDraft) => {
      handleOpenItemEditor({
        title: "Edit Item",
        submitLabel: "Update Item",
        initialValue: {
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        },
        initialTemplateId: item.templateId,
        onSubmit: async (payload: EstimateItemFormSubmit) => {
          setLineItems((current) =>
            current.map((existing) =>
              existing.id === item.id
                ? {
                    ...existing,
                    description: payload.values.description,
                    quantity: payload.values.quantity,
                    unitPrice: payload.values.unit_price,
                    total: payload.values.total,
                    templateId: payload.templateId,
                  }
                : existing,
            ),
          );
        },
        onCancel: () => undefined,
      });
    },
    [handleOpenItemEditor],
  );

  const handleRemoveItem = useCallback((itemId: string) => {
    setLineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const validateForm = useCallback(() => {
    const nextErrors: FormErrors = {};
    const trimmedJobTitle = jobTitle.trim();

    if (!trimmedJobTitle) {
      nextErrors.jobTitle = "Job title is required.";
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [jobTitle]);

  const handleSave = useCallback(
    async (navigateToPreview: boolean) => {
      if (!userId) {
        setFormError("You need to be signed in to create a new estimate.");
        Alert.alert("Estimate", "You need to be signed in to create a new estimate.");
        return;
      }

      if (!validateForm()) {
        return;
      }

      setSaving(true);
      setFormError(null);

      const estimateId = uuidv4();
      const now = new Date().toISOString();

      try {
        const db = await openDB();
        const normalizedNotes = notes.trim() ? notes.trim() : null;
        const newEstimate = {
          id: estimateId,
          user_id: userId,
          customer_id: null,
          date: null,
          total: totals.grandTotal,
          material_total: totals.materialTotal,
          labor_hours: 0,
          labor_rate: defaultLaborRate,
          labor_total: totals.laborTotal,
          subtotal: totals.subtotal,
          tax_rate: totals.taxRate,
          tax_total: totals.taxTotal,
          notes: normalizedNotes,
          status: "draft" as const,
          version: 1,
          updated_at: now,
          deleted_at: null,
        };

        await db.runAsync(
          `INSERT OR REPLACE INTO estimates
           (id, user_id, customer_id, date, total, material_total, labor_hours, labor_rate, labor_total, subtotal, tax_rate, tax_total, notes, status, version, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newEstimate.id,
            newEstimate.user_id,
            newEstimate.customer_id,
            newEstimate.date,
            newEstimate.total,
            newEstimate.material_total,
            newEstimate.labor_hours,
            newEstimate.labor_rate,
            newEstimate.labor_total,
            newEstimate.subtotal,
            newEstimate.tax_rate,
            newEstimate.tax_total,
            newEstimate.notes,
            newEstimate.status,
            newEstimate.version,
            newEstimate.updated_at,
            newEstimate.deleted_at,
          ],
        );

        await queueChange("estimates", "insert", sanitizeEstimateForQueue(newEstimate));

        if (lineItems.length > 0) {
          for (const item of lineItems) {
            const itemRecord = {
              id: item.id,
              estimate_id: estimateId,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              total: item.total,
              catalog_item_id: item.templateId,
              version: 1,
              updated_at: now,
              deleted_at: null,
            };

            await db.runAsync(
              `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, catalog_item_id, version, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                itemRecord.id,
                itemRecord.estimate_id,
                itemRecord.description,
                itemRecord.quantity,
                itemRecord.unit_price,
                itemRecord.total,
                itemRecord.catalog_item_id,
                itemRecord.version,
                itemRecord.updated_at,
                itemRecord.deleted_at,
              ],
            );

            await queueChange("estimate_items", "insert", itemRecord);
          }
        }

        void runSync().catch((syncError: unknown) => {
          console.warn("Failed to sync new estimate immediately", syncError);
        });

        if (navigateToPreview) {
          router.replace({
            pathname: "/(tabs)/estimates/[id]",
            params: { id: estimateId },
          });
        } else {
          Alert.alert("Draft saved", "Your estimate draft has been saved.");
        }
      } catch (error) {
        console.error("Failed to save new estimate", error);
        setFormError("We couldn't save your estimate. Please try again.");
        Alert.alert("Estimate", "We couldn't save your estimate. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [
      defaultLaborRate,
      lineItems,
      notes,
      router,
      totals.grandTotal,
      totals.laborTotal,
      totals.materialTotal,
      totals.subtotal,
      totals.taxRate,
      totals.taxTotal,
      userId,
      validateForm,
    ],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {formError ? (
            <Card elevated={false} style={[styles.cardSpacing, styles.errorCard]}>
              <Text style={styles.errorText}>{formError}</Text>
            </Card>
          ) : null}

          <Card style={styles.cardSpacing}>
            <Text style={styles.sectionTitle}>Customer</Text>
            <Input
              label="Customer"
              placeholder="Select or add customer"
              value={customerName}
              onChangeText={setCustomerName}
              autoCapitalize="words"
              autoCorrect={false}
              error={formErrors.customer}
            />
            <View style={styles.customerActions}>
              <Button
                label="Choose Customer"
                variant="secondary"
                alignment="inline"
                onPress={() => Alert.alert("Customer", "TODO: Launch customer picker")}
              />
            </View>
          </Card>

          <Card style={styles.cardSpacing}>
            <Text style={styles.sectionTitle}>Job Details</Text>
            <Input
              label="Job Title"
              placeholder="Describe the job"
              value={jobTitle}
              onChangeText={setJobTitle}
              error={formErrors.jobTitle}
              autoCapitalize="sentences"
              testID="jobTitleInput"
            />
            <Input
              label="Job Address"
              placeholder="Where is the job located?"
              value={jobAddress}
              onChangeText={setJobAddress}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <Input
              label="Notes"
              placeholder="Add any extra context for this estimate"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Card>

          <Card style={[styles.cardSpacing, styles.summaryCard]}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            <View style={styles.lineItemList}>
              {lineItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No line items yet. Add materials, labor, or services to build your estimate.
                  </Text>
                </View>
              ) : (
                lineItems.map((item) => (
                  <View key={item.id} style={styles.lineItemRow}>
                    <View style={styles.lineItemInfo}>
                      <Text style={styles.lineItemName}>{item.description}</Text>
                      <Text style={styles.lineItemMeta}>
                        Qty {item.quantity} × {formatCurrency(item.unitPrice)}
                      </Text>
                      <View style={styles.actionRow}>
                        <Button
                          label="Edit"
                          variant="ghost"
                          alignment="inline"
                          onPress={() => handleEditItem(item)}
                        />
                        <Button
                          label="Remove"
                          variant="ghost"
                          alignment="inline"
                          onPress={() => handleRemoveItem(item.id)}
                        />
                      </View>
                    </View>
                    <Text style={styles.lineItemTotal}>{formatCurrency(item.total)}</Text>
                  </View>
                ))
              )}
            </View>
            <Button label="Add Item" variant="secondary" onPress={handleAddItem} />
          </Card>

          <Card style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryRows}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tax ({totals.taxRate.toFixed(2)}%)</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.taxTotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(totals.grandTotal)}</Text>
              </View>
            </View>
          </Card>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
          <View style={styles.footerButtons}>
            <Button
              label="Save & Preview"
              onPress={() => handleSave(true)}
              loading={saving}
              disabled={saving}
            />
            <Button
              label="Save Draft"
              variant="ghost"
              onPress={() => handleSave(false)}
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
