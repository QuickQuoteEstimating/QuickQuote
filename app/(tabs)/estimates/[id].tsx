import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "react-native-get-random-values";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  AlertButton,
  FlatList,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  type ListRenderItem,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as ImagePicker from "expo-image-picker";
import * as MailComposer from "expo-mail-composer";
import { MailComposerStatus } from "expo-mail-composer";
import * as Print from "expo-print";
import * as SMS from "expo-sms";
import * as FileSystem from "expo-file-system/legacy";
import CustomerPicker from "../../../components/CustomerPicker";
import {
  type EstimateItemFormSubmit,
  type EstimateItemTemplate,
} from "../../../components/EstimateItemForm";
import { useAuth } from "../../../context/AuthContext";
import { useSettings } from "../../../context/SettingsContext";
import { useItemEditor, type ItemEditorConfig } from "../../../context/ItemEditorContext";
import { confirmDelete } from "../../../lib/confirmDelete";
import { logEstimateDelivery, openDB, queueChange } from "../../../lib/sqlite";
import { sanitizeEstimateForQueue } from "../../../lib/estimates";
import { runSync } from "../../../lib/sync";
import {
  listSavedItems,
  upsertSavedItem,
  type SavedItemRecord,
} from "../../../lib/savedItems";
import {
  createPhotoStoragePath,
  deleteLocalPhoto,
  deriveLocalPhotoUri,
  persistLocalPhotoCopy,
  syncPhotoBinaries,
} from "../../../lib/storage";
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

type CustomerContact = Pick<
  CustomerRecord,
  "id" | "name" | "email" | "phone" | "address" | "notes"
>;
import { Theme } from "../../../theme";
import { useThemeContext } from "../../../theme/ThemeProvider";
import type { EstimateListItem, EstimateRecord } from "./index";
import { v4 as uuidv4 } from "uuid";

type EstimateItemRecord = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  total: number;
  apply_markup: number;
  catalog_item_id: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

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

type EstimateItemRecordRow = Omit<EstimateItemRecord, "base_total" | "total" | "apply_markup" | "version"> & {
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
    typeof row.base_total === "number" && Number.isFinite(row.base_total)
      ? row.base_total
      : total;

  return {
    ...row,
    base_total: baseTotal,
    total,
    apply_markup: row.apply_markup === 0 ? 0 : 1,
    version: typeof row.version === "number" && Number.isFinite(row.version) ? row.version : 1,
  };
}

const estimateDraftStore = new Map<string, EstimateFormDraftState>();

function getEstimateFormDraft(estimateId: string): EstimateFormDraftState | null {
  const draft = estimateDraftStore.get(estimateId);
  if (!draft) {
    return null;
  }
  return {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    photoDrafts: { ...draft.photoDrafts },
  };
}

function setEstimateFormDraft(estimateId: string, draft: EstimateFormDraftState) {
  estimateDraftStore.set(estimateId, {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
    photoDrafts: { ...draft.photoDrafts },
  });
}

function clearEstimateFormDraft(estimateId: string) {
  estimateDraftStore.delete(estimateId);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function toPhotoPayload(photo: PhotoRecord) {
  return {
    id: photo.id,
    estimate_id: photo.estimate_id,
    uri: photo.uri,
    description: photo.description,
    version: photo.version ?? 1,
    updated_at: photo.updated_at,
    deleted_at: photo.deleted_at,
  };
}

const STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Declined", value: "declined" },
];

