import { describe, expect, test } from "bun:test"
import {
  parseFiscalYearHeader,
  pivotTwoDigitYear,
} from "../src/lib/fiscalYearParser"

describe("pivotTwoDigitYear", () => {
  test("near-future years map to 21st century", () => {
    expect(pivotTwoDigitYear(26, 2026)).toBe(2026)
    expect(pivotTwoDigitYear(35, 2026)).toBe(2035)
  })

  test("far-future years map to 20th century", () => {
    expect(pivotTwoDigitYear(99, 2026)).toBe(1999)
    expect(pivotTwoDigitYear(90, 2026)).toBe(1990)
  })

  test("past years always map to 21st century", () => {
    expect(pivotTwoDigitYear(7, 2026)).toBe(2007)
    expect(pivotTwoDigitYear(17, 2026)).toBe(2017)
  })
})

describe("parseFiscalYearHeader", () => {
  test("parses standard TIKR format", () => {
    expect(parseFiscalYearHeader("1/29/17", 2026)).toBe("2017-01-29")
  })

  test("parses double-digit month and day", () => {
    expect(parseFiscalYearHeader("12/31/23", 2026)).toBe("2023-12-31")
  })

  test("rejects invalid calendar dates", () => {
    expect(parseFiscalYearHeader("2/30/25", 2026)).toBeNull()
  })

  test("rejects non-date headers", () => {
    expect(parseFiscalYearHeader("LTM", 2026)).toBeNull()
    expect(parseFiscalYearHeader("1/25/26E", 2026)).toBeNull()
  })
})
