import { Platform } from "react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";

import { supabase } from "./supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const PHOTO_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "estimate-photos";
const DOCUMENT_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_DOCUMENT_BUCKET ?? PHOTO_BUCKET ?? "estimate-photos";
const DOCUMENT_PREFIX = "pdfs";

export type EstimatePdfItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type EstimatePdfPhoto = {
  id: string;
  description?: string | null;
  localUri?: string | null;
  remoteUri?: string | null;
};

export type EstimatePdfCustomer = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type EstimatePdfEstimate = {
  id: string;
  date?: string | null;
  status?: string | null;
  notes?: string | null;
  total?: number | null;
  materialTotal?: number | null;
  laborTotal?: number | null;
  taxTotal?: number | null;
  subtotal?: number | null;
  laborHours?: number | null;
  laborRate?: number | null;
  billingAddress?: string | null;
  jobAddress?: string | null;
  jobDetails?: string | null;
  customer?: EstimatePdfCustomer;
};

export type EstimatePdfOptions = {
  estimate: EstimatePdfEstimate;
  items: EstimatePdfItem[];
  photos?: EstimatePdfPhoto[];
  termsAndConditions?: string | null;
  paymentDetails?: string | null;
};

export type EstimatePdfResult = {
  uri: string;
  html: string;
  fileName: string;
  storagePath?: string | null;
  publicUrl?: string | null;
};

export type EstimatePdfUploadResult = {
  storagePath: string;
  publicUrl: string | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildPublicAssetUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path || !SUPABASE_URL) {
    return null;
  }

  const normalized = path.replace(/^\/+/, "");
  const encoded = encodeStoragePath(normalized);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encoded}`;
}

function buildPublicPhotoUrl(path: string | null | undefined): string | null {
  return buildPublicAssetUrl(PHOTO_BUCKET, path);
}

function buildPublicPdfUrl(path: string | null | undefined): string | null {
  return buildPublicAssetUrl(DOCUMENT_BUCKET, path);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function resolvePhotoSource(photo: EstimatePdfPhoto): Promise<string | null> {
  const candidate = photo.localUri ?? null;

  if (!candidate) {
    const remote = photo.remoteUri;
    if (remote) {
      if (/^https?:\/\//i.test(remote)) {
        return remote;
      }

      const derived = buildPublicPhotoUrl(remote);
      if (derived) {
        return derived;
      }
    }
    return null;
  }

  try {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }

    const info = await FileSystem.getInfoAsync(candidate);
    if (!info.exists) {
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(candidate, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = candidate.split(".").pop()?.toLowerCase();
    let mimeType = "image/jpeg";
    if (extension === "png") {
      mimeType = "image/png";
    } else if (extension === "heic" || extension === "heif") {
      mimeType = "image/heic";
    }

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn("Failed to embed photo in PDF", error);
    return null;
  }
}

async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Failed to obtain Supabase session", error);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (error) {
    console.warn("Failed to resolve Supabase session", error);
    return null;
  }
}

function sanitizeStorageSegment(segment: string): string {
  const fallback = "segment";
  if (!segment) {
    return fallback;
  }
  const normalized = segment.replace(/[^A-Za-z0-9_-]+/g, "-");
  return normalized || fallback;
}

function sanitizeStorageFileName(fileName: string): string {
  if (!fileName) {
    return "estimate.pdf";
  }
  const withExtension = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const normalized = withExtension.replace(/[^A-Za-z0-9._-]+/g, "-");
  return normalized || "estimate.pdf";
}

function deriveRemotePdfPath(estimateId: string, fileName: string): string {
  const safeEstimate = sanitizeStorageSegment(estimateId);
  const safeFileName = sanitizeStorageFileName(fileName);
  return `${DOCUMENT_PREFIX}/${safeEstimate}/${safeFileName}`;
}

async function uploadPdfBinary(localUri: string, remotePath: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  if (!SUPABASE_URL) {
    console.warn("Supabase URL is not configured; skipping PDF upload");
    return null;
  }

  try {
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists) {
      console.warn("PDF file missing for upload", localUri);
      return null;
    }
  } catch (error) {
    console.warn("Failed to inspect PDF before upload", error);
    return null;
  }

  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) {
    return null;
  }

  const encodedPath = encodeStoragePath(remotePath);
  const url = `${SUPABASE_URL}/storage/v1/object/${DOCUMENT_BUCKET}/${encodedPath}`;

  try {
    const result = await FileSystem.uploadAsync(url, localUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
    });

    if (result.status >= 400) {
      throw new Error(`Upload failed: ${result.status} ${result.body}`);
    }
  } catch (error) {
    console.warn("Failed to upload estimate PDF", error);
    return null;
  }

  return buildPublicPdfUrl(remotePath);
}

export async function uploadEstimatePdfToStorage(
  pdf: EstimatePdfResult,
  estimateId: string,
): Promise<EstimatePdfUploadResult | null> {
  if (!estimateId || !pdf?.uri || !pdf.fileName || Platform.OS === "web") {
    return null;
  }

  if (!pdf.uri.startsWith("file://")) {
    console.warn("PDF does not reference a local file; skipping upload");
    return null;
  }

  const remotePath = deriveRemotePdfPath(estimateId, pdf.fileName);
  const publicUrl = await uploadPdfBinary(pdf.uri, remotePath);

  if (!publicUrl && !SUPABASE_URL) {
    return null;
  }

  return {
    storagePath: remotePath,
    publicUrl,
  };
}

function renderNotes(notes: string | null | undefined): string {
  if (!notes) {
    return '<p style="color:#666;">No additional notes.</p>';
  }

  const normalized = escapeHtml(notes)
    .split(/\r?\n/)
    .map((line) => `<p>${line || "&nbsp;"}</p>`) // maintain blank lines
    .join("");
  return normalized;
}

function renderTerms(terms: string | null | undefined): string {
  if (!terms || !terms.trim()) {
    return '<p class="muted">No terms provided.</p>';
  }

  const items = terms
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<li>${escapeHtml(line)}</li>`) // convert to list items
    .join("");

  if (!items) {
    return '<p class="muted">No terms provided.</p>';
  }

  return `<ul class=\"list\">${items}</ul>`;
}

