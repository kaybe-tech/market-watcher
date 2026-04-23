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
      { fiscalYearEnd: "2027-01-31", salesGrowth: 0.3 },
      { fiscalYearEnd: "2028-01-31", salesGrowth: 0.3 },
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

  describe("maxYears", () => {
    const fiveYears: ParsedTable = {
      fiscalYears: [
        "2026-01-31",
        "2027-01-31",
        "2028-01-31",
        "2029-01-31",
        "2030-01-31",
      ],
      rows: [
        { label: "Revenue", values: ["100", "200", "300", "400", "500"] },
        {
          label: "% Change YoY",
          values: ["10.0%", "20.0%", "30.0%", "40.0%", "50.0%"],
        },
      ],
    }

    it("sin maxYears: devuelve todos los años (comportamiento actual)", () => {
      expect(mapTikrEstimatesToPayload(fiveYears)).toHaveLength(5)
    })

    it("maxYears = 3: devuelve los 3 años más tempranos por fiscalYearEnd", () => {
      expect(mapTikrEstimatesToPayload(fiveYears, 3)).toEqual([
        { fiscalYearEnd: "2026-01-31", salesGrowth: 0.1 },
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.2 },
        { fiscalYearEnd: "2028-01-31", salesGrowth: 0.3 },
      ])
    })

    it("ordena ascendente antes de cortar cuando la tabla viene en orden descendente", () => {
      const descending: ParsedTable = {
        fiscalYears: ["2030-01-31", "2029-01-31", "2028-01-31", "2027-01-31"],
        rows: [
          { label: "Revenue", values: ["500", "400", "300", "200"] },
          {
            label: "% Change YoY",
            values: ["50.0%", "40.0%", "30.0%", "20.0%"],
          },
        ],
      }
      expect(mapTikrEstimatesToPayload(descending, 2)).toEqual([
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.2 },
        { fiscalYearEnd: "2028-01-31", salesGrowth: 0.3 },
      ])
    })

    it("maxYears mayor a la cantidad disponible: devuelve todos", () => {
      const twoYears: ParsedTable = {
        fiscalYears: ["2026-01-31", "2027-01-31"],
        rows: [
          { label: "Revenue", values: ["100", "200"] },
          { label: "% Change YoY", values: ["10.0%", "20.0%"] },
        ],
      }
      expect(mapTikrEstimatesToPayload(twoYears, 5)).toHaveLength(2)
    })
  })
})
