import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "./sqlite";

export type SavedItemRecord = {
  id: string;
  user_id: string;
  name: string;
  default_quantity: number;
  default_unit_price: number;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

export async function listSavedItems(userId: string): Promise<SavedItemRecord[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<SavedItemRecord>(
    `SELECT id, user_id, name, default_quantity, default_unit_price, version, updated_at, deleted_at
       FROM saved_items
       WHERE deleted_at IS NULL AND user_id = ?
       ORDER BY name COLLATE NOCASE ASC`,
    [userId],
  );
  return rows;
}

export type UpsertSavedItemInput = {
  id?: string | null;
  userId: string;
  name: string;
  unitPrice: number;
  defaultQuantity?: number;
};

export async function upsertSavedItem(input: UpsertSavedItemInput): Promise<SavedItemRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  const normalizedQuantity = Math.max(1, Math.round(input.defaultQuantity ?? 1));
  const normalizedPrice = Math.max(0, Math.round(input.unitPrice * 100) / 100);
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    throw new Error("Name is required to save an item template.");
  }

  if (input.id) {
    const rows = await db.getAllAsync<SavedItemRecord>(
      `SELECT id, user_id, name, default_quantity, default_unit_price, version, updated_at, deleted_at
         FROM saved_items
         WHERE id = ?
         LIMIT 1`,
      [input.id],
    );
    const existing = rows[0];
    const nextVersion = (existing?.version ?? 1) + 1;
    const record: SavedItemRecord = {
      id: input.id,
      user_id: existing?.user_id ?? input.userId,
      name: normalizedName,
      default_quantity: normalizedQuantity,
      default_unit_price: normalizedPrice,
      version: nextVersion,
      updated_at: now,
      deleted_at: null,
    };

    await db.runAsync(
      `UPDATE saved_items
         SET name = ?, default_quantity = ?, default_unit_price = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
      [
        record.name,
        record.default_quantity,
        record.default_unit_price,
        record.version,
        record.updated_at,
        record.id,
      ],
    );

    await queueChange("saved_items", "update", record);
    return record;
  }

  const record: SavedItemRecord = {
    id: uuidv4(),
    user_id: input.userId,
    name: normalizedName,
    default_quantity: normalizedQuantity,
    default_unit_price: normalizedPrice,
    version: 1,
    updated_at: now,
    deleted_at: null,
  };

  await db.runAsync(
    `INSERT INTO saved_items (id, user_id, name, default_quantity, default_unit_price, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      record.id,
      record.user_id,
      record.name,
      record.default_quantity,
      record.default_unit_price,
      record.version,
      record.updated_at,
    ],
  );

  await queueChange("saved_items", "insert", record);
  return record;
}

export async function softDeleteSavedItem(id: string): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<SavedItemRecord>(
    `SELECT id, version FROM saved_items WHERE id = ? LIMIT 1`,
    [id],
  );
  const existing = rows[0];
  if (!existing) {
    return;
  }

  const record: SavedItemRecord = {
    ...existing,
    deleted_at: now,
    updated_at: now,
    version: (existing.version ?? 1) + 1,
  };

  await db.runAsync(
    `UPDATE saved_items
       SET deleted_at = ?, updated_at = ?, version = ?
       WHERE id = ?`,
    [record.deleted_at, record.updated_at, record.version, record.id],
  );

  await queueChange("saved_items", "update", record);
}
