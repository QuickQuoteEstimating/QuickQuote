import { ReadableStream as PolyfillReadableStream } from "web-streams-polyfill/ponyfill";

if (typeof globalThis.ReadableStream === "undefined") {
  globalThis.ReadableStream = PolyfillReadableStream;
}

import "expo-router/entry";

import { resetLocalDatabase } from "./lib/sqlite";
import { useEffect } from "react";

useEffect(() => {
  // TEMP: run this once to wipe and re-init the local DB
  resetLocalDatabase();
}, []);

