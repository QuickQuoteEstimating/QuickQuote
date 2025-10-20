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
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { v4 as uuidv4 } from "uuid";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import CustomerPicker from "../../../components/CustomerPicker";
import { useAuth } from "../../../context/AuthContext";
import { useThemeContext } from "../../../theme/ThemeProvider";
import { openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import { Button, Card, Input } from "../../../components/ui";
import type { Theme } from "../../../theme";
import { renderEstimatePdf } from "../../../lib/pdf";
import { useSettings } from "../../../context/SettingsContext";

// ---------- helpers ----------
const formatCurrency = (value: number): string => `$${(value || 0).toFixed(2)}`;
const oneLineFromParts = (street: string, city: string, state: string, zip: string) =>
  [street, city, state, zip].filter(Boolean).join(", ");

type LineItem = { id: string; name: string; qty: string; price: string };

export default function EstimateFormScreen() {
  const params = useLocalSearchParams<{ id?: string; mode?: string; customer?: string }>();
  const prefillCustomer = params.customer ? JSON.parse(params.customer as string) : null;
  const router = useRouter();

  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();
  const { settings } = useSettings();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ----- Estimate & Customer Data -----
  const [estimateId] = useState<string>(uuidv4());
  const [estimateNumber, setEstimateNumber] = useState<string>("001");

  const [customerId, setCustomerId] = useState(prefillCustomer?.id ?? null);
  const [customerName, setCustomerName] = useState(prefillCustomer?.name ?? "");
  const [customerContact, setCustomerContact] = useState({
    email: prefillCustomer?.email ?? null,
    phone: prefillCustomer?.phone ?? null,
  });

  const [billingStreet, setBillingStreet] = useState(prefillCustomer?.street ?? "");
  const [billingCity, setBillingCity] = useState(prefillCustomer?.city ?? "");
  const [billingState, setBillingState] = useState(prefillCustomer?.state ?? "");
  const [billingZip, setBillingZip] = useState(prefillCustomer?.zip ?? "");

  const [jobStreet, setJobStreet] = useState(prefillCustomer?.street ?? "");
  const [jobCity, setJobCity] = useState(prefillCustomer?.city ?? "");
  const [jobState, setJobState] = useState(prefillCustomer?.state ?? "");
  const [jobZip, setJobZip] = useState(prefillCustomer?.zip ?? "");
  const [sameAddress, setSameAddress] = useState(true);

  const [description, setDescription] = useState("");
  const [laborHoursText, setLaborHoursText] = useState("0");
  const [notes, setNotes] = useState("");
  const [taxMode, setTaxMode] = useState<"material" | "total" | "none">("material");

  const [items, setItems] = useState<LineItem[]>([]);

  // ---------- Derived Amounts ----------
  const laborHours = Math.max(0, parseFloat(laborHoursText) || 0);
  const laborRate = settings.hourlyRate || 0;
  const laborTotal = laborHours * laborRate;
  const materialSubtotal = items.reduce((sum, i) => {
    const q = parseFloat(i.qty) || 0;
    const p = parseFloat(i.price) || 0;
    return sum + q * p;
  }, 0);
  const subtotal = materialSubtotal + laborTotal;
  const taxRatePct = settings.taxRate || 0;
  const tax =
    taxMode === "none"
      ? 0
      : taxMode === "material"
      ? materialSubtotal * (taxRatePct / 100)
      : subtotal * (taxRatePct / 100);
  const total = subtotal + tax;

  // ---------- Load latest estimate number ----------
  useEffect(() => {
    (async () => {
      const db = await openDB();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS estimates (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          customer_id TEXT,
          description TEXT,
          billing_address TEXT,
          job_address TEXT,
          subtotal REAL,
          tax_rate REAL,
          tax_total REAL,
          total REAL,
          notes TEXT,
          estimate_number TEXT,
          updated_at TEXT,
          deleted_at TEXT
        );
      `);

      const result = await db.getFirstAsync<{ lastNum: string }>(
        "SELECT estimate_number AS lastNum FROM estimates WHERE deleted_at IS NULL ORDER BY estimate_number DESC LIMIT 1"
      );
      const nextNum = result?.lastNum
        ? String(parseInt(result.lastNum, 10) + 1).padStart(3, "0")
        : "001";
      setEstimateNumber(nextNum);
      setLoading(false);
    })();
  }, []);

  // ---------- Handlers ----------
  const addLineItem = () =>
    setItems((p) => [...p, { id: uuidv4(), name: "", qty: "1", price: "0" }]);
  const updateItem = (id: string, field: "name" | "qty" | "price", value: string) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  const handleSave = useCallback(async () => {
    if (!customerId) {
      Alert.alert("Missing Info", "Please select or add a customer first.");
      return;
    }

    const billingAddress = oneLineFromParts(
      billingStreet,
      billingCity,
      billingState,
      billingZip
    );
    const jobAddress = sameAddress
      ? billingAddress
      : oneLineFromParts(jobStreet, jobCity, jobState, jobZip);

    const now = new Date().toISOString();

    const estimateData = {
      id: estimateId,
      user_id: userId,
      customer_id: customerId,
      description,
      billing_address: billingAddress,
      job_address: jobAddress,
      subtotal,
      tax_rate: taxRatePct,
      tax_total: tax,
      total,
      notes,
      estimate_number: estimateNumber,
      updated_at: now,
      deleted_at: null as string | null,
    };

    try {
      setSaving(true);
      const db = await openDB();

      await db.runAsync(
        `INSERT INTO estimates (id, user_id, customer_id, description, billing_address, job_address, subtotal, tax_rate, tax_total, total, notes, estimate_number, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Object.values(estimateData)
      );

      await queueChange("estimates", "insert", sanitizeEstimateForQueue(estimateData));

      // Create estimate_items table if not exists
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS estimate_items (
          id TEXT PRIMARY KEY,
          estimate_id TEXT NOT NULL,
          description TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit_price REAL NOT NULL,
          base_total REAL NOT NULL DEFAULT 0,
          total REAL NOT NULL,
          apply_markup INTEGER NOT NULL DEFAULT 1,
          catalog_item_id TEXT,
          version INTEGER DEFAULT 1,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT
        );
      `);

      // Insert all line items
      for (const i of items) {
        const q = parseFloat(i.qty) || 0;
        const p = parseFloat(i.price) || 0;
        const lineTotal = q * p;
        const id = uuidv4();
        await db.runAsync(
          `INSERT INTO estimate_items (id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
          [id, estimateId, i.name, q, p, lineTotal, lineTotal]
        );
        await queueChange("estimate_items", "insert", {
          id,
          estimate_id: estimateId,
          description: i.name,
          quantity: q,
          unit_price: p,
          base_total: lineTotal,
          total: lineTotal,
          apply_markup: 1,
        });
      }

      await runSync();

      Alert.alert("Saved", `Estimate #${estimateNumber} saved successfully.`);
      router.replace("/(tabs)/estimates");
    } catch (e) {
      console.error("Save failed", e);
      Alert.alert("Error", "Unable to save this estimate.");
    } finally {
      setSaving(false);
    }
  }, [
    estimateId,
    estimateNumber,
    userId,
    customerId,
    description,
    billingStreet,
    billingCity,
    billingState,
    billingZip,
    jobStreet,
    jobCity,
    jobState,
    jobZip,
    sameAddress,
    subtotal,
    taxRatePct,
    tax,
    total,
    notes,
    items,
    router,
  ]);

  // ---------- UI ----------
  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={{ marginTop: 10 }}>Loading estimate...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.headerCard}>
            <Text style={styles.headerText}>Creating Estimate</Text>
            <Text style={styles.headerSub}>Estimate #{estimateNumber}</Text>

            <Text style={styles.sectionTitle}>Customer</Text>
            <CustomerPicker selectedCustomer={customerId} onSelect={() => {}} />
            <Text style={{ marginTop: 6, color: customerName ? "#374151" : "#9CA3AF" }}>
              {customerName
                ? `Selected: ${customerName}`
                : "No customer selected"}
            </Text>
          </Card>

          <Card style={styles.card}>
            <Input
              label="Description of Work"
              placeholder="e.g. Replace garage door springs"
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <Text style={styles.sectionTitle}>Billing Address</Text>
            <Input label="Street" value={billingStreet} onChangeText={setBillingStreet} />
            <Input label="City" value={billingCity} onChangeText={setBillingCity} />
            <Input label="State" value={billingState} onChangeText={setBillingState} />
            <Input label="ZIP" value={billingZip} onChangeText={setBillingZip} />

            <View style={styles.sameRow}>
              <Text style={styles.label}>Job address same as billing</Text>
              <Switch value={sameAddress} onValueChange={setSameAddress} />
            </View>

            {!sameAddress && (
              <>
                <Text style={styles.sectionTitle}>Job Address</Text>
                <Input label="Street" value={jobStreet} onChangeText={setJobStreet} />
                <Input label="City" value={jobCity} onChangeText={setJobCity} />
                <Input label="State" value={jobState} onChangeText={setJobState} />
                <Input label="ZIP" value={jobZip} onChangeText={setJobZip} />
              </>
            )}

            <Text style={styles.sectionTitle}>Labor</Text>
            <Input
              label={`Labor Hours (Rate ${formatCurrency(laborRate)}/hr)`}
              value={laborHoursText}
              onChangeText={setLaborHoursText}
              keyboardType="decimal-pad"
            />
            <Text style={{ marginTop: -6, marginBottom: 8, color: "#6B7280" }}>
              Labor Total: {formatCurrency(laborTotal)}
            </Text>

            <Text style={styles.sectionTitle}>Line Items</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.lineItem}>
                <Input
                  label="Item"
                  value={item.name}
                  onChangeText={(v) => updateItem(item.id, "name", v)}
                />
                <View style={styles.row}>
  <Input
    label="Qty"
    keyboardType="decimal-pad"
    value={item.qty}
    onChangeText={(v) => updateItem(item.id, "qty", v)}
    containerStyle={styles.qtyInput}     // 👈 use containerStyle
    inputStyle={styles.numericInput}     // optional: right-align numbers
  />
  <Input
    label="Price"
    keyboardType="decimal-pad"
    value={item.price}
    onChangeText={(v) => updateItem(item.id, "price", v)}
    containerStyle={styles.priceInput}   // 👈 use containerStyle
    inputStyle={styles.numericInput}
  />
  <Button label="X" variant="ghost" onPress={() => removeItem(item.id)} />
