import { describe, expect, it } from "bun:test"
import type { CompanyValuation } from "@market-watcher/valuation-engine"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createDb } from "@/db"
import { CompanyRepository } from "@/modules/company/repository"
import { completeYearRow, tickerStateRow } from "./fixtures/company"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  return new CompanyRepository(db)
}

const yfRow = completeYearRow
const tsRow = (ticker: string, overrides = {}) =>
  tickerStateRow({ ticker, currentPrice: 100, ...overrides })

const sampleValuation = {
  ticker: "AAPL",
  name: "Apple Inc.",
} as unknown as CompanyValuation

describe("CompanyRepository - TickerState", () => {
  it("getTickerState devuelve null para un ticker que no existe", () => {
    const repo = setup()
    expect(repo.getTickerState("AAPL")).toBeNull()
  })

  it("insertTickerState + getTickerState roundtrip", () => {
    const repo = setup()
    const row = tsRow("AAPL")
    repo.insertTickerState(row)
    expect(repo.getTickerState("AAPL")).toEqual(row)
  })

  it("insertTickerState con latestFiscalYearEnd null + getTickerState roundtrip", () => {
    const repo = setup()
    const row = tsRow("AAPL", {
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: 180,
    })
    repo.insertTickerState(row)
    expect(repo.getTickerState("AAPL")).toEqual(row)
  })

  it("updateTickerState con patch parcial actualiza solo los campos presentes", () => {
    const repo = setup()
    repo.insertTickerState(tsRow("AAPL"))

    repo.updateTickerState("AAPL", {
      currentPrice: 250,
      pendingValuation: false,
    })

    const updated = repo.getTickerState("AAPL")
    expect(updated).toEqual({
      ticker: "AAPL",
      latestFiscalYearEnd: "2025-09-27",
      pendingValuation: false,
      currentPrice: 250,
    })
  })
})

describe("CompanyRepository - YearlyFinancials", () => {
  it("getYearlyFinancials devuelve null para (ticker, fiscalYearEnd) inexistente", () => {
    const repo = setup()
    expect(repo.getYearlyFinancials("AAPL", "2025-09-27")).toBeNull()
  })

  it("insertYearlyFinancials + getYearlyFinancials roundtrip", () => {
    const repo = setup()
    const row = yfRow("AAPL", "2025-09-27")
    repo.insertYearlyFinancials(row)
    expect(repo.getYearlyFinancials("AAPL", "2025-09-27")).toEqual(row)
  })

  it("updateYearlyFinancials con patch parcial deja intactos los campos no mencionados", () => {
    const repo = setup()
    repo.insertYearlyFinancials(
      yfRow("AAPL", "2025-09-27", { sales: null, equity: 500 }),
    )

    repo.updateYearlyFinancials("AAPL", "2025-09-27", { sales: 999 })

    const row = repo.getYearlyFinancials("AAPL", "2025-09-27")
    expect(row?.sales).toBe(999)
    expect(row?.equity).toBe(500)
    expect(row?.ebit).toBe(50)
  })

  it("listYearlyFinancialsForTicker sin limit devuelve todos los rows ordenados por fiscal_year_end DESC", () => {
    const repo = setup()
    repo.insertYearlyFinancials(yfRow("AAPL", "2023-09-30"))
    repo.insertYearlyFinancials(yfRow("AAPL", "2025-09-27"))
    repo.insertYearlyFinancials(yfRow("AAPL", "2024-09-28"))
    repo.insertYearlyFinancials(yfRow("MSFT", "2025-06-30"))

    const rows = repo.listYearlyFinancialsForTicker("AAPL")
    expect(rows.map((r) => r.fiscalYearEnd)).toEqual([
      "2025-09-27",
      "2024-09-28",
      "2023-09-30",
    ])
  })

  it("listYearlyFinancialsForTicker con limit=3 respeta el cap", () => {
    const repo = setup()
    const years = [
      "2020-09-27",
      "2021-09-27",
      "2022-09-27",
      "2023-09-27",
      "2024-09-27",
      "2025-09-27",
    ]
    for (const y of years) {
      repo.insertYearlyFinancials(yfRow("AAPL", y))
    }

    const rows = repo.listYearlyFinancialsForTicker("AAPL", 3)
    expect(rows.map((r) => r.fiscalYearEnd)).toEqual([
      "2025-09-27",
      "2024-09-27",
      "2023-09-27",
    ])
  })
})

