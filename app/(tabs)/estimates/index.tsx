import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Card } from "../../../components/ui";
import { openDB } from "../../../lib/sqlite";
import { useThemeContext } from "../../../theme/ThemeProvider";
import { SafeAreaView } from "react-native-safe-area-context";


export default function EstimatesScreen() {
  const { theme } = useThemeContext();
  const { colors } = theme;
  const styles = createStyles(colors);
  const router = useRouter();

  const [estimates, setEstimates] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  // --- Load estimates with customer name
  useEffect(() => {
    (async () => {
      const db = await openDB();
      const rows = await db.getAllAsync(`
        SELECT 
          e.id,
          e.estimate_number,
          e.total,
          e.billing_address,
          e.job_address,
          c.name AS customer_name
        FROM estimates e
        LEFT JOIN customers c ON e.customer_id = c.id
        WHERE e.deleted_at IS NULL
        ORDER BY COALESCE(e.updated_at, '1970-01-01') DESC;
      `);
      setEstimates(rows);
    })();
  }, []);

  // --- Search filter
  const filtered = estimates.filter((e) => {
    const q = search.toLowerCase();
    const name = e.customer_name?.toLowerCase() ?? "";
    const estNum = e.estimate_number?.toLowerCase() ?? "";
    return name.includes(q) || estNum.includes(q);
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.container}>
        <Text style={styles.header}>Estimates</Text>

        <TextInput
          style={styles.search}
          placeholder="Search by estimate # or customer name..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.mutedText}
        />

        {filtered.length === 0 ? (
          <Text style={styles.empty}>No estimates found.</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/estimates/[id]",
                    params: { id: item.id },
                  })
                }
              >
                <Card style={styles.card}>
                  <Text style={styles.estimateNumber}>
                    Estimate #{item.estimate_number || "N/A"}
                  </Text>

                  {item.customer_name && (
                    <Text style={styles.customerName}>
                      {item.customer_name}
                    </Text>
                  )}

                  {(item.job_address || item.billing_address) && (
                    <Text style={styles.estimateAddress}>
                      {item.job_address || item.billing_address}
                    </Text>
                  )}

                  <Text style={styles.estimateTotal}>
                    Total: ${item.total?.toFixed(2) ?? "0.00"}
                  </Text>
                </Card>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
         <View style={{ padding: 16 }}>
        <Button
          label="+ Create Estimate"
          onPress={() => router.push("/(tabs)/estimates/new")}
        />
      </View>
      </View>
    </SafeAreaView>
  );
}

// --- Styles
function createStyles(colors: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    header: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.primaryText,
      marginBottom: 12,
    },
    search: {
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 12,
      borderColor: colors.border,
      borderWidth: 1,
      marginBottom: 16,
      color: colors.primaryText,
    },
    card: {
      marginVertical: 6,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    estimateNumber: {
      fontWeight: "700",
      fontSize: 16,
      color: colors.primaryText,
    },
    customerName: {
      fontSize: 14,
      color: colors.accent,
      marginTop: 2,
    },
    estimateAddress: {
      color: colors.secondaryText,
      marginTop: 4,
      fontSize: 13,
    },
    estimateTotal: {
      color: colors.mutedText,
      marginTop: 4,
      fontSize: 13,
    },
    empty: {
      textAlign: "center",
      color: colors.mutedText,
      marginTop: 40,
    },
  });
}
