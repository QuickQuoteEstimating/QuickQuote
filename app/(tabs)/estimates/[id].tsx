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
import { useSettings } from "../../../context/SettingsContext";
import { useThemeContext } from "../../../theme/ThemeProvider";
import { openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import { Button, Card, Input } from "../../../components/ui";
import type { Theme } from "../../../theme";
import { renderEstimatePdf } from "../../../lib/pdf";

// ---------- helpers ----------
const formatCurrency = (value: number): string => `$${(value || 0).toFixed(2)}`;

type LineItem = { id: string; name: string; qty: string; price: string };

type CustomerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

// =========================================
// Estimate Form
// =========================================
export default function EstimateFormScreen() {
  const params = useLocalSearchParams<{
    id?: string;
    mode?: string;
    customer_id?: string;
    name?: string;
  }>();
  const router = useRouter();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { user } = useAuth();
  const { settings } = useSettings();

  const userId = user?.id ?? null;
  const initialEstimateId = Array.isArray(params.id) ? params.id[0] : params.id || null;
  const isNew = !initialEstimateId || (Array.isArray(params.mode) ? params.mode[0] : params.mode) === "new";

  const [estimateId] = useState(initialEstimateId || uuidv4());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Customer state
  const [customerId, setCustomerId] = useState<string | null>(
    Array.isArray(params.customer_id) ? params.customer_id[0] : params.customer_id ?? null
  );
  const [customerName, setCustomerName] = useState(
    Array.isArray(params.name) ? params.name[0] : params.name ?? ""
  );
  const [customerContact, setCustomerContact] = useState<{ email?: string | null; phone?: string | null }>({});

  // Main form fields
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

  // Line items
  const [items, setItems] = useState<LineItem[]>([]);

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

  // ---------- load helper ----------
  const loadCustomerIntoForm = useCallback(async (id: string) => {
    try {
      const db = await openDB();
      const row = await db.getFirstAsync<CustomerRow>(
        `SELECT id, name, email, phone, street, city, state, zip FROM customers WHERE id = ? LIMIT 1`,
        [id]
      );
      if (!row) return;

      setCustomerName(row.name ?? "");
      setCustomerContact({ email: row.email, phone: row.phone });

      // Prefill billing address only if blank
      const shouldPrefill =
        !billingStreet && !billingCity && !billingState && !billingZip;

      if (shouldPrefill) {
        setBillingStreet(row.street ?? "");
        setBillingCity(row.city ?? "");
        setBillingState(row.state ?? "");
        setBillingZip(row.zip ?? "");
      }

      // If job same as billing, mirror too
      if (sameAddress) {
        setJobStreet(row.street ?? "");
        setJobCity(row.city ?? "");
        setJobState(row.state ?? "");
        setJobZip(row.zip ?? "");
      }
    } catch (e) {
      console.warn("Could not prefill customer address", e);
    }
  }, [billingStreet, billingCity, billingState, billingZip, sameAddress]);

  // ---------- load existing estimate ----------
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      if (customerId) {
        // Prefill from passed customer
        loadCustomerIntoForm(customerId);
      }
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const db = await openDB();
        const est = await db.getFirstAsync<any>(
          `SELECT * FROM estimates WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
          [estimateId]
        );
        if (!est) {
          setLoading(false);
          return;
        }

        if (!mounted) return;

        setCustomerId(est.customer_id ?? null);
        if (est.description) setDescription(est.description);

        // Addresses are single-line "street, city, state, zip"
        const fillFromOneLine = (value: string | null, setter: (segments: string[]) => void) => {
          const parts = (value ?? "").split(",").map((p: string) => p.trim());
          setter(parts);
        };

        if (est.billing_address) {
          fillFromOneLine(est.billing_address, ([st, c, s, z]) => {
            setBillingStreet(st ?? "");
            setBillingCity(c ?? "");
            setBillingState(s ?? "");
            setBillingZip(z ?? "");
          });
        }

        if (est.job_address) {
          fillFromOneLine(est.job_address, ([st, c, s, z]) => {
            setJobStreet(st ?? "");
            setJobCity(c ?? "");
            setJobState(s ?? "");
            setJobZip(z ?? "");
          });
        }

        // If equal, toggle sameAddress
        const a = [est.billing_address ?? "", est.job_address ?? ""].map((x) => (x || "").trim());
        setSameAddress(a[0] && a[0] === a[1]);

        // labor hours (if stored as notes or extra field later — for now derive from totals if possible)
        setLaborHoursText("0");

        setNotes(est.notes ?? "");

        // Load line items (if table exists)
        try {
          await db.execAsync(`
            CREATE TABLE IF NOT EXISTS estimate_items (
              id TEXT PRIMARY KEY,
              estimate_id TEXT NOT NULL,
              description TEXT NOT NULL,
              quantity INTEGER NOT NULL,
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

          const rows = await db.getAllAsync<{
            id: string;
            description: string;
            quantity: number;
            unit_price: number;
          }>(
            `SELECT id, description, quantity, unit_price
             FROM estimate_items
             WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
            [estimateId]
          );

          setItems(
            rows.map((r) => ({
              id: r.id,
              name: r.description,
              qty: String(r.quantity),
              price: String(r.unit_price),
            }))
          );
        } catch {
          // ignore
        }

        // resolve customer display/details
        if (est.customer_id) {
          await loadCustomerIntoForm(est.customer_id);
        }
      } catch (e) {
        console.error("Failed to load estimate", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [estimateId, isNew, customerId, loadCustomerIntoForm]);

  // When sameAddress toggles on, mirror billing → job
  useEffect(() => {
    if (sameAddress) {
      setJobStreet(billingStreet);
      setJobCity(billingCity);
      setJobState(billingState);
      setJobZip(billingZip);
    }
  }, [sameAddress, billingStreet, billingCity, billingState, billingZip]);

  // ---------- item handlers ----------
  const addLineItem = () => {
    setItems((prev) => [...prev, { id: uuidv4(), name: "", qty: "1", price: "0" }]);
  };
  const updateItem = (id: string, field: "name" | "qty" | "price", value: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };
  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // ---------- save ----------
  const saveEstimate = useCallback(async () => {
    if (!customerId) {
      Alert.alert("Validation", "Please select a customer first.");
      return;
    }

    const billingAddress = [billingStreet, billingCity, billingState, billingZip]
      .filter(Boolean)
      .join(", ");
    const jobAddress = sameAddress
      ? billingAddress
      : [jobStreet, jobCity, jobState, jobZip].filter(Boolean).join(", ");

    setSaving(true);
    try {
      const db = await openDB();
      const now = new Date().toISOString();

      // ensure tables
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
          updated_at TEXT,
          deleted_at TEXT
        );
      `);

      // upsert estimate
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
        updated_at: now,
        deleted_at: null as string | null,
      };

      const existing = await db.getFirstAsync<{ id: string }>(
        "SELECT id FROM estimates WHERE id = ? LIMIT 1",
        [estimateId]
      );

      if (!existing) {
        await db.runAsync(
          `INSERT INTO estimates (id, user_id, customer_id, description, billing_address, job_address, subtotal, tax_rate, tax_total, total, notes, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          Object.values(estimateData)
        );
        await queueChange("estimates", "insert", sanitizeEstimateForQueue(estimateData));
      } else {
        await db.runAsync(
          `UPDATE estimates SET
           user_id=?, customer_id=?, description=?, billing_address=?, job_address=?, subtotal=?, tax_rate=?, tax_total=?, total=?, notes=?, updated_at=?, deleted_at=NULL
           WHERE id=?`,
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
            now,
            estimateId,
          ]
        );
        await queueChange("estimates", "update", sanitizeEstimateForQueue(estimateData));
      }

      // persist line items (simple replace strategy)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS estimate_items (
          id TEXT PRIMARY KEY,
          estimate_id TEXT NOT NULL,
          description TEXT NOT NULL,
          quantity INTEGER NOT NULL,
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

      // soft-delete existing, then reinsert all current items
      await db.runAsync(
        `UPDATE estimate_items
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')`,
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

      Alert.alert("Saved", "Your estimate has been saved.");
      // Stay on screen (choice B)
    } catch (e) {
      console.error("Save failed", e);
      Alert.alert("Error", "Unable to save this estimate.");
    } finally {
      setSaving(false);
    }
  }, [
    customerId,
    estimateId,
    userId,
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

      const billingAddress = [billingStreet, billingCity, billingState, billingZip].filter(Boolean).join(", ");
      const jobAddress = sameAddress
        ? billingAddress
        : [jobStreet, jobCity, jobState, jobZip].filter(Boolean).join(", ");

      const pdf = await renderEstimatePdf({
        estimate: {
          id: estimateId,
          date: new Date().toISOString(),
          status: "Draft",
          notes,
          total,
          subtotal,
          taxTotal: tax,
          laborTotal,
          materialTotal: materialSubtotal,
          tax_rate: taxRatePct as any, // compatible with your renderer
          billingAddress,
          jobAddress,
          customer: {
            name: customerName,
            email: customerContact.email ?? null,
            phone: customerContact.phone ?? null,
            address: [billingStreet, billingCity, billingState, billingZip].filter(Boolean).join(", "),
          },
        } as any,
        items: items.map((i) => ({
          id: i.id,
          description: i.name,
          quantity: parseFloat(i.qty) || 0,
          unitPrice: parseFloat(i.price) || 0,
          total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
        })),
      });

      await Print.printAsync({ uri: pdf.uri });
    } catch (e) {
      console.error("Preview failed", e);
      Alert.alert("Error", "Could not open PDF preview.");
    } finally {
      setPreviewing(false);
    }
  }, [
    estimateId,
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
    taxRatePct,
    laborTotal,
    materialSubtotal,
    items,
  ]);

  // ---------- share ----------
  const handleShare = useCallback(async () => {
    Alert.alert(
      "Send to Customer",
      "Generate and share this estimate PDF?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setSending(true);

              const billingAddress = [billingStreet, billingCity, billingState, billingZip].filter(Boolean).join(", ");
              const jobAddress = sameAddress
                ? billingAddress
                : [jobStreet, jobCity, jobState, jobZip].filter(Boolean).join(", ");

              const pdf = await renderEstimatePdf({
                estimate: {
                  id: estimateId,
                  date: new Date().toISOString(),
                  status: "Draft",
                  notes,
                  total,
                  subtotal,
                  taxTotal: tax,
                  laborTotal,
                  materialTotal: materialSubtotal,
                  billingAddress,
                  jobAddress,
                  customer: {
                    name: customerName,
                    email: customerContact.email ?? null,
                    phone: customerContact.phone ?? null,
                    address: [billingStreet, billingCity, billingState, billingZip].filter(Boolean).join(", "),
                  },
                } as any,
                items: items.map((i) => ({
                  id: i.id,
                  description: i.name,
                  quantity: parseFloat(i.qty) || 0,
                  unitPrice: parseFloat(i.price) || 0,
                  total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
                })),
              });

              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdf.uri, {
                  UTI: "com.adobe.pdf",
                  mimeType: "application/pdf",
                });
              } else {
                await Print.printAsync({ uri: pdf.uri });
              }
            } catch (e) {
              console.error("Share failed", e);
              Alert.alert("Error", "Could not share the estimate PDF.");
            } finally {
              setSending(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [
    estimateId,
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
    materialSubtotal,
    items,
  ]);

  // ---------- delete ----------
  const handleDelete = useCallback(() => {
    Alert.alert(
      "Delete Estimate",
      "Are you sure you want to delete this estimate? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              const db = await openDB();
              await db.runAsync(
                `UPDATE estimates
                 SET deleted_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [estimateId]
              );
              await queueChange("estimates", "delete", { id: estimateId });
              await runSync();
              Alert.alert("Deleted", "Estimate was deleted.");
              router.replace("/(tabs)/estimates");
            } catch (e) {
              console.error("Delete failed", e);
              Alert.alert("Error", "Could not delete this estimate.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [estimateId, router]);

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card style={styles.headerCard}>
            <Text style={styles.headerText}>{isNew ? "Creating Estimate" : "Editing Estimate"}</Text>

            {/* Customer picker + selected label */}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionTitle}>Customer</Text>
              <CustomerPicker
                selectedCustomer={customerId}
                onSelect={async (custId) => {
                  if (custId) {
                    setCustomerId(custId);
                    await loadCustomerIntoForm(custId);
                  } else {
                    setCustomerId(null);
                    setCustomerName("");
                    setCustomerContact({});
                  }
                }}
              />
              <Text style={{ marginTop: 6, color: customerName ? "#374151" : "#9CA3AF" }}>
                {customerName ? `Selected: ${customerName}` : "No customer selected"}
              </Text>
            </View>
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
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom action bar */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={styles.footerRow}>
          <Button
            label={saving ? "Saving…" : "Save"}
            onPress={saveEstimate}
            loading={saving}
            style={{ flex: 1 }}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
          />
        </View>
        <View style={styles.footerRow}>
          <Button
            label={previewing ? "Previewing…" : "Preview PDF"}
            variant="secondary"
            onPress={handlePreview}
            loading={previewing}
            style={{ flex: 1 }}
          />
          <Button
            label={sending ? "Sharing…" : "Send to Customer"}
            variant="secondary"
            onPress={handleShare}
            loading={sending}
            style={{ flex: 1 }}
          />
        </View>
        <Button
          label={deleting ? "Deleting…" : "Delete"}
          variant="danger"
          onPress={handleDelete}
          loading={deleting}
        />
      </SafeAreaView>
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
    card: { gap: 16 },
    sameRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: { fontWeight: "700", marginTop: 10, marginBottom: 6, color: colors.secondaryText },
    lineItem: { marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    qtyInput: { flex: 1 },
    priceInput: { flex: 1 },
    label: { color: colors.secondaryText },
    total: { fontSize: 18, fontWeight: "700", marginTop: 4 },
    footer: {
      paddingTop: 8,
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      gap: 8,
    },
    footerRow: { flexDirection: "row", gap: 8 },
  });
}
