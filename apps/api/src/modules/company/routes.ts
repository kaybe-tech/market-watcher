import { sValidator } from "@hono/standard-validator"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Hono } from "hono"
import { Company } from "./company"
import { CompanyRepository } from "./repository"
import {
  estimatesBodySchema,
  ingestBodySchema,
  tickerParamSchema,
} from "./validators"

export const createCompanyRoutes = (db: BunSQLiteDatabase) => {
  const routes = new Hono()
  const company = new Company(new CompanyRepository(db))

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

  routes.post(
    "/companies/:ticker/estimates",
    sValidator("param", tickerParamSchema),
    sValidator("json", estimatesBodySchema),
    (c) => {
      const { ticker } = c.req.valid("param")
      const body = c.req.valid("json")
      const result = company.ingestEstimates(ticker, body)
      if (result.pendingValuation) {
        void company.valuate(ticker).catch((err) => {
          console.error(`background valuation failed for ${ticker}:`, err)
        })
      }
      return c.json({ success: true })
    },
  )

  routes.get("/companies", (c) => {
    return c.json(company.listCompanies())
  })

  routes.get(
    "/companies/:ticker",
    sValidator("param", tickerParamSchema),
    async (c) => {
      const { ticker } = c.req.valid("param")
      const view = await company.getCompanyView(ticker)
      if (view === null) {
        return c.json({ error: "ticker_not_found", ticker }, 404)
      }
      return c.json(view)
    },
  )

  return routes
}
