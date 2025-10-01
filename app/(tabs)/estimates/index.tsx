import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Button,
} from "react-native";
import { openDB } from "../../../lib/sqlite";
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

function formatCurrency(value: number | null): string {
  const total = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(total);
}

export default function EstimatesScreen() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
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
         ORDER BY name COLLATE NOCASE ASC`
      );
      setCustomers(rows);
    } catch (error) {
      console.error("Failed to load customers", error);
      Alert.alert(
        "Unable to load customers",
        "Please try again later or contact support if the issue persists."
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
          [selectedCustomerId]
        );
        if (!cancelled) {
          setCustomerEstimates(rows);
        }
      } catch (error) {
        console.error("Failed to load customer estimates", error);
        if (!cancelled) {
          Alert.alert(
            "Unable to load estimates",
            "Please try again later or contact support if the issue persists."
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
        nameMatch || phoneMatch || emailMatch || addressMatch || notesMatch
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

  const listHeader = useMemo(
    () => (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Estimates</Text>
        <Text style={styles.headerSubtitle}>
          Search for a customer to review their profile and estimate history.
        </Text>
        <Button
          title="Create Estimate"
          color={palette.accent}
          onPress={() => router.push("/(tabs)/estimates/new")}
        />
      </View>
    ),
    []
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {listHeader}

      <View style={styles.searchSection}>
        <Text style={styles.sectionTitle}>Find a customer</Text>
        <TextInput
          value={searchQuery}
          onChangeText={(value) => {
            setSearchQuery(value);
            if (!value) {
              setSelectedCustomerId(null);
            }
          }}
          placeholder="Search by name, phone, email, or address"
          placeholderTextColor={palette.mutedText}
          autoCorrect={false}
          style={styles.searchInput}
        />
        {loadingCustomers ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : null}
        {searchQuery.trim().length === 0 ? (
          <Text style={styles.helperText}>
            Start typing to find an existing customer.
          </Text>
        ) : null}
        {searchQuery.trim().length > 0 && !loadingCustomers ? (
          <View style={styles.resultsList}>
            {filteredCustomers.length === 0 ? (
              <Text style={styles.helperText}>No matching customers.</Text>
            ) : (
              filteredCustomers.map((customer) => (
                <Pressable
                  key={customer.id}
                  onPress={() => setSelectedCustomerId(customer.id)}
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
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </View>

      {selectedCustomer ? (
        <View style={styles.customerSection}>
          <Text style={styles.sectionTitle}>Customer profile</Text>
          <View style={styles.card}>
            <Text style={styles.customerName}>
              {selectedCustomer.name?.trim() || "Unnamed customer"}
            </Text>
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
                <Text style={styles.profileValue}>{selectedCustomer.notes}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Estimate history</Text>
          {loadingEstimates ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : null}
          {!loadingEstimates && customerEstimates.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                This customer does not have any estimates yet.
              </Text>
            </View>
          ) : null}
          {customerEstimates.map((estimate) => (
            <View key={estimate.id} style={styles.card}>
              <Pressable
                onPress={() => router.push(`/(tabs)/estimates/${estimate.id}`)}
                style={styles.cardBody}
              >
                <Text style={styles.cardTitle}>
                  Estimate #{estimate.id.slice(0, 8)}
                </Text>
                <Text style={styles.cardMeta}>
                  Status: {formatStatus(estimate.status)}
                </Text>
                <Text style={styles.cardMeta}>
                  Total: {formatCurrency(estimate.total)}
                </Text>
                <Text style={styles.cardMeta}>
                  Labor: {formatCurrency(estimate.labor_total ?? 0)}
                </Text>
                <Text style={styles.cardMeta}>
                  Materials: {formatCurrency(estimate.material_total ?? 0)}
                </Text>
                {estimate.date ? (
                  <Text style={styles.cardMeta}>
                    Date: {new Date(estimate.date).toLocaleDateString()}
                  </Text>
                ) : null}
              </Pressable>
              <View style={styles.buttonRow}>
                <View style={styles.buttonFlex}>
                  <Button
                    title="View"
                    color={palette.accent}
                    onPress={() => router.push(`/(tabs)/estimates/${estimate.id}`)}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: palette.background,
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
  header: {
    gap: 12,
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 48,
    gap: 24,
  },
  loadingRow: {
    paddingVertical: 16,
    alignItems: "center",
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
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    color: palette.mutedText,
  },
  searchSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: palette.primaryText,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surfaceSubtle,
    borderColor: palette.border,
    color: palette.primaryText,
  },
  helperText: {
    color: palette.secondaryText,
  },
  resultsList: {
    gap: 12,
  },
  resultItem: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: 4,
    ...cardShadow(6),
  },
  resultItemSelected: {
    borderColor: palette.accent,
  },
  resultName: {
    fontSize: 16,
    fontWeight: "600",
    color: palette.primaryText,
  },
  resultMeta: {
    color: palette.secondaryText,
  },
  customerSection: {
    gap: 16,
  },
  customerName: {
    fontSize: 22,
    fontWeight: "700",
    color: palette.primaryText,
  },
  profileRow: {
    gap: 4,
  },
  profileLabel: {
    fontSize: 12,
    color: palette.mutedText,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  profileValue: {
    color: palette.primaryText,
  },
});
