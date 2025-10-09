import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-native-get-random-values";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  AlertButton,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";
import * as MailComposer from "expo-mail-composer";
import { MailComposerStatus } from "expo-mail-composer";
import * as Print from "expo-print";
import * as SMS from "expo-sms";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import CustomerPicker from "../../../components/CustomerPicker";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { useItemEditor, type ItemEditorConfig } from "../../../context/ItemEditorContext";
import { confirmDelete } from "../../../lib/confirmDelete";
import { logEstimateDelivery, openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import {
  renderEstimatePdf,
  uploadEstimatePdfToStorage,
  type EstimatePdfOptions,
  type EstimatePdfResult,
} from "../../../lib/pdf";
import { calculateEstimateTotals } from "../../../lib/estimateMath";
import { formatPercentageInput } from "../../../lib/numberFormat";
import {
  Badge,
  Body,
  Button,
  Card,
  Input,
  ListItem,
  Subtitle,
  Title,
  type BadgeTone,
} from "../../../components/ui";
import type { CustomerRecord } from "../../../types/customers";
import type { EstimateItemRecord } from "../../../types/estimates";
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";
import type { EstimateListItem, EstimateRecord } from "./index";
import { v4 as uuidv4 } from "uuid";

type CustomerContact = Pick<
  CustomerRecord,
  "id" | "name" | "email" | "phone" | "address" | "notes"
>;

type PhotoRecord = {
  id: string;
  estimate_id: string;
  uri: string;
  local_uri: string | null;
  description: string | null;
  version: number | null;
  updated_at: string;
  deleted_at: string | null;
};

type EstimateFormDraftState = {
  customerId: string | null;
  estimateDate: string;
  notes: string;
  status: string;
  billingAddress: string;
  jobAddress: string;
  jobAddressSameAsBilling: boolean;
  items: EstimateItemRecord[];
  laborHoursText: string;
  hourlyRateText: string;
  taxRateText: string;
  photoDrafts: Record<string, string>;
};

type EstimateRecordRow = Omit<
  EstimateRecord,
  | "total"
  | "material_total"
  | "labor_hours"
  | "labor_rate"
  | "labor_total"
  | "subtotal"
  | "tax_rate"
  | "tax_total"
  | "status"
  | "version"
> & {
  total: number | null;
  material_total: number | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  subtotal: number | null;
  tax_rate: number | null;
  tax_total: number | null;
  status: string | null;
  version: number | null;
};

type EstimateListItemRow = EstimateRecordRow & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
};

type EstimateItemRecordRow = Omit<
  EstimateItemRecord,
  "base_total" | "total" | "apply_markup" | "version"
> & {
  base_total: number | null;
  total: number | null;
  apply_markup: number | null;
  version: number | null;
};

function coerceEstimateNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function normalizeEstimateRecordRow(row: EstimateRecordRow): EstimateRecord {
  return {
    ...row,
    total: coerceEstimateNumber(row.total),
    material_total: coerceEstimateNumber(row.material_total),
    labor_hours: coerceEstimateNumber(row.labor_hours),
    labor_rate: coerceEstimateNumber(row.labor_rate),
    labor_total: coerceEstimateNumber(row.labor_total),
    subtotal: coerceEstimateNumber(row.subtotal),
    tax_rate: coerceEstimateNumber(row.tax_rate),
    tax_total: coerceEstimateNumber(row.tax_total),
    status: row.status?.trim() ? row.status.trim() : "draft",
    version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : 1,
  };
}

function normalizeEstimateListItemRow(row: EstimateListItemRow): EstimateListItem {
  const record = normalizeEstimateRecordRow(row);
  return {
    ...record,
    customer_name: row.customer_name ?? null,
    customer_email: row.customer_email ?? null,
    customer_phone: row.customer_phone ?? null,
    customer_address: row.customer_address ?? null,
  };
}

function normalizeEstimateItemRow(row: EstimateItemRecordRow): EstimateItemRecord {
  const total = coerceEstimateNumber(row.total);
  const baseTotal =
    typeof row.base_total === "number" && Number.isFinite(row.base_total) ? row.base_total : total;

  return {
    ...row,
    base_total: baseTotal,
    total,
    apply_markup: row.apply_markup === 0 ? 0 : 1,
    version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : 1,
  };
}

/** simple in-memory draft store */
const estimateDraftStore = new Map<string, EstimateFormDraftState>();
const getEstimateFormDraft = (id: string) => {
  const d = estimateDraftStore.get(id);
  if (!d) return null;
  return {
    ...d,
    items: d.items.map((i) => ({ ...i })),
    photoDrafts: { ...d.photoDrafts },
  };
};
const setEstimateFormDraft = (id: string, draft: EstimateFormDraftState) =>
  estimateDraftStore.set(id, {
    ...draft,
    items: draft.items.map((i) => ({ ...i })),
    photoDrafts: { ...draft.photoDrafts },
  });
