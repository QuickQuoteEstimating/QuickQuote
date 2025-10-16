// app/(tabs)/estimates/[id].tsx
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

type LineItem = { id: string; name: string; qty: string; price: string };
type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export default function EstimateFormScreen() {
  const params = useLocalSearchParams<{ id?: string; mode?: string; customer_id?: string; name?: string }>();
  const router = useRouter();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();
  const { settings } = useSettings();
  const userId = user?.id ?? null;

  // ---------- stable state (no conditional hooks) ----------

const initialEstimateId = Array.isArray(params.id) ? params.id[0] : params.id || null;
const isNew = !initialEstimateId || (Array.isArray(params.mode) ? params.mode[0] : params.mode) === "new";
const [estimateId] = useState(initialEstimateId || uuidv4());
const [estimateNumber, setEstimateNumber] = useState<string>("001");

const [loading, setLoading] = useState<boolean>(true);
const [saving, setSaving] = useState(false);
const [sending, setSending] = useState(false);
const [previewing, setPreviewing] = useState(false);
const [deleting, setDeleting] = useState(false);

// ✅ Customer info states
const [customerId, setCustomerId] = useState<string | null>(null);
const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
const [customerName, setCustomerName] = useState<string>(
  Array.isArray(params.name) ? params.name[0] : params.name ?? ""
);
const [customerContact, setCustomerContact] = useState<{ email?: string | null; phone?: string | null }>({
  email: null,
  phone: null,
});

// ---------- main form fields ----------
const [description, setDescription] = useState("");
const [billingStreet, setBillingStreet] = useState("");
const [billingCity, setBillingCity] = useState("");
const [billingState, setBillingState] = useState("");
const [billingZip, setBillingZip] = useState("");

const [jobStreet, setJobStreet] = useState("");
const [jobCity, setJobCity] = useState("");
const [jobState, setJobState] = useState("");
const [jobZip, setJobZip] = useState("");
const [sameAddress, setSameAddress] = useState(true);

const [laborHoursText, setLaborHoursText] = useState("0");
const [notes, setNotes] = useState("");
const [taxMode, setTaxMode] = useState<"material" | "total" | "none">("material");

// ✅ Line items
const [items, setItems] = useState<LineItem[]>([]);

// ---------- handlers ----------
const handleCustomerSelect = (customer: any | null) => {
  if (!customer) {
    setCustomerId(null);
    setCustomerName("");
    setCustomerContact({ email: null, phone: null });
    setSelectedCustomer(null);
    return;
  }

  setCustomerId(customer.id);
  setCustomerName(customer.name || "Unnamed customer");
  setCustomerContact({ email: customer.email, phone: customer.phone });
  setSelectedCustomer(customer);

  // Prefill address fields when selecting
  setBillingStreet(customer.street ?? "");
  setBillingCity(customer.city ?? "");
  setBillingState(customer.state ?? "");
  setBillingZip(customer.zip ?? "");

  if (sameAddress) {
    setJobStreet(customer.street ?? "");
    setJobCity(customer.city ?? "");
    setJobState(customer.state ?? "");
    setJobZip(customer.zip ?? "");
  }
};

  // Derived numbers
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

  // ---------- helpers ----------
  const coalesceAddressFromSingleLine = (oneLine: string | null | undefined) => {
    if (!oneLine) return { street: "", city: "", state: "", zip: "" };
    const parts = oneLine.split(",").map((p) => p.trim());
    return {
      street: parts[0] ?? "",
      city: parts[1] ?? "",
      state: parts[2] ?? "",
      zip: parts[3] ?? "",
    };
  };

  const oneLineFromParts = (street: string, city: string, state: string, zip: string) =>
    [street, city, state, zip].filter(Boolean).join(", ");

  const loadCustomerIntoForm = useCallback(
    async (id: string) => {
      try {
        const db = await openDB();
        // Read what exists; don't assume columns. If not present, fall back to address string.
        const row = await db.getFirstAsync<any>(
          `SELECT id, name, email, phone, street, city, state, zip FROM customers WHERE id = ? LIMIT 1`,
          [id]
        ) as CustomerRow & { address?: string | null };

        if (!row) return;

        setCustomerName(row.name ?? "");
        setCustomerContact({ email: row.email ?? null, phone: row.phone ?? null });

        // Prefer split fields; fallback to parsing single-line address if needed
        let st = row.street ?? "";
        let ci = row.city ?? "";
        let stt = row.state ?? "";
        let zp = row.zip ?? "";

        if (!st && !ci && !stt && !zp && (row as any).address) {
          const parsed = coalesceAddressFromSingleLine((row as any).address);
          st = parsed.street;
          ci = parsed.city;
          stt = parsed.state;
          zp = parsed.zip;
        }

        const shouldPrefillBilling = !billingStreet && !billingCity && !billingState && !billingZip;
        if (shouldPrefillBilling) {
          setBillingStreet(st);
          setBillingCity(ci);
          setBillingState(stt);
          setBillingZip(zp);
        }

        if (sameAddress) {
          setJobStreet(st);
          setJobCity(ci);
          setJobState(stt);
          setJobZip(zp);
        }
      } catch (e) {
        console.warn("Could not prefill customer address", e);
      }
    },
    [billingStreet, billingCity, billingState, billingZip, sameAddress]
  );

  // ---------- load or create ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
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

        if (isNew) {
          // next estimate number
          const result = await db.getFirstAsync<{ lastNum: string }>(
            "SELECT estimate_number AS lastNum FROM estimates WHERE deleted_at IS NULL ORDER BY estimate_number DESC LIMIT 1"
          );
          const nextNum = result?.lastNum ? String(parseInt(result.lastNum, 10) + 1).padStart(3, "0") : "001";
          if (mounted) setEstimateNumber(nextNum);

          if (customerId) await loadCustomerIntoForm(customerId);
        } else {
          const est = await db.getFirstAsync<any>(
            `SELECT * FROM estimates WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
            [estimateId]
          );

          if (!est) {
            if (mounted) setLoading(false);
            return;
          }

          setEstimateNumber(est.estimate_number || "—");
          setDescription(est.description || "");
          setNotes(est.notes || "");

          // Prefill addresses
          const b = coalesceAddressFromSingleLine(est.billing_address ?? "");
          setBillingStreet(b.street);
          setBillingCity(b.city);
          setBillingState(b.state);
          setBillingZip(b.zip);

          const j = coalesceAddressFromSingleLine(est.job_address ?? "");
          setJobStreet(j.street);
          setJobCity(j.city);
          setJobState(j.state);
          setJobZip(j.zip);

          setSameAddress(est.billing_address && est.job_address && est.billing_address === est.job_address);

          if (est.customer_id) {
            setCustomerId(est.customer_id);
            await loadCustomerIntoForm(est.customer_id);
          }

          // Load line items if table exists; if not, skip silently
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

          const rows = await db.getAllAsync<{ id: string; description: string; quantity: number; unit_price: number }>(
            `SELECT id, description, quantity, unit_price
             FROM estimate_items
             WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
            [estimateId]
          );

          setItems(
            rows.map((r) => ({
              id: r.id,
              name: r.description,
              qty: String(r.quantity ?? 1),
              price: String(r.unit_price ?? 0),
            }))
          );
        }
      } catch (e) {
        console.error("Error loading estimate", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isNew, estimateId, customerId, loadCustomerIntoForm]);

  // keep job == billing when toggled on
  useEffect(() => {
    if (sameAddress) {
      setJobStreet(billingStreet);
      setJobCity(billingCity);
      setJobState(billingState);
      setJobZip(billingZip);
    }
  }, [sameAddress, billingStreet, billingCity, billingState, billingZip]);

  // ---------- item handlers ----------
  const addLineItem = () => setItems((p) => [...p, { id: uuidv4(), name: "", qty: "1", price: "0" }]);
  const updateItem = (id: string, field: "name" | "qty" | "price", value: string) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  // ---------- save ----------
  const saveEstimate = useCallback(async () => {
    if (!customerId) {
      Alert.alert("Validation", "Please select a customer first.");
      return;
    }

    const billingAddress = oneLineFromParts(billingStreet, billingCity, billingState, billingZip);
    const jobAddress = sameAddress ? billingAddress : oneLineFromParts(jobStreet, jobCity, jobState, jobZip);

    setSaving(true);
    try {
      const db = await openDB();
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

      const existing = await db.getFirstAsync<{ id: string }>(`SELECT id FROM estimates WHERE id = ? LIMIT 1`, [
        estimateId,
      ]);

      if (!existing) {
        await db.runAsync(
          `INSERT INTO estimates (id, user_id, customer_id, description, billing_address, job_address, subtotal, tax_rate, tax_total, total, notes, estimate_number, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          Object.values(estimateData)
        );
        await queueChange("estimates", "insert", sanitizeEstimateForQueue(estimateData));
      } else {
        await db.runAsync(
          `UPDATE estimates SET user_id=?, customer_id=?, description=?, billing_address=?, job_address=?, subtotal=?, tax_rate=?, tax_total=?, total=?, notes=?, estimate_number=?, updated_at=?, deleted_at=NULL WHERE id=?`,
          [
            userId,
            customerId,
            description,
            billingAddress,
            jobAddress,
            subtotal,
            taxRatePct,
            tax,
            total,
            notes,
            estimateNumber,
            now,
            estimateId,
          ]
        );
        await queueChange("estimates", "update", sanitizeEstimateForQueue(estimateData));
      }

      // persist items (simple replace)
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

      // soft-delete previous
      await db.runAsync(
        `UPDATE estimate_items SET deleted_at = CURRENT_TIMESTAMP WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
        [estimateId]
      );

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
  ]);

  // ---------- preview ----------
  const handlePreview = useCallback(async () => {
    try {
      setPreviewing(true);
      const billingAddress = oneLineFromParts(billingStreet, billingCity, billingState, billingZip);
      const jobAddress = sameAddress ? billingAddress : oneLineFromParts(jobStreet, jobCity, jobState, jobZip);

      const pdf = await renderEstimatePdf({
        estimate: {
          id: estimateId,
          estimate_number: estimateNumber,
          date: new Date().toISOString(),
          status: "Draft",
          notes,
          total,
          subtotal,
          taxTotal: tax,
          laborTotal,
          materialTotal: materialSubtotal,
          taxMode, // ✅ let the PDF show the “Tax Mode” label
          billingAddress,
          jobAddress,
          customer: {
            name: customerName,
            email: customerContact.email ?? null,
            phone: customerContact.phone ?? null,
            address: billingAddress,
          },
        } as any,
        items: items.map((i) => ({
          id: i.id,
          description: i.name,
          quantity: parseFloat(i.qty) || 0,
          unitPrice: parseFloat(i.price) || 0,
          total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
        })),
        // ✅ moved out of items and passed at the correct level
        termsAndConditions: settings.termsAndConditions,
        paymentDetails: settings.paymentDetails,
      });

      await Print.printAsync({ uri: pdf.uri });
    } catch (e) {
      console.error("Preview failed", e);
      Alert.alert("Error", "Unable to open PDF preview.");
    } finally {
      setPreviewing(false);
    }
  }, [
    estimateId,
    estimateNumber,
    customerName,
    customerContact,
    billingStreet,
    billingCity,
    billingState,
    billingZip,
    jobStreet,
    jobCity,
    jobState,
    jobZip,
    sameAddress,
    notes,
    total,
    subtotal,
    tax,
    laborTotal,
    materialSubtotal,
    taxMode,
    items,
    settings.termsAndConditions,
    settings.paymentDetails,
  ]);

  // ---------- share ----------
  const handleShare = useCallback(async () => {
    try {
      setSending(true);
      const billingAddress = oneLineFromParts(billingStreet, billingCity, billingState, billingZip);
      const jobAddress = sameAddress ? billingAddress : oneLineFromParts(jobStreet, jobCity, jobState, jobZip);

      const pdf = await renderEstimatePdf({
        estimate: {
          id: estimateId,
          estimate_number: estimateNumber,
          date: new Date().toISOString(),
          status: "Draft",
          notes,
          total,
          subtotal,
          taxTotal: tax,
          laborTotal,
          materialTotal: materialSubtotal,
          taxMode, // ✅ as above
          billingAddress,
          jobAddress,
          customer: {
            name: customerName,
            email: customerContact.email ?? null,
            phone: customerContact.phone ?? null,
            address: billingAddress,
          },
        } as any,
        items: items.map((i) => ({
          id: i.id,
          description: i.name,
          quantity: parseFloat(i.qty) || 0,
          unitPrice: parseFloat(i.price) || 0,
          total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
        })),
        // ✅ pass global sections here too
        termsAndConditions: settings.termsAndConditions,
        paymentDetails: settings.paymentDetails,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, { UTI: "com.adobe.pdf", mimeType: "application/pdf" });
      } else {
        await Print.printAsync({ uri: pdf.uri });
      }
      Alert.alert("Success", "Estimate PDF shared successfully.");
    } catch (e) {
      console.error("Share failed", e);
      Alert.alert("Error", "Unable to share this estimate.");
    } finally {
      setSending(false);
    }
  }, [
    estimateId,
    estimateNumber,
    customerName,
    customerContact,
    billingStreet,
    billingCity,
    billingState,
    billingZip,
    jobStreet,
    jobCity,
    jobState,
    jobZip,
    sameAddress,
    notes,
    total,
    subtotal,
    tax,
    laborTotal,
    materialSubtotal,
    taxMode,
    items,
    settings.termsAndConditions,
    settings.paymentDetails,
  ]);

  // ---------- delete ----------
  const handleDelete = useCallback(() => {
    Alert.alert("Delete Estimate", `Delete Estimate #${estimateNumber}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeleting(true);
            const db = await openDB();
            await db.runAsync(`UPDATE estimates SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [estimateId]);
            await queueChange("estimates", "delete", { id: estimateId });
            await runSync();
            Alert.alert("Deleted", `Estimate #${estimateNumber} deleted.`);
            router.replace("/(tabs)/estimates");
          } catch (e) {
            console.error("Delete failed", e);
            Alert.alert("Error", "Unable to delete estimate.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }, [estimateId, estimateNumber, router]);

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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Card style={styles.headerCard}>
            <Text style={styles.headerText}>{isNew ? "Creating Estimate" : "Editing Estimate"}</Text>
            <Text style={styles.headerSub}>Estimate #{estimateNumber || "—"}</Text>
            <Text style={styles.sectionTitle}>Customer</Text>
            <CustomerPicker selectedCustomer={customerId} onSelect={handleCustomerSelect} />
            <Text style={{ marginTop: 6, color: customerName ? "#374151" : "#9CA3AF" }}>
              {customerName ? `Selected: ${customerName}` : "No customer selected"}
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
                <Input label="Item" value={item.name} onChangeText={(v) => updateItem(item.id, "name", v)} />
                <View style={styles.row}>
                  <Input
                    label="Qty"
                    keyboardType="decimal-pad"
                    value={item.qty}
                    onChangeText={(v) => updateItem(item.id, "qty", v)}
                    style={styles.qtyInput}
                  />
                  <Input
                    label="Price"
                    keyboardType="decimal-pad"
                    value={item.price}
                    onChangeText={(v) => updateItem(item.id, "price", v)}
                    style={styles.priceInput}
                  />
                  <Button label="X" variant="ghost" onPress={() => removeItem(item.id)} />
                </View>
              </View>
            ))}
            <Button label="+ Add Line Item" onPress={addLineItem} variant="secondary" />

            <Text style={styles.sectionTitle}>Tax Settings</Text>
            <Picker
              selectedValue={taxMode}
              onValueChange={(v: "material" | "total" | "none") => setTaxMode(v)}
            >
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
              <Button label={saving ? "Saving…" : "Save"} onPress={() => Alert.alert("Save clicked")} loading={saving} style={styles.footerButton} />
              <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={styles.footerButton} />
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
    headerSub: { fontSize: 16, fontWeight: "500", color: colors.secondaryText, marginTop: 4, marginBottom: 8 },
    card: { gap: 16 },
    sameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontWeight: "700", marginTop: 10, marginBottom: 6, color: colors.secondaryText },
    lineItem: { marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyInput: { flex: 1 },
    priceInput: { flex: 1 },
    label: { color: colors.secondaryText },
    total: { fontSize: 18, fontWeight: "700", marginTop: 4 },
    footerContainer: { marginTop: 30, paddingBottom: 40, borderTopWidth: 1, borderColor: "#E5E7EB", gap: 12 },
    footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    footerButton: { flex: 1 },
    deleteButton: { marginTop: 10, backgroundColor: "#DC2626" },
  });
}
