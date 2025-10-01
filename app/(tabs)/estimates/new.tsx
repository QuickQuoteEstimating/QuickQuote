import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { v4 as uuidv4 } from "uuid";

import { Button } from "../../../components/ui";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { openDB, queueChange } from "../../../lib/sqlite";
import { runSync } from "../../../lib/sync";
import { useTheme, type Theme } from "../../../lib/theme";

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 24,
    },
    messageContainer: {
      alignItems: "center",
      gap: 12,
      maxWidth: 420,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: theme.primaryText,
      textAlign: "center",
    },
    message: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.secondaryText,
      textAlign: "center",
    },
    button: {
      alignSelf: "stretch",
    },
  });
}

export default function NewEstimateScreen() {
  const { user, session } = useAuth();
  const { settings } = useSettings();
  const theme = useTheme();
  const navigation = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const startNewEstimate = async () => {
      const userId = user?.id ?? session?.user?.id ?? null;

      if (!userId) {
        setError("You need to be signed in to create a new estimate.");
        setCreating(false);
        return;
      }

      try {
        const db = await openDB();
        const estimateId = uuidv4();
        const now = new Date().toISOString();
        const defaultLaborRate = Math.max(0, Math.round((settings.hourlyRate ?? 0) * 100) / 100);
        const defaultTaxRate = Math.max(0, Math.round((settings.taxRate ?? 0) * 100) / 100);

        const newEstimate = {
          id: estimateId,
          user_id: userId,
          customer_id: null,
          date: null,
          total: 0,
          material_total: 0,
          labor_hours: 0,
          labor_rate: defaultLaborRate,
          labor_total: 0,
          subtotal: 0,
          tax_rate: defaultTaxRate,
          tax_total: 0,
          notes: null,
          status: "draft",
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

        void runSync().catch((syncError: unknown) => {
          console.warn("Failed to sync new estimate immediately", syncError);
        });

        if (cancelled) {
          return;
        }

        navigation.replace({
          pathname: "/(tabs)/estimates/[id]",
          params: { id: estimateId },
        });
      } catch (creationError) {
        console.error("Failed to create new estimate", creationError);
        if (cancelled) {
          return;
        }
        setError("We couldn't start a new estimate. Please try again.");
        setCreating(false);
        Alert.alert("Estimate", "We couldn't start a new estimate. Please try again.");
      }
    };

    startNewEstimate();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, settings.hourlyRate, settings.taxRate, user?.id]);

  if (creating && !error) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={theme.accent} />
        <View style={styles.messageContainer}>
          <Text style={styles.title}>Setting up your estimate</Text>
          <Text style={styles.message}>
            Hang tight— we&apos;re preparing a fresh estimate workspace with all the tools you need.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.messageContainer}>
        <Text style={styles.title}>Unable to create an estimate</Text>
        <Text style={styles.message}>
          {error ?? "Something went wrong while creating the estimate."}
        </Text>
        <Button label="Close" onPress={() => navigation.back()} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}