type EstimateRouteParams = {
  id?: string | string[];
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
  const estimateId = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const { user, session } = useAuth();
  const { settings } = useSettings();
  const { theme } = useThemeContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const previewStyles = useMemo(() => createPreviewStyles(theme), [theme]);
  const colors = theme.colors;
  const userId = user?.id ?? session?.user?.id ?? null;
  const { openEditor } = useItemEditor();
  const draftRef = useRef<EstimateFormDraftState | null>(
    estimateId ? getEstimateFormDraft(estimateId) : null,
  );
  const hasRestoredDraftRef = useRef(Boolean(draftRef.current));
  const preserveDraftRef = useRef(false);
  const jobCustomAddressRef = useRef(
    draftRef.current?.jobAddressSameAsBilling ? "" : draftRef.current?.jobAddress ?? "",
  );

  const [estimate, setEstimate] = useState<EstimateListItem | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(draftRef.current?.customerId ?? null);
  const [estimateDate, setEstimateDate] = useState(draftRef.current?.estimateDate ?? "");
  const [notes, setNotes] = useState(draftRef.current?.notes ?? "");
  const [status, setStatus] = useState(draftRef.current?.status ?? "draft");
  const [billingAddress, setBillingAddress] = useState(
    draftRef.current?.billingAddress ?? "",
  );
  const [jobAddress, setJobAddress] = useState(draftRef.current?.jobAddress ?? "");
  const [jobAddressSameAsBilling, setJobAddressSameAsBilling] = useState(
    draftRef.current?.jobAddressSameAsBilling ?? true,
  );
  const [items, setItems] = useState<EstimateItemRecord[]>(
    () => draftRef.current?.items.map((item) => ({ ...item })) ?? [],
  );
  const [savedItems, setSavedItems] = useState<SavedItemRecord[]>([]);
  const [laborHoursText, setLaborHoursText] = useState(draftRef.current?.laborHoursText ?? "0");
  const [hourlyRateText, setHourlyRateText] = useState(
    draftRef.current?.hourlyRateText ?? settings.hourlyRate.toFixed(2),
  );
  const [taxRateText, setTaxRateText] = useState(
    () => draftRef.current?.taxRateText ?? formatPercentageInput(settings.taxRate),
  );
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, string>>(() => ({
    ...(draftRef.current?.photoDrafts ?? {}),
  }));
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [photoSavingId, setPhotoSavingId] = useState<string | null>(null);
  const [photoDeletingId, setPhotoDeletingId] = useState<string | null>(null);
  const [photoSyncing, setPhotoSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfWorking, setPdfWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [customerContact, setCustomerContact] = useState<CustomerContact | null>(null);

  const billingAddressRef = useRef(billingAddress);
  const jobAddressSameAsBillingRef = useRef(jobAddressSameAsBilling);

  useEffect(() => {
    if (jobAddressSameAsBilling) {
      setJobAddress(billingAddress);
    }
  }, [billingAddress, jobAddressSameAsBilling]);

  useEffect(() => {
    billingAddressRef.current = billingAddress;
  }, [billingAddress]);

  useEffect(() => {
    jobAddressSameAsBillingRef.current = jobAddressSameAsBilling;
  }, [jobAddressSameAsBilling]);

  const handleJobAddressToggle = useCallback(
    (value: boolean) => {
      setJobAddressSameAsBilling(value);
      if (value) {
        jobCustomAddressRef.current = jobAddress;
        setJobAddress(billingAddress);
      } else {
        const previous = jobCustomAddressRef.current.trim();
        setJobAddress(previous || "");
      }
    },
    [billingAddress, jobAddress],
  );

  const handleJobAddressChange = useCallback((value: string) => {
    setJobAddress(value);
    jobCustomAddressRef.current = value;
  }, []);

  const statusLabel = useMemo(() => {
    const option = STATUS_OPTIONS.find((option) => option.value === status);
    return option?.label ?? "Draft";
  }, [status]);
  const statusBadgeTone = useMemo(() => getStatusTone(status), [status]);
  const parseNumericInput = useCallback((value: string, fallback = 0): number => {
    const normalized = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(normalized)) {
      return fallback;
    }
    return normalized;
  }, []);

  const laborHours = useMemo(() => {
    return Math.max(0, parseNumericInput(laborHoursText, estimate?.labor_hours ?? 0));
  }, [estimate?.labor_hours, laborHoursText, parseNumericInput]);

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
      materialMarkup: {
        mode: settings.materialMarkupMode,
        value: settings.materialMarkup,
      },
      laborHours,
      laborRate: hourlyRate,
      laborMarkup: {
        mode: settings.laborMarkupMode,
        value: settings.laborMarkup,
      },
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
  const pdfOptions = useMemo<EstimatePdfOptions | null>(() => {
    if (!estimate) {
      return null;
    }

    const isoDate = estimateDate ? new Date(estimateDate).toISOString() : estimate.date;

    const trimmedNotes = notes.trim();
    const billingAddressValue = billingAddress.trim() ? billingAddress.trim() : null;
    const jobAddressValue = jobAddressSameAsBilling
      ? billingAddressValue
      : jobAddress.trim()
          ? jobAddress.trim()
          : null;

    return {
      estimate: {
        id: estimate.id,
        date: isoDate,
        status,
        notes: trimmedNotes ? trimmedNotes : null,
        total: totals.grandTotal,
        materialTotal: totals.materialTotal,
        laborTotal: totals.laborTotal,
        taxTotal: totals.taxTotal,
        subtotal: totals.subtotal,
        laborHours: totals.laborHours,
        laborRate: totals.laborRate,
        billingAddress: billingAddressValue,
        jobAddress: jobAddressValue,
        jobDetails: trimmedNotes ? trimmedNotes : null,
        customer: {
          name: customerContact?.name ?? estimate.customer_name ?? "Customer",
          email: customerContact?.email ?? estimate.customer_email ?? null,
          phone: customerContact?.phone ?? estimate.customer_phone ?? null,
          address:
            billingAddressValue ?? customerContact?.address ?? estimate.customer_address ?? null,
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
      photos: photos.map((photo) => ({
        id: photo.id,
        description: photo.description,
        localUri: photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri),
        remoteUri: photo.uri,
      })),
      termsAndConditions: settings.termsAndConditions,
      paymentDetails: settings.paymentDetails,
    };
  }, [
    billingAddress,
    customerContact,
    estimate,
    estimateDate,
    items,
    jobAddress,
    jobAddressSameAsBilling,
    notes,
    photos,
    status,
    totals.grandTotal,
    totals.laborTotal,
    totals.materialTotal,
    totals.subtotal,
    totals.taxTotal,
    settings.paymentDetails,
    settings.termsAndConditions,
  ]);
  const previewEstimateNumber = useMemo(() => {
    const identifier = pdfOptions?.estimate.id ?? estimate?.id ?? null;
    if (!identifier) {
      return "—";
    }
    return identifier;
  }, [estimate?.id, pdfOptions]);
  const previewCustomerName = useMemo(() => {
    const name = pdfOptions?.estimate.customer?.name ?? null;
    const normalized = name?.trim();
    return normalized && normalized.length > 0 ? normalized : "No name on file";
  }, [pdfOptions]);
  const previewCustomerEmail = useMemo(() => {
    const email = pdfOptions?.estimate.customer?.email ?? null;
    const normalized = email?.trim();
    return normalized && normalized.length > 0 ? normalized : "N/A";
  }, [pdfOptions]);
  const previewCustomerPhone = useMemo(() => {
    const phone = pdfOptions?.estimate.customer?.phone ?? null;
    const normalized = phone?.trim();
    return normalized && normalized.length > 0 ? normalized : "N/A";
  }, [pdfOptions]);
  const formatAddressPreview = useCallback((address: string | null | undefined) => {
    if (!address || !address.trim()) {
      return "Address not provided";
    }
    return address
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(", ");
  }, []);
  const previewBillingAddressDisplay = useMemo(() => {
    const address =
      pdfOptions?.estimate.billingAddress ?? pdfOptions?.estimate.customer?.address ?? null;
    return formatAddressPreview(address);
  }, [formatAddressPreview, pdfOptions]);
  const previewJobAddressDisplay = useMemo(() => {
    const estimateData = pdfOptions?.estimate;
    const address =
      estimateData?.jobAddress ??
      estimateData?.billingAddress ??
      estimateData?.customer?.address ??
      null;
    return formatAddressPreview(address);
  }, [formatAddressPreview, pdfOptions]);
  const previewJobAddressHint = useMemo(() => {
    const estimateData = pdfOptions?.estimate;
    const job = estimateData?.jobAddress?.trim();
    const billing = estimateData?.billingAddress?.trim();
    if (!job || !billing) {
      return null;
    }
    return job === billing ? "Matches billing address" : "Different from billing address";
  }, [pdfOptions]);
  const previewDate = useMemo(() => {
    if (estimateDate) {
      return new Date(estimateDate).toLocaleDateString();
    }
    const isoDate = pdfOptions?.estimate.date;
    return isoDate ? new Date(isoDate).toLocaleDateString() : "Date not set";
  }, [estimateDate, pdfOptions]);
  const previewLineItems = useMemo(() => {
    const count = pdfOptions?.items?.length ?? items.length;
    if (count === 0) {
      return "No line items";
    }
    return count === 1 ? "1 line item" : `${count} line items`;
  }, [items.length, pdfOptions]);
  const previewPhotoSummary = useMemo(() => {
    const count = pdfOptions?.photos?.length ?? photos.length;
    if (!count) {
      return "No photos";
    }
    return count === 1 ? "1 photo" : `${count} photos`;
  }, [pdfOptions, photos.length]);
  const previewNotesSummary = useMemo(() => {
    const raw = pdfOptions?.estimate.jobDetails ?? pdfOptions?.estimate.notes ?? null;
    if (!raw) {
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      return null;
    }
    const snippet = lines.slice(0, 3);
    let summary = snippet.join("\n");
    if (lines.length > snippet.length) {
      summary = `${summary}\n…`;
    } else if (trimmed.length > summary.length) {
      summary = `${summary}${summary.endsWith("\n") ? "" : "\n"}…`;
    }
    return summary;
  }, [pdfOptions]);
  const estimateRef = useRef<EstimateListItem | null>(null);
  const lastPdfRef = useRef<EstimatePdfResult | null>(null);
  const releasePdfRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    if (!estimate) {
      setHourlyRateText(settings.hourlyRate.toFixed(2));
    }
  }, [estimate, settings.hourlyRate]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }
    if (!estimate) {
      setTaxRateText(formatPercentageInput(settings.taxRate));
    }
  }, [estimate, settings.taxRate]);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      hasRestoredDraftRef.current = false;
    }
  }, []);

  const loadSavedItems = useCallback(async () => {
    if (!userId) {
      setSavedItems([]);
      return;
    }

    try {
      const records = await listSavedItems(userId);
      setSavedItems(records);
    } catch (error) {
      console.error("Failed to load saved items", error);
    }
  }, [userId]);

  useEffect(() => {
    loadSavedItems();
  }, [loadSavedItems]);

  const savedItemTemplates = useMemo<EstimateItemTemplate[]>(
    () =>
      savedItems.map((item) => ({
        id: item.id,
        description: item.name,
        unit_price: item.default_unit_price,
        default_quantity: item.default_quantity,
        default_markup_applicable: item.default_markup_applicable !== 0,
      })),
    [savedItems],
  );

  useEffect(() => {
    estimateRef.current = estimate;
  }, [estimate]);

  const applyPhotoState = useCallback(
    (rows: PhotoRecord[]) => {
      setPhotos(rows);
      setPhotoDrafts((current) => {
        const next: Record<string, string> = {};
        for (const row of rows) {
          const dbValue = row.description ?? "";
          const existing = current[row.id];
          if (existing === undefined || existing === dbValue || photoSavingId === row.id) {
            next[row.id] = dbValue;
          } else {
            next[row.id] = existing;
          }
        }
        return next;
      });
    },
    [photoSavingId],
  );

  useEffect(() => {
    if (!customerId) {
      setCustomerContact(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<CustomerContact>(
          `SELECT id, name, email, phone, address, notes
           FROM customers
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1`,
          [customerId],
        );

        if (cancelled) {
          return;
        }

        const record = rows[0];
        if (record) {
          setCustomerContact({
            id: record.id,
            name: record.name,
            email: record.email ?? null,
            phone: record.phone ?? null,
            address: record.address ?? null,
            notes: record.notes ?? null,
          });
          if (!billingAddressRef.current.trim()) {
            const nextBilling = record.address ?? "";
            setBillingAddress(nextBilling);
            if (jobAddressSameAsBillingRef.current) {
              setJobAddress(nextBilling);
            }
          }
        } else {
          setCustomerContact(null);
        }
      } catch (error) {
        console.error("Failed to load customer contact", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const refreshPhotosFromDb = useCallback(async () => {
    if (!estimateId) {
      return;
    }

    const db = await openDB();
    const rows = await db.getAllAsync<PhotoRecord>(
      `SELECT id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at
       FROM photos
       WHERE estimate_id = ?
       ORDER BY datetime(updated_at) ASC`,
      [estimateId],
    );

    const activePhotos = rows.filter((row) => !row.deleted_at);
    applyPhotoState(activePhotos);
  }, [estimateId, applyPhotoState]);


  useEffect(() => {
    lastPdfRef.current = null;
    if (releasePdfRef.current) {
      releasePdfRef.current();
      releasePdfRef.current = null;
    }
  }, [pdfOptions]);

  useEffect(() => {
    return () => {
      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
    };
  }, []);

  const openItemEditorScreen = useCallback(
    (config: ItemEditorConfig) => {
      preserveDraftRef.current = true;
      openEditor({
        ...config,
        onSubmit: async (payload) => {
          try {
            await config.onSubmit(payload);
          } finally {
            preserveDraftRef.current = false;
          }
        },
        onCancel: () => {
          try {
            config.onCancel?.();
          } finally {
            preserveDraftRef.current = false;
          }
        },
      });
      router.push("/(tabs)/estimates/item-editor");
    },
    [openEditor],
  );

  const persistEstimateTotals = useCallback(
    async (nextTotals: ReturnType<typeof calculateEstimateTotals>) => {
      const current = estimateRef.current;
      if (!current) {
        return false;
      }

      const normalizedTotal = Math.round(nextTotals.grandTotal * 100) / 100;
      const compare = (incoming: number, next: number) => {
        const currentValue = Math.round(incoming * 100) / 100;
        return Math.abs(currentValue - next) >= 0.005;
      };

      const shouldUpdate =
        compare(current.total, normalizedTotal) ||
        compare(current.material_total, nextTotals.materialTotal) ||
        compare(current.labor_total, nextTotals.laborTotal) ||
        compare(current.subtotal, nextTotals.subtotal) ||
        compare(current.tax_total, nextTotals.taxTotal) ||
        Math.abs(current.labor_hours - nextTotals.laborHours) >= 0.005 ||
        Math.abs(current.labor_rate - nextTotals.laborRate) >= 0.005 ||
        Math.abs(current.tax_rate - nextTotals.taxRate) >= 0.005;

      if (!shouldUpdate) {
        return false;
      }

      try {
        const now = new Date().toISOString();
        const nextVersion = current.version + 1;
        const db = await openDB();
        await db.runAsync(
          `UPDATE estimates
           SET total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, version = ?, updated_at = ?
           WHERE id = ?`,
          [
            normalizedTotal,
            nextTotals.materialTotal,
            nextTotals.laborHours,
            nextTotals.laborRate,
            nextTotals.laborTotal,
            nextTotals.subtotal,
            nextTotals.taxRate,
            nextTotals.taxTotal,
            nextVersion,
            now,
            current.id,
          ],
        );

        const updatedEstimate: EstimateListItem = {
          ...current,
          total: normalizedTotal,
          material_total: nextTotals.materialTotal,
          labor_hours: nextTotals.laborHours,
          labor_rate: nextTotals.laborRate,
          labor_total: nextTotals.laborTotal,
          subtotal: nextTotals.subtotal,
          tax_rate: nextTotals.taxRate,
          tax_total: nextTotals.taxTotal,
          version: nextVersion,
          updated_at: now,
        };

        estimateRef.current = updatedEstimate;
        setEstimate(updatedEstimate);

        await queueChange("estimates", "update", sanitizeEstimateForQueue(updatedEstimate));
        return true;
      } catch (error) {
        console.error("Failed to update estimate totals", error);
        Alert.alert("Error", "Unable to update the estimate totals. Please try again.");
        return false;
      }
    },
    [],
  );

  const makeItemSubmitHandler = useCallback(
    (existingItem?: EstimateItemRecord | null) =>
      async ({ values, saveToLibrary, templateId }: EstimateItemFormSubmit) => {
        const currentEstimate = estimateRef.current;
        if (!currentEstimate) {
          return;
        }

        try {
          const now = new Date().toISOString();
          const db = await openDB();
          let resolvedTemplateId: string | null = templateId ?? null;

          if (saveToLibrary && userId) {
            try {
              const record = await upsertSavedItem({
                id: templateId ?? undefined,
                userId,
                name: values.description,
                unitPrice: values.unit_price,
                defaultQuantity: values.quantity,
                markupApplicable: values.apply_markup,
              });
              resolvedTemplateId = record.id;
              setSavedItems((prev) => {
                const existingIndex = prev.findIndex((item) => item.id === record.id);
                if (existingIndex >= 0) {
                  const next = [...prev];
                  next[existingIndex] = record;
                  return next;
                }
                return [...prev, record].sort((a, b) => a.name.localeCompare(b.name));
              });
            } catch (error) {
              console.error("Failed to update item catalog", error);
              Alert.alert(
                "Saved items",
                "We couldn't update your saved items library. The estimate item was still updated.",
              );
            }
          }

          let nextItems: EstimateItemRecord[] = [];

          if (existingItem) {
            const nextVersion = existingItem.version + 1;
            const updatedItem: EstimateItemRecord = {
              ...existingItem,
              description: values.description,
              quantity: values.quantity,
              unit_price: values.unit_price,
              base_total: values.base_total,
              total: values.total,
              apply_markup: values.apply_markup ? 1 : 0,
              catalog_item_id: resolvedTemplateId,
              version: nextVersion,
              updated_at: now,
              deleted_at: null,
            };

            await db.runAsync(
              `UPDATE estimate_items
               SET description = ?, quantity = ?, unit_price = ?, base_total = ?, total = ?, apply_markup = ?, catalog_item_id = ?, version = ?, updated_at = ?, deleted_at = NULL
               WHERE id = ?`,
              [
                updatedItem.description,
                updatedItem.quantity,
                updatedItem.unit_price,
                updatedItem.base_total,
                updatedItem.total,
                updatedItem.apply_markup,
                updatedItem.catalog_item_id,
                nextVersion,
                now,
                updatedItem.id,
              ],
            );

            await queueChange("estimate_items", "update", updatedItem);

            setItems((prev) => {
              nextItems = prev.map((item) => (item.id === updatedItem.id ? updatedItem : item));
              return nextItems;
            });
          } else {
            const newItem: EstimateItemRecord = {
              id: uuidv4(),
              estimate_id: currentEstimate.id,
              description: values.description,
              quantity: values.quantity,
              unit_price: values.unit_price,
              base_total: values.base_total,
              total: values.total,
              apply_markup: values.apply_markup ? 1 : 0,
              catalog_item_id: resolvedTemplateId,
              version: 1,
              updated_at: now,
              deleted_at: null,
            };

            await db.runAsync(
              `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup, catalog_item_id, version, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newItem.id,
                newItem.estimate_id,
                newItem.description,
                newItem.quantity,
                newItem.unit_price,
                newItem.base_total,
                newItem.total,
                newItem.apply_markup,
                newItem.catalog_item_id,
                newItem.version,
                newItem.updated_at,
                newItem.deleted_at,
              ],
            );

            await queueChange("estimate_items", "insert", newItem);

            setItems((prev) => {
              nextItems = [...prev, newItem];
              return nextItems;
            });
          }

          const nextTotals = calculateEstimateTotals({
            materialLineItems: nextItems.map((item) => ({
              baseTotal: item.base_total,
              applyMarkup: item.apply_markup !== 0,
            })),
            materialMarkup: {
              mode: settings.materialMarkupMode,
              value: settings.materialMarkup,
            },
            laborHours,
            laborRate: hourlyRate,
            laborMarkup: {
              mode: settings.laborMarkupMode,
              value: settings.laborMarkup,
            },
            taxRate,
          });
          await persistEstimateTotals(nextTotals);
          await runSync();
        } catch (error) {
          console.error("Failed to save estimate item", error);
          Alert.alert("Error", "Unable to save the item. Please try again.");
        }
      },
    [
      hourlyRate,
      laborHours,
      persistEstimateTotals,
      settings.laborMarkup,
      settings.laborMarkupMode,
      settings.materialMarkup,
      settings.materialMarkupMode,
      taxRate,
      userId,
    ],
  );

  const handleDeleteItem = useCallback(
    (item: EstimateItemRecord) => {
      Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const previousItems = items;
            const previousTotals = calculateEstimateTotals({
              materialLineItems: previousItems.map((existing) => ({
                baseTotal: existing.base_total,
                applyMarkup: existing.apply_markup !== 0,
              })),
              laborHours,
              laborRate: hourlyRate,
              taxRate,
            });
            const nextItems = items.filter((existing) => existing.id !== item.id);
            const nextTotals = calculateEstimateTotals({
              materialLineItems: nextItems.map((existing) => ({
                baseTotal: existing.base_total,
                applyMarkup: existing.apply_markup !== 0,
              })),
              laborHours,
              laborRate: hourlyRate,
              taxRate,
            });

            setItems(nextItems);

            (async () => {
              const db = await openDB();
              const now = new Date().toISOString();
              const nextVersion = item.version + 1;

              try {
                await db.runAsync(
                  `UPDATE estimate_items
                     SET deleted_at = ?, updated_at = ?, version = ?
                     WHERE id = ?`,
                  [now, now, nextVersion, item.id],
                );

                const deletedItem: EstimateItemRecord = {
                  ...item,
                  deleted_at: now,
                  updated_at: now,
                  version: nextVersion,
                };

                await queueChange("estimate_items", "update", deletedItem);
                await persistEstimateTotals(nextTotals);
                void runSync().catch((error) => {
                  console.error("Failed to sync item deletion", error);
                });
              } catch (error) {
                console.error("Failed to delete estimate item", error);
                Alert.alert("Error", "Unable to delete the item. Please try again.");
                setItems(previousItems);
                try {
                  await persistEstimateTotals(previousTotals);
                  await db.runAsync(
                    `UPDATE estimate_items
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                    [item.updated_at, item.version, item.id],
                  );
                } catch (recoveryError) {
                  console.error("Failed to revert local item deletion", recoveryError);
                }
              }
            })();
          },
        },
      ]);
    },
    [hourlyRate, items, laborHours, persistEstimateTotals, taxRate],
  );

  const renderItem = useCallback<ListRenderItem<EstimateItemRecord>>(
    ({ item }) => {
      const quantity = item.quantity || 0;
      const normalizedTotal = Math.round(item.total * 100) / 100;
      const unitDisplay =
        quantity > 0 ? Math.round((normalizedTotal / quantity) * 100) / 100 : normalizedTotal;

      return (
        <View style={styles.lineItemRow}>
          <ListItem
            title={item.description}
            subtitle={`Qty: ${quantity} @ ${formatCurrency(unitDisplay)}`}
            rightContent={<Body style={styles.lineItemTotal}>{formatCurrency(normalizedTotal)}</Body>}
            style={styles.lineItem}
          />
          <View style={styles.lineItemActions}>
            <Button
              label="Edit"
              variant="secondary"
              alignment="inline"
              onPress={() =>
                openItemEditorScreen({
                  title: "Edit Item",
                  submitLabel: "Update Item",
                  initialValue: {
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    apply_markup: item.apply_markup !== 0,
                  },
                  initialTemplateId: item.catalog_item_id,
                  templates: () => savedItemTemplates,
                  materialMarkupValue: settings.materialMarkup,
                  materialMarkupMode: settings.materialMarkupMode,
                  onSubmit: makeItemSubmitHandler(item),
                })
              }
              style={styles.lineItemActionButton}
            />
            <Button
              label="Remove"
              variant="danger"
              alignment="inline"
              onPress={() => handleDeleteItem(item)}
              style={styles.lineItemActionButton}
            />
          </View>
        </View>
      );
    },
    [
      handleDeleteItem,
      makeItemSubmitHandler,
      openItemEditorScreen,
      savedItemTemplates,
      settings.materialMarkup,
      settings.materialMarkupMode,
    ],
  );

  const handlePhotoDraftChange = useCallback((photoId: string, value: string) => {
    setPhotoDrafts((current) => ({
      ...current,
      [photoId]: value,
    }));
  }, []);

  const handleAddPhoto = useCallback(async () => {
    if (!estimateId || addingPhoto) {
      return;
    }

    try {
      setAddingPhoto(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Photo library access is required to attach photos to this estimate.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        return;
      }

      const db = await openDB();
      const now = new Date().toISOString();
      const id = uuidv4();
      const storagePath = createPhotoStoragePath(estimateId, id, asset.uri);
      const localUri = await persistLocalPhotoCopy(id, storagePath, asset.uri);

      const newPhoto: PhotoRecord = {
        id,
        estimate_id: estimateId,
        uri: storagePath,
        local_uri: localUri,
        description: null,
        version: 1,
        updated_at: now,
        deleted_at: null,
      };

      await db.runAsync(
        `INSERT OR REPLACE INTO photos (id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newPhoto.id,
          newPhoto.estimate_id,
          newPhoto.uri,
          newPhoto.local_uri,
          newPhoto.description,
          newPhoto.version,
          newPhoto.updated_at,
          newPhoto.deleted_at,
        ],
      );

      await queueChange("photos", "insert", toPhotoPayload(newPhoto));

      await runSync();
      await refreshPhotosFromDb();
    } catch (error) {
      console.error("Failed to add photo", error);
      Alert.alert("Error", "Unable to add the photo. Please try again.");
    } finally {
      setAddingPhoto(false);
    }
  }, [estimateId, addingPhoto, refreshPhotosFromDb]);

  const handleSavePhotoDescription = useCallback(
    async (photo: PhotoRecord) => {
      const draft = photoDrafts[photo.id]?.trim() ?? "";
      const normalized = draft ? draft : null;

      if ((photo.description ?? null) === normalized) {
        return;
      }

      try {
        setPhotoSavingId(photo.id);
        const db = await openDB();
        const now = new Date().toISOString();
        const nextVersion = (photo.version ?? 1) + 1;

        await db.runAsync(
          `UPDATE photos
           SET description = ?, version = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
          [normalized, nextVersion, now, photo.id],
        );

        const updated: PhotoRecord = {
          ...photo,
          description: normalized,
          version: nextVersion,
          updated_at: now,
          deleted_at: null,
        };

        await queueChange("photos", "update", toPhotoPayload(updated));

        await runSync();
        await refreshPhotosFromDb();
      } catch (error) {
        console.error("Failed to update photo description", error);
        Alert.alert("Error", "Unable to update the photo description. Please try again.");
      } finally {
        setPhotoSavingId(null);
      }
    },
    [photoDrafts, refreshPhotosFromDb],
  );

  const handleDeletePhoto = useCallback(
    (photo: PhotoRecord) => {
      Alert.alert("Remove Photo", "Are you sure you want to remove this photo?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setPhotoDeletingId(photo.id);
            const previousPhotos = photos;
            const nextPhotos = photos.filter((existing) => existing.id !== photo.id);
            applyPhotoState(nextPhotos);

            (async () => {
              const db = await openDB();
              const now = new Date().toISOString();
              const nextVersion = (photo.version ?? 1) + 1;

              try {
                await db.runAsync(
                  `UPDATE photos
                     SET deleted_at = ?, updated_at = ?, version = ?, local_uri = NULL
                     WHERE id = ?`,
                  [now, now, nextVersion, photo.id],
                );

                await deleteLocalPhoto(photo.local_uri ?? deriveLocalPhotoUri(photo.id, photo.uri));

                await queueChange("photos", "delete", { id: photo.id });

                void runSync().catch((error) => {
                  console.error("Failed to sync photo deletion", error);
                });
                await refreshPhotosFromDb();
              } catch (error) {
                console.error("Failed to delete photo", error);
                Alert.alert("Error", "Unable to delete the photo. Please try again.");
                applyPhotoState(previousPhotos);
                try {
                  await db.runAsync(
                    `UPDATE photos
                       SET deleted_at = NULL, updated_at = ?, version = ?
                       WHERE id = ?`,
                    [photo.updated_at, photo.version ?? 1, photo.id],
                  );
                } catch (recoveryError) {
                  console.error("Failed to revert local photo deletion", recoveryError);
                }
              } finally {
                setPhotoDeletingId(null);
              }
            })();
          },
        },
      ]);
    },
    [applyPhotoState, photos, refreshPhotosFromDb],
  );

  const handleRetryPhotoSync = useCallback(async () => {
    try {
      setPhotoSyncing(true);
      await syncPhotoBinaries();
      await refreshPhotosFromDb();
    } catch (error) {
      console.error("Failed to sync photos", error);
      Alert.alert("Error", "Unable to sync photos. Please try again later.");
    } finally {
      setPhotoSyncing(false);
    }
  }, [refreshPhotosFromDb]);

  const ensurePdfReady = useCallback(async () => {
    if (!pdfOptions) {
      Alert.alert("Missing data", "Unable to build the estimate PDF.");
      return null;
    }

    try {
      const cached = lastPdfRef.current;
      if (cached) {
        return cached;
      }
      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
      const result = await renderEstimatePdf(pdfOptions);
      if (Platform.OS === "web" && typeof URL !== "undefined" && result.uri.startsWith("blob:")) {
        releasePdfRef.current = () => {
          try {
            URL.revokeObjectURL(result.uri);
          } catch (error) {
            console.warn("Failed to release PDF preview", error);
          }
        };
      }
      lastPdfRef.current = result;
      return result;
    } catch (error) {
      console.error("Failed to generate PDF", error);
      Alert.alert("Error", "Unable to prepare the PDF. Please try again.");
      return null;
    }
  }, [pdfOptions]);

  const ensureShareablePdf = useCallback(
    async (pdf: EstimatePdfResult): Promise<EstimatePdfResult> => {
      if (!estimate) {
        return pdf;
      }
      if (Platform.OS === "web") {
        return pdf;
      }
      if (pdf.publicUrl) {
        return pdf;
      }
      if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
        return pdf;
      }

      try {
        const uploaded = await uploadEstimatePdfToStorage(pdf, estimate.id);
        if (uploaded) {
          const enriched: EstimatePdfResult = {
            ...pdf,
            storagePath: uploaded.storagePath,
            publicUrl: uploaded.publicUrl,
          };
          lastPdfRef.current = enriched;
          return enriched;
        }
      } catch (error) {
        console.warn("Failed to upload estimate PDF for sharing", error);
      }

      return pdf;
    },
    [estimate],
  );

  const resolveAttachmentUri = useCallback(async (uri: string): Promise<string> => {
    if (Platform.OS === "android" && typeof FileSystem.getContentUriAsync === "function") {
      try {
        const contentUri = await FileSystem.getContentUriAsync(uri);
        if (contentUri) {
          return contentUri;
        }
      } catch (error) {
        console.warn("Failed to resolve attachment URI", error);
      }
    }
    return uri;
  }, []);

  const handlePreviewPdf = useCallback(async () => {
    setPdfWorking(true);
    try {
      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }

      if (Platform.OS === "web") {
        if (typeof window === "undefined") {
          Alert.alert("Unavailable", "Preview is not supported in this environment.");
          return;
        }
        const previewWindow = window.open("", "_blank");
        if (!previewWindow) {
          Alert.alert("Popup blocked", "Allow popups to preview the estimate.");
          return;
        }
        previewWindow.document.write(pdf.html);
        previewWindow.document.close();
        return;
      }

      await Print.printAsync({ html: pdf.html });
    } catch (error) {
      console.error("Failed to preview PDF", error);
      Alert.alert("Error", "Unable to preview the PDF. Please try again.");
    } finally {
      setPdfWorking(false);
    }
  }, [ensurePdfReady]);

  const markEstimateSent = useCallback(
    async (channel: "email" | "sms") => {
      const current = estimateRef.current;
      if (!current || current.status?.toLowerCase() === "sent") {
        if (status !== "sent") {
          setStatus("sent");
        }
        setSendSuccessMessage(
          channel === "email"
            ? "Estimate sent to your client via email."
            : "Estimate sent to your client via text message.",
        );
        return;
      }

      try {
        const now = new Date().toISOString();
        const nextVersion = current.version + 1;
        const db = await openDB();
        await db.runAsync(
          `UPDATE estimates
           SET status = ?, version = ?, updated_at = ?
           WHERE id = ?`,
          ["sent", nextVersion, now, current.id],
        );

        const updated: EstimateListItem = {
          ...current,
          status: "sent",
          version: nextVersion,
          updated_at: now,
        };

        estimateRef.current = updated;
        setEstimate(updated);
        setStatus("sent");
        setSendSuccessMessage(
          channel === "email"
            ? "Estimate sent to your client via email."
            : "Estimate sent to your client via text message.",
        );

        await queueChange("estimates", "update", sanitizeEstimateForQueue(updated));
        await runSync();
      } catch (error) {
        console.error("Failed to update estimate status", error);
        Alert.alert(
          "Status",
          `Your estimate was ${channel === "email" ? "emailed" : "texted"}, but we couldn't update the status automatically. Please review it manually.`,
        );
      }
    },
    [setEstimate, setSendSuccessMessage, setStatus, status],
  );

  const sendEstimateViaEmail = useCallback(async (pdf: EstimatePdfResult) => {
    if (!estimate) {
      return;
    }

    const emailAddress = customerContact?.email?.trim();
    if (!emailAddress) {
      Alert.alert(
        "Missing email",
        "Add an email address for this customer to share the estimate via email.",
      );
      return;
    }

    setSending(true);
    try {
      setSendSuccessMessage(null);
      const shareablePdf = await ensureShareablePdf(pdf);
      let attachmentUri: string | null = null;
      if (shareablePdf.uri?.startsWith("file://")) {
        attachmentUri = await resolveAttachmentUri(shareablePdf.uri);
      }

      const subjectText = `Estimate ${estimate.id} from QuickQuote`;
      const greetingName = customerContact?.name?.trim() || "there";
      const bodyLines = [
        `Hi ${greetingName},`,
        "",
        "Please review your estimate from QuickQuote.",
        `Total: ${formatCurrency(totals.grandTotal)}`,
      ];
      if (shareablePdf.publicUrl) {
        bodyLines.push(`PDF: ${shareablePdf.publicUrl}`);
      } else if (attachmentUri) {
        bodyLines.push("The estimate PDF is attached for your convenience.");
      } else {
        bodyLines.push("Open QuickQuote to download the full PDF estimate.");
      }
      bodyLines.push("", "Thank you!");
      const bodyPlain = bodyLines.join("\n");
      const messagePreview =
        bodyPlain.length > 240 ? `${bodyPlain.slice(0, 237)}...` : bodyPlain;

      if (Platform.OS !== "web" && (await MailComposer.isAvailableAsync())) {
        const composerResult = await MailComposer.composeAsync({
          recipients: [emailAddress],
          subject: subjectText,
          body: bodyPlain,
          attachments: attachmentUri ? [attachmentUri] : undefined,
          isHtml: false,
        });

        await logEstimateDelivery({
          estimateId: estimate.id,
          channel: "email",
          recipient: emailAddress,
          messagePreview,
          metadata: {
            pdfUri: shareablePdf.uri,
            attachmentUri,
            publicUrl: shareablePdf.publicUrl ?? null,
            mailComposerStatus: composerResult.status ?? null,
          },
        });

        if (composerResult.status === MailComposerStatus.SENT) {
          await markEstimateSent("email");
        } else if (composerResult.status === MailComposerStatus.CANCELLED) {
          setSendSuccessMessage("Email cancelled. You can try again when you're ready.");
        } else {
          setSendSuccessMessage("Email draft saved. Send it from your mail app when ready.");
        }
        return;
      }

      const subject = encodeURIComponent(subjectText);
      const body = encodeURIComponent(bodyPlain);
      const mailto = `mailto:${encodeURIComponent(emailAddress)}?subject=${subject}&body=${body}`;

      let canOpen = true;
      if (Platform.OS !== "web") {
        canOpen = await Linking.canOpenURL(mailto);
      }
      if (!canOpen) {
        Alert.alert("Unavailable", "No email client is configured on this device.");
        return;
      }

      await Linking.openURL(mailto);

      if (Platform.OS === "web" && typeof document !== "undefined" && shareablePdf.uri) {
        const link = document.createElement("a");
        link.href = shareablePdf.uri;
        link.download = shareablePdf.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      await logEstimateDelivery({
        estimateId: estimate.id,
        channel: "email",
        recipient: emailAddress,
        messagePreview,
        metadata: {
          pdfUri: shareablePdf.uri,
          publicUrl: shareablePdf.publicUrl ?? null,
          mailto,
        },
      });
      await markEstimateSent("email");
    } catch (error) {
      console.error("Failed to share via email", error);
      Alert.alert("Error", "Unable to share the estimate via email.");
    } finally {
      setSending(false);
    }
  }, [
    customerContact?.email,
    customerContact?.name,
    ensureShareablePdf,
    estimate,
    logEstimateDelivery,
    markEstimateSent,
    resolveAttachmentUri,
    setSendSuccessMessage,
    totals.grandTotal,
  ]);

  const sendEstimateViaSms = useCallback(
    async (pdf: EstimatePdfResult) => {
      if (!estimate) {
        return;
      }

      const phoneNumber = customerContact?.phone?.trim();
      if (!phoneNumber) {
        Alert.alert(
          "Missing phone",
          "Add a mobile number for this customer to share the estimate via SMS.",
        );
        return;
      }

      setSending(true);
      try {
        setSendSuccessMessage(null);
        const smsSupported = await SMS.isAvailableAsync();
        if (!smsSupported) {
          Alert.alert("Unavailable", "SMS is not supported on this device.");
          return;
        }

        const shareablePdf = await ensureShareablePdf(pdf);
        let attachmentUri: string | null = null;
        if (shareablePdf.uri?.startsWith("file://")) {
          attachmentUri = await resolveAttachmentUri(shareablePdf.uri);
        }

        const messageParts = [
          `Estimate ${estimate.id}`,
          `Total: ${formatCurrency(totals.grandTotal)}`,
        ];
        if (shareablePdf.publicUrl) {
          messageParts.push(`PDF: ${shareablePdf.publicUrl}`);
        } else if (attachmentUri) {
          messageParts.push("The estimate PDF is attached.");
        } else {
          messageParts.push("Download the PDF from QuickQuote to review details.");
        }
        const message = messageParts.join("\n");
        let smsResponse;
        try {
          smsResponse = await SMS.sendSMSAsync(
            [phoneNumber],
            message,
            attachmentUri
              ? {
                  attachments: [
                    {
                      uri: attachmentUri,
                      mimeType: "application/pdf",
                      filename: shareablePdf.fileName,
                    },
                  ],
                }
              : undefined,
          );
        } catch (error) {
          console.warn("Failed to send SMS with attachment", error);
          smsResponse = await SMS.sendSMSAsync([phoneNumber], message);
        }

        await logEstimateDelivery({
          estimateId: estimate.id,
          channel: "sms",
          recipient: phoneNumber,
          messagePreview: message.length > 240 ? `${message.slice(0, 237)}...` : message,
          metadata: {
            pdfUri: shareablePdf.uri,
            publicUrl: shareablePdf.publicUrl ?? null,
            smsResult: smsResponse?.result ?? null,
          },
        });
        if (smsResponse?.result === "sent") {
          await markEstimateSent("sms");
        } else if (smsResponse?.result === "cancelled") {
          setSendSuccessMessage("Text message cancelled before sending.");
        } else {
          setSendSuccessMessage("Check your messaging app to finish sending this estimate.");
        }
      } catch (error) {
        console.error("Failed to share via SMS", error);
        Alert.alert("Error", "Unable to share the estimate via SMS.");
      } finally {
        setSending(false);
      }
    },
    [
      customerContact?.phone,
      ensureShareablePdf,
      estimate,
      logEstimateDelivery,
      markEstimateSent,
      resolveAttachmentUri,
      setSendSuccessMessage,
      totals.grandTotal,
    ],
  );

  const saveEstimate = useCallback(async (): Promise<EstimateListItem | null> => {
    if (!estimate || saving) {
      return null;
    }

    if (!customerId) {
      Alert.alert("Validation", "Please select a customer.");
      return null;
    }

    setSaving(true);

    try {
      const safeTotal = Math.round(totals.grandTotal * 100) / 100;
      const now = new Date().toISOString();
      let isoDate: string | null = null;
      if (estimateDate) {
        const parsedDate = new Date(estimateDate);
        isoDate = isNaN(parsedDate.getTime())
          ? now
          : new Date(parsedDate.setHours(0, 0, 0, 0)).toISOString();
      }

      const trimmedNotes = notes.trim() ? notes.trim() : null;
      const billingAddressValue = billingAddress.trim() ? billingAddress.trim() : null;
      const jobAddressValue = jobAddressSameAsBilling
        ? billingAddressValue
        : jobAddress.trim()
            ? jobAddress.trim()
            : null;
      const nextVersion = estimate.version + 1;

      const db = await openDB();
      await db.runAsync(
        `UPDATE estimates
         SET customer_id = ?, date = ?, total = ?, material_total = ?, labor_hours = ?, labor_rate = ?, labor_total = ?, subtotal = ?, tax_rate = ?, tax_total = ?, notes = ?, status = ?, version = ?, updated_at = ?, deleted_at = NULL, billing_address = ?, job_address = ?, job_details = ?
         WHERE id = ?`,
        [
          customerId,
          isoDate,
          safeTotal,
          totals.materialTotal,
          totals.laborHours,
          totals.laborRate,
          totals.laborTotal,
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
        ],
      );

      let customerName = estimate.customer_name;
      let customerEmail = estimate.customer_email;
      let customerPhone = estimate.customer_phone;
      let customerAddress = estimate.customer_address;
      if (customerId !== estimate.customer_id) {
        const customerRows = await db.getAllAsync<{
          name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        }>(
          `SELECT name, email, phone, address, notes
           FROM customers
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1`,
          [customerId],
        );
        const customerRecord = customerRows[0];
        customerName = customerRecord?.name ?? customerName ?? null;
        customerEmail = customerRecord?.email ?? null;
        customerPhone = customerRecord?.phone ?? null;
        customerAddress = customerRecord?.address ?? null;
      }

      const updatedEstimate: EstimateListItem = {
        ...estimate,
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail ?? null,
        customer_phone: customerPhone ?? null,
        customer_address: customerAddress ?? null,
        date: isoDate,
        total: safeTotal,
        material_total: totals.materialTotal,
        labor_hours: totals.laborHours,
        labor_rate: totals.laborRate,
        labor_total: totals.laborTotal,
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_total: totals.taxTotal,
        notes: trimmedNotes,
        billing_address: billingAddressValue,
        job_address: jobAddressValue,
        job_details: trimmedNotes,
        status,
        version: nextVersion,
        updated_at: now,
        deleted_at: null,
      };

      await queueChange("estimates", "update", sanitizeEstimateForQueue(updatedEstimate));
      await runSync();

      estimateRef.current = updatedEstimate;
      setEstimate(updatedEstimate);
      setBillingAddress(billingAddressValue ?? "");
      if (jobAddressSameAsBilling) {
        setJobAddress(billingAddressValue ?? "");
      } else {
        setJobAddress(jobAddressValue ?? "");
      }
      setJobAddressSameAsBilling(
        (billingAddressValue ?? "") === (jobAddressValue ?? billingAddressValue ?? ""),
      );
      jobCustomAddressRef.current = jobAddressValue ?? "";
      setCustomerContact({
        id: customerId,
        name: customerName ?? "Customer",
        email: customerEmail ?? null,
        phone: customerPhone ?? null,
        address: billingAddressValue ?? customerAddress ?? null,
        notes: customerContact?.notes ?? null,
      });

      if (estimateId) {
        clearEstimateFormDraft(estimateId);
      }

      if (releasePdfRef.current) {
        releasePdfRef.current();
        releasePdfRef.current = null;
      }
      lastPdfRef.current = null;

      return updatedEstimate;
    } catch (error) {
      console.error("Failed to update estimate", error);
      Alert.alert("Error", "Unable to update the estimate. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    billingAddress,
    customerContact,
    customerId,
    estimate,
    estimateDate,
    estimateId,
    jobAddress,
    jobAddressSameAsBilling,
    notes,
    runSync,
    saving,
    status,
    totals.grandTotal,
    totals.laborHours,
    totals.laborRate,
    totals.laborTotal,
    totals.materialTotal,
    totals.subtotal,
    totals.taxRate,
    totals.taxTotal,
  ]);

  const handleSendToClient = useCallback(async () => {
    if (sending || saving) {
      return;
    }

    const hasEmail = Boolean(customerContact?.email?.trim());
    const hasPhone = Boolean(customerContact?.phone?.trim());

    if (!hasEmail && !hasPhone) {
      Alert.alert(
        "Add client contact",
        "Add an email address or mobile number before sending this estimate.",
      );
      return;
    }

    setSendSuccessMessage(null);
    setSending(true);
    try {
      const updated = await saveEstimate();
      if (!updated) {
        return;
      }

      const pdf = await ensurePdfReady();
      if (!pdf) {
        return;
      }

      const buttons: AlertButton[] = [{ text: "Cancel", style: "cancel" }];

      if (hasEmail) {
        buttons.push({
          text: hasPhone ? "Email" : "Send email",
          onPress: () => {
            void sendEstimateViaEmail(pdf);
          },
        });
      }

      if (hasPhone) {
        buttons.push({
          text: hasEmail ? "Text message" : "Send text",
          onPress: () => {
            void sendEstimateViaSms(pdf);
          },
        });
      }

      Alert.alert(
        "Send estimate",
        hasEmail && hasPhone
          ? "Choose how you'd like to share the estimate."
          : "Confirm how you'd like to send the estimate.",
        buttons,
      );
    } catch (error) {
      console.error("Failed to prepare estimate for sending", error);
      Alert.alert("Estimate", "We couldn't send this estimate. Please try again.");
    } finally {
      setSending(false);
    }
  }, [
    customerContact?.email,
    customerContact?.phone,
    ensurePdfReady,
    saveEstimate,
    saving,
    sendEstimateViaEmail,
    sendEstimateViaSms,
    sending,
    setSendSuccessMessage,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadEstimate = async () => {
      try {
        const db = await openDB();
        const rows = await db.getAllAsync<EstimateListItemRow>(
          `SELECT e.id, e.user_id, e.customer_id, e.date, e.total, e.material_total, e.labor_hours, e.labor_rate, e.labor_total, e.subtotal, e.tax_rate, e.tax_total, e.notes, e.status, e.version, e.updated_at, e.deleted_at,
                  e.billing_address, e.job_address, e.job_details,
                  c.name AS customer_name,
                  c.email AS customer_email,
                  c.phone AS customer_phone,
                  c.address AS customer_address
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
            { text: "OK", onPress: () => router.back() },
          ]);
          return;
        }

        if (!isMounted) {
          return;
        }

        estimateRef.current = record;
        setEstimate(record);
        const draft = draftRef.current;
        const billingAddressValue =
          record.billing_address?.trim() ?? record.customer_address?.trim() ?? "";
        const jobAddressValue = record.job_address?.trim() ?? "";
        const addressesMatch = !jobAddressValue || jobAddressValue === billingAddressValue;
        if (!draft) {
          setCustomerId(record.customer_id);
          setEstimateDate(record.date ? new Date(record.date).toISOString().split("T")[0] : "");
          setNotes(record.notes ?? "");
          setStatus(record.status ?? "draft");
          setBillingAddress(billingAddressValue);
          setJobAddress(addressesMatch ? billingAddressValue : jobAddressValue);
          setJobAddressSameAsBilling(addressesMatch);
          jobCustomAddressRef.current = addressesMatch ? "" : jobAddressValue;
        }
        const laborHoursValue = Math.max(0, Math.round(record.labor_hours * 100) / 100);
        const laborRateValue =
          typeof recordRow?.labor_rate === "number" && Number.isFinite(recordRow.labor_rate)
            ? Math.max(0, Math.round(record.labor_rate * 100) / 100)
            : Math.max(0, Math.round(settings.hourlyRate * 100) / 100);
        const taxRateValue =
          typeof recordRow?.tax_rate === "number" && Number.isFinite(recordRow.tax_rate)
            ? Math.max(0, Math.round(record.tax_rate * 100) / 100)
            : Math.max(0, Math.round(settings.taxRate * 100) / 100);
        if (!draft) {
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
        }

        const itemRows = await db.getAllAsync<EstimateItemRecordRow>(
          `SELECT id, estimate_id, description, quantity, unit_price, base_total, total, apply_markup, catalog_item_id, version, updated_at, deleted_at
           FROM estimate_items
           WHERE estimate_id = ? AND (deleted_at IS NULL OR deleted_at = '')
           ORDER BY datetime(updated_at) ASC`,
          [estimateId],
        );

        const activeItems = itemRows
          .filter((item) => !item.deleted_at)
          .map((item) => normalizeEstimateItemRow(item))
          .map((item) => ({
            ...item,
            base_total: Math.round(item.base_total * 100) / 100,
            total: Math.round(item.total * 100) / 100,
          }));

        if (isMounted) {
          setItems(activeItems);
        }

        const photoRows = await db.getAllAsync<PhotoRecord>(
          `SELECT id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at
           FROM photos
           WHERE estimate_id = ?
           ORDER BY datetime(updated_at) ASC`,
          [estimateId],
        );

        const activePhotos = photoRows.filter((photo) => !photo.deleted_at);

        if (isMounted) {
          applyPhotoState(activePhotos);
        }

        const recalculatedTotals = calculateEstimateTotals({
          materialLineItems: activeItems.map((item) => ({
            baseTotal: item.base_total,
            applyMarkup: item.apply_markup !== 0,
          })),
          materialMarkup: {
            mode: settings.materialMarkupMode,
            value: settings.materialMarkup,
          },
          laborHours: laborHoursValue,
          laborRate: laborRateValue,
          laborMarkup: {
            mode: settings.laborMarkupMode,
            value: settings.laborMarkup,
          },
          taxRate: taxRateValue,
        });
        if (isMounted) {
          const updated = await persistEstimateTotals(recalculatedTotals);
          if (updated) {
            await runSync();
          }
        }
      } catch (error) {
        console.error("Failed to load estimate", error);
        if (isMounted) {
          Alert.alert("Error", "Unable to load the estimate.", [
            { text: "OK", onPress: () => router.back() },
          ]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (estimateId) {
      loadEstimate();
    } else {
      setLoading(false);
      Alert.alert("Missing estimate", "No estimate ID was provided.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }

    return () => {
      isMounted = false;
    };
  }, [
    estimateId,
    persistEstimateTotals,
    applyPhotoState,
    settings.hourlyRate,
    settings.taxRate,
    settings.materialMarkup,
    settings.materialMarkupMode,
    settings.laborMarkup,
    settings.laborMarkupMode,
  ]);

  const handleDeleteEstimate = useCallback(() => {
    const currentEstimate = estimateRef.current;
    const targetEstimateId = currentEstimate?.id ?? estimateId;
    if (!targetEstimateId || deleting) {
      return;
    }

    confirmDelete(
      "Delete this Estimate?",
      "This action cannot be undone. This will permanently delete this record and all related data. Are you sure?",
      () => {
        void (async () => {
          setDeleting(true);
          try {
            const db = await openDB();

            await db.execAsync("BEGIN TRANSACTION");
            try {
              await db.runAsync(
                `UPDATE estimates
                 SET deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP,
                     version = COALESCE(version, 0) + 1
                 WHERE id = ?`,
                [targetEstimateId],
              );
              await db.runAsync(
                `UPDATE estimate_items
                 SET deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP,
                     version = COALESCE(version, 0) + 1
                 WHERE estimate_id = ?`,
                [targetEstimateId],
              );
              await db.runAsync(
                `UPDATE photos
                 SET deleted_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP,
                     version = COALESCE(version, 0) + 1
                 WHERE estimate_id = ?`,
                [targetEstimateId],
              );
              await db.execAsync("COMMIT");
            } catch (transactionError) {
              await db.execAsync("ROLLBACK");
              throw transactionError;
            }

            await queueChange("estimates", "delete", { id: targetEstimateId });

            clearEstimateFormDraft(targetEstimateId);

            await runSync().catch((syncError) => {
              console.error("Failed to sync estimate deletion", syncError);
            });

            router.replace("/(tabs)/estimates");
          } catch (error) {
            console.error("Failed to delete estimate", error);
            Alert.alert("Error", "Unable to delete this estimate. Please try again.");
          } finally {
            setDeleting(false);
          }
        })();
      },
    );
  }, [deleting, estimateId]);

  const handleSaveDraft = useCallback(async () => {
    const updated = await saveEstimate();
    if (updated) {
      Alert.alert("Draft saved", "Your estimate has been saved as a draft.");
    }
  }, [saveEstimate]);

  const handleSaveAndPreview = useCallback(async () => {
    const updated = await saveEstimate();
    if (!updated) {
      return;
    }
    await handlePreviewPdf();
  }, [handlePreviewPdf, saveEstimate]);

  useEffect(() => {
    if (!estimateId) {
      return;
    }
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
      photoDrafts,
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
    photoDrafts,
    status,
    taxRateText,
  ]);

  useEffect(() => {
    return () => {
      if (!estimateId) {
        return;
      }
      if (!preserveDraftRef.current) {
        clearEstimateFormDraft(estimateId);
      }
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

  if (!estimate) {
    return null;
  }

  const sendingToClient = sending;

  return (
    <View style={styles.screenContainer}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card style={styles.headerCard}>
          <ListItem
            title="Edit Estimate"
            subtitle="Update pricing, attach photos, and send a polished quote in seconds."
            style={styles.headerIntro}
            titleStyle={styles.headerTitle}
            subtitleStyle={styles.headerSubtitle}
          />
          <View style={styles.headerField}>
            <Body style={styles.headerLabel}>Customer</Body>
            <CustomerPicker selectedCustomer={customerId} onSelect={(id) => setCustomerId(id)} />
          </View>
          <Input
            label="Date"
            placeholder="YYYY-MM-DD"
            value={estimateDate}
            onChangeText={setEstimateDate}
            autoCapitalize="none"
          />
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Job Location &amp; Billing</Title>
          <Subtitle style={styles.sectionSubtitle}>
            Keep service and billing addresses current for this project.
          </Subtitle>
          <Input
            label="Billing address"
            placeholder="Where should invoices be sent?"
            value={billingAddress}
            onChangeText={setBillingAddress}
            multiline
          />
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Body style={styles.toggleLabel}>Job site same as billing</Body>
              <Body style={styles.toggleCaption}>
                Turn off to enter a different service location.
              </Body>
            </View>
            <Switch
              value={jobAddressSameAsBilling}
              onValueChange={handleJobAddressToggle}
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={jobAddressSameAsBilling ? colors.accent : undefined}
            />
          </View>
          {!jobAddressSameAsBilling ? (
            <Input
              label="Job site address"
              placeholder="Where is the work happening?"
              value={jobAddress}
              onChangeText={handleJobAddressChange}
              multiline
            />
          ) : null}
        </Card>

        <Card style={styles.photosCard}>
          <View style={styles.photosHeader}>
            <Title style={styles.sectionTitle}>Photos</Title>
            <Subtitle style={styles.sectionSubtitle}>
              Give your crew context with job site reference shots.
            </Subtitle>
          </View>
          {photos.length === 0 ? (
            <View style={styles.emptyCard}>
              <Body style={styles.emptyText}>No photos attached yet.</Body>
            </View>
          ) : (
            <View style={styles.photosList}>
              {photos.map((photo) => {
                const draft = photoDrafts[photo.id] ?? "";
                const isSaving = photoSavingId === photo.id;
                const isDeleting = photoDeletingId === photo.id;

                return (
                  <Card key={photo.id} style={styles.photoCard} elevated={false}>
                    {photo.local_uri ? (
                      <Image
                        source={{ uri: photo.local_uri }}
                        style={styles.photoImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Body style={styles.photoPlaceholderText}>
                          Photo unavailable offline. Use sync to restore the local copy.
                        </Body>
                      </View>
                    )}
                    <Input
                      placeholder="Add a description"
                      value={draft}
                      onChangeText={(text) => handlePhotoDraftChange(photo.id, text)}
                      multiline
                      containerStyle={styles.photoInput}
                    />
                    <View style={styles.photoButtonRow}>
                      <Button
                        label="Save"
                        variant="secondary"
                        onPress={() => handleSavePhotoDescription(photo)}
                        disabled={isSaving}
                        loading={isSaving}
                        style={styles.photoButton}
                        alignment="inline"
                      />
                      <Button
                        label="Remove"
                        variant="danger"
                        onPress={() => handleDeletePhoto(photo)}
                        disabled={isDeleting}
                        loading={isDeleting}
                        style={styles.photoButton}
                        alignment="inline"
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
          {photos.length > 0 ? (
            <Button
              label={photoSyncing ? "Syncing photos..." : "Sync photos"}
              onPress={handleRetryPhotoSync}
              disabled={photoSyncing}
              loading={photoSyncing}
              variant="secondary"
            />
          ) : null}
          <Button
            label={addingPhoto ? "Adding photo..." : "Add Photo"}
            onPress={handleAddPhoto}
            disabled={addingPhoto}
            loading={addingPhoto}
          />
        </Card>

        <Card style={styles.lineItemsCard}>
          <View style={styles.lineItemsHeader}>
            <Title style={styles.sectionTitle}>Estimate items</Title>
            <Subtitle style={styles.sectionSubtitle}>
              Track the work you&apos;re quoting. Saved items help you move fast.
            </Subtitle>
          </View>
          <FlatList<EstimateItemRecord>
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.lineItemSeparator} />}
            contentContainerStyle={styles.lineItemsList}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Body style={styles.emptyText}>No items added yet.</Body>
              </View>
            }
          />
          <Button
            label="Add line item"
            onPress={() =>
              openItemEditorScreen({
                title: "Add line item",
                submitLabel: "Add line item",
                templates: () => savedItemTemplates,
                initialTemplateId: null,
                materialMarkupValue: settings.materialMarkup,
                materialMarkupMode: settings.materialMarkupMode,
                onSubmit: makeItemSubmitHandler(null),
              })
            }
            style={styles.lineItemAddButton}
          />
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Labor &amp; tax</Title>
          <Input
            label="Project hours"
            placeholder="0"
            value={laborHoursText}
            onChangeText={setLaborHoursText}
            keyboardType="decimal-pad"
          />
          <Input
            label="Hourly rate"
            placeholder="0.00"
            value={hourlyRateText}
            onChangeText={setHourlyRateText}
            keyboardType="decimal-pad"
            leftElement={<Body style={styles.inputAdornment}>$</Body>}
            caption={`Labor charge (not shown to customers): ${formatCurrency(totals.laborTotal)}`}
          />
          <Input
            label="Tax rate"
            placeholder="0"
            value={taxRateText}
            onChangeText={setTaxRateText}
            keyboardType="decimal-pad"
            rightElement={<Body style={styles.inputAdornment}>%</Body>}
          />
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Estimate summary</Title>
          <View style={styles.summaryList}>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Materials</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.materialTotal)}</Body>
            </View>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Labor charge</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.laborTotal)}</Body>
            </View>
            <View style={styles.summaryRow}>
              <Body style={styles.summaryLabel}>Tax</Body>
              <Body style={styles.summaryValue}>{formatCurrency(totals.taxTotal)}</Body>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Subtitle style={styles.summaryTotalLabel}>Project total</Subtitle>
              <Title style={styles.summaryTotalValue}>{formatCurrency(totals.grandTotal)}</Title>
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <Title style={styles.sectionTitle}>Status &amp; notes</Title>
          <View style={styles.fieldGroup}>
            <Body style={styles.fieldLabel}>Status</Body>
            <View style={styles.pickerShell}>
              <Picker selectedValue={status} onValueChange={(value) => setStatus(value)}>
                {STATUS_OPTIONS.map((option) => (
                  <Picker.Item key={option.value} label={option.label} value={option.value} />
                ))}
              </Picker>
            </View>
          </View>
          <View style={styles.fieldGroup}>
            <Input
              label="Notes / Job description"
              placeholder="Add private notes for your team"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              inputStyle={styles.notesInput}
            />
          </View>
        </Card>
        <View style={previewStyles.previewSection}>
          <Title style={previewStyles.previewTitle}>Send to client preview</Title>
          <Subtitle style={previewStyles.previewSubtitle}>
            Double-check the essentials before sharing the full PDF with your client.
          </Subtitle>
          {sendSuccessMessage ? (
            <View style={previewStyles.successBanner}>
              <Body style={previewStyles.successText}>{sendSuccessMessage}</Body>
            </View>
          ) : null}
          <Card style={previewStyles.previewCard}>
            <View style={previewStyles.previewHeader}>
              <View style={previewStyles.brandBlock}>
                <Title style={previewStyles.brandName}>QuickQuote</Title>
                <Subtitle style={previewStyles.brandTagline}>Estimate summary</Subtitle>
              </View>
              <View style={previewStyles.metaBlock}>
                <Subtitle style={previewStyles.metaLabel}>Estimate #</Subtitle>
                <Title style={previewStyles.metaValue}>{previewEstimateNumber}</Title>
              </View>
            </View>
            <Badge tone={statusBadgeTone} style={previewStyles.statusBadge}>
              {statusLabel}
            </Badge>
            <View style={previewStyles.quickFacts}>
              <View style={previewStyles.quickFact}>
                <Subtitle style={previewStyles.quickFactLabel}>Estimate date</Subtitle>
                <Body style={previewStyles.quickFactValue}>{previewDate}</Body>
              </View>
              <View style={previewStyles.quickFact}>
                <Subtitle style={previewStyles.quickFactLabel}>Line items</Subtitle>
                <Body style={previewStyles.quickFactValue}>{previewLineItems}</Body>
              </View>
              <View style={previewStyles.quickFact}>
                <Subtitle style={previewStyles.quickFactLabel}>Photos</Subtitle>
                <Body style={previewStyles.quickFactValue}>{previewPhotoSummary}</Body>
              </View>
            </View>
            <View style={previewStyles.infoGrid}>
              <View style={previewStyles.infoCard}>
                <Subtitle style={previewStyles.infoTitle}>Customer</Subtitle>
                <Body style={previewStyles.infoValue}>{previewCustomerName}</Body>
                <Body style={previewStyles.infoMeta}>Email: {previewCustomerEmail}</Body>
                <Body style={previewStyles.infoMeta}>Phone: {previewCustomerPhone}</Body>
              </View>
              <View style={previewStyles.infoCard}>
                <Subtitle style={previewStyles.infoTitle}>Billing address</Subtitle>
                <Body style={previewStyles.infoValue}>{previewBillingAddressDisplay}</Body>
              </View>
              <View style={previewStyles.infoCard}>
                <Subtitle style={previewStyles.infoTitle}>Job site</Subtitle>
                <Body style={previewStyles.infoValue}>{previewJobAddressDisplay}</Body>
                {previewJobAddressHint ? (
                  <Body style={previewStyles.infoMeta}>{previewJobAddressHint}</Body>
                ) : null}
              </View>
            </View>
            <View style={previewStyles.breakdownCard}>
              <View style={previewStyles.breakdownRow}>
                <Body style={previewStyles.breakdownLabel}>Line items</Body>
                <Body style={previewStyles.breakdownValue}>
                  {formatCurrency(totals.materialTotal)}
                </Body>
              </View>
              <View style={previewStyles.breakdownRow}>
                <Body style={previewStyles.breakdownLabel}>Labor charge</Body>
                <Body style={previewStyles.breakdownValue}>{formatCurrency(totals.laborTotal)}</Body>
              </View>
              <View style={previewStyles.breakdownRow}>
                <Body style={previewStyles.breakdownLabel}>Subtotal</Body>
                <Body style={previewStyles.breakdownValue}>{formatCurrency(totals.subtotal)}</Body>
              </View>
              <View
                style={[
                  previewStyles.breakdownRow,
                  totals.taxTotal <= 0.0001 ? previewStyles.breakdownMutedRow : null,
                ]}
              >
                <Body style={previewStyles.breakdownLabel}>Tax</Body>
                <Body style={previewStyles.breakdownValue}>{formatCurrency(totals.taxTotal)}</Body>
              </View>
              <View style={[previewStyles.breakdownRow, previewStyles.breakdownTotalRow]}>
                <Subtitle style={previewStyles.breakdownTotalLabel}>Total due</Subtitle>
                <Title style={previewStyles.breakdownTotalValue}>
                  {formatCurrency(totals.grandTotal)}
                </Title>
              </View>
            </View>
            <View style={previewStyles.notesSection}>
              <Subtitle style={previewStyles.notesTitle}>Project notes</Subtitle>
              {previewNotesSummary ? (
                <Body style={previewStyles.notesBody}>{previewNotesSummary}</Body>
              ) : (
                <Body style={[previewStyles.notesBody, previewStyles.notesEmpty]}>
                  No additional notes.
                </Body>
              )}
            </View>
          </Card>
          <Body style={previewStyles.previewHint}>
            This summary mirrors the PDF your client receives when you send the estimate.
          </Body>
          <View style={previewStyles.previewActions}>
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
            />
            <Button
              label={pdfWorking ? "Preparing preview…" : "Preview PDF"}
              variant="ghost"
              alignment="inline"
              onPress={handleSaveAndPreview}
              disabled={pdfWorking || saving || deleting || sendingToClient}
              loading={pdfWorking}
              style={previewStyles.previewLink}
              contentStyle={previewStyles.previewLinkContent}
            />
          </View>
        </View>
        <View style={styles.deleteSection}>
          <Button
            label={deleting ? "Deleting…" : "Delete Estimate"}
            variant="danger"
            onPress={handleDeleteEstimate}
            disabled={saving || deleting}
            loading={deleting}
            alignment="full"
          />
        </View>
      </ScrollView>
    </View>
  );
}

function createPreviewStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    previewSection: {
      marginTop: spacing.xxl,
      alignItems: "center",
      alignSelf: "stretch",
      gap: spacing.lg,
    },
    previewTitle: {
      textAlign: "center",
      color: colors.secondaryText,
      letterSpacing: 0,
    },
    previewSubtitle: {
      textAlign: "center",
      color: colors.mutedText,
      maxWidth: 520,
    },
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
    successText: {
      color: colors.success,
      fontWeight: "600",
      textAlign: "center",
    },
    previewCard: {
      width: "100%",
      maxWidth: 520,
      alignSelf: "center",
      gap: spacing.lg,
    },
    previewHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.lg,
    },
    brandBlock: {
      flexShrink: 1,
      gap: spacing.xs,
    },
    brandName: {
      fontSize: 22,
      color: colors.primaryText,
    },
    brandTagline: {
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.mutedText,
      fontSize: 13,
    },
    metaBlock: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    metaLabel: {
      textTransform: "uppercase",
      letterSpacing: 1,
      color: colors.mutedText,
      fontSize: 12,
    },
    metaValue: {
      fontSize: 20,
      color: colors.primaryText,
    },
    statusBadge: {
      alignSelf: "flex-end",
    },
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
    quickFact: {
      flexGrow: 1,
      minWidth: 140,
      gap: spacing.xs,
    },
    quickFactLabel: {
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.mutedText,
      fontSize: 12,
    },
    quickFactValue: {
      color: colors.secondaryText,
      fontWeight: "600",
    },
    infoGrid: {
      width: "100%",
      gap: spacing.md,
    },
    infoCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surfaceAlt,
      gap: spacing.xs,
    },
    infoTitle: {
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.mutedText,
      fontSize: 12,
      fontWeight: "600",
    },
    infoValue: {
      color: colors.primaryText,
      fontWeight: "600",
    },
    infoMeta: {
      color: colors.mutedText,
    },
    breakdownCard: {
      width: "100%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    breakdownRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    breakdownLabel: {
      color: colors.mutedText,
      fontWeight: "500",
    },
    breakdownValue: {
      color: colors.secondaryText,
      fontWeight: "600",
    },
    breakdownMutedRow: {
      opacity: 0.7,
    },
    breakdownTotalRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
      marginTop: spacing.xs,
    },
    breakdownTotalLabel: {
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.mutedText,
      fontSize: 12,
    },
    breakdownTotalValue: {
      color: colors.primaryText,
    },
    notesSection: {
      width: "100%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      backgroundColor: colors.surface,
      gap: spacing.sm,
    },
    notesTitle: {
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.mutedText,
      fontSize: 12,
    },
    notesBody: {
      color: colors.secondaryText,
      lineHeight: 20,
    },
    notesEmpty: {
      color: colors.mutedText,
      fontStyle: "italic",
    },
    previewHint: {
      color: colors.mutedText,
      textAlign: "center",
      maxWidth: 520,
    },
    previewActions: {
      width: "100%",
      maxWidth: 520,
      gap: spacing.md,
    },
    previewLink: {
      alignSelf: "center",
    },
    previewLinkContent: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
  });
}

function createStyles(theme: Theme) {
  const { colors, spacing, radii } = theme;
  return StyleSheet.create({
    loadingState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    screenContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.xl,
      gap: spacing.xl,
      paddingBottom: spacing.xxl * 7,
    },
    headerCard: {
      gap: spacing.xl,
    },
    headerIntro: {
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: "transparent",
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.primaryText,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.mutedText,
      lineHeight: 20,
    },
    headerField: {
      gap: spacing.sm,
    },
    headerLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.mutedText,
    },
    card: {
      gap: spacing.lg,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.lg,
    },
    toggleLabelGroup: {
      flex: 1,
    },
    toggleLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    toggleCaption: {
      fontSize: 13,
      color: colors.mutedText,
      marginTop: 2,
    },
    sectionTitle: {
      color: colors.primaryText,
      fontSize: 20,
    },
    sectionSubtitle: {
      color: colors.mutedText,
    },
    fieldGroup: {
      gap: spacing.sm,
    },
    fieldLabel: {
      color: colors.mutedText,
      fontWeight: "600",
    },
    notesInput: {
      minHeight: spacing.xxl * 4,
    },
    photosCard: {
      gap: spacing.lg,
    },
    photosHeader: {
      gap: spacing.xs,
    },
    photosList: {
      gap: spacing.lg,
    },
    photoCard: {
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    photoInput: {
      gap: spacing.xs,
    },
    photoButtonRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    photoButton: {
      flex: 1,
    },
    photoImage: {
      width: "100%",
      height: spacing.xxl * 5 + spacing.xl,
      borderRadius: radii.sm,
    },
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
    photoPlaceholderText: {
      textAlign: "center",
      color: colors.mutedText,
    },
    emptyCard: {
      padding: spacing.xl,
      borderRadius: radii.md,
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    emptyText: {
      color: colors.mutedText,
    },
    lineItemsCard: {
      gap: spacing.lg,
    },
    lineItemsHeader: {
      gap: spacing.xs,
    },
    lineItemsList: {
      paddingVertical: spacing.xs,
    },
    lineItemRow: {
      gap: spacing.sm,
    },
    lineItem: {
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.lg,
    },
    lineItemTotal: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    lineItemActions: {
      flexDirection: "row",
      gap: spacing.md,
    },
    lineItemActionButton: {
      flex: 1,
    },
    lineItemSeparator: {
      height: spacing.md,
    },
    lineItemAddButton: {
      marginTop: spacing.sm,
    },
    inputAdornment: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.mutedText,
    },
    pickerShell: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radii.md,
      overflow: "hidden",
      backgroundColor: colors.surfaceAlt,
    },
    summaryList: {
      gap: spacing.md,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    summaryLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.mutedText,
    },
    summaryValue: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.primaryText,
    },
    summaryTotalRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryTotalLabel: {
      color: colors.mutedText,
      fontWeight: "600",
    },
    summaryTotalValue: {
      color: colors.primaryText,
      fontSize: 22,
    },
    deleteSection: {
      alignSelf: "stretch",
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
  });
}
