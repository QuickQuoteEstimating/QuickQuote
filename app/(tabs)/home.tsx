import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openDB } from "../../lib/sqlite";

type DashboardMetrics = {
  jobsSold: number;
  yearlyEarnings: number;
  topCustomers: Array<{ name: string; jobs: number; total: number }>;
  topJob: {
    customer: string;
    total: number;
    status: string;
    date: string | null;
  } | null;
  closeRate: number | null;
  pipelineValue: number;
  pipelineCount: number;
  averageDealSize: number | null;
};

type SummaryRow = {
  accepted_count: number | null;
  declined_count: number | null;
  sent_count: number | null;
  accepted_total: number | null;
  accepted_year_total: number | null;
  pipeline_total: number | null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F6FB",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 24,
  },
  heroCard: {
    backgroundColor: "#0F172A",
    borderRadius: 28,
    padding: 24,
    shadowColor: "#0F172A",
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.72)",
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
  },
  heroStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 28,
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: 1,
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "700",
  },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 22,
  },
  heroBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  heroBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0F172A",
    letterSpacing: 0.2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  metricLabel: {
    fontSize: 12,
    color: "#64748B",
    textTransform: "uppercase",
    fontWeight: "600",
    letterSpacing: 0.8,
  },
  metricValue: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "700",
    color: "#0F172A",
  },
  metricHint: {
    marginTop: 6,
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    gap: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listItemLeft: {
    gap: 4,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  listItemMeta: {
    fontSize: 13,
    color: "#64748B",
  },
  listItemValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0F172A",
  },
  topJobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    gap: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  muted: {
    color: "#94A3B8",
    fontSize: 13,
  },
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number | null | undefined) {
  const value = typeof amount === "number" ? amount : 0;
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function formatStatus(value: string) {
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "sent":
      return "Sent";
    case "draft":
      return "Draft";
    default:
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMetrics = useCallback(async (): Promise<DashboardMetrics> => {
    const db = await openDB();
    const currentYear = String(new Date().getFullYear());

    const summaryRows = await db.getAllAsync<SummaryRow>(
      `SELECT
         SUM(CASE WHEN LOWER(status) = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
         SUM(CASE WHEN LOWER(status) = 'declined' THEN 1 ELSE 0 END) AS declined_count,
         SUM(CASE WHEN LOWER(status) = 'sent' THEN 1 ELSE 0 END) AS sent_count,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'accepted' THEN total ELSE 0 END), 0) AS accepted_total,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'accepted' AND strftime('%Y', COALESCE(date, updated_at)) = ? THEN total ELSE 0 END), 0) AS accepted_year_total,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'sent' THEN total ELSE 0 END), 0) AS pipeline_total
       FROM estimates
       WHERE deleted_at IS NULL`,
      [currentYear]
    );

    const summary = summaryRows[0] ?? {
      accepted_count: 0,
      declined_count: 0,
      sent_count: 0,
      accepted_total: 0,
      accepted_year_total: 0,
      pipeline_total: 0,
    };

    const topCustomersRows = await db.getAllAsync<{
      name: string | null;
      jobs: number | null;
      total: number | null;
    }>(
      `SELECT
         COALESCE(NULLIF(c.name, ''), 'Unnamed customer') AS name,
         COUNT(e.id) AS jobs,
         COALESCE(SUM(e.total), 0) AS total
       FROM estimates e
       LEFT JOIN customers c ON c.id = e.customer_id
       WHERE e.deleted_at IS NULL
         AND LOWER(e.status) = 'accepted'
       GROUP BY e.customer_id, COALESCE(NULLIF(c.name, ''), 'Unnamed customer')
       ORDER BY total DESC
       LIMIT 3`
    );

    const topJobRows = await db.getAllAsync<{
      id: string;
      customer_name: string | null;
      total: number | null;
      status: string | null;
      date: string | null;
    }>(
      `SELECT
         e.id,
         COALESCE(NULLIF(c.name, ''), 'Unnamed customer') AS customer_name,
         e.total,
         e.status,
         e.date
       FROM estimates e
       LEFT JOIN customers c ON c.id = e.customer_id
       WHERE e.deleted_at IS NULL
       ORDER BY CASE WHEN LOWER(e.status) = 'accepted' THEN 0 ELSE 1 END, e.total DESC
       LIMIT 1`
    );

    const jobsSold = Number(summary.accepted_count ?? 0);
    const declined = Number(summary.declined_count ?? 0);
    const pipelineCount = Number(summary.sent_count ?? 0);
    const acceptedTotal = Number(summary.accepted_total ?? 0);
    const yearlyEarnings = Number(summary.accepted_year_total ?? 0);
    const pipelineValue = Number(summary.pipeline_total ?? 0);

    const closeRate = (() => {
      const attempts = jobsSold + declined;
      if (attempts === 0) {
        return null;
      }
      return jobsSold / attempts;
    })();

    const averageDealSize = jobsSold > 0 ? acceptedTotal / jobsSold : null;

    const topCustomers = topCustomersRows.map((row) => ({
      name: row.name ?? "Unnamed customer",
      jobs: Number(row.jobs ?? 0),
      total: Number(row.total ?? 0),
    }));

    const topJobRow = topJobRows[0];
    const topJob = topJobRow
      ? {
          customer: topJobRow.customer_name ?? "Unnamed customer",
          total: Number(topJobRow.total ?? 0),
          status: topJobRow.status?.toLowerCase() ?? "draft",
          date: topJobRow.date ?? null,
        }
      : null;

    return {
      jobsSold,
      yearlyEarnings,
      topCustomers,
      topJob,
      closeRate,
      pipelineValue,
      pipelineCount,
      averageDealSize,
    };
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const data = await loadMetrics();
      setMetrics(data);
    } finally {
      setRefreshing(false);
    }
  }, [loadMetrics]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      loadMetrics()
        .then((data) => {
          if (isActive) {
            setMetrics(data);
          }
        })
        .catch((error) => {
          console.error("Failed to load dashboard metrics", error);
        })
        .finally(() => {
          if (isActive) {
            setLoading(false);
          }
        });

      return () => {
        isActive = false;
      };
    }, [loadMetrics])
  );

  const heroSummary = useMemo(() => {
    if (!metrics) {
      return "Loading your business snapshot...";
    }
    if (metrics.jobsSold === 0) {
      return "You're ready to close your first job. Keep sharing polished estimates.";
    }
    return `You've sold ${metrics.jobsSold} ${metrics.jobsSold === 1 ? "job" : "jobs"} this year.`;
  }, [metrics]);

  const heroStatValue = metrics ? formatCurrency(metrics.yearlyEarnings) : "—";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 20) + 10 },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            refreshMetrics();
          }}
          tintColor="#0F172A"
        />
      }
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Good to see you</Text>
        <Text style={styles.heroSubtitle}>{heroSummary}</Text>
        <View style={styles.heroStatRow}>
          <View>
            <Text style={styles.heroStatLabel}>Booked revenue</Text>
            <Text style={styles.heroStatValue}>{heroStatValue}</Text>
          </View>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View>
              <Text style={styles.heroStatLabel}>Close rate</Text>
              <Text style={styles.heroStatValue}>{formatPercent(metrics?.closeRate ?? null)}</Text>
            </View>
          )}
        </View>
        <View style={styles.heroBadges}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              Avg. deal
              {" "}
              {metrics?.averageDealSize != null
                ? formatCurrency(metrics.averageDealSize)
                : "—"}
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              Pipeline {formatCurrency(metrics?.pipelineValue ?? 0)}
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {metrics?.pipelineCount ?? 0} active {metrics?.pipelineCount === 1 ? "estimate" : "estimates"}
            </Text>
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Quick stats</Text>
        <View style={styles.grid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Jobs sold</Text>
            <Text style={styles.metricValue}>{metrics?.jobsSold ?? 0}</Text>
            <Text style={styles.metricHint}>Accepted estimates that became booked work.</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Avg. deal size</Text>
            <Text style={styles.metricValue}>
              {metrics?.averageDealSize != null
                ? formatCurrency(metrics.averageDealSize)
                : "—"}
            </Text>
            <Text style={styles.metricHint}>Average value of every accepted estimate.</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Pipeline value</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(metrics?.pipelineValue ?? 0)}
            </Text>
            <Text style={styles.metricHint}>Open sent estimates waiting for approval.</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Active estimates</Text>
            <Text style={styles.metricValue}>{metrics?.pipelineCount ?? 0}</Text>
            <Text style={styles.metricHint}>Deals currently in play with customers.</Text>
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Top customers</Text>
        <View style={styles.listCard}>
          {metrics && metrics.topCustomers.length > 0 ? (
            metrics.topCustomers.map((customer) => (
              <View key={`${customer.name}-${customer.total}`} style={styles.listItem}>
                <View style={styles.listItemLeft}>
                  <Text style={styles.listItemName}>{customer.name}</Text>
                  <Text style={styles.listItemMeta}>
                    {customer.jobs} {customer.jobs === 1 ? "job" : "jobs"} · {formatCurrency(customer.total)}
                  </Text>
                </View>
                <Text style={styles.listItemValue}>{formatCurrency(customer.total)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No customers yet. Send your first estimate to get started.</Text>
          )}
        </View>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Top job</Text>
        <View style={styles.topJobCard}>
          {metrics?.topJob ? (
            <>
              <Text style={styles.metricLabel}>Customer</Text>
              <Text style={styles.metricValue}>{metrics.topJob.customer}</Text>
              <Text style={styles.metricHint}>
                {`Status · ${formatStatus(metrics.topJob.status)}`}
              </Text>
              <Text style={styles.metricLabel}>Total</Text>
              <Text style={styles.metricValue}>{formatCurrency(metrics.topJob.total)}</Text>
              {metrics.topJob.date ? (
                <Text style={styles.metricHint}>
                  {new Date(metrics.topJob.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>Create or send an estimate to see your top-performing job.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
