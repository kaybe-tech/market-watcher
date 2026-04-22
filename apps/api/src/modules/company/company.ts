import {
  CompanyValuation,
  type CompanyYearFinancials,
} from "@market-watcher/valuation-engine"
import { mergeOverrides } from "./estimates"
import type { CompanyRepository } from "./repository"
import type {
  TickerStateRow,
  ValuationRow,
  YearlyEstimatesRow,
  YearlyFinancialsRow,
} from "./schema"

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

export type IngestPayload = {
  currentPrice?: number
  years: IncomingYearlyFinancials[]
}

export type IncomingEstimateYear = {
  fiscalYearEnd: string
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  capexMaintenanceSalesRatio?: number
  netDebtEbitdaRatio?: number
}

export type IngestEstimatesPayload = {
  source: string
  years?: IncomingEstimateYear[]
}

const EMPTY_YEARLY_FINANCIALS = Object.fromEntries(
  Object.values(INPUT_FIELDS)
    .flat()
    .map((field) => [field, null]),
) as Omit<YearlyFinancialsRow, "ticker" | "fiscalYearEnd">

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

export type IngestResult = {
  pendingValuation: boolean
}

export type CompanyView = {
  ticker: string
  latestFiscalYearEnd: string | null
  currentPrice: number | null
  valuation: ValuationRow | null
  valuationWithEstimates: ValuationRow | null
  availableEstimateSources: string[]
  pending: boolean
  valuationInProgress: boolean
  missing?: MissingSummary
}

const MIN_CONSECUTIVE_YEARS_FOR_VALUATION = 2

const fiscalYearOf = (fiscalYearEnd: string): number =>
  Number.parseInt(fiscalYearEnd.slice(0, 4), 10)

export class Company {
  private readonly repository: CompanyRepository
  private readonly inProgressTickers: Set<string> = new Set()

  constructor(repository: CompanyRepository) {
    this.repository = repository
  }

  ingestData(ticker: string, payload: IngestPayload): IngestResult {
    return this.repository.runInTransaction(() => {
      const previousState = this.repository.getTickerState(ticker)
      const existingYears = new Map(
        this.repository
          .listYearlyFinancialsForTicker(ticker)
          .map((row) => [row.fiscalYearEnd, row]),
      )

      const maxEffectiveFiscalYearEnd = this.persistYearPatches(
        ticker,
        payload.years,
        existingYears,
      )

      const pendingValuation = this.resolveTickerState(
        ticker,
        previousState,
        maxEffectiveFiscalYearEnd,
        payload.currentPrice,
      )

      return { pendingValuation }
    })
  }

  ingestEstimates(
    ticker: string,
    payload: IngestEstimatesPayload,
  ): IngestResult {
    return this.repository.runInTransaction(() => {
      const previousState = this.repository.getTickerState(ticker)
      const capturedAt = new Date().toISOString()

      const years = payload.years ?? []
      let hasWrites = false
      for (const year of years) {
        this.repository.upsertEstimate({
          ticker,
          fiscalYearEnd: year.fiscalYearEnd,
          source: payload.source,
          capturedAt,
          salesGrowth: year.salesGrowth ?? null,
          ebitMargin: year.ebitMargin ?? null,
          taxRate: year.taxRate ?? null,
          capexMaintenanceSalesRatio: year.capexMaintenanceSalesRatio ?? null,
          netDebtEbitdaRatio: year.netDebtEbitdaRatio ?? null,
        })
        hasWrites = true
      }

      if (!hasWrites) {
        return { pendingValuation: previousState?.pendingValuation ?? false }
      }

      if (previousState === null) {
        this.repository.insertTickerState({
          ticker,
          latestFiscalYearEnd: null,
          pendingValuation: true,
          currentPrice: null,
        })
      } else if (!previousState.pendingValuation) {
        this.repository.updateTickerState(ticker, { pendingValuation: true })
      }

      return { pendingValuation: true }
    })
  }

  hasValuationInProgress(ticker: string): boolean {
    return this.inProgressTickers.has(ticker)
  }

