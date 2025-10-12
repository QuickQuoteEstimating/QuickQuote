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

  // 🆕 New optional taxMode for display
  taxMode?: "material" | "total" | "none" | null;

  // 🆕 Split address fields (optional support)
  billingStreet?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  jobStreet?: string | null;
  jobCity?: string | null;
  jobState?: string | null;
  jobZip?: string | null;
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

function renderAddressBlock(address: string | null | undefined): string {
  if (!address || !address.trim()) {
    return "<div>Address not provided</div>";
  }

  return address
    .split(/\r?\n/)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");
}

function renderNotes(notes: string | null | undefined): string {
  if (!notes) return "<p class='muted'>No notes provided.</p>";
  return escapeHtml(notes)
    .split(/\r?\n/)
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");
}

function renderTerms(terms: string | null | undefined): string {
  if (!terms?.trim()) return "<p class='muted'>No terms provided.</p>";
  const items = terms
    .split(/\r?\n/)
    .map((line) => `<li>${escapeHtml(line.trim())}</li>`)
    .join("");
  return `<ul class='list'>${items}</ul>`;
}

function renderPaymentDetails(details: string | null | undefined): string {
  if (!details?.trim()) return "<p class='muted'>No payment details provided.</p>";
  const paragraphs = details
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
  return paragraphs;
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
      if (derived) return derived;
    }
    return null;
  }

  try {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }

    const info = await FileSystem.getInfoAsync(candidate);
    if (!info.exists) return null;

    const base64 = await FileSystem.readAsStringAsync(candidate, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const extension = candidate.split(".").pop()?.toLowerCase();
    let mimeType = "image/jpeg";
    if (extension === "png") mimeType = "image/png";
    else if (extension === "heic" || extension === "heif") mimeType = "image/heic";

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.warn("Failed to embed photo in PDF", error);
    return null;
  }
}

// -- omitted existing helper functions (no changes) --

