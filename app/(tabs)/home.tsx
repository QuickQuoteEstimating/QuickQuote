import { Redirect, router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openDB } from "../../lib/sqlite";
import { BrandLogo } from "../../components/BrandLogo";
import {
  Badge,
  Body,
  Button,
  Card,
  ListItem,
  Title,
} from "../../components/ui";
import { Theme } from "../../theme";
import { useThemeContext } from "../../theme/ThemeProvider";
import { useAuth } from "../../context/AuthContext";

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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.xxl,
      backgroundColor: theme.colors.background,
    },
    heroCard: {
      backgroundColor: theme.colors.accentSoft,
      gap: theme.spacing.lg,
    },
    heroHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.lg,
    },
    heroText: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    heroTitle: {
      color: theme.colors.primaryText,
    },
    heroSummary: {
      color: theme.colors.mutedText,
    },
    heroStatsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    heroStatBlock: {
      gap: theme.spacing.xs,
    },
    heroStatLabel: {
      color: theme.colors.mutedText,
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    heroStatValue: {
      color: theme.colors.primaryText,
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
    },
    heroMetaItem: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.xxs,
    },
    heroMetaLabel: {
      color: theme.colors.mutedText,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: "600",
    },
    heroMetaValue: {
      color: theme.colors.secondaryText,
      fontWeight: "600",
    },
    sectionCard: {
      gap: theme.spacing.lg,
    },
    sectionHeading: {
      fontSize: 20,
      color: theme.colors.primaryText,
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.lg,
    },
    statItem: {
      flexGrow: 1,
      flexBasis: "48%",
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.md,
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    statLabel: {
      color: theme.colors.mutedText,
      fontSize: 12,
      textTransform: "uppercase",
      fontWeight: "600",
      letterSpacing: 0.6,
    },
    statValue: {
      color: theme.colors.primaryText,
      fontSize: 24,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    statHint: {
      color: theme.colors.mutedText,
    },
    listItem: {
      backgroundColor: theme.colors.surfaceAlt,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
    },
    listAmount: {
      color: theme.colors.primaryText,
    },
    emptyState: {
      color: theme.colors.mutedText,
    },
    topJobDetails: {
      gap: theme.spacing.md,
    },
    topJobHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    topJobTotal: {
      fontSize: 24,
      color: theme.colors.primaryText,
      fontWeight: "700",
    },
    statusBadge: {
      backgroundColor: theme.colors.accentSoft,
    },
    footer: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
  });
}

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
  const { theme } = useThemeContext();
const { session, isLoading } = useAuth();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      [currentYear],
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
       LIMIT 3`,
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
       LIMIT 1`,
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
    }, [loadMetrics]),
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
  const topPadding = Math.max(insets.top, theme.spacing.xl);
  const bottomPadding = Math.max(insets.bottom, theme.spacing.lg);

  if (isLoading) return null;
if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPadding, paddingBottom: bottomPadding + theme.spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refreshMetrics();
            }}
            tintColor={theme.colors.accent}
          />
        }
      >
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroText}>
              <Title style={styles.heroTitle}>Good to see you</Title>
              <Body style={styles.heroSummary}>{heroSummary}</Body>
            </View>
            <BrandLogo size={56} />
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatBlock}>
              <Body style={styles.heroStatLabel}>Booked revenue</Body>
              <Title style={styles.heroStatValue}>{heroStatValue}</Title>
            </View>
            {loading ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <View style={styles.heroStatBlock}>
                <Body style={styles.heroStatLabel}>Close rate</Body>
                <Title style={styles.heroStatValue}>
                  {formatPercent(metrics?.closeRate ?? null)}
                </Title>
              </View>
            )}
          </View>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Body style={styles.heroMetaLabel}>Avg. deal</Body>
              <Body style={styles.heroMetaValue}>
                {metrics?.averageDealSize != null
                  ? formatCurrency(metrics.averageDealSize)
                  : "—"}
              </Body>
            </View>
            <View style={styles.heroMetaItem}>
              <Body style={styles.heroMetaLabel}>Pipeline</Body>
              <Body style={styles.heroMetaValue}>
                {formatCurrency(metrics?.pipelineValue ?? 0)}
              </Body>
            </View>
            <View style={styles.heroMetaItem}>
              <Body style={styles.heroMetaLabel}>Active estimates</Body>
              <Body style={styles.heroMetaValue}>
                {metrics?.pipelineCount ?? 0}
              </Body>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Title style={styles.sectionHeading}>Quick stats</Title>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Body style={styles.statLabel}>Jobs sold</Body>
              <Title style={styles.statValue}>{metrics?.jobsSold ?? 0}</Title>
              <Body style={styles.statHint}>
                Accepted estimates that became booked work.
              </Body>
            </View>
            <View style={styles.statItem}>
              <Body style={styles.statLabel}>Avg. deal size</Body>
              <Title style={styles.statValue}>
                {metrics?.averageDealSize != null
                  ? formatCurrency(metrics.averageDealSize)
                  : "—"}
              </Title>
              <Body style={styles.statHint}>
                Average value of every accepted estimate.
              </Body>
            </View>
            <View style={styles.statItem}>
              <Body style={styles.statLabel}>Pipeline value</Body>
              <Title style={styles.statValue}>
                {formatCurrency(metrics?.pipelineValue ?? 0)}
              </Title>
              <Body style={styles.statHint}>
                Open sent estimates waiting for approval.
              </Body>
            </View>
            <View style={styles.statItem}>
              <Body style={styles.statLabel}>Active estimates</Body>
              <Title style={styles.statValue}>{metrics?.pipelineCount ?? 0}</Title>
              <Body style={styles.statHint}>
                Deals currently in play with customers.
              </Body>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Title style={styles.sectionHeading}>Top customers</Title>
          {metrics && metrics.topCustomers.length > 0 ? (
            metrics.topCustomers.map((customer) => (
              <ListItem
                key={`${customer.name}-${customer.total}`}
                title={customer.name}
                subtitle={`${customer.jobs} ${customer.jobs === 1 ? "job" : "jobs"}`}
                amount={formatCurrency(customer.total)}
                style={styles.listItem}
                amountStyle={styles.listAmount}
              />
            ))
          ) : (
            <Body style={styles.emptyState}>
              No customers yet. Send your first estimate to get started.
            </Body>
          )}
        </Card>

        <Card style={styles.sectionCard}>
          <Title style={styles.sectionHeading}>Top job</Title>
          {metrics?.topJob ? (
            <View style={styles.topJobDetails}>
              <View style={styles.topJobHeader}>
                <Body style={styles.statLabel}>Customer</Body>
                <Badge style={styles.statusBadge}>{formatStatus(metrics.topJob.status)}</Badge>
              </View>
              <Title style={styles.statValue}>{metrics.topJob.customer}</Title>
              <Body style={styles.statHint}>
                {metrics.topJob.date
                  ? new Date(metrics.topJob.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "Date not set"}
              </Body>
              <Body style={styles.statLabel}>Total</Body>
              <Title style={styles.topJobTotal}>
                {formatCurrency(metrics.topJob.total)}
              </Title>
            </View>
          ) : (
            <Body style={styles.emptyState}>
              Create or send an estimate to see your top-performing job.
            </Body>
          )}
        </Card>
      </ScrollView>

<View style={[styles.footer, { paddingBottom: bottomPadding }]}>
  <Button
    label="Create Estimate"
    onPress={() =>
      router.push({
        pathname: "/(tabs)/estimates/[id]",
        params: { id: "new", mode: "new" },
      })
    }
  />
</View>
</View>
  );
}