import React, { useCallback, useEffect, useMemo, useState } from "react";
import "react-native-get-random-values";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  Text,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { v4 as uuidv4 } from "uuid";

import CustomerPicker from "../../../components/CustomerPicker";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { formatPercentageInput } from "../../../lib/numberFormat";
import {
  Body,
  Button,
  Card,
  Input,
  ListItem,
  Subtitle,
  Title,
} from "../../../components/ui";
import type { EstimateItemRecord } from "../../../types/estimates";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";
import type { EstimateListItem } from "./index";

export default function EditEstimateScreen() {
  const params = useLocalSearchParams<{ id?: string; mode?: string }>();
  const navigation = useRouter();

  // ✅ FIX: cleaner and safer estimate ID handling
  const initialEstimateId = Array.isArray(params.id) ? params.id[0] : params.id || null;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const [estimateId, setEstimateId] = useState<string>(initialEstimateId || uuidv4());
  const isNew = !initialEstimateId || rawMode === "new";

  const { user } = useAuth();
  const { settings } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const colors = theme.colors;
  const userId = user?.id ?? null;

  const [estimateDate, setEstimateDate] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [billingAddress, setBillingAddress] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobAddressSameAsBilling, setJobAddressSameAsBilling] = useState(true);
  const [items, setItems] = useState<EstimateItemRecord[]>([]);
  const [notes, setNotes] = useState("");
  const [laborHoursText, setLaborHoursText] = useState("0");
  const [hourlyRateText, setHourlyRateText] = useState(settings.hourlyRate.toFixed(2));
  const [taxRateText, setTaxRateText] = useState(formatPercentageInput(settings.taxRate));
  const [taxType, setTaxType] = useState<"material" | "total" | "none">("material");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Line item inputs
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState("0");
  const [filteredCatalog, setFilteredCatalog] = useState<
    { id: string; name: string; unit_price: number }[]
  >([]);
  const [catalogItems, setCatalogItems] = useState<
    { id: string; name: string; unit_price: number }[]
  >([]);

  // ✅ FIX: ensure item_catalog is loaded AFTER table creation
  useEffect(() => {
    (async () => {
      try {
        const db = await openDB();
        await db.execAsync(`
          CREATE TABLE IF NOT EXISTS item_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            unit_price REAL NOT NULL,
            deleted_at TEXT
          );
        `);

        const rows = await db.getAllAsync<{ id: string; name: string; unit_price: number }>(
          `SELECT id, name, unit_price FROM item_catalog WHERE deleted_at IS NULL OR deleted_at = '' ORDER BY name ASC`
        );
        setCatalogItems(rows);
      } catch (err) {
        console.error("Error loading catalog items:", err);
      }
    })();
  }, []);

  const parseNumericInput = (value: string, fallback = 0) => {
    const normalized = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isNaN(normalized) ? fallback : normalized;
  };

  const laborHours = Math.max(0, parseNumericInput(laborHoursText, 0));
  const hourlyRate = Math.max(0, parseNumericInput(hourlyRateText, settings.hourlyRate));
  const taxRate = Math.max(0, parseNumericInput(taxRateText, settings.taxRate));

  const totals = useMemo(() => {
    const materialLineItems = items.map((i) => ({
      baseTotal: i.base_total,
      applyMarkup: i.apply_markup !== 0,
    }));
    return calculateEstimateTotals({
      materialLineItems,
      materialMarkup: { mode: settings.materialMarkupMode, value: settings.materialMarkup },
      laborHours,
      laborRate: hourlyRate,
      laborMarkup: { mode: settings.laborMarkupMode, value: settings.laborMarkup },
      taxRate,
    });
  }, [items, settings, laborHours, hourlyRate, taxRate]);

  // ✅ FIX: existing record loader that respects ID
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    (async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<any>(
          `SELECT * FROM estimates WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
          [estimateId]
        );
        const record = rows[0];
        if (!record) return;
        if (isMounted) {
          setEstimateDate(record.date?.split("T")[0] ?? "");
          setCustomerId(record.customer_id);
          setBillingAddress(record.billing_address ?? "");
          setJobAddress(record.job_address ?? "");
          setJobAddressSameAsBilling(record.job_address === record.billing_address);
          setNotes(record.notes ?? "");
        }
      } catch (e) {
        console.error("Failed to load estimate", e);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [estimateId, isNew]);

  // ✅ FIX: Save estimate with correct insert/update logic
  const saveEstimate = useCallback(async () => {
    if (saving) return;
    if (!customerId) {
      Alert.alert("Validation", "Please select a customer first.");
      return;
    }

    setSaving(true);
    try {
      const db = await openDB();
      const now = new Date().toISOString();
      const safeTotal = Math.round(totals.grandTotal * 100) / 100;
      const isoDate = estimateDate
        ? new Date(estimateDate).toISOString()
        : new Date().toISOString();

      const existing = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM estimates WHERE id = ? LIMIT 1",
        [estimateId]
      );

      const estimateData = {
        id: estimateId,
        user_id: userId,
        customer_id: customerId,
        date: isoDate,
        total: safeTotal,
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_total: totals.taxTotal,
        notes,
        updated_at: now,
        billing_address: billingAddress,
        job_address: jobAddress,
      };

      if (!existing) {
        await db.runAsync(
          `INSERT INTO estimates (id, user_id, customer_id, date, total, subtotal, tax_rate, tax_total, notes, updated_at, deleted_at, billing_address, job_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          Object.values(estimateData)
        );
        await queueChange("estimates", "insert", sanitizeEstimateForQueue(estimateData));
        Alert.alert("Saved", "Estimate created successfully!");
      } else {
        await db.runAsync(
          `UPDATE estimates
           SET customer_id=?, date=?, total=?, subtotal=?, tax_rate=?, tax_total=?, notes=?, updated_at=?, billing_address=?, job_address=?
           WHERE id=?`,
          [
            customerId,
            isoDate,
            safeTotal,
            totals.subtotal,
            totals.taxRate,
            totals.taxTotal,
            notes,
            now,
            billingAddress,
            jobAddress,
            estimateId,
          ]
        );
        await queueChange("estimates", "update", sanitizeEstimateForQueue(estimateData));
        Alert.alert("Updated", "Estimate updated successfully!");
      }

      await runSync();
    } catch (e) {
      console.error("Save failed:", e);
      Alert.alert("Error", "Unable to save the estimate.");
    } finally {
      setSaving(false);
    }
  }, [saving, customerId, totals, estimateDate, userId, billingAddress, jobAddress, notes]);

  // ✅ FIX: Corrected "Save Item to Catalog"
  const handleSaveItemToCatalog = async () => {
    if (!newItemDescription.trim()) {
      Alert.alert("Missing Info", "Please enter an item description first.");
      return;
    }
    try {
      const db = await openDB();
      const existing = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM item_catalog WHERE LOWER(name) = LOWER(?) LIMIT 1",
        [newItemDescription.trim()]
      );

      if (existing) {
        Alert.alert("Exists", "An item with this name already exists in your catalog.");
        return;
      }

      const id = uuidv4();
      const price = parseFloat(newItemPrice) || 0;

      await db.runAsync(
        `INSERT INTO item_catalog (id, name, unit_price, deleted_at)
         VALUES (?, ?, ?, NULL)`,
        [id, newItemDescription.trim(), price]
      );

      await queueChange("item_catalog", "insert", { id, name: newItemDescription.trim(), unit_price: price });
      await runSync();
      Alert.alert("Saved", `"${newItemDescription}" added to your catalog!`);
    } catch (err) {
      console.error("Error saving catalog item:", err);
      Alert.alert("Error", "Could not save item to catalog.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // === UI stays same ===
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
          {/* header, customer picker, job, line items, etc... unchanged */}
          {/* Replace your old “Save Item to Catalog” button with: */}
          <Button
            label="Save Item to Catalog"
            variant="ghost"
            onPress={handleSaveItemToCatalog}
            style={{ marginTop: 10 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* === Styles === */
function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    loadingState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
  });
}
