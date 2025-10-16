// lib/sqlite.ts
import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system";
import { v4 as uuidv4 } from "uuid";

// Some SDK typings don't expose these properties; cast to any for safety.
const FS: any = FileSystem;
export const documentDirectory: string =
  FS.documentDirectory ?? FS.cacheDirectory ?? "";

// -------------------------------------------------------------
// Types
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
// DB singleton (use standard location: <documentDir>/SQLite/quickquote.db)
// -------------------------------------------------------------
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    // Use just the filename so Expo stores it under .../SQLite/quickquote.db
    _dbPromise = SQLite.openDatabaseAsync("quickquote.db");
  }
  return _dbPromise;
}

// Debug helper: log CREATE TABLE for customers
export async function debugCustomersSchema() {
  const db = await openDB();
  const result = await db.getAllAsync<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='customers';"
  );
  console.log("🧩 Local customers table schema:", result);
}

// -------------------------------------------------------------
// Initialize schema
// -------------------------------------------------------------
export async function initLocalDB(): Promise<void> {
  const db = await openDB();
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // --- Standard table creation (unchanged) ---
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      street TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

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

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS item_catalog (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      deleted_at TEXT
    );
  `);

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

  // --- ✅ NEW: Safe schema migration for missing columns ---
  const tableInfo = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(estimates);"
  );
  const existingColumns = tableInfo.map((col) => col.name);

  if (!existingColumns.includes("estimate_number")) {
    console.log("🧩 Adding missing column: estimate_number");
    await db.execAsync(`ALTER TABLE estimates ADD COLUMN estimate_number TEXT;`);
  }

  if (!existingColumns.includes("description")) {
    console.log("🧩 Adding missing column: description");
    await db.execAsync(`ALTER TABLE estimates ADD COLUMN description TEXT;`);
  }

  console.log("✅ Local SQLite DB initialized (with schema migration)");
}


// -------------------------------------------------------------
// Sync queue helpers
// -------------------------------------------------------------
export async function queueChange(
  table: Change["table_name"],
  op: Change["op"],
  payload: unknown
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
  return db.getAllAsync<Change>(
    "SELECT id, table_name, op, payload, created_at FROM sync_queue ORDER BY created_at ASC"
  );
}

export async function clearQueuedChange(id: number): Promise<void> {
  const db = await openDB();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", [id]);
}

// -------------------------------------------------------------
// Delivery logging
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
// Reset local DB (delete both possible locations just in case)
// -------------------------------------------------------------
export async function resetLocalDatabase(): Promise<void> {
  try {
    const primary = `${documentDirectory}SQLite/quickquote.db`;
    const fallback = `${(FS.cacheDirectory ?? "")}SQLite/quickquote.db`;
    console.log("🧹 Attempting to delete local DB:", { primary, fallback });

    const tryDelete = async (path: string) => {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
        console.log("✅ Deleted:", path);
      }
    };

    await tryDelete(primary);
    await tryDelete(fallback);

    // Re-initialize schema
    await initLocalDB();

    const db = await openDB();
    await db.execAsync("DELETE FROM sync_queue;");

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    console.log("📋 Current tables after reset:", tables.map((t) => t.name));
    console.log("✅ Database reset complete!");
  } catch (err) {
    console.error("❌ Error resetting local DB:", err);
  }
}
