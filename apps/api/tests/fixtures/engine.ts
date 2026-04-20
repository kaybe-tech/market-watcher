import type { CompanyValuationInputs } from "@market-watcher/valuation-engine"
import {
  expected as amznExpected,
  inputs as amznInputs,
} from "@market-watcher/valuation-engine/tests/fixtures/amzn"
import {
  expected as costExpected,
  inputs as costInputs,
} from "@market-watcher/valuation-engine/tests/fixtures/cost"
import {
  expected as nkeExpected,
  inputs as nkeInputs,
} from "@market-watcher/valuation-engine/tests/fixtures/nke"
import {
  expected as nvdaExpected,
  inputs as nvdaInputs,
} from "@market-watcher/valuation-engine/tests/fixtures/nvda"

export type EngineFixture = {
  inputs: CompanyValuationInputs
  expected: unknown
}

export const amznFixture: EngineFixture = {
  inputs: amznInputs,
  expected: amznExpected,
}
export const costFixture: EngineFixture = {
  inputs: costInputs,
  expected: costExpected,
}
export const nkeFixture: EngineFixture = {
  inputs: nkeInputs,
  expected: nkeExpected,
}
export const nvdaFixture: EngineFixture = {
  inputs: nvdaInputs,
  expected: nvdaExpected,
}

export const allFixtures: EngineFixture[] = [
  amznFixture,
  costFixture,
  nkeFixture,
  nvdaFixture,
]

export type IngestYearBody = {
  fiscalYearEnd: string
  incomeStatement: Record<string, number>
  freeCashFlow: Record<string, number>
  roic: Record<string, number>
}

export type IngestBody = {
  currentPrice?: number
  years: IngestYearBody[]
}

export type ToIngestBodyOptions = {
  includeCurrentPrice?: boolean
}

const yearToFiscalYearEnd = (year: number): string => `${year}-12-31`

export const toIngestBody = (
  fixture: EngineFixture,
  { includeCurrentPrice = true }: ToIngestBodyOptions = {},
): IngestBody => {
  const { financials, currentPrice } = fixture.inputs
  const years: IngestYearBody[] = Object.keys(financials)
    .map((y) => Number.parseInt(y, 10))
    .sort((a, b) => a - b)
    .map((year) => {
      const data = financials[year]
      if (!data) throw new Error(`missing financials for year ${year}`)
      return {
        fiscalYearEnd: yearToFiscalYearEnd(year),
        incomeStatement: { ...data.incomeStatement },
        freeCashFlow: { ...data.freeCashFlow },
        roic: { ...data.roic },
      }
    })
  return includeCurrentPrice ? { currentPrice, years } : { years }
}

export const splitFixtureByYear = (fixture: EngineFixture): IngestBody[] => {
  const full = toIngestBody(fixture, { includeCurrentPrice: false })
  return full.years.map((year) => ({ years: [year] }))
}
