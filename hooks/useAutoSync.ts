// hooks/useAutoSync.ts
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { runSync } from "../lib/sync";
import { isOnline } from "../lib/network";

/**
 * Automatically runs sync when app regains focus or comes back online.
 * Works even in mock/offline-safe environments (no native NetInfo required).
 */
export function useAutoSync() {
  const hasSynced = useRef(false);

  useEffect(() => {
    let active = true;

    async function trySync() {
      if (!active) return;

      const online = await isOnline();
      if (online && !hasSynced.current) {
        console.log("🌐 AutoSync: device online, running sync...");
        hasSynced.current = true;
        await runSync();
      } else if (!online) {
        console.log("📴 AutoSync: offline, will retry when network restores.");
        hasSynced.current = false;
      }
    }

    // Check on mount
    trySync();

    // Recheck whenever app becomes active
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") trySync();
    });

    // Recheck every 60s (safety fallback)
    const interval = setInterval(trySync, 60000);

    return () => {
      active = false;
      sub.remove();
      clearInterval(interval);
    };
  }, []);
}
