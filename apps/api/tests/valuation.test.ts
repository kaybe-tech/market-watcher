import { describe, expect, it, mock } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createDb } from "@/db"
import { Company } from "@/modules/company/company"
import { CompanyRepository } from "@/modules/company/repository"
import { completeYearRow } from "./fixtures/company"
import { amznFixture, toIngestBody } from "./fixtures/engine"
import { completeYear } from "./fixtures/synthetic"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  const repository = new CompanyRepository(db)
  return { company: new Company(repository), repository }
}

const ingestAmzn = (company: Company) =>
  company.ingestData("AMZN", toIngestBody(amznFixture))

describe("Company.valuate — registro in-memory", () => {
  it("hasValuationInProgress es true mientras corre y false al terminar", async () => {
    const { company } = setup()
    ingestAmzn(company)

    const promise = company.valuate("AMZN")
    expect(company.hasValuationInProgress("AMZN")).toBe(true)
    await promise
    expect(company.hasValuationInProgress("AMZN")).toBe(false)
  })

  it("invocaciones concurrentes producen una sola fila en valuations", async () => {
    const { company, repository } = setup()
    ingestAmzn(company)

    await Promise.all([
      company.valuate("AMZN"),
      company.valuate("AMZN"),
      company.valuate("AMZN"),
    ])

    expect(repository.listValuationsForTicker("AMZN")).toHaveLength(1)
    expect(repository.getTickerState("AMZN")?.pendingValuation).toBe(false)
    expect(company.hasValuationInProgress("AMZN")).toBe(false)
  })
})

describe("Company.valuate — datos suficientes", () => {
  it("2 años consecutivos + currentPrice → persiste valoración y deja pending=false", async () => {
    const { company, repository } = setup()
    const body = toIngestBody(amznFixture)
    const reducedYears = body.years.slice(-2)
    company.ingestData("AMZN", {
      currentPrice: body.currentPrice,
      years: reducedYears,
    })

    await company.valuate("AMZN")

    const latest = repository.getLatestValuation("AMZN")
    if (!latest) throw new Error("expected valuation row")
    expect(latest.fiscalYearEnd).toBe("2025-12-31")
    expect(typeof latest.createdAt).toBe("string")
    expect(new Date(latest.createdAt).toISOString()).toBe(latest.createdAt)
    expect(repository.getTickerState("AMZN")?.pendingValuation).toBe(false)
  })

  it("10 años completos → el engine recibe exactamente los 10 años del fixture", async () => {
    const { company, repository } = setup()
    ingestAmzn(company)

    await company.valuate("AMZN")

    const latest = repository.getLatestValuation("AMZN")
    expect(latest).not.toBeNull()
    const result = latest?.result as { historical: Record<string, unknown> }
    const years = Object.keys(result.historical)
      .map(Number)
      .sort((a, b) => a - b)
    expect(years).toEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025,
    ])
  })

  it("valoraciones sucesivas acumulan filas sin borrar las previas", async () => {
    const { company, repository } = setup()
    ingestAmzn(company)
    await company.valuate("AMZN")
    const first = repository.getLatestValuation("AMZN")
    expect(first).not.toBeNull()

    repository.updateTickerState("AMZN", { pendingValuation: true })
    await new Promise((r) => setTimeout(r, 5))
    await company.valuate("AMZN")

    const all = repository.listValuationsForTicker("AMZN")
    expect(all).toHaveLength(2)
    const ids = all.map((v) => v.id).sort((a, b) => a - b)
    expect(ids[1]).toBeGreaterThan(ids[0] as number)
    expect(repository.getTickerState("AMZN")?.pendingValuation).toBe(false)
  })
})

describe("Company.valuate — datos insuficientes", () => {
  it("serie consecutiva de 1 → no persiste valoración; pending queda true", async () => {
    const { company, repository } = setup()
    company.ingestData("AAPL", {
      currentPrice: 180,
      years: [completeYear("2024-12-31")],
    })

    await company.valuate("AAPL")

    expect(repository.listValuationsForTicker("AAPL")).toHaveLength(0)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
  })

  it("currentPrice null → no persiste valoración; pending queda true", async () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: null,
    })
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2023-12-31"))
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))

    await company.valuate("AAPL")

    expect(repository.listValuationsForTicker("AAPL")).toHaveLength(0)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
  })

  it("gap en el historial → serie consecutiva < 2, sin valoración; pending queda true", async () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: 180,
    })
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2022-12-31"))

    await company.valuate("AAPL")

    expect(repository.listValuationsForTicker("AAPL")).toHaveLength(0)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
  })
})

describe("Company.valuate con estimates", () => {
  const setupWithCompleteFinancials = (ticker: string) => {
    const { company, repository } = setup()
    company.ingestData(ticker, toIngestBody(amznFixture))
    return { company, repository }
  }

  it("genera dos valuations (auto y merged_estimates) cuando hay estimates", async () => {
    const { company, repository } = setupWithCompleteFinancials("AMZN")
    company.ingestEstimates("AMZN", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2026-12-31", salesGrowth: 0.15, ebitMargin: 0.1 },
      ],
    })
    await company.valuate("AMZN")
    const all = repository.listValuationsForTicker("AMZN")
    const sources = new Set(all.map((v) => v.source))
    expect(sources).toEqual(new Set(["auto", "merged_estimates"]))
  })

  it("solo genera auto si no hay estimates", async () => {
    const { company, repository } = setupWithCompleteFinancials("AMZN")
    await company.valuate("AMZN")
    const all = repository.listValuationsForTicker("AMZN")
    expect(all.map((v) => v.source)).toEqual(["auto"])
  })

  it("pendingValuation=false después de correr (auto exitoso)", async () => {
    const { company, repository } = setupWithCompleteFinancials("AMZN")
    company.ingestEstimates("AMZN", {
      source: "tikr",
      years: [{ fiscalYearEnd: "2026-12-31", salesGrowth: 0.3 }],
    })
    await company.valuate("AMZN")
    expect(repository.getTickerState("AMZN")?.pendingValuation).toBe(false)
  })
})

describe("Company.valuate — fallo del engine", () => {
  it("engine que lanza → no persiste valoración; pending queda true; error registrado", async () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: 0,
    })
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2023-12-31"))
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))

    const errorSpy = mock(() => {})
    const originalError = console.error
    console.error = errorSpy as unknown as typeof console.error
    try {
      await company.valuate("AAPL")
    } finally {
      console.error = originalError
    }

    expect(repository.listValuationsForTicker("AAPL")).toHaveLength(0)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
    expect(errorSpy).toHaveBeenCalled()
  })
})
