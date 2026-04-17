import { HistoricalYear } from "../../src/historical-year"

export const TOLERANCE = 1e-4

export function isClose(actual: unknown, expected: unknown): boolean {
  if (actual === null && expected === null) return true
  if (actual === null || expected === null) return false
  if (typeof actual !== "number" || typeof expected !== "number") return false
  if (actual === 0 && expected === 0) return true
  const denom = Math.max(Math.abs(actual), Math.abs(expected))
  if (denom === 0) return true
  return Math.abs(actual - expected) / denom <= TOLERANCE
}

export interface FixtureInputs {
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

export function buildHistoricalYears(inputs: FixtureInputs): {
  years: number[]
  built: Record<number, HistoricalYear>
} {
  const years = Object.keys(inputs.financials)
    .map((y) => Number.parseInt(y, 10))
    .sort((a, b) => a - b)
  const lastYear = years[years.length - 1]

  const built: Record<number, HistoricalYear> = {}
  let prev: HistoricalYear | null = null
  for (const year of years) {
    const yearData = inputs.financials[String(year)]
    if (!yearData) throw new Error(`missing year ${year}`)
    const isLast = year === lastYear
    const hy: HistoricalYear = new HistoricalYear({
      year,
      currentPrice: isLast ? inputs.currentPrice : null,
      incomeStatement: yearData.incomeStatement,
      freeCashFlow: yearData.freeCashFlow,
      roic: yearData.roic,
      prev,
    })
    built[year] = hy
    prev = hy
  }

  return { years, built }
}
