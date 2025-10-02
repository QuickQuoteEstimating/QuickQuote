const CURRENCY_SCALE = 100;

export type MarkupMode = "percentage" | "flat";

export type MarkupRule = {
  mode: MarkupMode;
  value: number;
};

export type EstimateMaterialItem = {
  baseTotal: number;
  applyMarkup?: boolean;
};

export type EstimateTotalsInput = {
  materialLineItems: EstimateMaterialItem[];
  materialMarkup?: MarkupRule | null;
  laborHours?: number;
  laborRate?: number;
  laborMarkup?: MarkupRule | null;
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

export function roundCurrency(value: number): number {
  return Math.round(value * CURRENCY_SCALE) / CURRENCY_SCALE;
}

function coerceNumber(value: number | undefined | null): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function normalizeMarkupRule(rule: MarkupRule | null | undefined): MarkupRule | null {
  if (!rule) {
    return null;
  }

  const mode: MarkupMode = rule.mode === "flat" ? "flat" : "percentage";
  const value = Math.max(0, coerceNumber(rule.value));

  if (value === 0) {
    return null;
  }

  return { mode, value };
}

export function applyMarkup(
  baseTotal: number,
  rule: MarkupRule | null | undefined,
  options: { apply?: boolean } = {},
): { base: number; markupAmount: number; total: number } {
  const normalizedBase = Math.max(0, coerceNumber(baseTotal));
  const normalizedRule = normalizeMarkupRule(rule);
  const shouldApply = options.apply !== false && !!normalizedRule;

  if (!shouldApply || !normalizedRule) {
    const roundedBase = roundCurrency(normalizedBase);
    return { base: roundedBase, markupAmount: 0, total: roundedBase };
  }

  let total = normalizedBase;

  if (normalizedRule.mode === "percentage") {
    total = normalizedBase * (1 + normalizedRule.value / 100);
  } else {
    total = normalizedBase + normalizedRule.value;
  }

  const roundedBase = roundCurrency(normalizedBase);
  const roundedTotal = roundCurrency(total);
  const markupAmount = roundCurrency(roundedTotal - roundedBase);

  return { base: roundedBase, markupAmount, total: roundedTotal };
}

export function calculateEstimateTotals({
  materialLineItems,
  materialMarkup,
  laborHours,
  laborRate,
  laborMarkup,
  taxRate,
}: EstimateTotalsInput): EstimateTotals {
  let materialTotalAccumulator = 0;

  for (const item of materialLineItems) {
    const result = applyMarkup(item.baseTotal, materialMarkup, { apply: item.applyMarkup !== false });
    materialTotalAccumulator += result.total;
  }

  const materialTotal = roundCurrency(materialTotalAccumulator);

  const safeLaborHours = Math.max(0, coerceNumber(laborHours));
  const safeLaborRate = Math.max(0, coerceNumber(laborRate));
  const laborBaseTotal = roundCurrency(safeLaborHours * safeLaborRate);
  const laborResult = applyMarkup(laborBaseTotal, laborMarkup, { apply: true });
  const laborTotal = laborResult.total;

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
