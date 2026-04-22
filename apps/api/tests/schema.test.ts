import { describe, expect, it } from "bun:test"
import type { CompanyValuation } from "@market-watcher/valuation-engine"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createDb } from "@/db"
import {
  tickerState,
  valuations,
  yearlyEstimates,
  yearlyFinancials,
} from "@/modules/company/schema"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  return db
}

describe("yearly_financials", () => {
  it("persiste y recupera todos los campos financieros", () => {
    const db = setup()

    const row = {
      ticker: "AAPL",
      fiscalYearEnd: "2025-09-27",
      sales: 400_000_000_000,
      depreciationAmortization: 12_000_000_000,
      ebit: 120_000_000_000,
      interestExpense: 3_500_000_000,
      interestIncome: 4_000_000_000,
      taxExpense: 16_000_000_000,
      minorityInterests: 0,
      fullyDilutedShares: 15_500_000_000,
      capexMaintenance: 10_000_000_000,
      inventories: 7_000_000_000,
      accountsReceivable: 66_000_000_000,
      accountsPayable: 68_000_000_000,
      unearnedRevenue: 8_000_000_000,
      dividendsPaid: 15_000_000_000,
      cashAndEquivalents: 30_000_000_000,
      marketableSecurities: 50_000_000_000,
      shortTermDebt: 10_000_000_000,
      longTermDebt: 90_000_000_000,
      currentOperatingLeases: 1_500_000_000,
      nonCurrentOperatingLeases: 10_000_000_000,
      equity: 60_000_000_000,
    }
    db.insert(yearlyFinancials).values(row).run()

    const [fetched] = db.select().from(yearlyFinancials).all()
    expect(fetched).toEqual(row)
  })

  it("rechaza filas duplicadas con la misma (ticker, fiscal_year_end)", () => {
    const db = setup()
    const pk = { ticker: "AAPL", fiscalYearEnd: "2025-09-27" }
    db.insert(yearlyFinancials).values(pk).run()

    expect(() => db.insert(yearlyFinancials).values(pk).run()).toThrow()
  })
})

describe("ticker_state", () => {
  it("persiste y recupera todos los campos", () => {
    const db = setup()
    const row = {
      ticker: "AAPL",
      latestFiscalYearEnd: "2025-09-27",
      pendingValuation: true,
      currentPrice: 180.5,
    }
    db.insert(tickerState).values(row).run()

    const [fetched] = db.select().from(tickerState).all()
    expect(fetched).toEqual(row)
  })

  it("rechaza filas duplicadas con el mismo ticker", () => {
    const db = setup()
    const row = {
      ticker: "AAPL",
      latestFiscalYearEnd: "2025-09-27",
      pendingValuation: true,
      currentPrice: 180.5,
    }
    db.insert(tickerState).values(row).run()

    expect(() =>
      db
        .insert(tickerState)
        .values({ ...row, latestFiscalYearEnd: "2026-09-27" })
        .run(),
    ).toThrow()
  })

  it("acepta current_price nulo", () => {
    const db = setup()
    db.insert(tickerState)
      .values({
        ticker: "AAPL",
        latestFiscalYearEnd: "2025-09-27",
        pendingValuation: true,
        currentPrice: null,
      })
      .run()

    const [fetched] = db.select().from(tickerState).all()
    expect(fetched?.currentPrice).toBeNull()
  })

  it("acepta latest_fiscal_year_end nulo", () => {
    const db = setup()
    db.insert(tickerState)
      .values({
        ticker: "AAPL",
        latestFiscalYearEnd: null,
        pendingValuation: false,
        currentPrice: 150,
      })
      .run()

    const [fetched] = db.select().from(tickerState).all()
    expect(fetched?.latestFiscalYearEnd).toBeNull()
    expect(fetched?.currentPrice).toBe(150)
  })
})

describe("valuations", () => {
  it("persiste y recupera el campo result como JSON tipado", () => {
    const db = setup()

    const result = {
      ticker: "AAPL",
      name: "Apple Inc.",
      currentPrice: 180.5,
      intrinsicValue: { buyPrice: 150, targetPrice: 200 },
    } as unknown as CompanyValuation

    const inserted = db
      .insert(valuations)
      .values({
        ticker: "AAPL",
        fiscalYearEnd: "2025-09-27",
        result,
        createdAt: "2026-04-19T12:00:00.000Z",
      })
      .returning()
      .all()

    expect(inserted[0]?.id).toBeGreaterThan(0)

    const [fetched] = db.select().from(valuations).all()
    expect(fetched?.ticker).toBe("AAPL")
    expect(fetched?.fiscalYearEnd).toBe("2025-09-27")
    expect(fetched?.createdAt).toBe("2026-04-19T12:00:00.000Z")
    expect(fetched?.result).toEqual(result)
  })
})

describe("yearly_estimates schema", () => {
  it("permite upsert con clave (ticker, fiscalYearEnd, source)", () => {
    const db = createDb(":memory:")
    migrate(db, { migrationsFolder })
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } }).$client

    sqlite.exec(
      `INSERT INTO yearly_estimates (ticker, fiscal_year_end, source, captured_at, sales_growth, ebit_margin, tax_rate, capex_maintenance_sales_ratio, net_debt_ebitda_ratio)
       VALUES ('NVDA', '2027-01-31', 'tikr', '2026-04-22T10:00:00.000Z', 0.45, 0.62, 0.18, 0.04, -0.5)`,
    )

    const rows = sqlite.query("SELECT * FROM yearly_estimates").all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ticker: "NVDA",
      fiscal_year_end: "2027-01-31",
      source: "tikr",
      sales_growth: 0.45,
      ebit_margin: 0.62,
      tax_rate: 0.18,
      capex_maintenance_sales_ratio: 0.04,
      net_debt_ebitda_ratio: -0.5,
    })
  })

  it("valuations tiene columna source con default 'auto'", () => {
    const db = createDb(":memory:")
    migrate(db, { migrationsFolder })
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } }).$client

    sqlite.exec(
      `INSERT INTO valuations (ticker, fiscal_year_end, result, created_at)
       VALUES ('NVDA', '2026-01-31', '{}', '2026-04-22T10:00:00.000Z')`,
    )

    const rows = sqlite.query("SELECT source FROM valuations").all() as Array<{ source: string }>
    expect(rows[0]?.source).toBe("auto")
  })
})
