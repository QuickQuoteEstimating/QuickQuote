// lib/sqlite.ts
import * as SQLite from "expo-sqlite";
import { v4 as uuidv4 } from "uuid";

export type Change = {
  id: number;
  table_name: "customers" | "estimates" | "estimate_items" | "photos";
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
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    );
  `);

  // Estimates
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      date TEXT DEFAULT (datetime('now')),
      total REAL DEFAULT 0,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  const estimateColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(estimates)"
  );
  if (!estimateColumns.some((column) => column.name === "status")) {
    await db.execAsync(
      "ALTER TABLE estimates ADD COLUMN status TEXT DEFAULT 'draft'"
    );
  }

  // Estimate Items
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimate_items (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

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

  const photoColumns = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(photos)"
  );
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
