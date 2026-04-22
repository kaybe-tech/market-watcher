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
    expect(parseFiscalYearHeader("1/29/17", 2026)).toEqual({
      fiscalYearEnd: "2017-01-29",
      kind: "actual",
    })
  })

  test("parses double-digit month and day", () => {
    expect(parseFiscalYearHeader("12/31/23", 2026)).toEqual({
      fiscalYearEnd: "2023-12-31",
      kind: "actual",
    })
  })

  test("rejects invalid calendar dates", () => {
    expect(parseFiscalYearHeader("2/30/25", 2026)).toBeNull()
  })

  test("rejects non-date headers", () => {
    expect(parseFiscalYearHeader("LTM", 2026)).toBeNull()
  })
})

describe("parseFiscalYearHeader con sufijo A/E (página estimates)", () => {
  test("1/31/27 E → 2027-01-31 y flag estimate=true", () => {
    expect(parseFiscalYearHeader("1/31/27 E")).toEqual({
      fiscalYearEnd: "2027-01-31",
      kind: "estimate",
    })
  })

  test("1/31/23 A → 2023-01-31 y flag estimate=false", () => {
    expect(parseFiscalYearHeader("1/31/23 A")).toEqual({
      fiscalYearEnd: "2023-01-31",
      kind: "actual",
    })
  })

  test("1/31/23 sin sufijo → kind=actual (compat backwards con IS/BS/CF)", () => {
    expect(parseFiscalYearHeader("1/31/23")).toEqual({
      fiscalYearEnd: "2023-01-31",
      kind: "actual",
    })
  })

  test("1/25/27E sin espacio → kind=estimate (compat backwards con IS/BS/CF)", () => {
    expect(parseFiscalYearHeader("1/25/27E")).toEqual({
      fiscalYearEnd: "2027-01-25",
      kind: "estimate",
    })
  })
})
