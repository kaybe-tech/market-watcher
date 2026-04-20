import { and, desc, eq } from "drizzle-orm"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import {
  type TickerStateRow,
  tickerState,
  type ValuationRow,
  valuations,
  type YearlyFinancialsRow,
  yearlyFinancials,
} from "./schema"

export class CompanyRepository {
  private readonly db: BunSQLiteDatabase

  constructor(db: BunSQLiteDatabase) {
    this.db = db
  }

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)
  }

  getTickerState(ticker: string): TickerStateRow | null {
    const [row] = this.db
      .select()
      .from(tickerState)
      .where(eq(tickerState.ticker, ticker))
      .limit(1)
      .all()
    return row ?? null
  }

  insertTickerState(row: TickerStateRow): void {
    this.db.insert(tickerState).values(row).run()
  }

  updateTickerState(ticker: string, patch: Partial<TickerStateRow>): void {
    this.db
      .update(tickerState)
      .set(patch)
      .where(eq(tickerState.ticker, ticker))
      .run()
  }

  getYearlyFinancials(
    ticker: string,
    fiscalYearEnd: string,
  ): YearlyFinancialsRow | null {
    const [row] = this.db
      .select()
      .from(yearlyFinancials)
      .where(
        and(
          eq(yearlyFinancials.ticker, ticker),
          eq(yearlyFinancials.fiscalYearEnd, fiscalYearEnd),
        ),
      )
      .limit(1)
      .all()
    return row ?? null
  }

  insertYearlyFinancials(row: YearlyFinancialsRow): void {
    this.db.insert(yearlyFinancials).values(row).run()
  }

  updateYearlyFinancials(
    ticker: string,
    fiscalYearEnd: string,
    patch: Partial<YearlyFinancialsRow>,
  ): void {
    this.db
      .update(yearlyFinancials)
      .set(patch)
      .where(
        and(
          eq(yearlyFinancials.ticker, ticker),
          eq(yearlyFinancials.fiscalYearEnd, fiscalYearEnd),
        ),
      )
      .run()
  }

  listYearlyFinancialsForTicker(
    ticker: string,
    limit?: number,
  ): YearlyFinancialsRow[] {
    const base = this.db
      .select()
      .from(yearlyFinancials)
      .where(eq(yearlyFinancials.ticker, ticker))
      .orderBy(desc(yearlyFinancials.fiscalYearEnd))
    return limit === undefined ? base.all() : base.limit(limit).all()
  }

  insertValuation(row: Omit<ValuationRow, "id">): ValuationRow {
    const [inserted] = this.db.insert(valuations).values(row).returning().all()
    if (!inserted) {
      throw new Error("insertValuation: no row returned from insert")
    }
    return inserted
  }

  getLatestValuation(ticker: string): ValuationRow | null {
    const [row] = this.db
      .select()
      .from(valuations)
      .where(eq(valuations.ticker, ticker))
      .orderBy(desc(valuations.createdAt), desc(valuations.id))
      .limit(1)
      .all()
    return row ?? null
  }

  listValuationsForTicker(ticker: string): ValuationRow[] {
    return this.db
      .select()
      .from(valuations)
      .where(eq(valuations.ticker, ticker))
      .orderBy(desc(valuations.createdAt), desc(valuations.id))
      .all()
  }
}
