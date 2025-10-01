import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, Card, FAB, Input, ListItem } from "../../../components/ui";
import { cardShadow, useTheme, type Theme } from "../../../lib/theme";
import { openDB } from "../../../lib/sqlite";

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

type CustomerRecord = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
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

function statusTone(status: string | null) {
  const normalized = status?.toLowerCase();
  switch (normalized) {
    case "accepted":
      return "success" as const;
    case "declined":
      return "danger" as const;
    case "sent":
      return "info" as const;
    default:
      return "warning" as const;
  }
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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const badgeToneStyles = useMemo(
    () => ({
      info: styles.statusBadgeInfo,
      warning: styles.statusBadgeWarning,
      success: styles.statusBadgeSuccess,
      danger: styles.statusBadgeDanger,
    }),
    [styles],
  );
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [customerEstimates, setCustomerEstimates] = useState<
    EstimateListItem[]
  >([]);
  const [loadingEstimates, setLoadingEstimates] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const db = await openDB();
      const rows = await db.getAllAsync<CustomerRecord>(
        `SELECT id, name, email, phone, address, notes
         FROM customers
         WHERE deleted_at IS NULL
         ORDER BY name COLLATE NOCASE ASC`,
      );
      setCustomers(rows);
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert(
        "Unable to load customers",
        "Please try again later or contact support if the issue persists.",
      );
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerEstimates([]);
      return;
    }

    let cancelled = false;
    setLoadingEstimates(true);

    (async () => {
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
           WHERE e.deleted_at IS NULL AND e.customer_id = ?
           ORDER BY datetime(e.updated_at) DESC`,
          [selectedCustomerId],
        );
        if (!cancelled) {
          setCustomerEstimates(rows);
        }
      } catch (error) {
        console.error("Failed to load customer estimates", error);
        if (!cancelled) {
          Alert.alert(
            "Unable to load estimates",
            "Please try again later or contact support if the issue persists.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingEstimates(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const normalize = (value?: string | null) => {
      if (typeof value === "string") {
        return value.toLowerCase();
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value).toLowerCase();
    };

    return customers.filter((customer) => {
      const nameMatch = normalize(customer.name).includes(query);
      const phoneMatch = normalize(customer.phone).includes(query);
      const emailMatch = normalize(customer.email).includes(query);
      const addressMatch = normalize(customer.address).includes(query);
      const notesMatch = normalize(customer.notes).includes(query);

      return Boolean(
        nameMatch || phoneMatch || emailMatch || addressMatch || notesMatch,
      );
    });
  }, [customers, searchQuery]);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) {
      return null;
    }
    return (
      customers.find((customer) => customer.id === selectedCustomerId) || null
    );
  }, [customers, selectedCustomerId]);

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Estimates</Text>
          <Text style={styles.headerSubtitle}>
            Manage client proposals, keep tabs on project totals, and send
            polished quotes from the field.
          </Text>
        </View>
      </View>
    ),
    [styles],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {header}

        <Card style={styles.searchCard}>
          <View>
            <Text style={styles.sectionLabel}>Find a customer</Text>
            <Text style={styles.sectionCaption}>
              Search by name, email, phone number, or job site address to pull
              up client history.
            </Text>
          </View>
          <Input
            placeholder="Search customers"
            value={searchQuery}
            onChangeText={(value) => {
              setSearchQuery(value);
              if (!value) {
                setSelectedCustomerId(null);
              }
            }}
            leftElement={<Feather name="search" size={18} color={theme.mutedText} />}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {loadingCustomers ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.accent} />
            </View>
          ) : null}
          {searchQuery.trim().length === 0 ? (
            <Text style={styles.helperText}>
              Start typing to see matching customers.
            </Text>
          ) : null}
          {searchQuery.trim().length > 0 && !loadingCustomers ? (
            <View style={styles.resultsList}>
              {filteredCustomers.length === 0 ? (
                <Text style={styles.helperText}>No matching customers yet.</Text>
              ) : (
                filteredCustomers.map((customer) => (
                  <Pressable
                    key={customer.id}
                    onPress={() => setSelectedCustomerId(customer.id)}
                  >
                    <View
                      style={[
                        styles.resultItem,
                        selectedCustomerId === customer.id &&
                          styles.resultItemSelected,
                      ]}
                    >
                      <Text style={styles.resultName}>
                        {customer.name?.trim() || "Unnamed customer"}
                      </Text>
                      {customer.email ? (
                        <Text style={styles.resultMeta}>{customer.email}</Text>
                      ) : null}
                      {customer.phone ? (
                        <Text style={styles.resultMeta}>{customer.phone}</Text>
                      ) : null}
                      {customer.address ? (
                        <Text style={styles.resultMeta}>{customer.address}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          ) : null}
        </Card>

        {selectedCustomer ? (
          <View style={styles.customerSection}>
            <View>
              <Text style={styles.sectionLabel}>Customer profile</Text>
              <Text style={styles.sectionCaption}>
                Quick snapshot of client contact and service location details.
              </Text>
            </View>
            <Card style={styles.profileCard}>
              <Text style={styles.customerName}>
                {selectedCustomer.name?.trim() || "Unnamed customer"}
              </Text>
              <View style={styles.profileGrid}>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Email</Text>
                  <Text style={styles.profileValue}>
                    {selectedCustomer.email || "Not provided"}
                  </Text>
                </View>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Phone</Text>
                  <Text style={styles.profileValue}>
                    {selectedCustomer.phone || "Not provided"}
                  </Text>
                </View>
                <View style={styles.profileRow}>
                  <Text style={styles.profileLabel}>Address</Text>
                  <Text style={styles.profileValue}>
                    {selectedCustomer.address || "Not provided"}
                  </Text>
                </View>
                {selectedCustomer.notes ? (
                  <View style={styles.profileRow}>
                    <Text style={styles.profileLabel}>Notes</Text>
                    <Text style={styles.profileValue}>
                      {selectedCustomer.notes}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Card>

            <View>
              <Text style={styles.sectionLabel}>Estimate history</Text>
              <Text style={styles.sectionCaption}>
                Review previous work orders, totals, and sent status.
              </Text>
            </View>

            {loadingEstimates ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : null}

            {!loadingEstimates && customerEstimates.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather
                  name="file-text"
                  size={24}
                  color={theme.mutedText}
                />
                <Text style={styles.helperText}>
                  No estimates created for this customer yet.
                </Text>
              </View>
            ) : null}

            {customerEstimates.length > 0 ? (
              <Card style={styles.estimateList} elevated={false}>
                {customerEstimates.map((estimate, index) => {
                  const status = formatStatus(estimate.status);
                  const tone = statusTone(estimate.status);
                  const badgeStyle = badgeToneStyles[tone];
                  const subtitle = estimate.date
                    ? new Date(estimate.date).toLocaleDateString()
                    : "Date not set";

                  return (
                    <ListItem
                      key={estimate.id}
                      title={estimate.customer_name?.trim() || "Unassigned"}
                      subtitle={subtitle}
                      onPress={() => router.push(`/(tabs)/estimates/${estimate.id}`)}
                      style={[
                        styles.estimateItem,
                        index < customerEstimates.length - 1
                          ? styles.estimateDivider
                          : null,
                      ]}
                      badge={
                        <View style={styles.estimateTrailing}>
                          <Text style={styles.estimateAmount}>
                            {formatCurrency(estimate.total)}
                          </Text>
                          <Badge style={[styles.statusBadge, badgeStyle]}>
                            {status}
                          </Badge>
                        </View>
                      }
                    />
                  );
                })}
              </Card>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label="Create Estimate"
          onPress={() => router.push("/(tabs)/estimates/new")}
        />
      </View>

      <FAB
        accessibilityLabel="Create a new estimate"
        icon={<Feather name="plus" size={24} color={theme.surface} />}
        onPress={() => router.push("/(tabs)/estimates/new")}
        palette="highlight"
        style={styles.fab}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 24,
      paddingBottom: 140,
      gap: 24,
    },
    header: {
      gap: 20,
    },
    headerTitles: {
      gap: 8,
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: "700",
      color: theme.primaryText,
    },
    headerSubtitle: {
      fontSize: 16,
      lineHeight: 24,
      color: theme.secondaryText,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.secondaryText,
    },
    sectionCaption: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.mutedText,
      marginTop: 4,
    },
    searchCard: {
      gap: 16,
    },
    loadingRow: {
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    helperText: {
      fontSize: 14,
      color: theme.mutedText,
    },
    resultsList: {
      gap: 12,
    },
    resultItem: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      gap: 4,
      ...cardShadow(10, theme.mode),
    },
    resultItemSelected: {
      borderColor: theme.accent,
    },
    resultName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.primaryText,
    },
    resultMeta: {
      fontSize: 14,
      color: theme.secondaryText,
    },
    customerSection: {
      gap: 24,
    },
    profileCard: {
      gap: 20,
    },
    customerName: {
      fontSize: 24,
      fontWeight: "700",
      color: theme.primaryText,
    },
    profileGrid: {
      gap: 16,
    },
    profileRow: {
      gap: 6,
    },
    profileLabel: {
      fontSize: 12,
      color: theme.mutedText,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    profileValue: {
      fontSize: 16,
      lineHeight: 22,
      color: theme.primaryText,
    },
    emptyState: {
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      gap: 12,
      backgroundColor: theme.surfaceSubtle,
      borderWidth: 1,
      borderColor: theme.border,
    },
    estimateList: {
      padding: 0,
      gap: 0,
      overflow: "hidden",
    },
    estimateItem: {
      borderRadius: 0,
      backgroundColor: theme.surface,
    },
    estimateDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    estimateTrailing: {
      alignItems: "flex-end",
      gap: 8,
    },
    estimateAmount: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.primaryText,
    },
    statusBadge: {
      alignSelf: "flex-end",
    },
    statusBadgeInfo: {
      backgroundColor: theme.accentMuted,
    },
    statusBadgeWarning: {
      backgroundColor: theme.highlight,
    },
    statusBadgeSuccess: {
      backgroundColor: theme.successSurface,
    },
    statusBadgeDanger: {
      backgroundColor: theme.dangerSurface,
    },
    footer: {
      paddingHorizontal: 24,
      paddingBottom: 32,
      backgroundColor: theme.background,
    },
    fab: {
      position: "absolute",
      bottom: 112,
      right: 24,
      ...cardShadow(20, theme.mode),
    },
  });
}
