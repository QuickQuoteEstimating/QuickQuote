import { applyMarkup, calculateEstimateTotals } from "../lib/estimateMath";

describe("applyMarkup", () => {
  it("applies percentage markup correctly", () => {
    const result = applyMarkup(100, { mode: "percentage", value: 10 }, { apply: true });
    expect(result).toEqual({ base: 100, markupAmount: 10, total: 110 });
  });

  it("applies flat markup correctly", () => {
    const result = applyMarkup(80, { mode: "flat", value: 25 }, { apply: true });
    expect(result).toEqual({ base: 80, markupAmount: 25, total: 105 });
  });

  it("skips markup when apply is false", () => {
    const result = applyMarkup(120, { mode: "percentage", value: 15 }, { apply: false });
    expect(result).toEqual({ base: 120, markupAmount: 0, total: 120 });
  });
});

describe("calculateEstimateTotals", () => {
  it("combines material and labor markup into the totals", () => {
    const totals = calculateEstimateTotals({
      materialLineItems: [
        { baseTotal: 100, applyMarkup: true },
        { baseTotal: 50, applyMarkup: false },
      ],
      materialMarkup: { mode: "percentage", value: 10 },
      laborHours: 5,
      laborRate: 40,
      laborMarkup: { mode: "flat", value: 25 },
      taxRate: 8,
    });

    expect(totals.materialTotal).toBe(160);
    expect(totals.laborTotal).toBe(225);
    expect(totals.subtotal).toBe(385);
    expect(totals.taxTotal).toBeCloseTo(30.8, 5);
    expect(totals.grandTotal).toBeCloseTo(415.8, 5);
  });
});
