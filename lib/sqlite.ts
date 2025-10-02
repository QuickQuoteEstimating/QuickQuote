// lib/sqlite.ts
import * as SQLite from "expo-sqlite";
import { v4 as uuidv4 } from "uuid";

export type Change = {
  id: number;
  table_name:
    | "customers"
    | "estimates"
    | "estimate_items"
    | "photos"
    | "saved_items"
    | "item_catalog";
  op: "insert" | "update" | "delete";
  payload: string; // JSON string
  created_at: string;
};

export type DeliveryLogRecord = {
  id: string;
  estimate_id: string;
  channel: string;
  recipient: string | null;
  message_preview: string | null;
  metadata: string | null;
  created_at: string;
};

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Always use the async DB. No nulls, no transactions API.
export function openDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync("quickquote.db");
  }
  return _dbPromise;
}

export async function initLocalDB(): Promise<void> {
  const db = await openDB();
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // Queue table for offline sync
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Customers
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  const customerColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(customers)");
  if (!customerColumns.some((column) => column.name === "notes")) {
    await db.execAsync("ALTER TABLE customers ADD COLUMN notes TEXT");
  }

  // Estimates
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      date TEXT DEFAULT (datetime('now')),
      total REAL DEFAULT 0,
      material_total REAL DEFAULT 0,
      labor_hours REAL DEFAULT 0,
      labor_rate REAL DEFAULT 0,
      labor_total REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_total REAL DEFAULT 0,
      notes TEXT,
      billing_address TEXT,
      job_address TEXT,
      job_details TEXT,
      status TEXT DEFAULT 'draft',
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  const estimateColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(estimates)");
  if (!estimateColumns.some((column) => column.name === "status")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN status TEXT DEFAULT 'draft'");
  }
  if (!estimateColumns.some((column) => column.name === "material_total")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN material_total REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "labor_hours")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN labor_hours REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "labor_rate")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN labor_rate REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "labor_total")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN labor_total REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "subtotal")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN subtotal REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "tax_rate")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN tax_rate REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "tax_total")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN tax_total REAL DEFAULT 0");
  }
  if (!estimateColumns.some((column) => column.name === "billing_address")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN billing_address TEXT");
  }
  if (!estimateColumns.some((column) => column.name === "job_address")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN job_address TEXT");
  }
  if (!estimateColumns.some((column) => column.name === "job_details")) {
    await db.execAsync("ALTER TABLE estimates ADD COLUMN job_details TEXT");
  }

  // Estimate Items
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
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  const estimateItemColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(estimate_items)",
  );
  if (!estimateItemColumns.some((column) => column.name === "base_total")) {
    await db.execAsync("ALTER TABLE estimate_items ADD COLUMN base_total REAL NOT NULL DEFAULT 0");
    await db.execAsync("UPDATE estimate_items SET base_total = total WHERE base_total = 0");
  }
  if (!estimateItemColumns.some((column) => column.name === "catalog_item_id")) {
    await db.execAsync("ALTER TABLE estimate_items ADD COLUMN catalog_item_id TEXT");
  }
  if (!estimateItemColumns.some((column) => column.name === "apply_markup")) {
    await db.execAsync("ALTER TABLE estimate_items ADD COLUMN apply_markup INTEGER NOT NULL DEFAULT 1");
  }

  // Photos
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      local_uri TEXT,
      description TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS item_catalog (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      description TEXT NOT NULL,
      default_quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      notes TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      default_quantity INTEGER DEFAULT 1,
      default_unit_price REAL NOT NULL,
      default_markup_applicable INTEGER NOT NULL DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  const savedItemColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(saved_items)");
  if (!savedItemColumns.some((column) => column.name === "default_unit_price")) {
    await db.execAsync("ALTER TABLE saved_items ADD COLUMN default_unit_price REAL NOT NULL DEFAULT 0");
  }
  if (!savedItemColumns.some((column) => column.name === "default_quantity")) {
    await db.execAsync("ALTER TABLE saved_items ADD COLUMN default_quantity INTEGER DEFAULT 1");
  }
  if (!savedItemColumns.some((column) => column.name === "default_markup_applicable")) {
    await db.execAsync(
      "ALTER TABLE saved_items ADD COLUMN default_markup_applicable INTEGER NOT NULL DEFAULT 1",
    );
  }
  if (!savedItemColumns.some((column) => column.name === "created_at")) {
    await db.execAsync(
      "ALTER TABLE saved_items ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP",
    );
  }

  const legacyCatalogColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(item_catalog)");
  if (legacyCatalogColumns.length) {
    await db.execAsync(`
      INSERT OR IGNORE INTO saved_items (id, user_id, name, default_quantity, default_unit_price, default_markup_applicable, version, created_at, updated_at, deleted_at)
      SELECT id, user_id, description AS name, default_quantity, unit_price AS default_unit_price, 1, version, COALESCE(updated_at, CURRENT_TIMESTAMP), updated_at, deleted_at
      FROM item_catalog
    `);
  }

  const photoColumns = await db.getAllAsync<{ name: string }>("PRAGMA table_info(photos)");
  if (!photoColumns.some((column) => column.name === "local_uri")) {
    await db.execAsync("ALTER TABLE photos ADD COLUMN local_uri TEXT");
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS delivery_logs (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT,
      message_preview TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  console.log("✅ Local SQLite DB initialized");
}

// ------- Queue helpers (Async API only) -------

export async function queueChange(
  table: Change["table_name"],
  op: Change["op"],
  payload: any,
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_queue (table_name, op, payload, created_at)
     VALUES (?, ?, ?, ?)`,
    [table, op, JSON.stringify(payload), now],
  );
}

export async function getQueuedChanges(): Promise<Change[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<Change>(
    "SELECT id, table_name, op, payload, created_at FROM sync_queue ORDER BY created_at ASC",
  );
  return rows;
}

export async function clearQueuedChange(id: number): Promise<void> {
  const db = await openDB();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
}

export async function logEstimateDelivery(params: {
  estimateId: string;
  channel: string;
  recipient?: string | null;
  messagePreview?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  const id = uuidv4();
  const metadata = params.metadata ? JSON.stringify(params.metadata) : null;

  await db.runAsync(
    `INSERT INTO delivery_logs (id, estimate_id, channel, recipient, message_preview, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.estimateId,
      params.channel,
      params.recipient ?? null,
      params.messagePreview ?? null,
      metadata,
      now,
    ],
  );
}
