import { openDB } from "./sqlite";

export type EstimateItemRecord = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type CustomerRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type EstimateRecord = {
  id: string;
  user_id: string;
  customer_id: string;
  date: string | null;
  total: number | null;
  notes: string | null;
  pdf_last_generated_uri: string | null;
  pdf_last_generated_at: string | null;
  pdf_last_sent_at: string | null;
  pdf_last_sent_via: string | null;
  pdf_last_sent_status: string | null;
  customer: CustomerRecord;
  items: EstimateItemRecord[];
};

type DeliveryLogParams = {
  via: "email" | "share" | "other";
  status: "sent" | "failed";
  metadata?: Record<string, unknown> | null;
};

export async function fetchEstimatesWithDetails(): Promise<EstimateRecord[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<
    Omit<EstimateRecord, "customer" | "items"> & {
      customer_name: string;
      customer_email: string | null;
      customer_phone: string | null;
      customer_address: string | null;
    }
  >(`
    SELECT
      e.id,
      e.user_id,
      e.customer_id,
      e.date,
      e.total,
      e.notes,
      e.pdf_last_generated_uri,
      e.pdf_last_generated_at,
      e.pdf_last_sent_at,
      e.pdf_last_sent_via,
      e.pdf_last_sent_status,
      c.name AS customer_name,
      c.email AS customer_email,
      c.phone AS customer_phone,
      c.address AS customer_address
    FROM estimates e
    INNER JOIN customers c ON c.id = e.customer_id
    WHERE e.deleted_at IS NULL
    ORDER BY e.date DESC
  `);

  const estimates: EstimateRecord[] = [];
  for (const row of rows) {
    const items = await db.getAllAsync<EstimateItemRecord>(
      `SELECT id, description, quantity, unit_price, total
       FROM estimate_items
       WHERE estimate_id = ? AND deleted_at IS NULL
       ORDER BY updated_at ASC`,
      [row.id]
    );

    estimates.push({
      ...row,
      customer: {
        id: row.customer_id,
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        address: row.customer_address,
      },
      items,
    });
  }

  return estimates;
}

export async function saveGeneratedPdfMetadata(
  estimateId: string,
  uri: string,
  generatedAtInput?: string
): Promise<string> {
  const db = await openDB();
  const generatedAt = generatedAtInput ?? new Date().toISOString();

  await db.runAsync(
    `UPDATE estimates
     SET pdf_last_generated_uri = ?,
         pdf_last_generated_at = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [uri, generatedAt, estimateId]
  );

  return generatedAt;
}

export async function logEstimateDelivery(
  estimateId: string,
  params: DeliveryLogParams
): Promise<string> {
  const db = await openDB();
  const sentAt = new Date().toISOString();
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;

  await db.runAsync(
    `INSERT INTO estimate_delivery_logs (estimate_id, sent_via, status, sent_at, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [estimateId, params.via, params.status, sentAt, metadata]
  );

  await db.runAsync(
    `UPDATE estimates
     SET pdf_last_sent_at = ?,
         pdf_last_sent_via = ?,
         pdf_last_sent_status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [sentAt, params.via, params.status, estimateId]
  );

  return sentAt;
}
