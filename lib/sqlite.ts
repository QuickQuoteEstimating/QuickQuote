// lib/sqlite.ts
import * as SQLite from "expo-sqlite";

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  type: string
): Promise<void> {
  const columnInfo = await db.getFirstAsync<{ name: string }>(
    `PRAGMA table_info(${table}) WHERE name = ?`,
    [column]
  );

  if (!columnInfo) {
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    } catch (error) {
      console.warn(`Failed to add column ${column} to ${table}:`, error);
    }
  }
}

export type Change = {
  id: number;
  table_name: "customers" | "estimates" | "estimate_items" | "photos";
  op: "insert" | "update" | "delete";
  payload: string; // JSON string
  created_at: string;
};

let _dbPromise: Promise<SQLite.SQLiteDatabase> | undefined;

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
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      pdf_last_generated_uri TEXT,
      pdf_last_generated_at TEXT,
      pdf_last_sent_at TEXT,
      pdf_last_sent_via TEXT,
      pdf_last_sent_status TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `);

  // Ensure new PDF metadata columns exist for legacy databases
  await ensureColumn(db, "estimates", "pdf_last_generated_uri", "TEXT");
  await ensureColumn(db, "estimates", "pdf_last_generated_at", "TEXT");
  await ensureColumn(db, "estimates", "pdf_last_sent_at", "TEXT");
  await ensureColumn(db, "estimates", "pdf_last_sent_via", "TEXT");
  await ensureColumn(db, "estimates", "pdf_last_sent_status", "TEXT");

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
      description TEXT,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS estimate_delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id TEXT NOT NULL,
      sent_via TEXT NOT NULL,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      metadata TEXT,
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
