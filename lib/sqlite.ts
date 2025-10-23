// lib/sqlite.ts
import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import { v4 as uuidv4 } from "uuid";

// Fallback safety
const FS: any = FileSystem;
export const documentDirectory: string =
  FS.documentDirectory ?? FS.cacheDirectory ?? "";

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------
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



// -------------------------------------------------------------
// DB Singleton
// -------------------------------------------------------------
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function openDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync("quickquote.db");
  }
  return _dbPromise;
}

// -------------------------------------------------------------
// Initialize Schema
// -------------------------------------------------------------
export async function initLocalDB(): Promise<void> {
  const db = await openDB();
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // -------------------------------
  // SYNC QUEUE
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // -------------------------------
  // CUSTOMERS
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      street TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      notes TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  // -------------------------------
  // ESTIMATES
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      customer_id TEXT,
      description TEXT,
      billing_address TEXT,
      job_address TEXT,
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_total REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      estimate_number TEXT,
      status TEXT DEFAULT 'draft',
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // -------------------------------
  // ESTIMATE ITEMS
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimate_items (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      user_id TEXT,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      base_total REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      apply_markup INTEGER NOT NULL DEFAULT 1,
      catalog_item_id TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  // -------------------------------
  // ITEM CATALOG
  // -------------------------------
  await db.execAsync(`
    DROP TABLE IF EXISTS item_catalog;
    CREATE TABLE IF NOT EXISTS item_catalog (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      unit_price REAL DEFAULT 0,
      default_quantity REAL DEFAULT 1,
      apply_markup INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  // -------------------------------
  // PHOTOS
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      uri TEXT NOT NULL,
      local_uri TEXT,
      description TEXT,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  // -------------------------------
  // SAVED ITEMS
  // -------------------------------
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_items (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      default_quantity INTEGER DEFAULT 1,
      default_unit_price REAL DEFAULT 0,
      default_markup_applicable INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  // -------------------------------
  // DELIVERY LOGS
  // -------------------------------
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

  // -------------------------------
  // MIGRATION CHECKS
  // -------------------------------
  const migrations: { table: string; column: string; type: string }[] = [
    { table: "customers", column: "user_id", type: "TEXT" },
    { table: "estimates", column: "user_id", type: "TEXT" },
    { table: "estimate_items", column: "user_id", type: "TEXT" },
    { table: "item_catalog", column: "user_id", type: "TEXT" },
  ];

  for (const { table, column, type } of migrations) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
    if (!info.some((col) => col.name === column)) {
      console.log(`🧩 Adding missing column ${column} to ${table}`);
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    }
  }

  console.log("✅ Local SQLite DB initialized successfully");
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
// Reset local DB
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
