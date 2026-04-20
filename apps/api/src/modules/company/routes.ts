import { sValidator } from "@hono/standard-validator"
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import { Hono } from "hono"
import { Company } from "./company"
import { CompanyRepository } from "./repository"
import { ingestBodySchema, tickerParamSchema } from "./validators"

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

  return routes
}