</View>


              </View>
            ))}
            <Button label="+ Add Line Item" onPress={addLineItem} variant="secondary" />

            <Text style={styles.sectionTitle}>Tax Settings</Text>
            <Picker selectedValue={taxMode} onValueChange={(v) => setTaxMode(v)}>
              <Picker.Item label="Tax on Material" value="material" />
              <Picker.Item label="Tax on Total" value="total" />
              <Picker.Item label="Tax Exempt" value="none" />
            </Picker>

            <Text style={styles.sectionTitle}>Summary</Text>
            <Text>Materials: {formatCurrency(materialSubtotal)}</Text>
            <Text>Labor: {formatCurrency(laborTotal)}</Text>
            <Text>Subtotal: {formatCurrency(subtotal)}</Text>
            <Text>Tax: {formatCurrency(tax)}</Text>
            <Text style={styles.total}>Total: {formatCurrency(total)}</Text>

            <Input
              label="Notes"
              placeholder="Add any additional notes"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Card>

          <View style={styles.footerContainer}>
            <View style={styles.footerRow}>
              <Button
                label={saving ? "Saving…" : "Save"}
                onPress={handleSave}
                loading={saving}
                style={styles.footerButton}
              />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => router.back()}
                style={styles.footerButton}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: 16, paddingBottom: 220 },
    loadingState: { flex: 1, justifyContent: "center", alignItems: "center" },
    headerCard: { marginBottom: 16, padding: 12 },
    headerText: { fontSize: 18, fontWeight: "700", color: colors.primaryText },
    headerSub: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.secondaryText,
      marginTop: 4,
      marginBottom: 8,
    },
    card: { gap: 16 },
    sameRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      fontWeight: "700",
      marginTop: 10,
      marginBottom: 6,
      color: colors.secondaryText,
    },
    lineItem: { marginBottom: 12 },
row: {
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 8,
},

// Width is applied to the outer bubble via containerStyle
qtyInput: {
  flex: 1.1,
  minWidth: 90,
},

priceInput: {
  flex: 1.6,
  minWidth: 130,
},

// Optional: make numeric text easier to read
numericInput: {
  textAlign: "right",
},

    label: { color: colors.secondaryText },
    total: { fontSize: 18, fontWeight: "700", marginTop: 4 },
    footerContainer: {
      marginTop: 30,
      paddingBottom: 40,
      borderTopWidth: 1,
      borderColor: "#E5E7EB",
      gap: 12,
    },
    footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    footerButton: { flex: 1 },
    deleteButton: { marginTop: 10, backgroundColor: "#DC2626" },

    
  });
}
