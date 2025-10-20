import "react-native-gesture-handler";
import "expo-router/entry";
import { useEffect } from "react";
import { resetLocalDatabase } from "./lib/sqlite";

// 👇 Optional: only use this for debugging
// Uncomment if you really want to reset local DB every launch
// useEffect(() => {
//   resetLocalDatabase();
// }, []);

export default function App() {
  // 👇 You can add any global setup hooks here later if needed
  useEffect(() => {
    console.log("✅ App initialized");
  }, []);

  return null; // expo-router handles navigation tree automatically
}
