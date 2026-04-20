import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import { CompanyRepository } from "@/modules/company/repository"
import { completeYearRow, fullYearPayload } from "./fixtures/company"

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
