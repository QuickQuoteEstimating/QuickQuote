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

export function formatCurrency(value: number, currency: string = "USD"): string {
  if (isNaN(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}
