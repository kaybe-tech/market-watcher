import type { CompanyRepository } from "./repository"
import type { TickerStateRow, YearlyFinancialsRow } from "./schema"

const INPUT_FIELDS = {
  incomeStatement: [
    "sales",
    "depreciationAmortization",
    "ebit",
    "interestExpense",
    "interestIncome",
    "taxExpense",
    "minorityInterests",
    "fullyDilutedShares",
  ],
  freeCashFlow: [
    "capexMaintenance",
    "inventories",
    "accountsReceivable",
    "accountsPayable",
    "unearnedRevenue",
    "dividendsPaid",
  ],
  roic: [
    "cashAndEquivalents",
    "marketableSecurities",
    "shortTermDebt",
    "longTermDebt",
    "currentOperatingLeases",
    "nonCurrentOperatingLeases",
    "equity",
  ],
} as const satisfies Record<string, ReadonlyArray<keyof YearlyFinancialsRow>>

const MAX_CONSECUTIVE_YEARS = 10

type IncomeStatementField = (typeof INPUT_FIELDS.incomeStatement)[number]
type FreeCashFlowField = (typeof INPUT_FIELDS.freeCashFlow)[number]
type RoicField = (typeof INPUT_FIELDS.roic)[number]

export type IncomingYearlyFinancials = {
  fiscalYearEnd: string
  incomeStatement?: Partial<Record<IncomeStatementField, number>>
  freeCashFlow?: Partial<Record<FreeCashFlowField, number>>
  roic?: Partial<Record<RoicField, number>>
}

export type MissingYearGroups = {
  incomeStatement?: string[]
  freeCashFlow?: string[]
  roic?: string[]
}

export type MissingYearEntry = MissingYearGroups & { fiscalYearEnd: string }

export type MissingSummary = {
  ticker?: string[]
  years?: MissingYearEntry[]
}

export type ApplyPatchResult = {
  patch: Partial<YearlyFinancialsRow>
  hasWrites: boolean
  isNewYear: boolean
}

const previousFiscalYearEnd = (fiscalYearEnd: string): string => {
  const year = Number.parseInt(fiscalYearEnd.slice(0, 4), 10)
  return `${year - 1}${fiscalYearEnd.slice(4)}`
}

export class Company {
  private readonly repository: CompanyRepository

  constructor(repository: CompanyRepository) {
    this.repository = repository
  }

  applyYearlyFinancialsPatch(
    current: YearlyFinancialsRow | null,
    incoming: IncomingYearlyFinancials,
  ): ApplyPatchResult {
    const isNewYear = current === null
    const patch: Partial<YearlyFinancialsRow> = {}

    for (const group of ["incomeStatement", "freeCashFlow", "roic"] as const) {
      const sent = incoming[group]
      if (!sent) continue
      const fields = INPUT_FIELDS[group] as ReadonlyArray<
        keyof YearlyFinancialsRow
      >
      for (const field of fields) {
        const value = (sent as Partial<Record<string, number>>)[field]
        if (value === undefined) continue
        if (current === null || current[field] === null) {
          ;(patch as Record<string, number>)[field] = value
        }
      }
    }

    return {
      patch,
      hasWrites: Object.keys(patch).length > 0,
      isNewYear,
    }
  }

  consolidateConsecutiveYears(
    rows: YearlyFinancialsRow[],
    latestFiscalYearEnd: string,
  ): YearlyFinancialsRow[] {
    const byFiscalYearEnd = new Map<string, YearlyFinancialsRow>()
    for (const row of rows) {
      byFiscalYearEnd.set(row.fiscalYearEnd, row)
    }

    const series: YearlyFinancialsRow[] = []
    let cursor = latestFiscalYearEnd

    while (series.length < MAX_CONSECUTIVE_YEARS) {
      const row = byFiscalYearEnd.get(cursor)
      if (!row || !this.isYearComplete(row)) break
      series.push(row)
      cursor = previousFiscalYearEnd(cursor)
    }

    return series
  }

  isYearComplete(row: YearlyFinancialsRow): boolean {
    for (const group of ["incomeStatement", "freeCashFlow", "roic"] as const) {
      for (const field of INPUT_FIELDS[group]) {
        if (row[field] === null) return false
      }
    }
    return true
  }

  missingFieldsOfYear(row: YearlyFinancialsRow): MissingYearGroups {
    const result: MissingYearGroups = {}
    for (const group of ["incomeStatement", "freeCashFlow", "roic"] as const) {
      const missing: string[] = []
      for (const field of INPUT_FIELDS[group]) {
        if (row[field] === null) missing.push(field)
      }
      if (missing.length > 0) result[group] = missing
    }
    return result
  }

  missingTickerFields(state: TickerStateRow): string[] {
    const missing: string[] = []
    if (state.currentPrice === null) missing.push("currentPrice")
    return missing
  }

  consolidateMissing(
    state: TickerStateRow,
    rows: YearlyFinancialsRow[],
  ): MissingSummary {
    const summary: MissingSummary = {}

    const tickerMissing = this.missingTickerFields(state)
    if (tickerMissing.length > 0) summary.ticker = tickerMissing

    const years: MissingYearEntry[] = []
    for (const row of rows) {
      if (this.isYearComplete(row)) continue
      years.push({
        fiscalYearEnd: row.fiscalYearEnd,
        ...this.missingFieldsOfYear(row),
      })
    }
    if (years.length > 0) summary.years = years

    return summary
  }
}
