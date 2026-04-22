import { describe, expect, test } from "bun:test"
import { filterFiscalYearColumns } from "../src/lib/columnFilter"

describe("filterFiscalYearColumns", () => {
  test("keeps fiscal-year headers and returns parsed ISO dates", () => {
    const result = filterFiscalYearColumns(
      ["1/29/17", "1/25/26", "1/25/27E", "LTM"],
      2026,
    )
    expect(result).toEqual([
      { index: 0, fiscalYearEnd: "2017-01-29" },
      { index: 1, fiscalYearEnd: "2026-01-25" },
      { index: 2, fiscalYearEnd: "2027-01-25" },
    ])
  })

  test("excludes non-date headers like LTM", () => {
    const result = filterFiscalYearColumns(["1/25/27E", "LTM", "1/25/26"], 2026)
    expect(result).toEqual([
      { index: 0, fiscalYearEnd: "2027-01-25" },
      { index: 2, fiscalYearEnd: "2026-01-25" },
    ])
  })
})
