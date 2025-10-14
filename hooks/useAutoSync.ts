// hooks/useAutoSync.ts
import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { runSync } from "../lib/sync";

export function useAutoSync() {
  const hasSynced = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = !!state.isConnected;

      if (online && !hasSynced.current) {
        console.log("🌐 Connection restored — running auto-sync...");
        try {
          await runSync();
          hasSynced.current = true;
          console.log("✅ Auto-sync complete.");
        } catch (err) {
          console.warn("⚠️ Auto-sync failed:", err);
        }
      }

      if (!online) hasSynced.current = false;
    });

    return () => unsubscribe();
  }, []);
}
