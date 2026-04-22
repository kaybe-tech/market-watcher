import { describe, expect, it } from "bun:test"
import { isValidEstimateYearsLimit } from "../src/storage/settings"

describe("isValidEstimateYearsLimit", () => {
  it("acepta enteros entre 1 y 10 inclusive", () => {
    expect(isValidEstimateYearsLimit(1)).toBe(true)
    expect(isValidEstimateYearsLimit(3)).toBe(true)
    expect(isValidEstimateYearsLimit(10)).toBe(true)
  })

  it("rechaza 0, negativos y mayores a 10", () => {
    expect(isValidEstimateYearsLimit(0)).toBe(false)
    expect(isValidEstimateYearsLimit(-1)).toBe(false)
    expect(isValidEstimateYearsLimit(11)).toBe(false)
  })

  it("rechaza decimales, NaN e Infinity", () => {
    expect(isValidEstimateYearsLimit(2.5)).toBe(false)
    expect(isValidEstimateYearsLimit(Number.NaN)).toBe(false)
    expect(isValidEstimateYearsLimit(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
