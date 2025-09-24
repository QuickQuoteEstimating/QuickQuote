import { supabase } from "./supabase";
import { getQueuedChanges, clearQueuedChange, Change } from "./sqlite";

// ✅ Process a single change
async function processChange(change: Change) {
  console.log("📤 Processing change:", change);

  try {
    const payload = JSON.parse(change.payload);

    let result;

    if (change.op === "insert") {
      result = await supabase.from(change.table_name).insert(payload);
    } else if (change.op === "update") {
      result = await supabase
        .from(change.table_name)
        .update(payload)
        .eq("id", payload.id);
    } else if (change.op === "delete") {
      result = await supabase.from(change.table_name).delete().eq("id", payload.id);
    } else {
      console.warn("⚠️ Unknown operation:", change.op);
      return;
    }

    if (result.error) {
      console.error(`❌ Supabase error for ${change.op} on ${change.table_name}:`, result.error.message);
      return; // stop here so we don’t clear the change
    }

    console.log(`✅ Supabase ${change.op} success:`, result.data);

    // ✅ clear only if success
    await clearQueuedChange(change.id);
  } catch (err) {
    console.error("💥 Unexpected sync error:", err);
  }
}

// ✅ Run full sync
export async function runSync() {
  console.log("🔄 Running sync...");

  const changes = await getQueuedChanges();
  console.log(`📋 Found ${changes.length} queued change(s)`);

  for (const change of changes) {
    if (["customers", "estimates", "estimate_items", "photos"].includes(change.table_name)) {
      await processChange(change);
    } else {
      console.warn("⚠️ Skipping unknown table:", change.table_name);
    }
  }
}