  runOnTheFlyValuationBySource(
    ticker: string,
    source: string,
  ): CompanyValuation | null {
    const state = this.repository.getTickerState(ticker)
    if (!state || state.latestFiscalYearEnd === null) return null
    if (state.currentPrice === null) return null

    const estimateRows = this.repository
      .listEstimatesForTicker(ticker)
      .filter((row) => row.source === source)
    if (estimateRows.length === 0) return null

    const rows = this.repository.listYearlyFinancialsForTicker(ticker)
    const series = this.consolidateConsecutiveYears(
      rows,
      state.latestFiscalYearEnd,
    )
    if (series.length < MIN_CONSECUTIVE_YEARS_FOR_VALUATION) return null

    const financials = this.buildEngineFinancials(series)
    const overrides = mergeOverrides(estimateRows)
    try {
      return new CompanyValuation({
        ticker,
        currentPrice: state.currentPrice,
        financials,
        overrides,
      })
    } catch (err) {
      console.error(
        `on-the-fly valuation for ${ticker} source=${source} failed:`,
        err,
      )
      return null
    }
  }

  async getCompanyView(ticker: string): Promise<CompanyView | null> {
    const initialState = this.repository.getTickerState(ticker)
    if (initialState === null) return null

    let state = initialState
    if (initialState.pendingValuation) {
      await this.valuate(ticker)
      state = this.repository.getTickerState(ticker) ?? initialState
    }

    const view: CompanyView = {
      ticker,
      latestFiscalYearEnd: state.latestFiscalYearEnd,
      currentPrice: state.currentPrice,
      valuation: this.repository.getLatestValuationBySource(ticker, "auto"),
      valuationWithEstimates: this.repository.getLatestValuationBySource(
        ticker,
        "merged_estimates",
      ),
      availableEstimateSources: this.repository.listSourcesForTicker(ticker),
      pending: state.pendingValuation,
      valuationInProgress: this.hasValuationInProgress(ticker),
    }

    if (state.pendingValuation) {
      const rows = this.repository.listYearlyFinancialsForTicker(ticker)
      view.missing = this.consolidateMissing(state, rows)
    }

    return view
  }

  async valuate(ticker: string): Promise<void> {
    if (this.inProgressTickers.has(ticker)) return
    this.inProgressTickers.add(ticker)
    try {
      await Promise.resolve()
      this.runValuation(ticker)
    } finally {
      this.inProgressTickers.delete(ticker)
    }
  }

  private runValuation(ticker: string): void {
    const state = this.repository.getTickerState(ticker)
    if (!state || state.latestFiscalYearEnd === null) return
    if (state.currentPrice === null) return

    const rows = this.repository.listYearlyFinancialsForTicker(ticker)
    const series = this.consolidateConsecutiveYears(
      rows,
      state.latestFiscalYearEnd,
    )
    if (series.length < MIN_CONSECUTIVE_YEARS_FOR_VALUATION) return

    const financials = this.buildEngineFinancials(series)
    const createdAt = new Date().toISOString()
    const autoOk = this.runAutoValuation(
      ticker,
      state.currentPrice,
      state.latestFiscalYearEnd,
      financials,
      createdAt,
    )
    if (!autoOk) return

    const estimateRows = this.repository.listEstimatesForTicker(ticker)
    if (estimateRows.length > 0) {
      this.runMergedEstimatesValuation(
        ticker,
        state.currentPrice,
        state.latestFiscalYearEnd,
        financials,
        estimateRows,
        createdAt,
      )
    }

    this.repository.updateTickerState(ticker, { pendingValuation: false })
  }

  private runAutoValuation(
    ticker: string,
    currentPrice: number,
    fiscalYearEnd: string,
    financials: Record<number, CompanyYearFinancials>,
    createdAt: string,
  ): boolean {
    try {
      const valuation = new CompanyValuation({
        ticker,
        currentPrice,
        financials,
      })
      this.repository.insertValuation({
        ticker,
        fiscalYearEnd,
        result: valuation,
        createdAt,
        source: "auto",
      })
      return true
    } catch (err) {
      console.error(`valuation engine (auto) failed for ${ticker}:`, err)
      return false
    }
  }

  private runMergedEstimatesValuation(
    ticker: string,
    currentPrice: number,
    fiscalYearEnd: string,
    financials: Record<number, CompanyYearFinancials>,
    estimateRows: YearlyEstimatesRow[],
    createdAt: string,
  ): void {
    const overrides = mergeOverrides(estimateRows)
    try {
      const valuation = new CompanyValuation({
        ticker,
        currentPrice,
        financials,
        overrides,
      })
      this.repository.insertValuation({
        ticker,
        fiscalYearEnd,
        result: valuation,
        createdAt,
        source: "merged_estimates",
      })
    } catch (err) {
      console.error(
        `valuation engine (merged_estimates) failed for ${ticker}:`,
        err,
      )
    }
  }

