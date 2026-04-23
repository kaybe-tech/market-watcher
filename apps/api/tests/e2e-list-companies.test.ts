import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import type { CompanyListItem } from "@/modules/company/company"
import { CompanyRepository } from "@/modules/company/repository"
import {
  amznFixture,
  costFixture,
  type IngestBody,
  toIngestBody,
} from "./fixtures/engine"
import { buildIngestBody, incompleteYear } from "./fixtures/synthetic"
import { waitForBackgroundValuation } from "./fixtures/wait"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  const app = createApp(db)
  const repository = new CompanyRepository(db)
  return { app, repository }
}

type AppInstance = ReturnType<typeof createApp>

const postIngest = (app: AppInstance, ticker: string, body: IngestBody) =>
  app.request(`/companies/${ticker}/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const listCompanies = async (app: AppInstance): Promise<CompanyListItem[]> => {
  const res = await app.request("/companies")
  expect(res.status).toBe(200)
  return (await res.json()) as CompanyListItem[]
}

describe("GET /companies — listado para dashboard", () => {
  it("sin datos → arreglo vacío", async () => {
    const { app } = setup()
    expect(await listCompanies(app)).toEqual([])
  })

  it("ticker valuado → summary completo con buyPrice/MoS/CAGR derivados", async () => {
    const { app, repository } = setup()
    await postIngest(app, "AMZN", toIngestBody(amznFixture))
    await waitForBackgroundValuation(repository, "AMZN")

    const items = await listCompanies(app)
    expect(items).toHaveLength(1)
    const amzn = items[0]
    expect(amzn?.ticker).toBe("AMZN")
    expect(amzn?.pending).toBe(false)
    expect(amzn?.valuationInProgress).toBe(false)
    expect(amzn?.currentPrice).toBe(amznFixture.inputs.currentPrice)
    expect(amzn?.lastValuatedAt).not.toBeNull()
    expect(amzn?.summary.buyPrice).not.toBeNull()
    expect(amzn?.summary.targetPrice1y).not.toBeNull()
    expect(amzn?.summary.mos1y).not.toBeNull()
    expect(amzn?.summary.cagr3y).not.toBeNull()
    expect(amzn?.summary.cagr5y).not.toBeNull()
    expect(amzn?.summary.buyPriceDiff).not.toBeNull()
  })

  it("ticker pending → summary nulo, pending=true", async () => {
    const { app } = setup()
    const body = buildIngestBody([
      incompleteYear("2024-12-31", { incomeStatement: ["sales"] }),
    ])
    await postIngest(app, "AAPL", body)

    const items = await listCompanies(app)
    expect(items).toHaveLength(1)
    expect(items[0]?.ticker).toBe("AAPL")
    expect(items[0]?.pending).toBe(true)
    expect(items[0]?.summary).toEqual({
      buyPrice: null,
      buyPriceDiff: null,
      targetPrice1y: null,
      mos1y: null,
      cagr3y: null,
      cagr5y: null,
    })
  })

  it("orden por mos1y desc — pending al final", async () => {
    const { app, repository } = setup()
    await postIngest(app, "AMZN", toIngestBody(amznFixture))
    await postIngest(app, "COST", toIngestBody(costFixture))
    await waitForBackgroundValuation(repository, "AMZN")
    await waitForBackgroundValuation(repository, "COST")

    const pendingBody = buildIngestBody([
      incompleteYear("2024-12-31", { roic: ["equity"] }),
    ])
    await postIngest(app, "AAPL", pendingBody)

    const items = await listCompanies(app)
    expect(items).toHaveLength(3)
    expect(items.at(-1)?.ticker).toBe("AAPL")
    expect(items.at(-1)?.summary.mos1y).toBeNull()

    const valuated = items.slice(0, 2)
    const mos = valuated.map((i) => i.summary.mos1y as number)
    expect(mos[0]).toBeGreaterThanOrEqual(mos[1] ?? Number.NEGATIVE_INFINITY)
  })
})
