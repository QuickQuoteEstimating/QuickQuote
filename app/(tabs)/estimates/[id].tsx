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
// import { Picker } from "@react-native-picker/picker"; // (unused right now)
import { v4 as uuidv4 } from "uuid";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
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
import { supabase } from "lib/supabase";

const formatCurrency = (value: number): string => `$${(value || 0).toFixed(2)}`;
const oneLineFromParts = (street: string, city: string, state: string, zip: string) =>
  [street, city, state, zip].filter(Boolean).join(", ");

// ✅ include addToCatalog in the LineItem type
type LineItem = {
  id: string;
  name: string;
  qty: string;
  price: string;
  addToCatalog?: boolean;
};

export default function EstimateFormScreen() {
  const { theme } = useThemeContext();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  // 💾 all your useState hooks first
  const [estimateNumber, setEstimateNumber] = useState("001");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState({ email: "", phone: "" });
  const [billingStreet, setBillingStreet] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [jobStreet, setJobStreet] = useState("");
  const [jobCity, setJobCity] = useState("");
  const [jobState, setJobState] = useState("");
  const [jobZip, setJobZip] = useState("");
  const [laborHoursText, setLaborHoursText] = useState("0");
  const [items, setItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);

  const [sameAddress, setSameAddress] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [subtotal, setSubtotal] = useState(0);
  const [taxRatePct, setTaxRatePct] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [laborRate, setLaborRate] = useState(75); // adjust to your default hourly rate
  const [laborTotal, setLaborTotal] = useState(0);

  const params = useLocalSearchParams<{
  id?: string;
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}>();
const estimateId = useMemo(() => params.id ?? uuidv4(), [params.id]);
  // 👇 place the new useEffect **here**, inside the component,
  // after all the useState declarations:
    useEffect(() => {
    (async () => {
      const db = await openDB();
      type DBEstimate = {
  id: string;
  estimate_number?: string | null;
  description?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  billing_address?: string | null;
  job_address?: string | null;
  labor_hours?: number | null;
  notes?: string | null;
};

      // ✅ if editing an existing estimate
      if (params.id) {
        const estimate = await db.getFirstAsync<DBEstimate>(
          `
          SELECT 
            e.*,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            c.street AS customer_street,
            c.city AS customer_city,
            c.state AS customer_state,
            c.zip AS customer_zip
          FROM estimates e
          LEFT JOIN customers c ON e.customer_id = c.id
          WHERE e.id = ? AND e.deleted_at IS NULL
          `,
          [params.id]
        );

        if (estimate) {
          // 🔹 Restore all saved fields
          setEstimateNumber(estimate.estimate_number || "001");
          setDescription(estimate.description || "");
          setCustomerId(estimate.customer_id || null);
          setCustomerName(estimate.customer_name || "");
          setCustomerContact({
            email: estimate.customer_email || "",
            phone: estimate.customer_phone || "",
          });

          const [bStreet, bCity, bState, bZip] = (estimate.billing_address || "").split(",");
          const [jStreet, jCity, jState, jZip] = (estimate.job_address || "").split(",");

          setBillingStreet(bStreet?.trim() || "");
          setBillingCity(bCity?.trim() || "");
          setBillingState(bState?.trim() || "");
          setBillingZip(bZip?.trim() || "");

          setJobStreet(jStreet?.trim() || "");
          setJobCity(jCity?.trim() || "");
          setJobState(jState?.trim() || "");
          setJobZip(jZip?.trim() || "");

          if (estimate.labor_hours !== undefined) {
            setLaborHoursText(String(estimate.labor_hours));
          }

          const itemsData = await db.getAllAsync<any>(
  `SELECT * FROM estimate_items WHERE estimate_id = ? AND deleted_at IS NULL`,
  [estimate.id]
);
setItems(
  itemsData.map((i: any) => ({
    id: i.id,
    name: i.description,
    qty: String(i.quantity),
    price: String(i.unit_price),
    addToCatalog: false,
  }))
);

          setNotes(estimate.notes || "");
          setLoading(false);
          return;
        }
      }

      // 🆕 NEW ESTIMATE FROM CUSTOMER
    if (!params.id && params.customerId) {
      setCustomerId(String(params.customerId));
      setCustomerName(String(params.name || ""));
      setCustomerContact({
        email: String(params.email || ""),
        phone: String(params.phone || ""),
      });
      setBillingStreet(String(params.street || ""));
      setBillingCity(String(params.city || ""));
      setBillingState(String(params.state || ""));
      setBillingZip(String(params.zip || ""));
      setJobStreet(String(params.street || ""));
      setJobCity(String(params.city || ""));
      setJobState(String(params.state || ""));
      setJobZip(String(params.zip || ""));
    }
    
      // ✅ if creating a new estimate
      const last = await db.getFirstAsync<{ lastNum: string }>(
        "SELECT estimate_number AS lastNum FROM estimates WHERE deleted_at IS NULL ORDER BY estimate_number DESC LIMIT 1"
      );
      const nextNum = last?.lastNum
        ? String(parseInt(last.lastNum, 10) + 1).padStart(3, "0")
        : "001";
      setEstimateNumber(nextNum);

      setLoading(false);
    })();
  }, [params.id]);

    useEffect(() => {
    const subtotalCalc = items.reduce(
      (sum, i) => sum + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
      0
    );
    const laborHrs = parseFloat(laborHoursText) || 0;
    const laborCost = laborHrs * laborRate;
    const sub = subtotalCalc + laborCost;
    const taxAmount = sub * (taxRatePct / 100);
    const grandTotal = sub + taxAmount;

    setSubtotal(sub);
    setLaborTotal(laborCost);
    setTax(taxAmount);
    setTotal(grandTotal);
  }, [items, laborHoursText, laborRate, taxRatePct]);


  // --- Handlers ---
  const handleCustomerSelect = (customer: any | null) => {
    if (!customer) return;
    setCustomerId(customer.id);
    setCustomerName(customer.name || "Unnamed customer");
    setCustomerContact({ email: customer.email, phone: customer.phone });
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

  const addLineItem = () =>
    setItems((p) => [
      ...p,
      {
        id: uuidv4(),
        name: "",
        qty: "1",
        price: "0",
        addToCatalog: false,
      },
    ]);

  const updateItem = (
    id: string,
    field: "name" | "qty" | "price" | "addToCatalog",
    value: string | boolean
  ) =>
    setItems((p) => p.map((i) => (i.id === id ? { ...i, [field]: value } : i)));

  const removeItem = (id: string) => setItems((p) => p.filter((i) => i.id !== id));

  const handleSave = useCallback(async () => {
  if (!customerId) {
    Alert.alert("Missing Info", "Please select or add a customer first.");
    return;
  }

  const { data } = await supabase.auth.getUser();
  const authedUserId = data?.user?.id ?? null;

  const billingAddress = oneLineFromParts(billingStreet, billingCity, billingState, billingZip);
  const jobAddress = sameAddress
    ? billingAddress
    : oneLineFromParts(jobStreet, jobCity, jobState, jobZip);

  const now = new Date().toISOString();

  const estimateData = {
    id: estimateId,
    user_id: authedUserId,
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

      if (!estimateNumber || estimateNumber.length > 5) {
  const last = await db.getFirstAsync<{ lastNum: string }>(
    "SELECT estimate_number AS lastNum FROM estimates WHERE deleted_at IS NULL ORDER BY estimate_number DESC LIMIT 1"
  );
  const nextNum = last?.lastNum
    ? String(parseInt(last.lastNum, 10) + 1).padStart(3, "0")
    : "001";
  setEstimateNumber(nextNum);
}

    // ✅ Check if this estimate already exists locally
    const existing = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM estimates WHERE id = ? LIMIT 1",
      [estimateId]
    );

    if (existing) {
      // 🟡 UPDATE
      await db.runAsync(
        `UPDATE estimates
         SET user_id = ?, customer_id = ?, description = ?, billing_address = ?, job_address = ?,
             subtotal = ?, tax_rate = ?, tax_total = ?, total = ?, notes = ?, estimate_number = ?,
             updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
        [
          authedUserId,
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
    } else {
      // 🟢 INSERT
      await db.runAsync(
        `INSERT INTO estimates (id, user_id, customer_id, description, billing_address, job_address, subtotal, tax_rate, tax_total, total, notes, estimate_number, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Object.values(estimateData)
      );
      await queueChange("estimates", "insert", sanitizeEstimateForQueue(estimateData));
    }

    // 🔁 Replace estimate_items each time (simpler + consistent)
    await db.runAsync(`DELETE FROM estimate_items WHERE estimate_id = ?`, [estimateId]);

    for (const i of items) {
      const q = parseFloat(i.qty) || 0;
      const p = parseFloat(i.price) || 0;
      const lineTotal = q * p;
      const id = uuidv4();

      await db.runAsync(
        `INSERT INTO estimate_items (id, user_id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, authedUserId, estimateId, i.name, q, p, lineTotal, lineTotal]
      );

      if (i.addToCatalog) {
        const catalogId = uuidv4();
        await db.runAsync(
          `INSERT INTO item_catalog (id, user_id, name, unit_price, default_quantity, apply_markup)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [catalogId, authedUserId, i.name, p, q]
        );
      }
    }

    await runSync();

    Alert.alert(
      "Saved",
      existing
        ? `Estimate #${estimateNumber} updated successfully.`
        : `Estimate #${estimateNumber} created successfully.`
    );

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


  const handlePreview = useCallback(async () => {
    try {
      setPreviewing(true);

      const pdfItems = items.map((i, index) => ({
        id: i.id || index.toString(),
        description: i.name,
        quantity: parseFloat(i.qty) || 0,
        unitPrice: parseFloat(i.price) || 0,
        total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
      }));

      const pdf = await renderEstimatePdf({
  estimate: {
    id: estimateId,
    estimate_number: estimateNumber,
    description,
    customer: {
      name: customerName,
      email: customerContact.email,
      phone: customerContact.phone,
    },
    billingAddress: oneLineFromParts(
      billingStreet,
      billingCity,
      billingState,
      billingZip
    ),
    jobAddress: oneLineFromParts(
      jobStreet,
      jobCity,
      jobState,
      jobZip
    ),
    subtotal,
    taxTotal: tax,
    total,
    notes,
  },
  items: pdfItems,
});

      await Print.printAsync({ uri: pdf.uri });
    } catch (e) {
      console.error("Preview failed", e);
      Alert.alert("Error", "Unable to open PDF preview.");
    } finally {
      setPreviewing(false);
    }
  }, [items, estimateNumber, customerName, total, estimateId]);

  const handleSendEmail = useCallback(async () => {
    try {
      if (!customerContact.email) {
        Alert.alert(
          "No Email on File",
          "This customer doesn't have an email address saved. You can still share the PDF using the share sheet."
        );
      }

      setSending(true);

      const pdfItems = items.map((i, index) => ({
        id: i.id || index.toString(),
        description: i.name,
        quantity: parseFloat(i.qty) || 0,
        unitPrice: parseFloat(i.price) || 0,
        total: (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0),
      }));

      const pdf = await renderEstimatePdf({
        estimate: {
          id: estimateId,
          estimate_number: estimateNumber,
          customer: { name: customerName },
          total,
        },
        items: pdfItems,
      });

      const subject = `Estimate #${estimateNumber} from QuickQuote`;
      const body =
        `Hi ${customerName || "there"},\n\n` +
        `Please find attached your estimate.\n\n` +
        `Estimate #: ${estimateNumber}\n` +
        `Total: ${formatCurrency(total)}\n\n` +
        `Thank you!`;

      const canEmail = await MailComposer.isAvailableAsync();

      if (canEmail && customerContact.email) {
        await MailComposer.composeAsync({
          recipients: [customerContact.email],
          subject,
          body,
          attachments: [pdf.uri],
        });
      } else if (canEmail) {
        await MailComposer.composeAsync({
          subject,
          body,
          attachments: [pdf.uri],
        });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: subject,
        });
      } else {
        Alert.alert("Unavailable", "Neither email nor sharing is available on this device.");
      }
    } catch (e) {
      console.error("Send failed", e);
      Alert.alert("Error", "Unable to send this estimate.");
    } finally {
      setSending(false);
    }
  }, [items, estimateNumber, customerName, customerContact.email, total, estimateId]);

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
            await db.runAsync(
              `UPDATE estimates SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [estimateId]
            );
            await queueChange("estimates", "delete", { id: estimateId });
            await runSync();
            Alert.alert("Deleted", `Estimate #${estimateNumber} deleted.`);
            router.replace("/(tabs)/estimates");
          } catch (e) {
            console.error("Delete failed", e);
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
          {/* Header */}
          <Card style={styles.headerCard}>
            <Text style={styles.headerText}>Estimate #{estimateNumber}</Text>
            <CustomerPicker selectedCustomer={customerId} onSelect={handleCustomerSelect} />
            <Text style={{ marginTop: 6, color: customerName ? "#374151" : "#9CA3AF" }}>
              {customerName ? `Selected: ${customerName}` : "No customer selected"}
            </Text>
          </Card>

          {/* Addresses & description */}
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
          </Card>

          {/* Labor & items */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Labor</Text>
            <Input
              label={`Labor Hours (Rate ${formatCurrency(laborRate)}/hr)`}
              value={laborHoursText}
              onChangeText={setLaborHoursText}
              keyboardType="decimal-pad"
            />
            <Text style={{ marginTop: 3, marginBottom: 10, color: "#6B7280" }}>
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
                    containerStyle={styles.qtyInput}
                    inputStyle={styles.numericInput}
                  />
                  <Input
                    label="Price"
                    keyboardType="decimal-pad"
                    value={item.price}
                    onChangeText={(v) => updateItem(item.id, "price", v)}
                    containerStyle={styles.priceInput}
                    inputStyle={styles.numericInput}
                  />
                  <Button label="X" variant="ghost" onPress={() => removeItem(item.id)} />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <Switch
                    value={item.addToCatalog ?? false}
                    onValueChange={(v) => updateItem(item.id, "addToCatalog", v)}
                  />
                  <Text style={{ marginLeft: 8, color: colors.primaryText }}>Add to Catalog</Text>
                </View>
              </View>
            ))}

            <Button label="+ Add Line Item" onPress={addLineItem} variant="secondary" />
          </Card>

          {/* Summary & notes */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text>Subtotal: {formatCurrency(subtotal)}</Text>
            <Text>Tax: {formatCurrency(tax)}</Text>
            <Text style={styles.total}>Total: {formatCurrency(total)}</Text>

            <Input
              label="Notes"
              placeholder="Add notes"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </Card>

          {/* Footer actions */}
          <View style={styles.footerContainer}>
            <Button label={saving ? "Saving..." : "Save"} onPress={handleSave} loading={saving} />
            <Button
              label={previewing ? "Previewing..." : "Preview"}
              variant="secondary"
              onPress={handlePreview}
              loading={previewing}
            />
            <Button
              label={sending ? "Sending..." : "Send to Customer"}
              variant="secondary"
              onPress={handleSendEmail}
              loading={sending}
            />
            <Button
              label={deleting ? "Deleting..." : "Delete"}
              variant="danger"
              onPress={handleDelete}
              loading={deleting}
            />
            <Button label="Back" variant="secondary" onPress={() => router.back()} />
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
    card: { gap: 16, marginBottom: 16, paddingBottom: 12 },
    sameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontWeight: "700", marginTop: 10, marginBottom: 6, color: colors.secondaryText },
    lineItem: { marginBottom: 12 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    qtyInput: { flex: 1.1, minWidth: 90 },
    priceInput: { flex: 1.6, minWidth: 130 },
    numericInput: { textAlign: "right" },
    label: { color: colors.secondaryText, fontSize: 15 },
    total: { fontSize: 18, fontWeight: "700", marginTop: 4 },
    footerContainer: { marginTop: 10, paddingBottom: 60, gap: 10 },
  });
}
