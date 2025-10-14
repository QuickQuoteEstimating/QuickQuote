// lib/sync.ts
import { supabase } from "./supabase";
import { getQueuedChanges, clearQueuedChange, Change } from "./sqlite";
import { syncPhotoBinaries } from "./storage";

// Whitelists per table to avoid sending extra keys to Supabase
const ALLOWED_KEYS: Record<Change["table_name"], string[]> = {
  customers: [
    "id",
    "user_id",
    "name",
    "email",
    "phone",
    "street",
    "city",
    "state",
    "zip",
    "notes",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  estimates: [
    "id",
    "user_id",
    "customer_id",
    "date",
    "total",
    "material_total",
    "labor_hours",
    "labor_rate",
    "labor_total",
    "subtotal",
    "tax_rate",
    "tax_total",
    "notes",
    "billing_address",
    "job_address",
    "job_details",
    "status",
    "version",
    "updated_at",
    "deleted_at",
  ],
  estimate_items: [
    "id",
    "estimate_id",
    "description",
    "quantity",
    "unit_price",
    "base_total",
    "total",
    "apply_markup",
    "catalog_item_id",
    "version",
    "updated_at",
    "deleted_at",
  ],
  photos: [
    "id",
    "estimate_id",
    "uri",
    "local_uri",
    "description",
    "version",
    "updated_at",
    "deleted_at",
  ],
  saved_items: [
    "id",
    "user_id",
    "name",
    "default_quantity",
    "default_unit_price",
    "default_markup_applicable",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  item_catalog: ["id", "name", "unit_price", "deleted_at"],
};

function sanitizePayload(table: Change["table_name"], payload: any) {
  const allowed = ALLOWED_KEYS[table];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in payload) clean[k] = payload[k];
  }
  return clean;
}

async function processChange(change: Change) {
  console.log("🧩 Processing change:", change);

  try {
    const raw = JSON.parse(change.payload);

    // Never send phantom keys like "title"
    delete raw.title;

    // Remove placeholder ids
    if (raw.id === "[id]" || raw.id === null || raw.id === undefined) {
      delete raw.id;
    }

    const payload = sanitizePayload(change.table_name, raw);

    let result:
      | Awaited<ReturnType<typeof supabase["from"]>> // just for TS happiness
      | any;

    if (change.op === "insert") {
      result = await supabase.from(change.table_name).insert(payload);
    } else if (change.op === "update") {
      if (!raw.id) {
        console.warn("⚠️ Skipping update: missing ID", raw);
        return;
      }
      result = await supabase.from(change.table_name).update(payload).eq("id", raw.id);
    } else if (change.op === "delete") {
      if (!raw.id) {
        console.warn("⚠️ Skipping delete: missing ID", raw);
        return;
      }
      result = await supabase.from(change.table_name).delete().eq("id", raw.id);
    } else {
      console.warn("⚠️ Unknown op:", change.op);
      return;
    }

    if (result.error) {
      console.error(
        `❌ Supabase error for ${change.op} on ${change.table_name}:`,
        result.error.message
      );
      return; // keep it in the queue so we can inspect again later
    }

    console.log(`✅ ${change.op} successful for ${change.table_name}`);
    await clearQueuedChange(change.id);
  } catch (err) {
    console.error("💥 Failed to process change:", err);
  }
}

export async function runSync() {
  console.log("🔄 Running sync...");
  const changes = await getQueuedChanges();
  console.log(`📋 Found ${changes.length} queued change(s)`);

  for (const change of changes) {
    if (
      [
        "customers",
        "estimates",
        "estimate_items",
        "photos",
        "saved_items",
        "item_catalog",
      ].includes(change.table_name)
    ) {
      await processChange(change);
    } else {
      console.warn("⚠️ Skipping unknown table:", change.table_name);
    }
  }

  await syncPhotoBinaries();
}
