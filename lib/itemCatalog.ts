import { v4 as uuidv4 } from "uuid";
import { openDB, queueChange } from "./sqlite";

export type ItemCatalogRecord = {
  id: string;
  user_id: string;
  description: string;
  default_quantity: number;
  unit_price: number;
  notes: string | null;
  version: number;
  updated_at: string;
  deleted_at: string | null;
};

export async function listItemCatalog(userId: string): Promise<ItemCatalogRecord[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<ItemCatalogRecord>(
    `SELECT id, user_id, description, default_quantity, unit_price, notes, version, updated_at, deleted_at
       FROM item_catalog
       WHERE deleted_at IS NULL AND user_id = ?
       ORDER BY description COLLATE NOCASE ASC`,
    [userId]
  );
  return rows;
}

export type UpsertItemCatalogInput = {
  id?: string | null;
  userId: string;
  description: string;
  unitPrice: number;
  defaultQuantity?: number;
  notes?: string | null;
};

export async function upsertItemCatalog(input: UpsertItemCatalogInput): Promise<ItemCatalogRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  const normalizedQuantity = Math.max(1, Math.round(input.defaultQuantity ?? 1));
  const normalizedPrice = Math.max(0, Math.round(input.unitPrice * 100) / 100);
  const normalizedDescription = input.description.trim();
  const normalizedNotes = input.notes?.trim() || null;

  if (!normalizedDescription) {
    throw new Error("Description is required to save an item template.");
  }

  if (input.id) {
    const rows = await db.getAllAsync<ItemCatalogRecord>(
      `SELECT id, user_id, description, default_quantity, unit_price, notes, version, updated_at, deleted_at
         FROM item_catalog
         WHERE id = ? LIMIT 1`,
      [input.id]
    );
    const existing = rows[0];
    const nextVersion = (existing?.version ?? 1) + 1;
    const record: ItemCatalogRecord = {
      id: input.id,
      user_id: existing?.user_id ?? input.userId,
      description: normalizedDescription,
      default_quantity: normalizedQuantity,
      unit_price: normalizedPrice,
      notes: normalizedNotes,
      version: nextVersion,
      updated_at: now,
      deleted_at: null,
    };

    await db.runAsync(
      `UPDATE item_catalog
         SET description = ?, default_quantity = ?, unit_price = ?, notes = ?, version = ?, updated_at = ?, deleted_at = NULL
         WHERE id = ?`,
      [
        record.description,
        record.default_quantity,
        record.unit_price,
        record.notes,
        record.version,
        record.updated_at,
        record.id,
      ]
    );

    await queueChange("item_catalog", "update", record);
    return record;
  }

  const record: ItemCatalogRecord = {
    id: uuidv4(),
    user_id: input.userId,
    description: normalizedDescription,
    default_quantity: normalizedQuantity,
    unit_price: normalizedPrice,
    notes: normalizedNotes,
    version: 1,
    updated_at: now,
    deleted_at: null,
  };

  await db.runAsync(
    `INSERT INTO item_catalog (id, user_id, description, default_quantity, unit_price, notes, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      record.id,
      record.user_id,
      record.description,
      record.default_quantity,
      record.unit_price,
      record.notes,
      record.version,
      record.updated_at,
    ]
  );

  await queueChange("item_catalog", "insert", record);
  return record;
}

export async function softDeleteItemCatalog(id: string): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  const rows = await db.getAllAsync<ItemCatalogRecord>(
    `SELECT id, version FROM item_catalog WHERE id = ? LIMIT 1`,
    [id]
  );
  const existing = rows[0];
  if (!existing) {
    return;
  }

  const record: ItemCatalogRecord = {
    ...existing,
    deleted_at: now,
    updated_at: now,
    version: (existing.version ?? 1) + 1,
  };

  await db.runAsync(
    `UPDATE item_catalog
       SET deleted_at = ?, updated_at = ?, version = ?
       WHERE id = ?`,
    [record.deleted_at, record.updated_at, record.version, record.id]
  );

  await queueChange("item_catalog", "update", record);
}
