import { supabase } from "./supabase";
import { getQueuedChanges, clearQueuedChange, Change } from "./sqlite";
import { syncPhotoBinaries } from "./storage";

// ✅ Process a single change safely for Supabase sync
async function processChange(change: Change) {
  console.log("🧩 Processing change:", change);

  try {
    const payload = JSON.parse(change.payload);
    // Add a fallback title if missing
if (!payload.title || payload.title === "") {
  payload.title = "Untitled Estimate";
}

    let result;

    // Sanitize payload — remove any placeholder IDs
    if (payload.id === "[id]" || payload.id === null || payload.id === undefined) {
      delete payload.id;
    }

    if (change.op === "insert") {
      // Let Supabase handle ID generation
      result = await supabase.from(change.table_name).insert(payload);
    } else if (change.op === "update") {
      // Ensure we have a valid ID before updating
      if (!payload.id || payload.id === "[id]") {
        console.warn("⚠️ Skipping update: invalid or missing ID in payload", payload);
        return;
      }
      result = await supabase
        .from(change.table_name)
        .update(payload)
        .eq("id", payload.id);
    } else if (change.op === "delete") {
      // Only delete when a valid ID is present
      if (!payload.id || payload.id === "[id]") {
        console.warn("⚠️ Skipping delete: invalid or missing ID in payload");
        return;
      }
      result = await supabase.from(change.table_name).delete().eq("id", payload.id);
    } else {
      console.warn("⚠️ Unknown operation:", change.op);
      return;
    }

    if (result.error) {
      console.error(
        `❌ Supabase error for ${change.op} on ${change.table_name}:`,
        result.error.message
      );
      return; // stop here so we don’t clear the change
    }

    console.log(`✅ ${change.op} successful for ${change.table_name}`);
  } catch (err) {
    console.error("💥 Failed to process change:", err);
  }
}


// ✅ Run full sync
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
