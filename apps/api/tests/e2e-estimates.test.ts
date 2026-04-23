import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import { CompanyRepository } from "@/modules/company/repository"
import { amznFixture, toIngestBody } from "./fixtures/engine"
import { waitForBackgroundValuation } from "./fixtures/wait"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setupApp = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  const app = createApp(db)
  const repository = new CompanyRepository(db)
  return { app, repository }
}

// amznFixture latest fiscal year is 2025-12-31.
// Projected years must be AFTER the fixture's latestFiscalYearEnd
// and within the 5-year projection window (2026–2030).
const ESTIMATE_YEAR_1 = "2026-12-31"
const ESTIMATE_YEAR_2 = "2027-12-31"

describe("E2E estimates", () => {
  it("ingesta financials + estimates + GET produce las dos valuations", async () => {
    const { app, repository } = setupApp()

    const ingestRes = await app.request("/companies/AMZN/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toIngestBody(amznFixture)),
    })
    expect(ingestRes.status).toBe(200)
    await waitForBackgroundValuation(repository, "AMZN")

    const estimatesRes = await app.request("/companies/AMZN/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "tikr",
        years: [
          {
            fiscalYearEnd: ESTIMATE_YEAR_1,
            salesGrowth: 0.15,
            ebitMargin: 0.1,
          },
          {
            fiscalYearEnd: ESTIMATE_YEAR_2,
            salesGrowth: 0.12,
            ebitMargin: 0.11,
          },
        ],
      }),
    })
    expect(estimatesRes.status).toBe(200)
    await waitForBackgroundValuation(repository, "AMZN")

    const getRes = await app.request("/companies/AMZN")
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as {
      valuations: Record<
        string,
        { result: { intrinsicValue: { buyPrice: { price: number } } } }
      >
      availableEstimateSources: string[]
    }
    expect(body.valuations.auto).toBeDefined()
    expect(body.valuations.merged_estimates).toBeDefined()
    expect(body.valuations.tikr).toBeDefined()
    expect(body.availableEstimateSources).toEqual(["tikr"])

    const auto = body.valuations.auto
    const merged = body.valuations.merged_estimates
    const tikr = body.valuations.tikr
    if (!auto || !merged || !tikr) throw new Error("expected all valuations")
    expect(auto.result.intrinsicValue.buyPrice.price).not.toBeCloseTo(
      merged.result.intrinsicValue.buyPrice.price,
    )
    expect(merged.result.intrinsicValue.buyPrice.price).toBeCloseTo(
      tikr.result.intrinsicValue.buyPrice.price,
    )
  })
})
