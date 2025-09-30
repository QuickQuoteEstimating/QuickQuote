export function formatPercentageInput(value: number): string {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return "0";
  }

  const normalized = Math.max(0, Math.round(value * 100) / 100);
  if (normalized % 1 === 0) {
    return normalized.toFixed(0);
  }
  return normalized.toString();
}
