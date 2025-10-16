// lib/network.ts
let forceOffline = false;

export function setForceOffline(value: boolean) {
  forceOffline = value;
}

export async function isOnline(): Promise<boolean> {
  if (forceOffline) return false;
  try {
    const response = await fetch("https://api.github.com", { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