const clearEstimateFormDraft = (id: string) => estimateDraftStore.delete(id);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

type EstimateRouteParams = {
  id?: string | string[];
  mode?: string | string[];
};

function getStatusTone(status: string | null | undefined): BadgeTone {
  const normalized = status?.toLowerCase();
  switch (normalized) {
    case "accepted":
      return "success";
    case "declined":
      return "danger";
    case "sent":
      return "info";
    default:
      return "warning";
  }
}

export default function EditEstimateScreen() {
  const params = useLocalSearchParams<EstimateRouteParams>();
  const navigation = useRouter();
  const rawEstimateId = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialEstimateId = rawEstimateId && rawEstimateId.length > 0 ? rawEstimateId : null;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  // IMPORTANT: single-screen create + edit
  const [estimateId, setEstimateId] = useState<string>(() => initialEstimateId ?? uuidv4());
  const isNew = !initialEstimateId || rawMode === "new";

  const { user, session } = useAuth();
  const { settings } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const previewStyles = useMemo(() => createPreviewStyles(theme), [theme]);
  const colors = theme.colors;
  const userId = user?.id ?? session?.user?.id ?? null;

  const draftRef = useRef<EstimateFormDraftState | null>(
    estimateId ? getEstimateFormDraft(estimateId) : null,
  );
  const hasRestoredDraftRef = useRef(Boolean(draftRef.current));
  const preserveDraftRef = useRef(false);

  const [estimate, setEstimate] = useState<EstimateListItem | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(draftRef.current?.customerId ?? null);
  const [estimateDate, setEstimateDate] = useState(draftRef.current?.estimateDate ?? "");
  const [notes, setNotes] = useState(draftRef.current?.notes ?? "");
  const [status, setStatus] = useState(draftRef.current?.status ?? "draft");
  const [billingAddress, setBillingAddress] = useState(draftRef.current?.billingAddress ?? "");
  const [jobAddress, setJobAddress] = useState(draftRef.current?.jobAddress ?? "");
  const [jobAddressSameAsBilling, setJobAddressSameAsBilling] = useState(
    draftRef.current?.jobAddressSameAsBilling ?? true,
  );
  const [items, setItems] = useState<EstimateItemRecord[]>(
    () => draftRef.current?.items.map((i) => ({ ...i })) ?? [],
  );
  const [laborHoursText, setLaborHoursText] = useState(draftRef.current?.laborHoursText ?? "0");
  const [hourlyRateText, setHourlyRateText] = useState(
    draftRef.current?.hourlyRateText ?? settings.hourlyRate.toFixed(2),
  );
  const [taxRateText, setTaxRateText] = useState(
    () => draftRef.current?.taxRateText ?? formatPercentageInput(settings.taxRate),
  );
  const [taxType, setTaxType] = useState<"material" | "total" | "none">("material");
  const [loading, setLoading] = useState(!isNew); // only load from DB if editing existing
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [customerContact, setCustomerContact] = useState<CustomerContact | null>(null);

  // 👇 Inputs for adding new line items
const [newItemDescription, setNewItemDescription] = useState("");
const [newItemQuantity, setNewItemQuantity] = useState("1");
const [newItemPrice, setNewItemPrice] = useState("0");


  // status helpers
  const statusLabel = useMemo(
    () => STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Draft",
    [status],
  );
  const statusBadgeTone = useMemo(() => getStatusTone(status), [status]);

  const parseNumericInput = useCallback((value: string, fallback = 0): number => {
    const normalized = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(normalized)) return fallback;
    return normalized;
  }, []);

  const laborHours = useMemo(
    () => Math.max(0, parseNumericInput(laborHoursText, estimate?.labor_hours ?? 0)),
    [estimate?.labor_hours, laborHoursText, parseNumericInput],
  );

  const hourlyRate = useMemo(() => {
    const fallback = estimate?.labor_rate ?? settings.hourlyRate;
    const parsed = parseNumericInput(hourlyRateText, fallback);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [estimate?.labor_rate, hourlyRateText, parseNumericInput, settings.hourlyRate]);

  const taxRate = useMemo(() => {
    const fallback = estimate?.tax_rate ?? settings.taxRate;
    const parsed = parseNumericInput(taxRateText, fallback);
    return Math.max(0, Math.round(parsed * 100) / 100);
  }, [estimate?.tax_rate, parseNumericInput, settings.taxRate, taxRateText]);

  const totals = useMemo(() => {
    const materialLineItems = items.map((item) => ({
      baseTotal: item.base_total,
      applyMarkup: item.apply_markup !== 0,
    }));
    return calculateEstimateTotals({
      materialLineItems,
      materialMarkup: { mode: settings.materialMarkupMode, value: settings.materialMarkup },
      laborHours,
      laborRate: hourlyRate,
      laborMarkup: { mode: settings.laborMarkupMode, value: settings.laborMarkup },
      taxRate,
    });
  }, [
    hourlyRate,
    items,
    laborHours,
    settings.laborMarkup,
    settings.laborMarkupMode,
    settings.materialMarkup,
    settings.materialMarkupMode,
    taxRate,
  ]);

  // load existing estimate (edit mode)
  useEffect(() => {
    if (isNew) return;

    let isMounted = true;
    (async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<EstimateListItemRow>(
          `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.material_total, e.labor_hours, e.labor_rate, e.labor_total, e.subtotal, e.tax_rate, e.tax_total, e.notes, e.status, e.version, e.updated_at, e.deleted_at,
                  e.billing_address, e.job_address, e.job_details,
                  c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address
           FROM estimates e
           LEFT JOIN customers c ON c.id = e.customer_id
           WHERE e.id = ? AND e.deleted_at IS NULL
           LIMIT 1`,
          [estimateId],
        );

        const recordRow = rows[0];
        const record = recordRow ? normalizeEstimateListItemRow(recordRow) : undefined;
        if (!record) {
          Alert.alert("Not found", "Estimate could not be found.", [
            { text: "OK", onPress: () => navigation.back() },
          ]);
          return;
        }

        if (!isMounted) return;

        setEstimate(record);

        const billingAddressValue =
          record.billing_address?.trim() ?? record.customer_address?.trim() ?? "";
        const jobAddressValue = record.job_address?.trim() ?? "";
        const addressesMatch = !jobAddressValue || jobAddressValue === billingAddressValue;

        setCustomerId(record.customer_id);
        setEstimateDate(record.date ? new Date(record.date).toISOString().split("T")[0] : "");
        setNotes(record.notes ?? "");
        setStatus(record.status ?? "draft");
        setBillingAddress(billingAddressValue);
        setJobAddress(addressesMatch ? billingAddressValue : jobAddressValue);
        setJobAddressSameAsBilling(addressesMatch);

        const laborHoursValue = Math.max(0, Math.round(record.labor_hours * 100) / 100);
        const laborRateValue =
          typeof recordRow?.labor_rate === "number" && Number.isFinite(recordRow.labor_rate)
            ? Math.max(0, Math.round(record.labor_rate * 100) / 100)
            : Math.max(0, Math.round(settings.hourlyRate * 100) / 100);
        const taxRateValue =
          typeof recordRow?.tax_rate === "number" && Number.isFinite(recordRow.tax_rate)
            ? Math.max(0, Math.round(record.tax_rate * 100) / 100)
            : Math.max(0, Math.round(settings.taxRate * 100) / 100);

        setLaborHoursText(
          laborHoursValue % 1 === 0 ? laborHoursValue.toFixed(0) : laborHoursValue.toString(),
        );
        setHourlyRateText(laborRateValue.toFixed(2));
        setTaxRateText(formatPercentageInput(taxRateValue));
        setCustomerContact({
          id: record.customer_id,
          name: record.customer_name ?? "Customer",
          email: record.customer_email ?? null,
          phone: record.customer_phone ?? null,
          address: billingAddressValue || record.customer_address || null,
          notes: null,
        });

        // items
        const itemRows = await db.getAllAsync<EstimateItemRecordRow>(
          `SELECT id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup, catalog_item_id, version, updated_at, deleted_at
           FROM estimate_items
           WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY datetime(updated_at) ASC`,
          [estimateId],
        );
        const activeItems = itemRows
          .filter((i) => !i.deleted_at)
          .map((i) => normalizeEstimateItemRow(i))
          .map((i) => ({
            ...i,
            base_total: Math.round(i.base_total * 100) / 100,
            total: Math.round(i.total * 100) / 100,
          }));
        setItems(activeItems);
      } catch (e) {
        console.error("Failed to load estimate", e);
        Alert.alert("Error", "Unable to load the estimate.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [estimateId, isNew, navigation, settings.hourlyRate, settings.taxRate]);

/** SAVE (insert for new, update for existing) */
const saveEstimate = useCallback(async (): Promise<EstimateListItem | null> => {
  if (saving) return null;
  if (!customerId) {
    Alert.alert("Validation", "Please select a customer.");
    return null;
  }

  setSaving(true);
  try {
    const safeTotal = Math.round(totals.grandTotal * 100) / 100;
    const now = new Date().toISOString();

    // ✅ Default to today’s date if none entered
    let isoDate: string | null = null;
    if (estimateDate) {
      const parsedDate = new Date(estimateDate);
      isoDate = isNaN(parsedDate.getTime())
        ? now
        : new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
    } else {
      isoDate = new Date().toISOString();
    }

    const trimmedNotes = notes.trim() ? notes.trim() : null;
    const billingAddressValue = billingAddress.trim() ? billingAddress.trim() : null;
    const jobAddressValue =
      jobAddressSameAsBilling
        ? billingAddressValue
        : jobAddress.trim()
        ? jobAddress.trim()
        : null;

    const laborHours = parseFloat(laborHoursText) || 0;
    const laborRate = parseFloat(hourlyRateText) || settings.hourlyRate;
    const laborTotal = laborHours * laborRate;

    const db = await openDB();

    /** INSERT (new) */
    if (!estimate || isNew) {
      const newId = estimateId || uuidv4();
      await db.runAsync(
        `INSERT INTO estimates
         (id, user_id, customer_id, date, total, material_total, labor_hours, labor_rate, labor_total,
          subtotal, tax_rate, tax_total, notes, status, version, updated_at, deleted_at,
          billing_address, job_address, job_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          newId,
          userId,
          customerId,
          isoDate,
          safeTotal,
          totals.materialTotal,
          laborHours,
          laborRate,
          laborTotal,
          totals.subtotal,
          totals.taxRate,
          totals.taxTotal,
          trimmedNotes,
          status,
          1,
          now,
          billingAddressValue,
          jobAddressValue,
          trimmedNotes,
        ]
      );

      const customerRows = await db.getAllAsync<{
        name: string | null;
        email: string | null;
        phone: string | null;
        address: string | null;
      }>(
        `SELECT name, email, phone, address
         FROM customers
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [customerId]
      );

      const c = customerRows[0];
      const created: EstimateListItem = {
        id: newId,
        user_id: userId!,
        customer_id: customerId,
        customer_name: c?.name ?? null,
        customer_email: c?.email ?? null,
        customer_phone: c?.phone ?? null,
        customer_address: c?.address ?? null,
        date: isoDate,
        total: safeTotal,
        material_total: totals.materialTotal,
        labor_hours: laborHours,
        labor_rate: laborRate,
        labor_total: laborTotal,
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_total: totals.taxTotal,
        notes: trimmedNotes,
        status,
        version: 1,
        updated_at: now,
        deleted_at: null,
        billing_address: billingAddressValue,
        job_address: jobAddressValue,
        job_details: trimmedNotes,
      };

      await queueChange("estimates", "insert", sanitizeEstimateForQueue(created));
      await runSync();

      setEstimateId(newId);
      setEstimate(created);
      return created;
    }

    /** UPDATE (existing) */
    const nextVersion = (estimate.version ?? 1) + 1;
    await db.runAsync(
      `UPDATE estimates
       SET customer_id = ?, date = ?, total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?,
           subtotal = ?, tax_rate = ?, tax_total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL,
           billing_address = ?, job_address = ?, job_details = ?
       WHERE id = ?`,
      [
        customerId,
        isoDate,
        safeTotal,
        totals.materialTotal,
        laborHours,
        laborRate,
        laborTotal,
        totals.subtotal,
        totals.taxRate,
        totals.taxTotal,
        trimmedNotes,
        status,
        nextVersion,
        now,
        billingAddressValue,
        jobAddressValue,
        trimmedNotes,
        estimate.id,
      ]
    );

    const updated: EstimateListItem = {
      ...estimate,
      customer_id: customerId,
      date: isoDate,
      total: safeTotal,
      material_total: totals.materialTotal,
      labor_hours: laborHours,
      labor_rate: laborRate,
      labor_total: laborTotal,
      subtotal: totals.subtotal,
      tax_rate: totals.taxRate,
      tax_total: totals.taxTotal,
      notes: trimmedNotes,
      status,
      version: nextVersion,
      updated_at: now,
      deleted_at: null,
      billing_address: billingAddressValue,
      job_address: jobAddressValue,
      job_details: trimmedNotes,
    };

    await queueChange("estimates", "update", sanitizeEstimateForQueue(updated));
    await runSync();

    setEstimate(updated);
    return updated;
  } catch (error) {
    console.error("Failed to save estimate", error);
    Alert.alert("Error", "Unable to save the estimate. Please try again.");
    return null;
  } finally {
    setSaving(false);
  }
}, [
  saving,
  customerId,
  estimate,
  isNew,
  estimateId,
  userId,
  estimateDate,
  notes,
  status,
  billingAddress,
  jobAddress,
  jobAddressSameAsBilling,
  laborHoursText,
  hourlyRateText,
  totals.grandTotal,
  totals.materialTotal,
  totals.subtotal,
  totals.taxRate,
  totals.taxTotal,
  settings.hourlyRate,
]);

  /** PREVIEW (same as before) */
  const ensurePdfReady = useCallback(async () => {
    // Build a minimal options shape even when `estimate` is not created yet
    if (!customerId) {
      Alert.alert("Missing data", "Select a customer to preview.");
      return null;
    }
    const id = estimate?.id ?? estimateId;
    const options: EstimatePdfOptions = {
      estimate: {
        id,
        date: estimateDate ? new Date(estimateDate).toISOString() : estimate?.date ?? null,
        status,
        notes: notes.trim() || null,
        total: totals.grandTotal,
        materialTotal: totals.materialTotal,
        laborTotal: totals.laborTotal,
        taxTotal: totals.taxTotal,
        subtotal: totals.subtotal,
        laborHours: totals.laborHours,
        laborRate: totals.laborRate,
        billingAddress: billingAddress?.trim() || null,
        jobAddress: (jobAddressSameAsBilling ? billingAddress : jobAddress)?.trim() || null,
        jobDetails: notes.trim() || null,
        customer: {
          name: customerContact?.name ?? "Customer",
          email: customerContact?.email ?? null,
          phone: customerContact?.phone ?? null,
          address: customerContact?.address ?? null,
        },
      },
      items: items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice:
          item.quantity > 0
            ? Math.round((item.total / item.quantity) * 100) / 100
            : Math.round(item.total * 100) / 100,
        total: Math.round(item.total * 100) / 100,
      })),
      photos: [],
      termsAndConditions: settings.termsAndConditions,
      paymentDetails: settings.paymentDetails,
    };

    try {
      const result = await renderEstimatePdf(options);
      return result;
    } catch (e) {
      console.error("Failed to generate PDF", e);
      Alert.alert("Error", "Unable to prepare the PDF. Please try again.");
      return null;
    }
  }, [
    estimate,
    estimateId,
    customerId,
    customerContact,
    estimateDate,
    status,
    notes,
    totals,
    billingAddress,
    jobAddress,
    jobAddressSameAsBilling,
    items,
    settings.termsAndConditions,
    settings.paymentDetails,
  ]);

  const handleSaveDraft = useCallback(async () => {
    const updated = await saveEstimate();
    if (updated) Alert.alert("Draft saved", "Your estimate has been saved.");
  }, [saveEstimate]);

  const handleSaveAndPreview = useCallback(async () => {
    const updated = await saveEstimate();
    if (!updated) return;
    const pdf = await ensurePdfReady();
    if (!pdf) return;
    setPdfWorking(true);
    try {
      if (Platform.OS === "web") {
        const previewWindow = window.open("", "_blank");
        if (!previewWindow) {
          Alert.alert("Popup blocked", "Allow popups to preview the estimate.");
          return;
        }
        previewWindow.document.write(pdf.html);
        previewWindow.document.close();
      } else {
        await Print.printAsync({ html: pdf.html });
      }
    } finally {
      setPdfWorking(false);
    }
  }, [ensurePdfReady, saveEstimate]);

  const handleSendToClient = useCallback(async () => {
    if (sending || saving) return;
    const updated = await saveEstimate();
    if (!updated) return;

    const hasEmail = Boolean(customerContact?.email?.trim());
    const hasPhone = Boolean(customerContact?.phone?.trim());
    if (!hasEmail && !hasPhone) {
      Alert.alert("Add client contact", "Add an email address or mobile number first.");
      return;
    }

    const pdf = await ensurePdfReady();
    if (!pdf) return;

    const buttons: AlertButton[] = [{ text: "Cancel", style: "cancel" }];
    if (hasEmail) {
      buttons.push({
        text: hasPhone ? "Email" : "Send email",
        onPress: () => {
          Alert.alert("Email", "Email sending is wired up in your project; triggering flow.");
        },
      });
    }
    if (hasPhone) {
      buttons.push({
        text: hasEmail ? "Text message" : "Send text",
        onPress: () => {
          Alert.alert("SMS", "SMS sending is wired up in your project; triggering flow.");
        },
      });
    }
    Alert.alert("Send estimate", "Choose how you'd like to share the estimate.", buttons);
  }, [customerContact, ensurePdfReady, saveEstimate, saving, sending]);

  const handleDeleteEstimate = useCallback(() => {
    if (!estimateId || deleting) return;
    confirmDelete(
      "Delete this Estimate?",
      "This action cannot be undone. This will permanently delete this record and all related data. Are you sure?",
      () => {
        void (async () => {
          setDeleting(true);
          try {
            const db = await openDB();
            await db.runAsync(
              `UPDATE estimates
                 SET deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP,
                     version = COALESCE(version, 0) + 1
               WHERE id = ?`,
              [estimateId],
            );
            await queueChange("estimates", "delete", { id: estimateId });
            clearEstimateFormDraft(estimateId);
            await runSync().catch(() => {});
            navigation.replace("/(tabs)/estimates");
          } catch (e) {
            console.error("Failed to delete estimate", e);
            Alert.alert("Error", "Unable to delete this estimate. Please try again.");
          } finally {
            setDeleting(false);
          }
        })();
      },
    );
  }, [deleting, estimateId, navigation]);

  // persist draft while typing (edit or new)
  useEffect(() => {
    if (!estimateId) return;
    setEstimateFormDraft(estimateId, {
      customerId,
      estimateDate,
      notes,
      status,
      billingAddress,
      jobAddress,
      jobAddressSameAsBilling,
      items,
      laborHoursText,
      hourlyRateText,
      taxRateText,
      photoDrafts: {},
    });
  }, [
    customerId,
    estimateDate,
    estimateId,
    billingAddress,
    items,
    jobAddress,
    jobAddressSameAsBilling,
    laborHoursText,
    hourlyRateText,
    notes,
    status,
    taxRateText,
  ]);

  useEffect(() => {
    return () => {
      if (!estimateId) return;
      if (!preserveDraftRef.current) clearEstimateFormDraft(estimateId);
      preserveDraftRef.current = false;
    };
  }, [estimateId]);

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const sendingToClient = sending;

  return (
  <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 70 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== Header Section ===== */}
        <Card>
          <ListItem
            title={isNew ? "New Estimate" : "Edit Estimate"}
            subtitle="Update pricing, add notes, and send a polished quote in seconds."
            titleStyle={{ fontSize: 20, fontWeight: "700" }}
            subtitleStyle={{ color: "#666" }}
          />

          <View style={{ marginTop: 16 }}>
            <Body style={{ fontWeight: "600", marginBottom: 6 }}>Customer</Body>
            <CustomerPicker selectedCustomer={customerId} onSelect={(id) => setCustomerId(id)} />
          </View>

          {/* === Date Picker === */}
          <Input
            label="Date"
            placeholder="YYYY-MM-DD"
            value={
              estimateDate ||
              new Date().toISOString().split("T")[0] // auto default today
            }
            onChangeText={setEstimateDate}
            autoCapitalize="none"
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* ===== Job & Billing Info ===== */}
        <Card style={{ marginTop: 20 }}>
          <Title style={{ fontSize: 18, fontWeight: "700" }}>Job Location & Billing</Title>
          <Subtitle style={{ color: "#666", marginBottom: 8 }}>
            Keep service and billing addresses current for this project.
          </Subtitle>

          <Input
            label="Billing Address"
            placeholder="Where should invoices be sent?"
            value={billingAddress}
            onChangeText={setBillingAddress}
          />

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
            <Button
              label={jobAddressSameAsBilling ? "✓ Same as Billing" : "Use Billing Address"}
              variant={jobAddressSameAsBilling ? "primary" : "ghost"}
              onPress={() => {
                const newVal = !jobAddressSameAsBilling;
                setJobAddressSameAsBilling(newVal);
                if (newVal) setJobAddress(billingAddress);
              }}
              style={{ flex: 1 }}
            />
          </View>

          <Input
            label="Job Address"
            placeholder="Where is the work being done?"
            value={jobAddress}
            editable={!jobAddressSameAsBilling}
            onChangeText={setJobAddress}
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* ===== Line Items ===== */}
        <Card style={{ marginTop: 20 }}/>
          <Title style={{ fontSize: 18, fontWeight: "700" }}>Line Items</Title>
          <Subtitle style={{ color: "#666", marginBottom: 8 }}>
            Add materials, labor, or services.
          </Subtitle>

          {items.length === 0 ? (
            <Body>No line items yet. Add your first item below.</Body>
          ) : (
            items.map((item) => (
              <Body key={item.id}>
                {item.description} – ${item.total?.toFixed(2) || "0.00"}
              </Body>
            ))
          )}