function renderPaymentDetails(details: string | null | undefined): string {
  if (!details || !details.trim()) {
    return '<p class="muted">No payment details provided.</p>';
  }

  const paragraphs = details
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => {
      const content = escapeHtml(paragraph).split(/\r?\n/).join("<br />");
      return `<p>${content}</p>`;
    })
    .join("");

  return paragraphs || '<p class="muted">No payment details provided.</p>';
}

async function createHtml(options: EstimatePdfOptions): Promise<string> {
  const { estimate, items, photos = [], termsAndConditions, paymentDetails } = options;
  const issueDate = estimate.date ? new Date(estimate.date).toLocaleDateString() : "Not provided";
  const statusLabel = estimate.status ? estimate.status : "Draft";
  const total = typeof estimate.total === "number" ? estimate.total : 0;
  const coerceCurrency = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const laborTotal = coerceCurrency(estimate.laborTotal);
  const taxTotal = coerceCurrency(estimate.taxTotal);
  const subtotal = coerceCurrency(estimate.subtotal);
  const materialTotal = (() => {
    if (typeof estimate.materialTotal === "number" && Number.isFinite(estimate.materialTotal)) {
      return estimate.materialTotal;
    }
    const base = subtotal > 0 ? subtotal : total - taxTotal;
    const fallback = Math.max(0, Math.round((base - laborTotal) * 100) / 100);
    return fallback;
  })();
  const subtotalDisplay = subtotal > 0 ? subtotal : Math.max(0, total - taxTotal);
  const customer = estimate.customer ?? {};

  const photoSources = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      description: photo.description ?? null,
      source: await resolvePhotoSource(photo),
    })),
  );

  const visiblePhotos = photoSources.filter((photo) => photo.source);

  const rows = items
    .map((item, index) => {
      const safeDescription = escapeHtml(item.description);
      const rawQuantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0;
      const normalizedQuantity = Math.max(0, Math.round(rawQuantity * 1000) / 1000);
      const quantityDisplay =
        Number.isInteger(normalizedQuantity) && normalizedQuantity <= Number.MAX_SAFE_INTEGER
          ? normalizedQuantity.toFixed(0)
          : normalizedQuantity.toString();
      const rawTotal =
        typeof item.total === "number" && Number.isFinite(item.total) ? item.total : 0;
      const normalizedTotal = Math.max(0, Math.round(rawTotal * 100) / 100);
      const unitPriceDisplay =
        normalizedQuantity > 0
          ? Math.round((normalizedTotal / normalizedQuantity) * 100) / 100
          : normalizedTotal;

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${safeDescription}</td>
          <td>${quantityDisplay}</td>
          <td>${formatCurrency(unitPriceDisplay)}</td>
          <td>${formatCurrency(normalizedTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const photoGrid = visiblePhotos
    .map((photo) => {
      const caption = photo.description
        ? `<div class=\"caption\">${escapeHtml(photo.description)}</div>`
        : "";
      return `
        <div class=\"photo-card\">
          <img src=\"${photo.source}\" alt=\"Estimate photo\" />
          ${caption}
        </div>
      `;
    })
    .join("");

  const hasPhotos = visiblePhotos.length > 0;
  const taxRowClass = taxTotal > 0.0001 ? "" : " muted";
  const taxRowHtml = `<div class=\"total-row${taxRowClass}\"><span>Tax</span><strong>${formatCurrency(
    taxTotal,
  )}</strong></div>`;
  const taxCardClass = taxTotal > 0.0001 ? "" : " totals-card-muted";
  const taxCardHtml = `
                  <div class=\"totals-card${taxCardClass}\">
                    <div class=\"label\">Tax</div>
                    <div class=\"value\">${formatCurrency(taxTotal)}</div>
                  </div>`;
  const lineItemTotalsHtml = `
    <div class=\"line-item-totals\">
      <div class=\"total-row\"><span>Line items</span><strong>${formatCurrency(materialTotal)}</strong></div>
      <div class=\"total-row\"><span>Labor charge</span><strong>${formatCurrency(laborTotal)}</strong></div>
      <div class=\"total-row\"><span>Subtotal</span><strong>${formatCurrency(subtotalDisplay)}</strong></div>
      ${taxRowHtml}
      <div class=\"total-row grand\"><span>Total due</span><strong>${formatCurrency(total)}</strong></div>
    </div>
  `;

  const renderAddressBlock = (address: string | null | undefined) => {
    if (!address || !address.trim()) {
      return "<div>Address not provided</div>";
    }

    return address
      .split(/\r?\n/)
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join("");
  };

  const billingAddressHtml = renderAddressBlock(
    estimate.billingAddress ?? customer.address ?? null,
  );
  const jobAddressSource =
    estimate.jobAddress ?? estimate.billingAddress ?? customer.address ?? null;
  const jobAddressHtml = renderAddressBlock(jobAddressSource);
  const jobAddressesDiffer = Boolean(
    estimate.jobAddress &&
      estimate.billingAddress &&
      estimate.jobAddress.trim() !== estimate.billingAddress.trim(),
  );
  const customerAddressHtml = renderAddressBlock(customer.address ?? null);
  const jobDetailNotes = estimate.jobDetails ?? estimate.notes ?? null;

  const termsHtml = renderTerms(termsAndConditions ?? null);
  const paymentHtml = renderPaymentDetails(paymentDetails ?? null);

  return `
    <html>
      <head>
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
        <style>
          :root { color-scheme: light; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #F5F6F7; margin: 0; padding: 32px; color: #1F2933; }
          .document { max-width: 960px; margin: 0 auto; background: #FFFFFF; border-radius: 20px; box-shadow: 0 28px 60px rgba(15, 23, 42, 0.12); overflow: hidden; }
          .inner { padding: 36px 40px 48px; }
          .header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; background: #005BBB; color: #FFFFFF; padding: 28px 32px; border-radius: 18px; margin-bottom: 32px; box-shadow: 0 20px 40px rgba(0, 91, 187, 0.25); }
          .branding { max-width: 60%; }
          .branding .logo { font-size: 28px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #FFFFFF; }
          .branding .tagline { margin-top: 6px; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
          .status-badge { display: inline-flex; align-items: center; gap: 8px; background: #F5B700; color: #1F2933; border-radius: 999px; font-size: 12px; font-weight: 600; padding: 6px 16px; margin-top: 18px; letter-spacing: 0.08em; text-transform: uppercase; }
          .estimate-meta { background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px; padding: 20px 22px; min-width: 220px; }
          .meta-row { display: flex; justify-content: space-between; font-size: 13px; color: rgba(255, 255, 255, 0.88); padding: 4px 0; }
          .meta-row strong { color: #FFFFFF; }
          .info-grid { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 36px; }
          .info-card { flex: 1 1 280px; border: 1px solid #C8CFD8; border-radius: 16px; overflow: hidden; background: #FFFFFF; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
          .card-title { background: #005BBB; color: #FFFFFF; padding: 12px 18px; font-weight: 600; letter-spacing: 0.08em; font-size: 13px; text-transform: uppercase; }
          .card-body { padding: 18px 20px; font-size: 14px; line-height: 1.6; color: #1F2933; }
          .card-body div + div { margin-top: 6px; }
          .muted { color: #4B5563; }
          .muted-small { color: #6B7280; font-size: 12px; margin-top: 8px; letter-spacing: 0.04em; text-transform: uppercase; }
          .notice { background: #E6F0FF; border: 1px solid rgba(0, 91, 187, 0.24); border-radius: 16px; padding: 16px 20px; margin-bottom: 36px; color: #1F2933; font-size: 13px; font-weight: 500; text-align: center; letter-spacing: 0.04em; }
          .section { margin-bottom: 36px; }
          .section-title { background: #005BBB; color: #FFFFFF; padding: 12px 18px; font-weight: 600; letter-spacing: 0.08em; font-size: 13px; text-transform: uppercase; border-radius: 14px 14px 0 0; }
          .section-body { border: 1px solid #C8CFD8; border-top: none; border-radius: 0 0 14px 14px; padding: 20px; font-size: 14px; line-height: 1.6; background: #FFFFFF; }
          .totals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 18px; }
          .totals-card { border: 1px solid #C8CFD8; border-radius: 16px; padding: 18px; background: #EEF5FF; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
          .totals-card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #4B5563; font-weight: 600; }
          .totals-card .value { margin-top: 8px; font-size: 20px; font-weight: 700; color: #1F2933; }
          .totals-card.total-accent { background: linear-gradient(135deg, #005BBB, #1B74E4); color: #FFFFFF; border-color: rgba(255, 255, 255, 0.4); }
          .totals-card.total-accent .label { color: rgba(255, 255, 255, 0.9); }
          .totals-card.total-accent .value { color: #FFFFFF; }
          .totals-card.totals-card-muted { background: #F8FAFF; color: #6B7280; border-color: #E5E7EB; box-shadow: none; }
          .totals-card.totals-card-muted .label { color: #6B7280; }
          .totals-card.totals-card-muted .value { color: #4B5563; }
          .line-items { width: 100%; border-collapse: collapse; }
          .line-items th { background: #EEF5FF; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #1F2933; padding: 10px 12px; border-bottom: 1px solid #C8CFD8; text-align: left; }
          .line-items td { padding: 10px 12px; border-bottom: 1px solid #E3E6EA; font-size: 13px; color: #1F2933; }
          .line-items td:nth-child(3) { text-align: center; }
          .line-items td:nth-child(4), .line-items td:nth-child(5) { text-align: right; font-variant-numeric: tabular-nums; }
          .line-items tr:last-child td { border-bottom: none; }
          .line-items .empty { text-align: center; color: #9AA1AB; padding: 18px 12px; font-style: italic; }
          .line-item-totals { margin-top: 24px; border: 1px solid #D4DBE6; border-radius: 16px; padding: 18px 20px; background: #F8FAFF; max-width: 360px; margin-left: auto; display: grid; gap: 12px; }
          .line-item-totals .total-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; color: #1F2933; }
          .line-item-totals .total-row strong { font-size: 14px; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
          .line-item-totals .total-row.muted span, .line-item-totals .total-row.muted strong { color: #4B5563; }
          .line-item-totals .total-row.grand { border-top: 1px solid #C8CFD8; margin-top: 4px; padding-top: 12px; }
          .line-item-totals .total-row.grand span { color: #005BBB; }
          .line-item-totals .total-row.grand strong { color: #005BBB; font-size: 18px; }
          .photo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
          .photo-card { border: 1px solid #C8CFD8; border-radius: 16px; overflow: hidden; background: #FFFFFF; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08); }
          .photo-card img { display: block; width: 100%; height: 180px; object-fit: cover; background: #F3F4F6; }
          .photo-card .caption { padding: 10px 14px; font-size: 12px; color: #4B5563; background: #F8FAFC; border-top: 1px solid #E5E7EB; }
          .static-notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
          .static-notes .section-body { min-height: 180px; }
          .list { margin: 0; padding-left: 18px; }
          .list li { margin-bottom: 6px; }
          @media (max-width: 720px) {
            body { padding: 16px; }
            .inner { padding: 28px 24px 36px; }
            .branding { max-width: 100%; margin-bottom: 20px; }
            .estimate-meta { width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class=\"document\">
          <div class=\"inner\">
            <header class=\"header\">
              <div class=\"branding\">
                <div class=\"logo\">QuickQuote</div>
                <div class=\"tagline\">Commercial Estimate</div>
                <div class=\"status-badge\">Status: ${escapeHtml(statusLabel)}</div>
              </div>
              <div class=\"estimate-meta\">
                <div class=\"meta-row\"><span>Estimate #</span><strong>${escapeHtml(
                  estimate.id,
                )}</strong></div>
                <div class=\"meta-row\"><span>Date</span><strong>${escapeHtml(
                  issueDate,
                )}</strong></div>
                <div class=\"meta-row\"><span>Total</span><strong>${formatCurrency(
                  total,
                )}</strong></div>
                <div class=\"meta-row\"><span>Tax</span><strong>${formatCurrency(
                  taxTotal,
                )}</strong></div>
              </div>
            </header>

            <div class=\"info-grid\">
              <div class=\"info-card\">
                <div class=\"card-title\">Customer</div>
                <div class=\"card-body\">
                  <div><strong>${escapeHtml(customer.name ?? "No name on file")}</strong></div>
                  ${customerAddressHtml}
                  <div>Email: ${escapeHtml(customer.email ?? "N/A")}</div>
                  <div>Phone: ${escapeHtml(customer.phone ?? "N/A")}</div>
                </div>
              </div>
              <div class=\"info-card\">
                <div class=\"card-title\">Billing Address</div>
                <div class=\"card-body\">
                  ${billingAddressHtml}
                  <div class=\"muted-small\">Primary billing contact: ${escapeHtml(
                    customer.name ?? "Not provided",
                  )}</div>
                </div>
              </div>
              <div class=\"info-card\">
                <div class=\"card-title\">Job Site</div>
                <div class=\"card-body\">
                  ${jobAddressHtml}
                  <div class=\"muted-small\">${
                    jobAddressesDiffer
                      ? "Different from billing address"
                      : "Matches billing address"
                  }</div>
                </div>
              </div>
            </div>

            <div class=\"notice\">All prices quoted are valid for 30 days from the date indicated above.</div>

            <section class=\"section\">
              <div class=\"section-title\">Estimate Summary</div>
              <div class=\"section-body\">
                <div class=\"totals-grid\">
                  <div class=\"totals-card\">
                    <div class=\"label\">Line items</div>
                    <div class=\"value\">${formatCurrency(materialTotal)}</div>
                  </div>
                  <div class=\"totals-card\">
                    <div class=\"label\">Labor charge</div>
                    <div class=\"value\">${formatCurrency(laborTotal)}</div>
                  </div>
                  <div class=\"totals-card\">
                    <div class=\"label\">Subtotal</div>
                    <div class=\"value\">${formatCurrency(subtotalDisplay)}</div>
                  </div>
                  ${taxCardHtml}
                  <div class=\"totals-card total-accent\">
                    <div class=\"label\">Total due</div>
                    <div class=\"value\">${formatCurrency(total)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section class=\"section\">
              <div class=\"section-title\">Work Description &amp; Line Items</div>
              <div class=\"section-body\">
                <table class=\"line-items\">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows || `<tr><td class=\"empty\" colspan=\"5\">No line items recorded.</td></tr>`}
                  </tbody>
                </table>
                ${lineItemTotalsHtml}
              </div>
            </section>

            ${
              hasPhotos
                ? `<section class=\\"section\\"><div class=\\"section-title\\">Estimate Photos</div><div class=\\"section-body\\"><div class=\\"photo-grid\\">${photoGrid}</div></div></section>`
                : ""
            }

            <section class=\"section\">
              <div class=\"section-title\">Project Notes</div>
              <div class=\"section-body\">${renderNotes(jobDetailNotes)}</div>
            </section>

            <div class=\"static-notes\">
              <section class=\"section\">
                <div class=\"section-title\">Terms &amp; Conditions</div>
                <div class=\"section-body\">${termsHtml}</div>
              </section>
              <section class=\"section\">
                <div class=\"section-title\">Payment Details</div>
                <div class=\"section-body\">${paymentHtml}</div>
              </section>
              <section class=\"section\">
                <div class=\"section-title\">Acceptance</div>
                <div class=\"section-body\">
                  <p>By signing below you acknowledge acceptance of this estimate and authorize QuickQuote to proceed with the work described.</p>
                  <div style=\"margin-top:24px; display:flex; gap:32px; flex-wrap:wrap;\">
                    <div style=\"flex:1 1 220px;\">
                      <div style=\"border-bottom:1px solid #d1d5db; height:32px;\"></div>
                      <div class=\"muted\" style=\"margin-top:8px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em;\">Authorized Signature</div>
                    </div>
                    <div style=\"flex:0 0 160px;\">
                      <div style=\"border-bottom:1px solid #d1d5db; height:32px;\"></div>
                      <div class=\"muted\" style=\"margin-top:8px; font-size:12px; text-transform:uppercase; letter-spacing:0.08em;\">Date</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function renderEstimatePdf(options: EstimatePdfOptions): Promise<EstimatePdfResult> {
  if (Platform.OS === "web") {
    const html = await createHtml(options);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `estimate-${options.estimate.id}-${timestamp}.html`;

    if (typeof Blob !== "undefined" && typeof URL !== "undefined") {
      const blob = new Blob([html], { type: "text/html" });
      const uri = URL.createObjectURL(blob);
      return { uri, html, fileName, storagePath: null, publicUrl: null };
    }

    const base64 = btoa(unescape(encodeURIComponent(html)));
    const uri = `data:text/html;base64,${base64}`;
    return { uri, html, fileName, storagePath: null, publicUrl: null };
  }

  const html = await createHtml(options);
  const { uri } = await Print.printToFileAsync({ html });
  const directory =
    FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? uri.replace(/[^/]+$/, "");

  const targetDir = `${directory}estimates`;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch {
    // Directory may already exist
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `estimate-${options.estimate.id}-${timestamp}.pdf`;
  const destination = `${targetDir}/${fileName}`;

  await FileSystem.copyAsync({ from: uri, to: destination });

  return { uri: destination, html, fileName, storagePath: null, publicUrl: null };
}