async function createHtml(options: EstimatePdfOptions): Promise<string> {
  const { estimate, items, photos = [], termsAndConditions, paymentDetails } = options;
  const issueDate = estimate.date ? new Date(estimate.date).toLocaleDateString() : "Not provided";
  const statusLabel = estimate.status ?? "Draft";
  const total = typeof estimate.total === "number" ? estimate.total : 0;

  const coerce = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  const laborTotal = coerce(estimate.laborTotal);
  const taxTotal = coerce(estimate.taxTotal);
  const subtotal = coerce(estimate.subtotal);
  const materialTotal =
    typeof estimate.materialTotal === "number"
      ? estimate.materialTotal
      : Math.max(0, subtotal - laborTotal);
  const subtotalDisplay = subtotal > 0 ? subtotal : total - taxTotal;

  const customer = estimate.customer ?? {};

  // 🏠 Address helpers
  const formatAddress = (
    street?: string | null,
    city?: string | null,
    state?: string | null,
    zip?: string | null
  ) => {
    const lines = [street, [city, state].filter(Boolean).join(", "), zip]
      .filter(Boolean)
      .map((l) => `<div>${escapeHtml(l ?? "")}</div>`)
      .join("");
    return lines || "<div>Address not provided</div>";
  };

  const billingAddressHtml =
    estimate.billingStreet || estimate.billingCity
      ? formatAddress(
          estimate.billingStreet,
          estimate.billingCity,
          estimate.billingState,
          estimate.billingZip
        )
      : renderAddressBlock(estimate.billingAddress ?? customer.address ?? null);

  const jobAddressHtml =
    estimate.jobStreet || estimate.jobCity
      ? formatAddress(
          estimate.jobStreet,
          estimate.jobCity,
          estimate.jobState,
          estimate.jobZip
        )
      : renderAddressBlock(estimate.jobAddress ?? estimate.billingAddress ?? null);

  const jobAddressesDiffer =
    estimate.jobAddress &&
    estimate.billingAddress &&
    estimate.jobAddress.trim() !== estimate.billingAddress.trim();

  // 🧾 Job description & tax mode
  const jobDescription = estimate.jobDetails?.trim()
    ? escapeHtml(estimate.jobDetails)
    : "No description provided.";
  const taxModeLabel =
    estimate.taxMode === "none"
      ? "Tax Exempt"
      : estimate.taxMode === "material"
      ? "Tax on Material"
      : "Tax on Total";

  // 📸 Photos
  const photoSources = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      description: photo.description ?? null,
      source: await resolvePhotoSource(photo),
    }))
  );
  const visiblePhotos = photoSources.filter((p) => p.source);
  const hasPhotos = visiblePhotos.length > 0;
  const photoGrid = visiblePhotos
    .map(
      (p) => `
      <div class="photo-card">
        <img src="${p.source}" alt="Estimate photo" />
        ${p.description ? `<div class="caption">${escapeHtml(p.description)}</div>` : ""}
      </div>`
    )
    .join("");

  // 🧮 Line items
  const rows = items
    .map((item, i) => {
      const desc = escapeHtml(item.description);
      const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
      const totalVal = Number.isFinite(item.total) ? item.total : 0;
      const unit = qty > 0 ? totalVal / qty : totalVal;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${desc}</td>
          <td>${qty}</td>
          <td>${formatCurrency(unit)}</td>
          <td>${formatCurrency(totalVal)}</td>
        </tr>`;
    })
    .join("");

  const termsHtml = renderTerms(termsAndConditions ?? null);
  const paymentHtml = renderPaymentDetails(paymentDetails ?? null);

  // 💙 Full themed layout
  return `
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F5F6F7;margin:0;padding:32px;color:#1F2933; }
      .document { max-width:960px;margin:0 auto;background:#FFF;border-radius:20px;box-shadow:0 28px 60px rgba(15,23,42,0.12);overflow:hidden; }
      .inner { padding:36px 40px 48px; }
      .header { display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;background:#005BBB;color:#FFF;padding:28px 32px;border-radius:18px;margin-bottom:32px;box-shadow:0 20px 40px rgba(0,91,187,0.25); }
      .branding { max-width:60%; }
      .branding .logo { font-size:28px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase; }
      .branding .tagline { margin-top:6px;font-size:14px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82); }
      .status-badge { background:#F5B700;color:#1F2933;border-radius:999px;font-size:12px;font-weight:600;padding:6px 16px;margin-top:18px; }
      .info-grid { display:flex;flex-wrap:wrap;gap:24px;margin-bottom:36px; }
      .info-card { flex:1 1 280px;border:1px solid #C8CFD8;border-radius:16px;background:#FFF;box-shadow:0 16px 40px rgba(15,23,42,0.08); }
      .card-title { background:#005BBB;color:#FFF;padding:12px 18px;font-weight:600;letter-spacing:0.08em;font-size:13px;text-transform:uppercase;border-radius:14px 14px 0 0; }
      .card-body { padding:18px 20px;font-size:14px;line-height:1.6; }
      .muted-small { color:#6B7280;font-size:12px;margin-top:8px;text-transform:uppercase; }
      .section { margin-bottom:36px; }
      .section-title { background:#005BBB;color:#FFF;padding:12px 18px;font-weight:600;font-size:13px;text-transform:uppercase;border-radius:14px 14px 0 0; }
      .section-body { border:1px solid #C8CFD8;border-top:none;border-radius:0 0 14px 14px;padding:20px;font-size:14px;line-height:1.6;background:#FFF; }
      .line-items { width:100%;border-collapse:collapse; }
      .line-items th { background:#EEF5FF;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#1F2933;padding:10px 12px;border-bottom:1px solid #C8CFD8;text-align:left; }
      .line-items td { padding:10px 12px;border-bottom:1px solid #E3E6EA;font-size:13px;color:#1F2933; }
      .photo-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px; }
      .photo-card { border:1px solid #C8CFD8;border-radius:16px;overflow:hidden;background:#FFF; }
      .photo-card img { display:block;width:100%;height:180px;object-fit:cover; }
      .photo-card .caption { padding:10px 14px;font-size:12px;color:#4B5563;background:#F8FAFC;border-top:1px solid #E5E7EB; }
      .signature-block { display:flex;gap:32px;flex-wrap:wrap;margin-top:24px; }
      .sig-line { flex:1 1 220px; }
      .sig-label { margin-top:8px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6B7280; }
      .line { border-bottom:1px solid #d1d5db;height:32px; }
    </style>
  </head>
  <body>
    <div class="document"><div class="inner">
      <header class="header">
        <div class="branding">
          <div class="logo">QuickQuote</div>
          <div class="tagline">Commercial Estimate</div>
          <div class="status-badge">Status: ${escapeHtml(statusLabel)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.14);border-radius:16px;padding:20px;">
          <div><strong>Estimate #:</strong> ${escapeHtml(estimate.id)}</div>
          <div><strong>Date:</strong> ${issueDate}</div>
          <div><strong>Total:</strong> ${formatCurrency(total)}</div>
          <div><strong>Tax:</strong> ${formatCurrency(taxTotal)}</div>
        </div>
      </header>

      <div class="info-grid">
        <div class="info-card">
          <div class="card-title">Customer</div>
          <div class="card-body">
            <div><strong>${escapeHtml(customer.name ?? "No name on file")}</strong></div>
            <div>Email: ${escapeHtml(customer.email ?? "N/A")}</div>
            <div>Phone: ${escapeHtml(customer.phone ?? "N/A")}</div>
          </div>
        </div>
        <div class="info-card">
          <div class="card-title">Billing Address</div>
          <div class="card-body">${billingAddressHtml}</div>
        </div>
        <div class="info-card">
          <div class="card-title">Job Address</div>
          <div class="card-body">
            ${jobAddressHtml}
            <div class="muted-small">${
              jobAddressesDiffer
                ? "Different from billing address"
                : "Matches billing address"
            }</div>
          </div>
        </div>
      </div>

      <section class="section">
        <div class="section-title">Description of Work</div>
        <div class="section-body">${jobDescription}</div>
      </section>

      <section class="section">
        <div class="section-title">Line Items</div>
        <div class="section-body">
          <table class="line-items">
            <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5">No line items recorded.</td></tr>`}</tbody>
          </table>
          <div style="margin-top:10px;"><strong>Tax Mode:</strong> ${taxModeLabel}</div>
        </div>
      </section>

      ${
        hasPhotos
          ? `<section class="section"><div class="section-title">Estimate Photos</div><div class="section-body"><div class="photo-grid">${photoGrid}</div></div></section>`
          : ""
      }

      <section class="section">
        <div class="section-title">Notes</div>
        <div class="section-body">${renderNotes(estimate.notes)}</div>
      </section>

      <section class="section">
        <div class="section-title">Terms & Conditions</div>
        <div class="section-body">${termsHtml}</div>
      </section>

      <section class="section">
        <div class="section-title">Payment Details</div>
        <div class="section-body">${paymentHtml}</div>
      </section>

      <section class="section">
        <div class="section-title">Acceptance</div>
        <div class="section-body">
          <p>By signing below, you acknowledge acceptance of this estimate and authorize QuickQuote to proceed with the work described.</p>
          <div class="signature-block">
            <div class="sig-line">
              <div class="line"></div>
              <div class="sig-label">Authorized Signature</div>
            </div>
            <div class="sig-line" style="flex:0 0 160px;">
              <div class="line"></div>
              <div class="sig-label">Date</div>
            </div>
          </div>
        </div>
      </section>
    </div></div>
  </body>
  </html>`;
}


export async function renderEstimatePdf(options: EstimatePdfOptions): Promise<EstimatePdfResult> {
  if (Platform.OS === "web") {
    const html = await createHtml(options);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `estimate-${options.estimate.id}-${timestamp}.html`;

    const blob = new Blob([html], { type: "text/html" });
    const uri = URL.createObjectURL(blob);
    return { uri, html, fileName };
  }

  const html = await createHtml(options);
  const { uri } = await Print.printToFileAsync({ html });

  const directory =
    FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? uri.replace(/[^/]+$/, "");
  const targetDir = `${directory}estimates`;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch {}

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `estimate-${options.estimate.id}-${timestamp}.pdf`;
  const destination = `${targetDir}/${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: destination });

  return { uri: destination, html, fileName };
}
