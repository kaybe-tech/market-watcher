import { describe, expect, it } from "bun:test"
import { mapTikrEstimatesToPayload } from "../src/sources/tikr/estimatesFieldMapper"
import type { ParsedTable } from "../src/sources/tikr/fieldMapper"

describe("mapTikrEstimatesToPayload", () => {
  it("mapea Revenue → sub-fila % Change YoY → salesGrowth por año", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31", "2028-01-31"],
      rows: [
        { label: "Revenue", values: ["200000", "260000"] },
        { label: "% Change YoY", values: ["30.0%", "30.0%"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", salesGrowth: 0.30 },
      { fiscalYearEnd: "2028-01-31", salesGrowth: 0.30 },
    ])
  })

  it("mapea EBIT → % EBIT Margins → ebitMargin", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "EBIT", values: ["60000"] },
        { label: "% EBIT Margins", values: ["62.0%"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", ebitMargin: 0.62 },
    ])
  })

  it("Effective Tax Rate y Net Debt/EBITDA van directo", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Effective Tax Rate (%)", values: ["18.0%"] },
        { label: "Net Debt/EBITDA", values: ["(0.5)"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      {
        fiscalYearEnd: "2027-01-31",
        taxRate: 0.18,
        netDebtEbitdaRatio: -0.5,
      },
    ])
  })

  it("Capital Expenditure / Revenue → capexMaintenanceSalesRatio", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Revenue", values: ["200000"] },
        { label: "Capital Expenditure", values: ["(8000)"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", capexMaintenanceSalesRatio: 0.04 },
    ])
  })

  it("celdas vacías (--, —) no se emiten", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Revenue", values: ["200000"] },
        { label: "% Change YoY", values: ["--"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31" },
    ])
  })
})