  private buildEngineFinancials(
    series: YearlyFinancialsRow[],
  ): Record<number, CompanyYearFinancials> {
    const groups = ["incomeStatement", "freeCashFlow", "roic"] as const
    const financials: Record<number, CompanyYearFinancials> = {}
    for (const row of series) {
      const year = Number.parseInt(row.fiscalYearEnd.slice(0, 4), 10)
      const yearData = {} as Record<string, Record<string, number>>
      for (const group of groups) {
        const fields = INPUT_FIELDS[group] as ReadonlyArray<
          keyof YearlyFinancialsRow
        >
        const groupData: Record<string, number> = {}
        for (const field of fields) {
          groupData[field as string] = row[field] as number
        }
        yearData[group] = groupData
      }
      financials[year] = yearData as unknown as CompanyYearFinancials
    }
    return financials
  }

  private persistYearPatches(
    ticker: string,
    incomingYears: IncomingYearlyFinancials[],
    existingYears: Map<string, YearlyFinancialsRow>,
  ): string | null {
    let maxEffectiveFiscalYearEnd: string | null = null

    for (const incomingYear of incomingYears) {
      const current = existingYears.get(incomingYear.fiscalYearEnd) ?? null
      const result = this.applyYearlyFinancialsPatch(current, incomingYear)
      if (!result.hasWrites) continue

      if (result.isNewYear) {
        this.repository.insertYearlyFinancials({
          ticker,
          fiscalYearEnd: incomingYear.fiscalYearEnd,
          ...EMPTY_YEARLY_FINANCIALS,
          ...result.patch,
        })
      } else {
        this.repository.updateYearlyFinancials(
          ticker,
          incomingYear.fiscalYearEnd,
          result.patch,
        )
      }

      if (
        maxEffectiveFiscalYearEnd === null ||
        incomingYear.fiscalYearEnd > maxEffectiveFiscalYearEnd
      ) {
        maxEffectiveFiscalYearEnd = incomingYear.fiscalYearEnd
      }
    }

    return maxEffectiveFiscalYearEnd
  }

  private resolveTickerState(
    ticker: string,
    previousState: TickerStateRow | null,
    maxEffectiveFiscalYearEnd: string | null,
    incomingCurrentPrice: number | undefined,
  ): boolean {
    const hasEffectiveYearWrite = maxEffectiveFiscalYearEnd !== null

    if (previousState === null) {
      if (!hasEffectiveYearWrite && incomingCurrentPrice === undefined) {
        return false
      }
      this.repository.insertTickerState({
        ticker,
        latestFiscalYearEnd: maxEffectiveFiscalYearEnd,
        pendingValuation: hasEffectiveYearWrite,
        currentPrice: incomingCurrentPrice ?? null,
      })
      return hasEffectiveYearWrite
    }

    const patch: Partial<TickerStateRow> = {}
    if (
      maxEffectiveFiscalYearEnd !== null &&
      (previousState.latestFiscalYearEnd === null ||
        maxEffectiveFiscalYearEnd > previousState.latestFiscalYearEnd)
    ) {
      patch.latestFiscalYearEnd = maxEffectiveFiscalYearEnd
    }
    if (incomingCurrentPrice !== undefined) {
      patch.currentPrice = incomingCurrentPrice
    }
    if (hasEffectiveYearWrite) {
      patch.pendingValuation = true
    }
    if (Object.keys(patch).length > 0) {
      this.repository.updateTickerState(ticker, patch)
    }

    return hasEffectiveYearWrite || previousState.pendingValuation
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
    latestFiscalYearEnd: string | null,
  ): YearlyFinancialsRow[] {
    if (latestFiscalYearEnd === null) return []

    const sorted = rows
      .filter((row) => row.fiscalYearEnd <= latestFiscalYearEnd)
      .sort((a, b) => b.fiscalYearEnd.localeCompare(a.fiscalYearEnd))

    const series: YearlyFinancialsRow[] = []
    let expectedYear: number | null = null

    for (const row of sorted) {
      if (series.length >= MAX_CONSECUTIVE_YEARS) break
      const year = fiscalYearOf(row.fiscalYearEnd)
      if (expectedYear !== null && year !== expectedYear) break
      if (!this.isYearComplete(row)) break
      series.push(row)
      expectedYear = year - 1
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
