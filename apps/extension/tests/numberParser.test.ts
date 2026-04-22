import { describe, expect, test } from "bun:test"
import {
  isVisualEmpty,
  normalizeToMillions,
  parseAndNormalize,
  parseCell,
  parseUnit,
} from "../src/lib/numberParser"

describe("parseCell", () => {
  test("parses plain integers", () => {
    expect(parseCell("1234")).toBe(1234)
  })

  test("parses decimals", () => {
    expect(parseCell("1234.56")).toBe(1234.56)
  })

  test("strips thousand separators", () => {
    expect(parseCell("1,234,567.89")).toBe(1234567.89)
  })

  test("translates parentheses to negative", () => {
    expect(parseCell("(1,234.56)")).toBe(-1234.56)
  })

  test.each([
    "",
    "--",
    "—",
    " —  ",
    "  --",
    "NM",
    "N/A",
  ])("returns null for empty marker %p", (raw) => {
    expect(parseCell(raw)).toBeNull()
  })

  test("returns null for garbage", () => {
    expect(parseCell("abc")).toBeNull()
  })

  test("handles non-breaking spaces", () => {
    expect(parseCell("\u00a01,000\u00a0")).toBe(1000)
  })
})

describe("parseUnit", () => {
  test.each([
    ["Millions", "millions"],
    ["MILLIONS", "millions"],
    ["Financials in Thousands of USD", "thousands"],
    ["Billions", "billions"],
  ] as const)("maps %p", (raw, expected) => {
    expect(parseUnit(raw)).toBe(expected)
  })

  test("returns null when not recognized", () => {
    expect(parseUnit("actual")).toBeNull()
  })
})

describe("normalizeToMillions", () => {
  test("millions stays the same", () => {
    expect(normalizeToMillions(1234, "millions")).toBe(1234)
  })

  test("billions multiply by 1000", () => {
    expect(normalizeToMillions(1.5, "billions")).toBe(1500)
  })

  test("thousands divide by 1000", () => {
    expect(normalizeToMillions(500, "thousands")).toBe(0.5)
  })
})

describe("parseAndNormalize", () => {
  test("pipes parse and normalize", () => {
    expect(parseAndNormalize("(1,500)", "billions")).toBe(-1_500_000)
  })

  test("propagates null", () => {
    expect(parseAndNormalize("--", "millions")).toBeNull()
  })
})

describe("isVisualEmpty", () => {
  test.each([
    "",
    "  ",
    "--",
    "—",
    "-",
    "–",
    " — ",
    " ",
  ])("true for visual empty marker %p", (raw) => {
    expect(isVisualEmpty(raw)).toBe(true)
  })

  test.each([
    "NM",
    "N/A",
    "NA",
    "1234",
    "abc",
    "0",
  ])("false for non-visual-empty marker %p", (raw) => {
    expect(isVisualEmpty(raw)).toBe(false)
  })
})
