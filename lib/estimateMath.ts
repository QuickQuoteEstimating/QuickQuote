const CURRENCY_SCALE = 100;

export type EstimateTotalsInput = {
  materialLineItems: { total: number }[];
  laborHours?: number;
  laborRate?: number;
  taxRate?: number;
};

export type EstimateTotals = {
  materialTotal: number;
  laborHours: number;
  laborRate: number;
  laborTotal: number;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  grandTotal: number;
};

function roundCurrency(value: number): number {
  return Math.round(value * CURRENCY_SCALE) / CURRENCY_SCALE;
}

function coerceNumber(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

export function calculateEstimateTotals({
  materialLineItems,
  laborHours,
  laborRate,
  taxRate,
}: EstimateTotalsInput): EstimateTotals {
  const materialTotal = roundCurrency(
    materialLineItems.reduce((acc, item) => acc + coerceNumber(item.total), 0)
  );

  const safeLaborHours = Math.max(0, coerceNumber(laborHours));
  const safeLaborRate = Math.max(0, coerceNumber(laborRate));
  const laborTotal = roundCurrency(safeLaborHours * safeLaborRate);

  const subtotal = roundCurrency(materialTotal + laborTotal);
  const safeTaxRate = Math.max(0, coerceNumber(taxRate));
  const taxTotal = roundCurrency(subtotal * (safeTaxRate / 100));
  const grandTotal = roundCurrency(subtotal + taxTotal);

  return {
    materialTotal,
    laborHours: safeLaborHours,
    laborRate: safeLaborRate,
    laborTotal,
    subtotal,
    taxRate: safeTaxRate,
    taxTotal,
    grandTotal,
  };
}
