import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import { EstimateRecord } from "./estimates";

function formatCurrency(value: number | null | undefined): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return formatter.format(value ?? 0);
}

function formatDate(value: string | null): string {
  if (!value) return "N/A";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString();
  } catch (error) {
    console.warn("Failed to format date", error);
    return value ?? "N/A";
  }
}

function buildEstimateHtml(estimate: EstimateRecord): string {
  const itemsRows = estimate.items
    .map(
      (item) => `
        <tr class="item-row">
          <td>${item.description}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unit_price)}</td>
          <td>${formatCurrency(item.total)}</td>
        </tr>
      `
    )
    .join("\n");

  const subtotal = estimate.items.reduce((sum, item) => sum + (item.total ?? 0), 0);
  const notesSection = estimate.notes
    ? `<div class="notes"><h3>Notes</h3><p>${estimate.notes}</p></div>`
    : "";

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, Helvetica, sans-serif;
            padding: 24px;
            color: #1f2933;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 16px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 24px;
          }
          .customer-info, .estimate-info {
            font-size: 14px;
            line-height: 1.4;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 24px;
          }
          th {
            text-align: left;
            background-color: #e5e7eb;
            padding: 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          td {
            padding: 12px 10px;
            border-bottom: 1px solid #d1d5db;
            font-size: 13px;
          }
          .totals {
            margin-top: 24px;
            text-align: right;
            font-size: 16px;
            font-weight: 600;
          }
          .notes {
            margin-top: 32px;
            padding: 16px;
            background-color: #f9fafb;
            border-radius: 8px;
          }
          .notes h3 {
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 16px;
          }
        </style>
      </head>
      <body>
        <h1>Estimate</h1>
        <div class="header">
          <div class="customer-info">
            <strong>${estimate.customer.name}</strong><br />
            ${estimate.customer.address ?? ""}<br />
            ${estimate.customer.email ?? ""}<br />
            ${estimate.customer.phone ?? ""}
          </div>
          <div class="estimate-info">
            <div><strong>Estimate #</strong>: ${estimate.id}</div>
            <div><strong>Date</strong>: ${formatDate(estimate.date)}</div>
            <div><strong>Total</strong>: ${formatCurrency(estimate.total)}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || `
              <tr>
                <td colspan="4" style="text-align: center; padding: 24px;">No line items</td>
              </tr>
            `}
          </tbody>
        </table>
        <div class="totals">Subtotal: ${formatCurrency(subtotal)}</div>
        ${notesSection}
      </body>
    </html>
  `;
}

export async function generateEstimatePdf(estimate: EstimateRecord): Promise<string> {
  const html = buildEstimateHtml(estimate);
  const { uri: tempUri } = await Print.printToFileAsync({ html, base64: false });

  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!directory) {
    return tempUri;
  }

  const filename = `estimate-${estimate.id}-${Date.now()}.pdf`;
  const targetUri = `${directory}${filename}`;

  await FileSystem.copyAsync({ from: tempUri, to: targetUri });

  return targetUri;
}
