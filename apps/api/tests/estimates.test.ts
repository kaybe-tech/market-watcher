import { describe, expect, it } from "bun:test"
import type { YearlyEstimatesRow } from "@/modules/company/schema"
import { mergeOverrides } from "@/modules/company/estimates"

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
      row("tikr", "2028-01-31", { salesGrowth: 0.30 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.45, ebitMargin: 0.62 },
        2028: { salesGrowth: 0.30 },
      },
    })
  })

  it("manual gana sobre tikr campo-por-campo", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0.45, ebitMargin: 0.62 }),
      row("manual", "2027-01-31", { salesGrowth: 0.50 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.50, ebitMargin: 0.62 },
      },
    })
  })

  it("sources desconocidas resuelven en orden alfabético después de manual y tikr", () => {
    const result = mergeOverrides([
      row("zeta", "2027-01-31", { salesGrowth: 0.10 }),
      row("alpha", "2027-01-31", { salesGrowth: 0.20 }),
    ])
    expect(result.projections[2027]).toEqual({ salesGrowth: 0.20 })
  })

  it("omite campos null en todas las sources", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: null, ebitMargin: null }),
    ])
    expect(result.projections[2027]).toBeUndefined()
  })
})
