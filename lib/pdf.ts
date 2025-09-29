import { Platform } from "react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";

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
  customer?: EstimatePdfCustomer;
};

export type EstimatePdfOptions = {
  estimate: EstimatePdfEstimate;
  items: EstimatePdfItem[];
  photos?: EstimatePdfPhoto[];
};

export type EstimatePdfResult = {
  uri: string;
  html: string;
  fileName: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
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
    if (remote && /^https?:\/\//.test(remote)) {
      return remote;
    }
    return null;
  }

  try {
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

function renderNotes(notes: string | null | undefined): string {
  if (!notes) {
    return "<p style=\"color:#666;\">No additional notes.</p>";
  }

  const normalized = escapeHtml(notes)
    .split(/\r?\n/)
    .map((line) => `<p>${line || "&nbsp;"}</p>`) // maintain blank lines
    .join("");
  return normalized;
}

async function createHtml(options: EstimatePdfOptions): Promise<string> {
  const { estimate, items, photos = [] } = options;
  const issueDate = estimate.date
    ? new Date(estimate.date).toLocaleDateString()
    : "Not provided";
  const statusLabel = estimate.status ? estimate.status : "Draft";
  const total = typeof estimate.total === "number" ? estimate.total : 0;
  const coerceCurrency = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const laborTotal = coerceCurrency(estimate.laborTotal);
  const taxTotal = coerceCurrency(estimate.taxTotal);
  const subtotal = coerceCurrency(estimate.subtotal);
  const materialTotal = (() => {
    if (
      typeof estimate.materialTotal === "number" &&
      Number.isFinite(estimate.materialTotal)
    ) {
      return estimate.materialTotal;
    }
    const base = subtotal > 0 ? subtotal : total - taxTotal;
    const fallback = Math.max(0, Math.round((base - laborTotal) * 100) / 100);
    return fallback;
  })();
  const customer = estimate.customer ?? {};

  const photoSources = await Promise.all(
    photos.map(async (photo) => ({
      id: photo.id,
      description: photo.description ?? null,
      source: await resolvePhotoSource(photo),
    }))
  );

  const rows = items
    .map((item, index) => {
      const safeDescription = escapeHtml(item.description);
      return `
        <tr>
          <td style=\"padding:8px;border:1px solid #ddd;\">${index + 1}</td>
          <td style=\"padding:8px;border:1px solid #ddd;\">${safeDescription}</td>
          <td style=\"padding:8px;border:1px solid #ddd;text-align:center;\">${item.quantity}</td>
          <td style=\"padding:8px;border:1px solid #ddd;text-align:right;\">${formatCurrency(
            item.unitPrice
          )}</td>
          <td style=\"padding:8px;border:1px solid #ddd;text-align:right;\">${formatCurrency(
            item.total
          )}</td>
        </tr>
      `;
    })
    .join("") ||
    `<tr><td colspan=\"5\" style=\"padding:12px;text-align:center;border:1px solid #ddd;color:#666;\">No line items recorded.</td></tr>`;

  const photoGrid = photoSources
    .filter((photo) => photo.source)
    .map((photo) => {
      const caption = photo.description
        ? `<div style=\"margin-top:4px;font-size:12px;color:#555;\">${escapeHtml(
            photo.description
          )}</div>`
        : "";
      return `
        <div style=\"width:48%;margin-bottom:16px;\">
          <div style=\"border:1px solid #ddd;border-radius:8px;overflow:hidden;padding:8px;\">
            <img src=\"${photo.source}\" style=\"width:100%;height:auto;border-radius:4px;object-fit:cover;\" />
            ${caption}
          </div>
        </div>
      `;
    })
    .join("");

  const photoSection = photoGrid
    ? `<div style=\"display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;\">${photoGrid}</div>`
    : `<p style=\"color:#666;\">No photos attached.</p>`;

  const customerAddress = customer.address
    ? `<div>${escapeHtml(customer.address)}</div>`
    : "<div>Address not provided</div>";

  return `
    <html>
      <head>
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111; }
          h1 { font-size: 24px; margin-bottom: 4px; }
          h2 { font-size: 18px; margin-top: 24px; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        </style>
      </head>
      <body>
        <h1>Estimate ${escapeHtml(estimate.id)}</h1>
        <div style=\"margin-bottom:16px;color:#555;\">Status: ${escapeHtml(
          statusLabel
        )}</div>

        <section style=\"margin-bottom:24px;\">
          <h2>Customer</h2>
          <div><strong>${escapeHtml(
            customer.name ?? "No name on file"
          )}</strong></div>
          ${customerAddress}
          <div>Email: ${escapeHtml(customer.email ?? "N/A")}</div>
          <div>Phone: ${escapeHtml(customer.phone ?? "N/A")}</div>
        </section>

        <section style=\"margin-bottom:24px;\">
          <h2>Estimate Summary</h2>
          <div>Date: ${escapeHtml(issueDate)}</div>
          <div>Materials: ${formatCurrency(materialTotal)}</div>
          <div>Labor: ${formatCurrency(laborTotal)}</div>
          <div>Tax: ${formatCurrency(taxTotal)}</div>
          <div><strong>Total: ${formatCurrency(total)}</strong></div>
        </section>

        <section style=\"margin-bottom:24px;\">
          <h2>Line Items</h2>
          <table>
            <thead>
              <tr>
                <th style=\"text-align:left;padding:8px;border:1px solid #ddd;\">#</th>
                <th style=\"text-align:left;padding:8px;border:1px solid #ddd;\">Description</th>
                <th style=\"text-align:center;padding:8px;border:1px solid #ddd;\">Qty</th>
                <th style=\"text-align:right;padding:8px;border:1px solid #ddd;\">Unit Price</th>
                <th style=\"text-align:right;padding:8px;border:1px solid #ddd;\">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </section>

        <section style=\"margin-bottom:24px;\">
          <h2>Notes</h2>
          ${renderNotes(estimate.notes ?? null)}
        </section>

        <section>
          <h2>Photos</h2>
          ${photoSection}
        </section>
      </body>
    </html>
  `;
}

export async function renderEstimatePdf(
  options: EstimatePdfOptions
): Promise<EstimatePdfResult> {
  if (Platform.OS === "web") {
    throw new Error("PDF generation is only supported on native platforms.");
  }

  const html = await createHtml(options);
  const { uri } = await Print.printToFileAsync({ html });
  const directory =
    FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? uri.replace(/[^/]+$/, "");

  const targetDir = `${directory}estimates`;
  try {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch (error) {
    // Directory may already exist
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `estimate-${options.estimate.id}-${timestamp}.pdf`;
  const destination = `${targetDir}/${fileName}`;

  await FileSystem.copyAsync({ from: uri, to: destination });

  return { uri: destination, html, fileName };
}
