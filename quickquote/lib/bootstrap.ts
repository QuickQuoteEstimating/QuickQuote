import { supabase } from "./supabase";
import { openDB } from "./sqlite";

type Customer = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  version: number | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type Estimate = {
  id: string;
  user_id: string;
  customer_id: string;
  date: string | null;
  total: number | null;
  notes: string | null;
  version: number | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type EstimateItem = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  version: number | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type Photo = {
  id: string;
  estimate_id: string;
  uri: string;
  description: string | null;
  version: number | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export async function bootstrapUserData(userId: string) {
  const [{ data: customers, error: customersError }, { data: estimates, error: estimatesError }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("user_id", userId),
      supabase.from("estimates").select("*").eq("user_id", userId),
    ]);

  if (customersError) {
    throw customersError;
  }
  if (estimatesError) {
    throw estimatesError;
  }

  const estimateIds = (estimates ?? []).map((estimate) => estimate.id);

  let estimateItems: EstimateItem[] = [];
  let photos: Photo[] = [];

  if (estimateIds.length > 0) {
    const [{ data: itemsData, error: itemsError }, { data: photosData, error: photosError }] =
      await Promise.all([
        supabase.from("estimate_items").select("*").in("estimate_id", estimateIds),
        supabase.from("photos").select("*").in("estimate_id", estimateIds),
      ]);

    if (itemsError) {
      throw itemsError;
    }
    if (photosError) {
      throw photosError;
    }

    estimateItems = (itemsData ?? []) as EstimateItem[];
    photos = (photosData ?? []) as Photo[];
  }

  const db = await openDB();

  await db.runAsync("DELETE FROM sync_queue");
  await db.runAsync("DELETE FROM photos");
  await db.runAsync("DELETE FROM estimate_items");
  await db.runAsync("DELETE FROM estimates");
  await db.runAsync("DELETE FROM customers");

  for (const customer of (customers ?? []) as Customer[]) {
    await db.runAsync(
      `INSERT OR REPLACE INTO customers (id, user_id, name, phone, email, address, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer.id,
        customer.user_id,
        customer.name,
        customer.phone,
        customer.email,
        customer.address,
        customer.version ?? 1,
        customer.updated_at ?? new Date().toISOString(),
        customer.deleted_at,
      ]
    );
  }

  for (const estimate of (estimates ?? []) as Estimate[]) {
    await db.runAsync(
      `INSERT OR REPLACE INTO estimates (id, user_id, customer_id, date, total, notes, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        estimate.id,
        estimate.user_id,
        estimate.customer_id,
        estimate.date,
        estimate.total ?? 0,
        estimate.notes,
        estimate.version ?? 1,
        estimate.updated_at ?? new Date().toISOString(),
        estimate.deleted_at,
      ]
    );
  }

  for (const item of estimateItems) {
    await db.runAsync(
      `INSERT OR REPLACE INTO estimate_items (id, estimate_id, description, quantity, unit_price, total, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.estimate_id,
        item.description,
        item.quantity,
        item.unit_price,
        item.total,
        item.version ?? 1,
        item.updated_at ?? new Date().toISOString(),
        item.deleted_at,
      ]
    );
  }

  for (const photo of photos) {
    await db.runAsync(
      `INSERT OR REPLACE INTO photos (id, estimate_id, uri, description, version, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        photo.id,
        photo.estimate_id,
        photo.uri,
        photo.description,
        photo.version ?? 1,
        photo.updated_at ?? new Date().toISOString(),
        photo.deleted_at,
      ]
    );
  }
}

export async function clearLocalData() {
  const db = await openDB();
  await db.runAsync("DELETE FROM sync_queue");
  await db.runAsync("DELETE FROM photos");
  await db.runAsync("DELETE FROM estimate_items");
  await db.runAsync("DELETE FROM estimates");
  await db.runAsync("DELETE FROM customers");
}
