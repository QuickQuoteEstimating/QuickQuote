import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, FAB, Input, ListItem } from "../../../components/ui";
import { openDB } from "../../../lib/sqlite";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";

export type EstimateRecord = {
  id: string;
  user_id: string;
  customer_id: string;
  date: string | null;
  total: number;
  material_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  subtotal: number;
  tax_rate: number;
  tax_total: number;
  notes: string | null;
  billing_address: string | null;
  job_address: string | null;
  job_details: string | null;
  status: string;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

export type EstimateListItem = EstimateRecord & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
};

type EstimateRecordRow = Omit<EstimateRecord, "total" | "material_total" | "labor_hours" | "labor_rate" | "labor_total" | "subtotal" | "tax_rate" | "tax_total" | "status" | "version"> & {
  total: number | null;
  material_total: number | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_total: number | null;
  status: string | null;
  version: number | null;
};

type EstimateListItemRow = EstimateRecordRow & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
};

function coerceEstimateNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function normalizeEstimateRecord(row: EstimateRecordRow): EstimateRecord {
  return {
    ...row,
    total: coerceEstimateNumber(row.total),
    material_total: coerceEstimateNumber(row.material_total),
    labor_hours: coerceEstimateNumber(row.labor_hours),
    labor_rate: coerceEstimateNumber(row.labor_rate),
    labor_total: coerceEstimateNumber(row.labor_total),
    subtotal: coerceEstimateNumber(row.subtotal),
    tax_rate: coerceEstimateNumber(row.tax_rate),
    tax_total: coerceEstimateNumber(row.tax_total),
    status: row.status?.trim() ? row.status.trim() : "draft",
    version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : 1,
  };
}

function normalizeEstimateListItem(row: EstimateListItemRow): EstimateListItem {
  const record = normalizeEstimateRecord(row);
  return {
    ...record,
    customer_name: row.customer_name ?? null,
    customer_email: row.customer_email ?? null,
    customer_phone: row.customer_phone ?? null,
    customer_address: row.customer_address ?? null,
  };
}

type EstimateStatusFilter = "all" | "draft" | "sent" | "approved" | "declined";

type StatusDefinition = {
  key: EstimateStatusFilter;
  label: string;
};

const STATUS_FILTERS: StatusDefinition[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Approved",
  approved: "Approved",
  declined: "Declined",
};

function normalizeStatus(status: string | null | undefined): string {
  return status?.toLowerCase() ?? "draft";
}

function formatStatus(status: string | null | undefined): string {
  const normalized = normalizeStatus(status);
  return STATUS_LABELS[normalized] ?? status ?? "Draft";
}

