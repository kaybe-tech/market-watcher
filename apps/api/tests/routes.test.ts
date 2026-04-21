import { describe, expect, it } from "bun:test"
import type { CompanyValuation } from "@market-watcher/valuation-engine"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import { CompanyRepository } from "@/modules/company/repository"
import { completeYearRow, fullYearPayload } from "./fixtures/company"
import { amznFixture, toIngestBody } from "./fixtures/engine"
import { waitForBackgroundValuation } from "./fixtures/wait"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  const app = createApp(db)
  const repository = new CompanyRepository(db)
  return { app, repository, db }
}

const seedTickerState = (
  repository: CompanyRepository,
  overrides: Partial<{
    latestFiscalYearEnd: string | null
    pendingValuation: boolean
    currentPrice: number | null
  }> = {},
) =>
  repository.insertTickerState({
    ticker: "AAPL",
    latestFiscalYearEnd: "2024-12-31",
    pendingValuation: false,
    currentPrice: 100,
    ...overrides,
  })

type AppInstance = ReturnType<typeof createApp>

const postIngest = (app: AppInstance, ticker: string, body: unknown) =>
  app.request(`/companies/${ticker}/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /companies/:ticker/data - éxito con escrituras", () => {
  it("ticker nuevo + body completo → crea TickerState y yearly_financials", async () => {
    const { app, repository } = setup()

    const res = await postIngest(app, "AAPL", {
      currentPrice: 180.5,
      years: [fullYearPayload("2024-12-31")],
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(repository.getTickerState("AAPL")).toEqual({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: 180.5,
    })

    const year = repository.getYearlyFinancials("AAPL", "2024-12-31")
    expect(year?.sales).toBe(100)
    expect(year?.equity).toBe(200)
    expect(year?.dividendsPaid).toBe(10)
  })

  it("ticker existente + año nuevo posterior → actualiza latestFiscalYearEnd y marca pendiente", async () => {
    const { app, repository } = setup()
    seedTickerState(repository, { latestFiscalYearEnd: "2023-12-31" })

    const res = await postIngest(app, "AAPL", {
      years: [fullYearPayload("2024-12-31")],
    })

    expect(res.status).toBe(200)
    const state = repository.getTickerState("AAPL")
    expect(state?.latestFiscalYearEnd).toBe("2024-12-31")
    expect(state?.pendingValuation).toBe(true)
    expect(state?.currentPrice).toBe(100)
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")).not.toBeNull()
  })

  it("ticker existente + año existente con campos null → pobla solo esos campos", async () => {
    const { app, repository } = setup()
    seedTickerState(repository)
    repository.insertYearlyFinancials(
      completeYearRow("AAPL", "2024-12-31", { sales: null, ebit: null }),
    )

    const res = await postIngest(app, "AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 999, ebit: 888 },
        },
      ],
    })

    expect(res.status).toBe(200)
    const year = repository.getYearlyFinancials("AAPL", "2024-12-31")
    expect(year?.sales).toBe(999)
    expect(year?.ebit).toBe(888)
    expect(year?.depreciationAmortization).toBe(10)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
  })

  it("campo ya poblado con valor distinto entrante → no se altera ni marca pendiente", async () => {
    const { app, repository } = setup()
    seedTickerState(repository)
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))

    const res = await postIngest(app, "AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 999 },
        },
      ],
    })

    expect(res.status).toBe(200)
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")?.sales).toBe(
      100,
    )
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(false)
  })
})

describe("POST /companies/:ticker/data - éxito sin escrituras", () => {
  it("solo currentPrice distinto al previo (ticker preexistente) → actualiza price sin marcar pendiente", async () => {
    const { app, repository } = setup()
    seedTickerState(repository)

    const res = await postIngest(app, "AAPL", {
      currentPrice: 200,
      years: [],
    })

    expect(res.status).toBe(200)
    const state = repository.getTickerState("AAPL")
    expect(state?.currentPrice).toBe(200)
    expect(state?.pendingValuation).toBe(false)
  })

  it("years: [] sobre ticker existente → sin cambios", async () => {
    const { app, repository } = setup()
    seedTickerState(repository)

    const res = await postIngest(app, "AAPL", { years: [] })

    expect(res.status).toBe(200)
    expect(repository.listYearlyFinancialsForTicker("AAPL")).toEqual([])
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(false)
  })

  it("año sin sub-objetos efectivos → sin escrituras en yearly_financials", async () => {
    const { app, repository } = setup()
    seedTickerState(repository, { latestFiscalYearEnd: "2023-12-31" })

    const res = await postIngest(app, "AAPL", {
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })

    expect(res.status).toBe(200)
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")).toBeNull()
    const state = repository.getTickerState("AAPL")
    expect(state?.latestFiscalYearEnd).toBe("2023-12-31")
    expect(state?.pendingValuation).toBe(false)
  })

  it("ticker nuevo + solo currentPrice + years vacío → crea TickerState con latestFiscalYearEnd null", async () => {
    const { app, repository } = setup()

    const res = await postIngest(app, "AAPL", {
      currentPrice: 150,
      years: [],
    })

    expect(res.status).toBe(200)
    expect(repository.getTickerState("AAPL")).toEqual({
      ticker: "AAPL",
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: 150,
    })
  })

  it("ticker nuevo + años sin sub-objetos efectivos y sin currentPrice → no crea TickerState", async () => {
    const { app, repository } = setup()

    const res = await postIngest(app, "AAPL", {
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })

    expect(res.status).toBe(200)
    expect(repository.getTickerState("AAPL")).toBeNull()
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")).toBeNull()
  })
})

describe("POST /companies/:ticker/data - normalización", () => {
  it("ticker en minúsculas → persiste bajo el ticker en mayúsculas", async () => {
    const { app, repository } = setup()

    const res = await postIngest(app, "aapl", {
      currentPrice: 100,
      years: [fullYearPayload("2024-12-31")],
    })

    expect(res.status).toBe(200)
    expect(repository.getTickerState("AAPL")).not.toBeNull()
    expect(repository.getTickerState("aapl")).toBeNull()
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")).not.toBeNull()
  })
})

describe("POST /companies/:ticker/data - validación 400", () => {
  it("campo desconocido en raíz del body", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", {
      currentPrice: 100,
      years: [],
      foo: "bar",
    })
    expect(res.status).toBe(400)
  })

  it("campo desconocido en incomeStatement", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 100, foo: 1 },
        },
      ],
    })
    expect(res.status).toBe(400)
  })

  it("campo numérico con null explícito", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: null },
        },
      ],
    })
    expect(res.status).toBe(400)
  })

  it("años duplicados por fiscalYearEnd", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", {
      years: [{ fiscalYearEnd: "2024-12-31" }, { fiscalYearEnd: "2024-12-31" }],
    })
    expect(res.status).toBe(400)
  })

  it("body sin years", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", { currentPrice: 100 })
    expect(res.status).toBe(400)
  })

  it("currentPrice = 0", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", { currentPrice: 0, years: [] })
    expect(res.status).toBe(400)
  })

  it("currentPrice negativo", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", { currentPrice: -5, years: [] })
    expect(res.status).toBe(400)
  })

  it("fiscalYearEnd con formato inválido", async () => {
    const { app } = setup()
    const res = await postIngest(app, "AAPL", {
      years: [{ fiscalYearEnd: "2024-13-40" }],
    })
    expect(res.status).toBe(400)
  })
})

describe("POST /companies/:ticker/data - disparo de valoración en segundo plano", () => {
  it("ingesta que deja pendiente → Flujo 2 persiste la valoración", async () => {
    const { app, repository } = setup()

    const res = await postIngest(app, "AMZN", toIngestBody(amznFixture))
    expect(res.status).toBe(200)

    await waitForBackgroundValuation(repository, "AMZN")

    const latest = repository.getLatestValuation("AMZN")
    expect(latest).not.toBeNull()
    expect(latest?.fiscalYearEnd).toBe("2025-12-31")
    expect(repository.getTickerState("AMZN")?.pendingValuation).toBe(false)
  })

  it("ingesta que no deja pendiente (solo currentPrice sin cambios efectivos) → no dispara Flujo 2", async () => {
    const { app, repository } = setup()
    seedTickerState(repository, { pendingValuation: false, currentPrice: 100 })

    const res = await postIngest(app, "AAPL", { currentPrice: 120, years: [] })
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 50))

    expect(repository.getLatestValuation("AAPL")).toBeNull()
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(false)
  })
})

describe("POST /companies/:ticker/data - fallos de persistencia 500", () => {
  it("DB cerrada antes del request → 500 con success:false y error", async () => {
    const { app, db } = setup()
    db.$client.close()

    const res = await postIngest(app, "AAPL", {
      currentPrice: 100,
      years: [fullYearPayload("2024-12-31")],
    })

    expect(res.status).toBe(500)
    const body = (await res.json()) as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(typeof body.error).toBe("string")
  })
})

const getCompany = (app: AppInstance, ticker: string) =>
  app.request(`/companies/${ticker}`)

type GetCompanyBody = {
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
  missing?: {
    ticker?: string[]
    years?: Array<{
      fiscalYearEnd: string
      incomeStatement?: string[]
      freeCashFlow?: string[]
      roic?: string[]
    }>
  }
}

describe("GET /companies/:ticker", () => {
  it("ticker sin registro → 404 con ticker_not_found", async () => {
    const { app } = setup()

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: "ticker_not_found",
      ticker: "AAPL",
    })
  })

  it("ticker con valoración previa y no pendiente → 200 con valuation poblada, missing ausente", async () => {
    const { app, repository } = setup()
    await postIngest(app, "AMZN", toIngestBody(amznFixture))
    await waitForBackgroundValuation(repository, "AMZN")

    const res = await getCompany(app, "AMZN")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.ticker).toBe("AMZN")
    expect(body.pending).toBe(false)
    expect(body.valuationInProgress).toBe(false)
    expect(body.valuation).not.toBeNull()
    expect(body.valuation?.fiscalYearEnd).toBe("2025-12-31")
    expect(body.missing).toBeUndefined()
  })

  it("ticker pendiente con datos suficientes → Flujo 2 corre sincrónico y responde con valuation", async () => {
    const { app, repository } = setup()
    const body = toIngestBody(amznFixture)
    const reducedYears = body.years.slice(-2)
    await postIngest(app, "AMZN", {
      currentPrice: body.currentPrice,
      years: reducedYears,
    })
    await waitForBackgroundValuation(repository, "AMZN")
    repository.updateTickerState("AMZN", { pendingValuation: true })

    const res = await getCompany(app, "AMZN")

    expect(res.status).toBe(200)
    const parsed = (await res.json()) as GetCompanyBody
    expect(parsed.pending).toBe(false)
    expect(parsed.valuation).not.toBeNull()
    expect(parsed.missing).toBeUndefined()
  })

  it("ticker pendiente con currentPrice null y años completos → pending=true, missing.ticker=['currentPrice']", async () => {
    const { app, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: null,
    })
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2023-12-31"))
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.pending).toBe(true)
    expect(body.currentPrice).toBeNull()
    expect(body.missing?.ticker).toEqual(["currentPrice"])
    expect(body.missing?.years).toBeUndefined()
    expect(body.valuation).toBeNull()
  })

  it("ticker pendiente con serie consecutiva < 2 → pending=true, missing.years enumera años incompletos", async () => {
    const { app, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: 150,
    })
    repository.insertYearlyFinancials(completeYearRow("AAPL", "2024-12-31"))
    repository.insertYearlyFinancials(
      completeYearRow("AAPL", "2023-12-31", { sales: null, ebit: null }),
    )

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.pending).toBe(true)
    expect(body.missing?.ticker).toBeUndefined()
    expect(body.missing?.years).toHaveLength(1)
    expect(body.missing?.years?.[0]?.fiscalYearEnd).toBe("2023-12-31")
    expect(body.missing?.years?.[0]?.incomeStatement).toEqual(["sales", "ebit"])
  })

  it("ticker pendiente con currentPrice null y gaps → missing.ticker y missing.years ambos presentes", async () => {
    const { app, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: null,
    })
    repository.insertYearlyFinancials(
      completeYearRow("AAPL", "2024-12-31", { equity: null }),
    )

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.missing?.ticker).toEqual(["currentPrice"])
    expect(body.missing?.years?.[0]?.roic).toEqual(["equity"])
  })

  it("ticker con latestFiscalYearEnd=null → 200 con latestFiscalYearEnd null y pending=true", async () => {
    const { app, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: null,
      pendingValuation: true,
      currentPrice: 150,
    })

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.latestFiscalYearEnd).toBeNull()
    expect(body.pending).toBe(true)
  })

  it("path con ticker en minúsculas → responde con el ticker normalizado en mayúsculas", async () => {
    const { app, repository } = setup()
    seedTickerState(repository, { pendingValuation: false })

    const res = await getCompany(app, "aapl")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.ticker).toBe("AAPL")
  })

  it("con varias filas en valuations → devuelve la de createdAt más reciente (desempate por id mayor)", async () => {
    const { app, repository } = setup()
    seedTickerState(repository, { pendingValuation: false, currentPrice: 100 })
    const sameCreatedAt = "2026-04-18T10:00:00.000Z"
    repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "first" } as unknown as CompanyValuation,
      createdAt: "2026-04-18T09:00:00.000Z",
    })
    const second = repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "second" } as unknown as CompanyValuation,
      createdAt: sameCreatedAt,
    })
    const third = repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "third" } as unknown as CompanyValuation,
      createdAt: sameCreatedAt,
    })

    const res = await getCompany(app, "AAPL")

    expect(res.status).toBe(200)
    const body = (await res.json()) as GetCompanyBody
    expect(body.valuation?.id).toBe(third.id)
    expect(body.valuation?.id).toBeGreaterThan(second.id)
    expect(body.valuation?.result).toEqual({ tag: "third" })
  })
})

describe("CORS preflight", () => {
  it("OPTIONS desde una extensión de Chrome → 204 con headers CORS", async () => {
    const { app } = setup()

    const res = await app.request("/companies/AAPL/data", {
      method: "OPTIONS",
      headers: {
        origin: "chrome-extension://imhojfkooakaggefdamfapfmacfnicff",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    })

    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://imhojfkooakaggefdamfapfmacfnicff",
    )
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
    expect(
      res.headers.get("access-control-allow-headers")?.toLowerCase(),
    ).toContain("content-type")
  })

  it("OPTIONS desde un origen no confiable → sin Allow-Origin", async () => {
    const { app } = setup()

    const res = await app.request("/companies/AAPL/data", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example.com",
        "access-control-request-method": "POST",
      },
    })

    expect(res.headers.get("access-control-allow-origin")).toBeNull()
  })
})
