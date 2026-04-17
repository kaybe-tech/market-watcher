import { describe, expect, test } from "bun:test"
import { HistoricalYear } from "../src/historical-year"
import * as amzn from "./fixtures/amzn"
import * as cost from "./fixtures/cost"
import * as nke from "./fixtures/nke"
import * as nvda from "./fixtures/nvda"

const TOLERANCE = 1e-4

function isClose(actual: unknown, expected: unknown): boolean {
  if (actual === null && expected === null) return true
  if (actual === null || expected === null) return false
  if (typeof actual !== "number" || typeof expected !== "number") return false
  if (actual === 0 && expected === 0) return true
  const denom = Math.max(Math.abs(actual), Math.abs(expected))
  if (denom === 0) return true
  return Math.abs(actual - expected) / denom <= TOLERANCE
}

type FixtureModule = {
  inputs: {
    ticker: string
    sector: string
    currentPrice: number
    financials: Record<
      string,
      {
        incomeStatement: ConstructorParameters<
          typeof HistoricalYear
        >[0]["incomeStatement"]
        freeCashFlow: ConstructorParameters<
          typeof HistoricalYear
        >[0]["freeCashFlow"]
        roic: ConstructorParameters<typeof HistoricalYear>[0]["roic"]
      }
    >
  }
  expected: {
    historical: Record<string, Record<string, Record<string, unknown>>>
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const years = Object.keys(mod.inputs.financials)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
    const lastYear = years[years.length - 1]

    const built: Record<number, HistoricalYear> = {}
    let prev: HistoricalYear | null = null
    for (const year of years) {
      const yearData = mod.inputs.financials[String(year)]
      if (!yearData) throw new Error(`missing year ${year}`)
      const isLast = year === lastYear
      const hy: HistoricalYear = new HistoricalYear({
        year,
        currentPrice: isLast ? mod.inputs.currentPrice : null,
        incomeStatement: yearData.incomeStatement,
        freeCashFlow: yearData.freeCashFlow,
        roic: yearData.roic,
        prev,
      })
      built[year] = hy
      prev = hy
    }

    for (const year of years) {
      test(`${year}`, () => {
        const hy = built[year]
        if (!hy) throw new Error(`missing built year ${year}`)
        const exp = mod.expected.historical[String(year)]
        if (!exp) throw new Error(`missing expected for ${year}`)
        const subObjects = [
          "incomeStatement",
          "freeCashFlow",
          "roic",
          "valuation",
        ] as const
        for (const sub of subObjects) {
          const expectedSub = exp[sub]
          if (!expectedSub)
            throw new Error(`missing expected sub ${sub} for ${year}`)
          const actualSub = hy[sub] as unknown as Record<string, unknown>
          for (const key of Object.keys(expectedSub)) {
            const a = actualSub[key]
            const e = expectedSub[key]
            const ok = isClose(a, e)
            expect(
              ok,
              `${name} ${year} ${sub}.${key} -> got ${String(a)}, want ${String(e)}`,
            ).toBe(true)
          }
        }
      })
    }
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
