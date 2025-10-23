import { Platform } from "react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const PHOTO_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "estimate-photos";
const DOCUMENT_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_DOCUMENT_BUCKET ?? PHOTO_BUCKET ?? "estimate-photos";
const DOCUMENT_PREFIX = "pdfs";

// -------------------------------------------------------------
// 🧾 TYPES
// -------------------------------------------------------------
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
  estimate_number?: string;
  description?: string | null;
  date?: string | null;
  status?: string | null;
  notes?: string | null;
  total?: number | null;
  subtotal?: number | null;
  taxTotal?: number | null;
  materialTotal?: number | null;
  laborTotal?: number | null;
  laborHours?: number | null;
  laborRate?: number | null;
  billingAddress?: string | null;
  jobAddress?: string | null;
  taxMode?: "material" | "total" | "none" | null;
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

// -------------------------------------------------------------
// 🧩 HELPERS
// -------------------------------------------------------------
function formatCurrency(value: number | null | undefined): string {
  const v = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(v);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNotes(notes: string | null | undefined): string {
  if (!notes?.trim()) return "<p>No notes provided.</p>";
  return escapeHtml(notes)
    .split(/\r?\n/)
    .map((l) => `<p>${l || "&nbsp;"}</p>`)
    .join("");
}

function renderTerms(terms: string | null | undefined): string {
  if (!terms?.trim()) return "<p>No terms provided.</p>";
  const items = terms
    .split(/\r?\n/)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function renderPaymentDetails(details: string | null | undefined): string {
  if (!details?.trim()) return "<p>No payment details provided.</p>";
  return details
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
}

// -------------------------------------------------------------
// 🧮 HTML GENERATOR
// -------------------------------------------------------------
async function createHtml(options: EstimatePdfOptions): Promise<string> {
  const { estimate, items, termsAndConditions, paymentDetails } = options;
  const {
    customer = {},
    billingAddress,
    jobAddress,
    taxTotal = 0,
    total = 0,
    status = "draft",
    estimate_number,
    notes,
    description,
  } = estimate;

  const issueDate = new Date().toLocaleDateString();
  const statusLabel = status ? status.toUpperCase() : "DRAFT";

  // Build rows
  const rows = items
    .map((item, i) => {
      const desc = escapeHtml(item.description ?? "");
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
  const billingAddressHtml = escapeHtml(billingAddress ?? "N/A");
  const jobAddressHtml = escapeHtml(jobAddress ?? "N/A");

  return `
  <html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 25mm 20mm; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #F8FAFC;
        color: #1F2937;
        margin: 0;
      }
      .document { max-width: 850px; margin: 0 auto; background: #FFF; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
      .inner { padding: 32px; }
      .header { display: flex; justify-content: space-between; flex-wrap: wrap; background: #005BBB; color: #FFF; padding: 24px 28px; border-radius: 14px; margin-bottom: 32px; }
      .branding .logo { font-size: 28px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
      .status-badge { background: #F5B700; color: #1F2933; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; margin-top: 12px; display: inline-block; }
      .summary-box { background: rgba(255,255,255,0.15); border-radius: 12px; padding: 16px 20px; font-size: 13px; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #EEF5FF; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; padding: 8px 10px; border-bottom: 1px solid #C8CFD8; text-align: left; }
      td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; font-size: 13px; }
      .section { margin-bottom: 24px; }
      .section-title { background: #005BBB; color: #FFF; padding: 10px 14px; font-weight: 600; font-size: 13px; border-radius: 10px 10px 0 0; text-transform: uppercase; letter-spacing: 0.05em; }
      .section-body { border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 10px 10px; padding: 14px 16px; background: #FFF; font-size: 13px; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="document"><div class="inner">
      <header class="header">
        <div class="branding">
          <div class="logo">QuickQuote</div>
          <div class="status-badge">Status: ${escapeHtml(statusLabel)}</div>
        </div>
        <div class="summary-box">
          <div><strong>Estimate #:</strong> ${escapeHtml(estimate_number ?? "N/A")}</div>
          <div><strong>Date:</strong> ${issueDate}</div>
          <div><strong>Total:</strong> ${formatCurrency(total)}</div>
          <div><strong>Tax:</strong> ${formatCurrency(taxTotal)}</div>
        </div>
      </header>

      <section class="section">
        <div class="section-title">Customer</div>
        <div class="section-body">
          <strong>${escapeHtml(customer.name ?? "No name on file")}</strong><br/>
          Email: ${escapeHtml(customer.email ?? "N/A")}<br/>
          Phone: ${escapeHtml(customer.phone ?? "N/A")}
        </div>
      </section>

      <section class="section">
        <div class="section-title">Addresses</div>
        <div class="section-body">
          <strong>Billing:</strong> ${billingAddressHtml}<br/>
          <strong>Job:</strong> ${jobAddressHtml}
        </div>
      </section>

      <section class="section">
        <div class="section-title">Description of Work</div>
        <div class="section-body">${escapeHtml(description ?? "N/A")}</div>
      </section>

      <section class="section">
        <div class="section-title">Line Items</div>
        <div class="section-body">
          <table>
            <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5">No items</td></tr>`}</tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <div class="section-title">Notes</div>
        <div class="section-body">${renderNotes(notes)}</div>
      </section>

      <section class="section">
        <div class="section-title">Terms & Conditions</div>
        <div class="section-body">${termsHtml}</div>
      </section>

      <section class="section">
        <div class="section-title">Payment Details</div>
        <div class="section-body">${paymentHtml}</div>
      </section>
    </div></div>
  </body>
  </html>`;
}

// -------------------------------------------------------------
// 🖨️ PDF RENDERER (EXPORTED)
// -------------------------------------------------------------
export async function renderEstimatePdf(options: EstimatePdfOptions): Promise<EstimatePdfResult> {
  const html = await createHtml(options);
  const { uri } = await Print.printToFileAsync({ html });

  const directory =
    FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? uri.replace(/[^/]+$/, "");
  const targetDir = `${directory}estimates`;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch {}

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `estimate-${options.estimate.estimate_number ?? options.estimate.id}-${timestamp}.pdf`;
  const destination = `${targetDir}/${fileName}`;
  await FileSystem.copyAsync({ from: uri, to: destination });

  return { uri: destination, html, fileName };
}
