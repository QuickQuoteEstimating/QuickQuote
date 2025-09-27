import { ReadableStream as PolyfillReadableStream } from "web-streams-polyfill/ponyfill";

if (typeof globalThis.ReadableStream === "undefined") {
  globalThis.ReadableStream = PolyfillReadableStream;
}

import "expo-router/entry";
