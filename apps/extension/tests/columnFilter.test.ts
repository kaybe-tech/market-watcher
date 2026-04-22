import { describe, expect, it } from "bun:test"
import { filterFiscalYearColumns } from "../src/lib/columnFilter"

describe("filterFiscalYearColumns", () => {
  it("mode='historical' excluye sufijo E y conserva sin-sufijo", () => {
    const cols = filterFiscalYearColumns(
      ["1/29/23", "1/28/24", "1/25/27E", "LTM"],
      2026,
      "historical",
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2023-01-29", "2024-01-28"])
  })

  it("mode='estimates' conserva solo sufijo E (con espacio o sin espacio)", () => {
    const cols = filterFiscalYearColumns(
      ["1/31/23 A", "1/31/26 A", "1/31/27 E", "1/31/28 E", "CAGR"],
      2026,
      "estimates",
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2027-01-31", "2028-01-31"])
  })

  it("mode default ausente = 'historical' (backwards-compat)", () => {
    const cols = filterFiscalYearColumns(
      ["1/29/23", "1/25/27E"],
      2026,
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2023-01-29"])
  })
})
