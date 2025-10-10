// lib/sqlite.ts
import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system";
import { v4 as uuidv4 } from "uuid";

// -------------------------------------------------------------
// 📂 File system setup
// ------------------------------------------------------------
// safely type and export directories
const documentDirectory: string =
  (FileSystem as any).documentDirectory ??
  (FileSystem as any).cacheDirectory ??
  "";

export { documentDirectory };

// -------------------------------------------------------------
// 📋 Helper types
// -------------------------------------------------------------
export type TableColumn = { name: string };

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
  payload: string;
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

// -------------------------------------------------------------
// 🗃️ Database Singleton
// -------------------------------------------------------------
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync("quickquote.db");
  }
  return _dbPromise;
}

// -------------------------------------------------------------
// 🏗️ Initialize Local Database
// -------------------------------------------------------------
export async function initLocalDB(): Promise<void> {
  const db = await openDB();
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // --- Sync Queue ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // --- Customers ---
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

  // --- Estimates ---
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

  // --- Item Catalog ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS item_catalog (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      deleted_at TEXT
    );
  `);

  // --- Estimate Items ---
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

  // --- Photos ---
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

  // --- Saved Items ---
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

  // --- Delivery Logs ---
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

// -------------------------------------------------------------
// 🔄 Offline Sync Helpers
// -------------------------------------------------------------
export async function queueChange(
  table: Change["table_name"],
  op: Change["op"],
  payload: any
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_queue (table_name, op, payload, created_at)
     VALUES (?, ?, ?, ?)`,
    [table, op, JSON.stringify(payload), now]
  );
}

export async function getQueuedChanges(): Promise<Change[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<Change>(
    "SELECT id, table_name, op, payload, created_at FROM sync_queue ORDER BY created_at ASC"
  );
  return rows;
}

export async function clearQueuedChange(id: number): Promise<void> {
  const db = await openDB();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
}

// -------------------------------------------------------------
// 📨 Delivery Logging
// -------------------------------------------------------------
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
    ]
  );
}

// -------------------------------------------------------------
// 🧹 Reset Local Database
// -------------------------------------------------------------
export async function resetLocalDatabase(): Promise<void> {
  try {
    const dbPath = `${documentDirectory}SQLite/quickquote.db`;
    console.log("🧹 Attempting to delete local DB:", dbPath);

    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(dbPath, { idempotent: true });
      console.log("✅ Local DB file deleted.");
    }

    // Re-initialize DB
    await initLocalDB();

    const db = await openDB();
    await db.execAsync("DELETE FROM sync_queue;");

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    console.log(
      "📋 Current tables after reset:",
      tables.map((t) => t.name)
    );
    console.log("✅ Database reset complete!");
  } catch (err) {
    console.error("❌ Error resetting local DB:", err);
  }
}