function formatCurrency(value: number | null | undefined): string {
  const amount = coerceEstimateNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatEstimateNumber(estimate: EstimateRecord): string {
  if (Number.isFinite(estimate.version)) {
    return `Q-${String(estimate.version).padStart(4, "0")}`;
  }

  return `Q-${estimate.id.slice(0, 4).toUpperCase()}`;
}

export default function EstimatesScreen() {
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [estimates, setEstimates] = useState<EstimateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatusFilter>("all");

  const fetchEstimates = useCallback(async () => {
    try {
      setError(null);
      const db = await openDB();
      const rows = await db.getAllAsync<EstimateListItemRow>(
        `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.notes, e.status, e.version, e.updated_at, e.deleted_at,
                e.material_total, e.labor_hours, e.labor_rate, e.labor_total, e.subtotal, e.tax_rate, e.tax_total,
                e.billing_address, e.job_address, e.job_details,
                c.name AS customer_name,
                c.email AS customer_email,
                c.phone AS customer_phone,
                c.address AS customer_address
         FROM estimates e
         LEFT JOIN customers c ON c.id = e.customer_id
         WHERE e.deleted_at IS NULL
         ORDER BY datetime(e.updated_at) DESC`,
      );
      const normalizedRows = rows.map(normalizeEstimateListItem);
      setEstimates(normalizedRows);
    } catch (err) {
      console.error("Failed to load estimates", err);
      setError("We couldn't load your estimates. Please try again.");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      await fetchEstimates();
      if (isMounted) {
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [fetchEstimates]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEstimates();
    setRefreshing(false);
  }, [fetchEstimates]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    await fetchEstimates();
    setLoading(false);
  }, [fetchEstimates]);

  const handleCreateEstimate = useCallback(() => {
    router.push({ pathname: "/(tabs)/estimates/[id]", params: { mode: "new" } });
  }, []);

  const filteredEstimates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return estimates.filter((estimate) => {
      const normalizedStatus = normalizeStatus(estimate.status);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "approved" && normalizedStatus === "accepted") ||
        normalizedStatus === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      const candidateValues = [
        estimate.customer_name ?? "",
        estimate.notes ?? "",
        formatEstimateNumber(estimate),
        estimate.customer_email ?? "",
        estimate.customer_phone ?? "",
        estimate.customer_address ?? "",
      ];

      return candidateValues.some((value) => value.toLowerCase().includes(query));
    });
  }, [estimates, searchQuery, statusFilter]);

  const renderEstimateItem = useCallback<ListRenderItem<EstimateListItem>>(
    ({ item }) => {
      const statusLabel = formatStatus(item.status);
      const formattedDate = item.date ? new Date(item.date).toLocaleDateString() : "No date";
      const estimateNumber = formatEstimateNumber(item);
      const subtitle = `${formattedDate} • ${estimateNumber}`;

      return (
        <ListItem
          title={item.customer_name?.trim() || "Untitled estimate"}
          subtitle={subtitle}
          onPress={() => router.push(`/(tabs)/estimates/${item.id}`)}
          badge={
            <View style={styles.itemMeta}>
              <Text style={styles.itemAmount}>{formatCurrency(item.total)}</Text>
              <Badge style={styles.statusBadge}>{statusLabel}</Badge>
            </View>
          }
          style={styles.listItem}
        />
      );
    },
    [styles.itemAmount, styles.itemMeta, styles.listItem, styles.statusBadge],
  );

  const renderSeparator = useCallback(() => <View style={styles.separator} />, [styles.separator]);

  const showFab = false; // TODO: Evaluate floating action pattern once design guidance is finalized.

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <FlatList<EstimateListItem>
          data={filteredEstimates}
          keyExtractor={(item) => item.id}
          renderItem={renderEstimateItem}
          ItemSeparatorComponent={renderSeparator}
          ListHeaderComponent={
            <View style={styles.headerSection}>
              <View style={styles.titleBlock}>
                <Text style={styles.screenTitle}>Estimates</Text>
                <Text style={styles.screenSubtitle}>
                  Review proposals, track their status, and keep your pricing up to date.
                </Text>
              </View>
              <Card style={styles.filterCard}>
                <Input
                  placeholder="Search estimates…"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                  leftElement={<Feather name="search" size={18} color={theme.colors.mutedText} />}
                />
                <View style={styles.filterRow}>
                  {STATUS_FILTERS.map((filter) => {
                    const isSelected = statusFilter === filter.key;
                    return (
                      <Button
                        key={filter.key}
                        label={filter.label}
                        variant={isSelected ? "primary" : "ghost"}
                        alignment="inline"
                        onPress={() => setStatusFilter(filter.key)}
                        style={[styles.filterButton, isSelected ? styles.filterButtonActive : null]}
                        textStyle={[styles.filterButtonLabel]}
                        accessibilityLabel={`Filter estimates by status: ${filter.label}`}
                      />
                    );
                  })}
                </View>
                </Card>
              <View style={styles.utilitiesRow}>
                <Button
                  label="Manage saved items"
                  variant="secondary"
                  alignment="inline"
                  onPress={() => router.push("/(tabs)/estimates/saved-items")}
                  leadingIcon={<Feather name="bookmark" size={18} color={theme.colors.accent} />}
                />
              </View>
              {loading ? (
                <Card style={styles.messageCard}>
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={styles.messageText}>Loading estimates…</Text>
                  </View>
                </Card>
              ) : null}
              {error ? (
                <Card style={styles.messageCard}>
                  <View style={styles.errorContent}>
                    <Text style={styles.messageText}>{error}</Text>
                    <Button
                      label="Retry"
                      variant="secondary"
                      alignment="inline"
                      onPress={handleRetry}
                      accessibilityLabel="Retry loading estimates"
                    />
                  </View>
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            !loading && !error ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyContent}>
                  <Text style={styles.emptyTitle}>No estimates yet</Text>
                  <Text style={styles.emptySubtitle}>
                    Create your first estimate to start tracking proposals and customer totals.
                  </Text>
                  <Button
                    label="Create Estimate"
                    onPress={handleCreateEstimate}
                    accessibilityLabel="Create a new estimate"
                  />
                </View>
              </Card>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
        {filteredEstimates.length > 0 ? (
          <View style={styles.createAction}>
            <Button
              label="Create Estimate"
              onPress={handleCreateEstimate}
              accessibilityLabel="Create a new estimate"
            />
          </View>
        ) : null}
        {showFab ? (
          <FAB
            icon={<Feather name="plus" size={24} color={theme.colors.primaryText} />}
            onPress={handleCreateEstimate}
            accessibilityLabel="Create a new estimate"
            style={styles.fab}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
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
    listContent: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl * 2,
      gap: theme.spacing.xl,
    },
    headerSection: {
      gap: theme.spacing.xl,
      marginBottom: theme.spacing.xl,
    },
    titleBlock: {
      gap: theme.spacing.sm,
    },
    utilitiesRow: {
      flexDirection: "row",
      justifyContent: "flex-start",
    },
    screenTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    screenSubtitle: {
      fontSize: 15,
      color: theme.colors.mutedText,
      lineHeight: 22,
    },
    filterCard: {
      gap: theme.spacing.lg,
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
    },
    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    filterButton: {
      borderRadius: theme.radii.md,
      minHeight: 48,
    },
    filterButtonActive: {
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.12,
      shadowOffset: { width: 0, height: theme.spacing.xs },
      shadowRadius: theme.spacing.md,
    },
    filterButtonLabel: {
      fontSize: 14,
    },
    messageCard: {
      padding: theme.spacing.xl,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    errorContent: {
      gap: theme.spacing.md,
    },
    messageText: {
      fontSize: 15,
      color: theme.colors.secondaryText,
    },
    emptyCard: {
      padding: theme.spacing.xl,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
    },
    emptyContent: {
      gap: theme.spacing.lg,
      alignItems: "flex-start",
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    emptySubtitle: {
      fontSize: 15,
      color: theme.colors.mutedText,
      lineHeight: 22,
    },
    separator: {
      height: theme.spacing.lg,
    },
    listItem: {
      backgroundColor: theme.colors.surface,
    },
    itemMeta: {
      alignItems: "flex-end",
      gap: theme.spacing.xs,
    },
    itemAmount: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.primaryText,
    },
    statusBadge: {
      backgroundColor: theme.colors.accentSoft,
    },
    createAction: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.lg,
    },
    fab: {
      position: "absolute",
      right: theme.spacing.xl,
      bottom: theme.spacing.xxl,
    },
  });
}