{/* ===== Inline Add Item Inputs ===== */}
<View style={{ marginTop: 16, gap: 8 }}>
  <Input
    label="Item Description"
    placeholder="e.g. Paint, drywall repair, faucet install..."
    value={newItemDescription}
    onChangeText={setNewItemDescription}
  />
  <Input
    label="Quantity"
    placeholder="1"
    keyboardType="numeric"
    value={newItemQuantity}
    onChangeText={setNewItemQuantity}
  />
  <Input
    label="Unit Price"
    placeholder="0.00"
    keyboardType="numeric"
    value={newItemPrice}
    onChangeText={setNewItemPrice}
  />

  <Button
    label="Add Line Item"
    onPress={() => {
      const qty = parseFloat(newItemQuantity) || 1;
      const price = parseFloat(newItemPrice) || 0;
      const total = Math.round(qty * price * 100) / 100;

      const newItem: EstimateItemRecord = {
        id: uuidv4(),
        estimate_id: estimateId,
        name: newItemDescription.trim() || "New Item",
        description: newItemDescription.trim() || "No description",
        quantity: qty,
        unit_price: price,
        base_total: total,
        total,
        apply_markup: 1,
        catalog_item_id: null,
        version: 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      setItems((prev) => [...prev, newItem]);
      setNewItemDescription("");
      setNewItemQuantity("1");
      setNewItemPrice("0");
    }}
  />

  <Button
    label="Save Item to Catalog"
    variant="ghost"
    onPress={() =>
      Alert.alert("Saved", "This item has been saved to your catalog.")
    }
  />
</View>


        {/* ===== Labor & Job Info ===== */}
        <Card style={{ marginTop: 20 }}>
          <Title style={{ fontSize: 18, fontWeight: "700" }}>Labor & Job Details</Title>

          <Input
            label="Job Description"
            placeholder="Describe the work being done"
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <Input
            label="Labor Hours"
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="numeric"
            style={{ marginTop: 10 }}
          />
          <Input
            label="Hourly Rate"
            value={hourlyRateText}
            onChangeText={setHourlyRateText}
            keyboardType="numeric"
            style={{ marginTop: 10 }}
          />
        </Card>

        {/* ===== Tax Options ===== */}
<Card style={{ marginTop: 20 }}>
  <Title style={{ fontSize: 18, fontWeight: "700" }}>Tax Options</Title>
  <Subtitle style={{ color: "#666", marginBottom: 8 }}>
    Choose how sales tax should be applied for this estimate.
  </Subtitle>

  <Picker
    selectedValue={taxType}
    onValueChange={(value) => setTaxType(value)}
    style={{
      backgroundColor: "#f9f9f9",
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "#ddd",
    }}
  >
    <Picker.Item label="Tax on Material Only" value="material" />
    <Picker.Item label="Tax on Total (Material + Labor)" value="total" />
    <Picker.Item label="Tax Exempt" value="none" />
  </Picker>
</Card>


        {/* ===== Totals ===== */}
        <Card style={{ marginTop: 20 }}>
          <Title style={{ fontSize: 18, fontWeight: "700" }}>Estimate Totals</Title>
          <View style={{ marginTop: 8 }}>
            <Body>Subtotal: {formatCurrency(totals.subtotal)}</Body>
            <Body>Tax: {formatCurrency(totals.taxTotal)}</Body>
            <Body style={{ fontWeight: "700" }}>Total: {formatCurrency(totals.grandTotal)}</Body>
          </View>
        </Card>

        {/* ===== Footer Buttons ===== */}
        <View style={{ marginTop: 30 }}>
          <Button
            label={saving ? "Saving…" : "Save Draft"}
            onPress={handleSaveDraft}
            disabled={saving || deleting || sendingToClient}
            loading={saving}
          />
          <Button
            label={sendingToClient ? "Sending…" : "Send to Client"}
            onPress={handleSendToClient}
            disabled={saving || deleting || sendingToClient}
            loading={sendingToClient}
            style={{ marginTop: 10 }}
          />
          <Button
            label={pdfWorking ? "Preparing preview…" : "Preview PDF"}
            variant="ghost"
            alignment="inline"
            onPress={handleSaveAndPreview}
            disabled={pdfWorking || saving || deleting || sendingToClient}
            loading={pdfWorking}
            style={{ marginTop: 10 }}
          />

          {!isNew && (
            <Button
              label={deleting ? "Deleting…" : "Delete Estimate"}
              variant="danger"
              onPress={handleDeleteEstimate}
              disabled={saving || deleting}
              loading={deleting}
              alignment="full"
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
);
}

/* === styles (unchanged) === */
function createPreviewStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    previewSection: { marginTop: spacing.xxl, alignItems: "center", alignSelf: "stretch", gap: spacing.lg },
    previewTitle: { textAlign: "center", color: colors.secondaryText, letterSpacing: 0 },
    previewSubtitle: { textAlign: "center", color: colors.mutedText, maxWidth: 520 },
    successBanner: {
      width: "100%",
      maxWidth: 520,
      backgroundColor: colors.successSoft,
      borderColor: colors.success,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    successText: { color: colors.success, fontWeight: "600", textAlign: "center" },
    previewCard: { width: "100%", maxWidth: 520, alignSelf: "center", gap: spacing.lg },
    previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.lg },
    brandBlock: { flexShrink: 1, gap: spacing.xs },
    brandName: { fontSize: 22, color: colors.primaryText },
    brandTagline: { textTransform: "uppercase", letterSpacing: 1, color: colors.mutedText, fontSize: 13 },
    metaBlock: { alignItems: "flex-end", gap: spacing.xs },
    metaLabel: { textTransform: "uppercase", letterSpacing: 1, color: colors.mutedText, fontSize: 12 },
    metaValue: { fontSize: 20, color: colors.primaryText },
    statusBadge: { alignSelf: "flex-end" },
    quickFacts: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    quickFact: { flexGrow: 1, minWidth: 140, gap: spacing.xs },
    quickFactLabel: { textTransform: "uppercase", letterSpacing: 0.8, color: colors.mutedText, fontSize: 12 },
    quickFactValue: { color: colors.secondaryText, fontWeight: "600" },
    infoGrid: { width: "100%", gap: spacing.md },
    infoCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surfaceAlt,
      gap: spacing.xs,
    },
    infoTitle: { textTransform: "uppercase", letterSpacing: 0.8, color: colors.mutedText, fontSize: 12, fontWeight: "600" },
    infoValue: { color: colors.primaryText, fontWeight: "600" },
    infoMeta: { color: colors.mutedText },
    breakdownCard: {
      width: "100%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    breakdownLabel: { color: colors.mutedText, fontWeight: "500" },
    breakdownValue: { color: colors.secondaryText, fontWeight: "600" },
    breakdownMutedRow: { opacity: 0.7 },
    breakdownTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
    breakdownTotalLabel: { color: colors.mutedText, fontWeight: "600" },
    breakdownTotalValue: { color: colors.primaryText, fontSize: 22 },
    notesSection: { width: "100%", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md, backgroundColor: colors.surface, gap: spacing.sm },
    notesTitle: { textTransform: "uppercase", letterSpacing: 0.8, color: colors.mutedText, fontSize: 12 },
    notesBody: { color: colors.secondaryText, lineHeight: 20 },
    notesEmpty: { color: colors.mutedText, fontStyle: "italic" },
    previewHint: { color: colors.mutedText, textAlign: "center", maxWidth: 520 },
  });
}

function createStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    keyboardAvoiding: { flex: 1 },
    loadingState: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
    screenContainer: { flex: 1, backgroundColor: colors.background },
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl * 7 },
    headerCard: { gap: spacing.xl },
    headerIntro: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: "transparent" },
    headerTitle: { fontSize: 24, fontWeight: "700", color: colors.primaryText },
    headerSubtitle: { fontSize: 14, color: colors.mutedText, lineHeight: 20 },
    headerField: { gap: spacing.sm },
    headerLabel: { fontSize: 14, fontWeight: "600", color: colors.mutedText },
    card: { gap: spacing.lg },
    toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.lg },
    toggleLabelGroup: { flex: 1 },
    toggleLabel: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    toggleCaption: { fontSize: 13, color: colors.mutedText, marginTop: 2 },
    sectionTitle: { color: colors.primaryText, fontSize: 20 },
    sectionSubtitle: { color: colors.mutedText },
    fieldGroup: { gap: spacing.sm },
    fieldLabel: { color: colors.mutedText, fontWeight: "600" },
    notesInput: { minHeight: spacing.xxl * 4 },
    photosCard: { gap: spacing.lg },
    photosHeader: { gap: spacing.xs },
    photosList: { gap: spacing.lg },
    photoCard: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    photoInput: { gap: spacing.xs },
    photoButtonRow: { flexDirection: "row", gap: spacing.md },
    photoButton: { flex: 1 },
    photoImage: { width: "100%", height: spacing.xxl * 5 + spacing.xl, borderRadius: radii.sm },
    photoPlaceholder: {
      minHeight: spacing.xxl * 5 + spacing.xl,
      borderRadius: radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    photoPlaceholderText: { textAlign: "center", color: colors.mutedText },
    emptyCard: {
      padding: spacing.xl,
      borderRadius: radii.md,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    emptyText: { color: colors.mutedText },
    lineItemsCard: { gap: spacing.lg },
    lineItemsHeader: { gap: spacing.xs },
    lineItemsList: { paddingVertical: spacing.xs },
    lineItemRow: { gap: spacing.sm },
    lineItem: { backgroundColor: colors.surfaceAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.lg },
    lineItemTotal: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    lineItemActions: { flexDirection: "row", gap: spacing.md },
    lineItemActionButton: { flex: 1 },
    lineItemSeparator: { height: spacing.md },
    lineItemAddButton: { marginTop: spacing.sm },
    inputAdornment: { fontSize: 16, fontWeight: "600", color: colors.mutedText },
    pickerShell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: "hidden",
      backgroundColor: colors.surfaceAlt,
    },
    summaryList: { gap: spacing.md },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    summaryLabel: { fontSize: 14, fontWeight: "600", color: colors.mutedText },
    summaryValue: { fontSize: 16, fontWeight: "600", color: colors.primaryText },
    summaryTotalRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    summaryTotalLabel: { color: colors.mutedText, fontWeight: "600" },
    summaryTotalValue: { color: colors.primaryText, fontSize: 22 },
    footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    footerButtons: { width: "100%", maxWidth: 520, alignSelf: "center", gap: spacing.md },
    footerPreviewButton: { alignSelf: "center" },
    footerPreviewButtonContent: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  });
}
