import { describe, expect, it } from "bun:test"
import { mergeOverrides } from "@/modules/company/estimates"
import type { YearlyEstimatesRow } from "@/modules/company/schema"

const row = (
  source: string,
  year: string,
  fields: Partial<YearlyEstimatesRow> = {},
): YearlyEstimatesRow => ({
  ticker: "NVDA",
  fiscalYearEnd: year,
  source,
  capturedAt: "2026-04-22T10:00:00.000Z",
  salesGrowth: null,
  ebitMargin: null,
  taxRate: null,
  capexMaintenanceSalesRatio: null,
  netDebtEbitdaRatio: null,
  ...fields,
})

describe("mergeOverrides", () => {
  it("devuelve overrides vacíos si no hay filas", () => {
    expect(mergeOverrides([])).toEqual({ projections: {} })
  })

  it("mapea 1 source a projections por año", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0.45, ebitMargin: 0.62 }),
      row("tikr", "2028-01-31", { salesGrowth: 0.3 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.45, ebitMargin: 0.62 },
        2028: { salesGrowth: 0.3 },
      },
    })
  })

  it("manual gana sobre tikr campo-por-campo", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0.45, ebitMargin: 0.62 }),
      row("manual", "2027-01-31", { salesGrowth: 0.5 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.5, ebitMargin: 0.62 },
      },
    })
  })

  it("sources desconocidas resuelven en orden alfabético después de manual y tikr", () => {
    const result = mergeOverrides([
      row("zeta", "2027-01-31", { salesGrowth: 0.1 }),
      row("alpha", "2027-01-31", { salesGrowth: 0.2 }),
    ])
    expect(result.projections![2027]).toEqual({ salesGrowth: 0.2 })
  })

  it("omite campos null en todas las sources", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: null, ebitMargin: null }),
    ])
    expect(result.projections![2027]).toBeUndefined()
  })

  it("trata 0 como valor válido (no como null)", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0 }),
    ])
    expect(result.projections![2027]).toEqual({ salesGrowth: 0 })
  })
})
