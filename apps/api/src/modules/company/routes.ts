import { sValidator } from "@hono/standard-validator"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Hono } from "hono"
import { Company } from "./company"
import { CompanyRepository } from "./repository"
import { ingestBodySchema, tickerParamSchema } from "./validators"

export const createCompanyRoutes = (db: BunSQLiteDatabase) => {
  const routes = new Hono()
  const repository = new CompanyRepository(db)
  const company = new Company(repository)

  routes.post(
    "/companies/:ticker/data",
    sValidator("param", tickerParamSchema),
    sValidator("json", ingestBodySchema),
    (c) => {
      const { ticker } = c.req.valid("param")
      const body = c.req.valid("json")
      const result = company.ingestData(ticker, body)
      if (result.pendingValuation) {
        void company.valuate(ticker).catch((err) => {
          console.error(`background valuation failed for ${ticker}:`, err)
        })
      }
      return c.json({ success: true })
    },
  )

  routes.get(
    "/companies/:ticker",
    sValidator("param", tickerParamSchema),
    async (c) => {
      const { ticker } = c.req.valid("param")
      const initialState = repository.getTickerState(ticker)
      if (initialState === null) {
        return c.json({ error: "ticker_not_found", ticker }, 404)
      }

      if (initialState.pendingValuation) {
        await company.valuate(ticker)
      }

      const state = repository.getTickerState(ticker)
      if (state === null) {
        return c.json({ error: "ticker_not_found", ticker }, 404)
      }

      const latest = repository.getLatestValuation(ticker)
      const body: {
        ticker: string
        latestFiscalYearEnd: string | null
        currentPrice: number | null
        valuation: {
          id: number
          ticker: string
          fiscalYearEnd: string
          createdAt: string
          result: unknown
        } | null
        pending: boolean
        valuationInProgress: boolean
        missing?: ReturnType<Company["consolidateMissing"]>
      } = {
        ticker,
        latestFiscalYearEnd: state.latestFiscalYearEnd,
        currentPrice: state.currentPrice,
        valuation: latest
          ? {
              id: latest.id,
              ticker: latest.ticker,
              fiscalYearEnd: latest.fiscalYearEnd,
              createdAt: latest.createdAt,
              result: latest.result,
            }
          : null,
        pending: state.pendingValuation,
        valuationInProgress: company.hasValuationInProgress(ticker),
      }

      if (state.pendingValuation) {
        const rows = repository.listYearlyFinancialsForTicker(ticker)
        body.missing = company.consolidateMissing(state, rows)
      }

      return c.json(body)
    },
  )

  return routes
}