describe("CompanyRepository - Valuation", () => {
  it("insertValuation devuelve el row con id asignado por la DB", () => {
    const repo = setup()
    const inserted = repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2025-09-27",
      result: sampleValuation,
      createdAt: "2026-04-19T12:00:00.000Z",
      source: "auto",
    })

    expect(inserted.id).toBeGreaterThan(0)
    expect(inserted.ticker).toBe("AAPL")
    expect(inserted.result).toEqual(sampleValuation)
  })

  it("getLatestValuation devuelve null cuando no hay ninguno", () => {
    const repo = setup()
    expect(repo.getLatestValuation("AAPL")).toBeNull()
  })

  it("getLatestValuation con varios rows elige el de createdAt mayor", () => {
    const repo = setup()
    repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-09-28",
      result: sampleValuation,
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "auto",
    })
    repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2025-09-27",
      result: sampleValuation,
      createdAt: "2026-04-01T00:00:00.000Z",
      source: "auto",
    })
    repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2023-09-30",
      result: sampleValuation,
      createdAt: "2026-02-15T00:00:00.000Z",
      source: "auto",
    })

    const latest = repo.getLatestValuation("AAPL")
    expect(latest?.fiscalYearEnd).toBe("2025-09-27")
    expect(latest?.createdAt).toBe("2026-04-01T00:00:00.000Z")
  })

  it("en empate de createdAt, desempata por id mayor", () => {
    const repo = setup()
    const createdAt = "2026-04-19T12:00:00.000Z"
    const first = repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-09-28",
      result: sampleValuation,
      createdAt,
      source: "auto",
    })
    const second = repo.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2025-09-27",
      result: sampleValuation,
      createdAt,
      source: "auto",
    })
    expect(second.id).toBeGreaterThan(first.id)

    const latest = repo.getLatestValuation("AAPL")
    expect(latest?.id).toBe(second.id)
  })
})

describe("CompanyRepository - yearly_estimates", () => {
  it("upsertEstimate crea fila nueva con capturedAt", () => {
    const repo = setup()
    repo.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: 0.62,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    const rows = repo.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.45)
    expect(rows[0]?.ebitMargin).toBe(0.62)
  })

  it("upsertEstimate reemplaza la fila existente (PK ticker+year+source)", () => {
    const repo = setup()
    repo.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: 0.62,
      taxRate: 0.18,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    repo.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-05-01T10:00:00.000Z",
      salesGrowth: 0.5,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: 0.04,
      netDebtEbitdaRatio: null,
    })
    const rows = repo.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      salesGrowth: 0.5,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: 0.04,
      capturedAt: "2026-05-01T10:00:00.000Z",
    })
  })

  it("listSourcesForTicker devuelve sources distintas", () => {
    const repo = setup()
    repo.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    repo.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "manual",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.5,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    const sources = repo.listSourcesForTicker("NVDA")
    expect(new Set(sources)).toEqual(new Set(["tikr", "manual"]))
  })
})

describe("CompanyRepository - valuations por source", () => {
  it("getLatestValuationBySource filtra por source", () => {
    const repo = setup()
    repo.insertValuation({
      ticker: "NVDA",
      fiscalYearEnd: "2026-01-31",
      result: {} as never,
      createdAt: "2026-04-22T10:00:00.000Z",
      source: "auto",
    })
    repo.insertValuation({
      ticker: "NVDA",
      fiscalYearEnd: "2026-01-31",
      result: {} as never,
      createdAt: "2026-04-22T10:00:01.000Z",
      source: "merged_estimates",
    })
    expect(repo.getLatestValuationBySource("NVDA", "auto")?.source).toBe("auto")
    expect(
      repo.getLatestValuationBySource("NVDA", "merged_estimates")?.source,
    ).toBe("merged_estimates")
  })
})
