import { describe, expect, it } from "bun:test"
import { isClose } from "@market-watcher/valuation-engine/tests/helpers/fixtures"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import { CompanyRepository } from "@/modules/company/repository"
import {
  allFixtures,
  amznFixture,
  type EngineFixture,
  type IngestBody,
  splitFixtureByYear,
  toIngestBody,
} from "./fixtures/engine"
import {
  buildIngestBody,
  completeYear,
  incompleteYear,
} from "./fixtures/synthetic"

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

const getCompany = (app: AppInstance, ticker: string) =>
  app.request(`/companies/${ticker}`)

const waitForBackgroundValuation = async (
  repository: CompanyRepository,
  ticker: string,
  {
    timeoutMs = 3000,
    intervalMs = 10,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = repository.getTickerState(ticker)
    if (state && !state.pendingValuation) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `background valuation for ${ticker} did not complete within ${timeoutMs}ms`,
  )
}

const assertCloseDeep = (actual: unknown, expected: unknown, path = "root") => {
  if (
    expected === null ||
    typeof expected === "number" ||
    typeof actual === "number"
  ) {
    if (!isClose(actual, expected)) {
      throw new Error(
        `mismatch at ${path}: expected ${String(expected)}, got ${String(actual)}`,
      )
    }
    return
  }
  if (typeof expected !== "object" || expected === undefined) {
    expect(actual).toEqual(expected as never)
    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true)
    const actualArr = actual as unknown[]
    expect(actualArr.length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) {
      assertCloseDeep(actualArr[i], expected[i], `${path}[${i}]`)
    }
    return
  }
  expect(typeof actual).toBe("object")
  const actualObj = actual as Record<string, unknown>
  const expectedObj = expected as Record<string, unknown>
  for (const key of Object.keys(expectedObj)) {
    assertCloseDeep(actualObj[key], expectedObj[key], `${path}.${key}`)
  }
}

const tickerForFixture = (fixture: EngineFixture): string =>
  fixture.inputs.ticker

describe("E2E criterio 1 — set completo dispara valoración automática", () => {
  for (const fixture of allFixtures) {
    const ticker = tickerForFixture(fixture)
    it(`${ticker}: ingesta completa → Flujo 2 persiste la valoración`, async () => {
      const { app, repository } = setup()

      const res = await postIngest(app, ticker, toIngestBody(fixture))
      expect(res.status).toBe(200)

      await waitForBackgroundValuation(repository, ticker)

      const latest = repository.getLatestValuation(ticker)
      expect(latest).not.toBeNull()
      expect(latest?.ticker).toBe(ticker)
      expect(repository.getTickerState(ticker)?.pendingValuation).toBe(false)
    })
  }
})

describe("E2E criterio 2 — equivalencia con el engine directo (tolerancia 0.01%)", () => {
  for (const fixture of allFixtures) {
    const ticker = tickerForFixture(fixture)
    it(`${ticker}: valuations.result coincide con expected del fixture`, async () => {
      const { app, repository } = setup()

      await postIngest(app, ticker, toIngestBody(fixture))
      await waitForBackgroundValuation(repository, ticker)

      const latest = repository.getLatestValuation(ticker)
      if (!latest) throw new Error("expected valuation row")
      const result = latest.result as unknown as Record<string, unknown>
      const expected = fixture.expected as Record<string, unknown>

      assertCloseDeep(result.historical, expected.historical, "historical")
      assertCloseDeep(result.assumptions, expected.assumptions, "assumptions")
      assertCloseDeep(result.projected, expected.projected, "projected")
      assertCloseDeep(result.multiples, expected.multiples, "multiples")
      assertCloseDeep(
        result.intrinsicValue,
        expected.intrinsicValue,
        "intrinsicValue",
      )
    })
  }
})

describe("E2E criterio 3 — payloads parciales reportan faltantes", () => {
  it("año incompleto + currentPrice ausente → GET devuelve pending=true con missing a nivel ticker y año", async () => {
    const { app } = setup()

    const body = buildIngestBody([
      incompleteYear("2024-12-31", {
        incomeStatement: ["sales"],
        roic: ["equity"],
      }),
    ])
    await postIngest(app, "AAPL", body)

    const res = await getCompany(app, "AAPL")
    expect(res.status).toBe(200)
    const parsed = (await res.json()) as {
      pending: boolean
      missing?: {
        ticker?: string[]
        years?: Array<{
          fiscalYearEnd: string
          incomeStatement?: string[]
          roic?: string[]
        }>
      }
    }
    expect(parsed.pending).toBe(true)
    expect(parsed.missing?.ticker).toEqual(["currentPrice"])
    expect(parsed.missing?.years).toHaveLength(1)
    expect(parsed.missing?.years?.[0]?.fiscalYearEnd).toBe("2024-12-31")
    expect(parsed.missing?.years?.[0]?.incomeStatement).toEqual(["sales"])
    expect(parsed.missing?.years?.[0]?.roic).toEqual(["equity"])
  })
})

describe("E2E criterio 4 — re-ingesta no altera datos existentes", () => {
  it("misma ingesta dos veces con valores distintos → se conservan los originales y hay una única fila", async () => {
    const { app, repository } = setup()

    const first = buildIngestBody(
      [completeYear("2024-12-31", { incomeStatement: { sales: 100000 } })],
      150,
    )
    await postIngest(app, "AAPL", first)

    const second = buildIngestBody(
      [completeYear("2024-12-31", { incomeStatement: { sales: 999999 } })],
      200,
    )
    await postIngest(app, "AAPL", second)

    expect(repository.listYearlyFinancialsForTicker("AAPL")).toHaveLength(1)
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")?.sales).toBe(
      100000,
    )
  })
})

describe("E2E criterio 5 — año posterior dispara recálculo sin borrar historial", () => {
  it("AMZN completo + año sintético 2026 → dos filas en valuations y latestFiscalYearEnd avanza", async () => {
    const { app, repository } = setup()

    await postIngest(app, "AMZN", toIngestBody(amznFixture))
    await waitForBackgroundValuation(repository, "AMZN")
    const valuationsAfterFirst = repository.listValuationsForTicker("AMZN")
    expect(valuationsAfterFirst).toHaveLength(1)

    // Nuevo año posterior sintético consistente (valores realistas no importan porque el engine
    // ya validó el historial real; agregamos un año completo con shape correcto).
    await new Promise((r) => setTimeout(r, 5))
    await postIngest(app, "AMZN", buildIngestBody([completeYear("2026-12-31")]))
    await waitForBackgroundValuation(repository, "AMZN")

    const valuationsAfterSecond = repository.listValuationsForTicker("AMZN")
    expect(valuationsAfterSecond.length).toBeGreaterThanOrEqual(2)
    expect(repository.getTickerState("AMZN")?.latestFiscalYearEnd).toBe(
      "2026-12-31",
    )
  })
})

describe("E2E criterio 6 — GET devuelve la última valoración", () => {
  it("múltiples filas en valuations → GET retorna la de createdAt más reciente (desempate por id)", async () => {
    const { app, repository } = setup()

    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: false,
      currentPrice: 150,
    })
    const sameCreatedAt = "2026-04-18T12:00:00.000Z"
    repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "older" } as unknown as never,
      createdAt: "2026-04-18T10:00:00.000Z",
    })
    repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "tie-earlier" } as unknown as never,
      createdAt: sameCreatedAt,
    })
    const winner = repository.insertValuation({
      ticker: "AAPL",
      fiscalYearEnd: "2024-12-31",
      result: { tag: "winner" } as unknown as never,
      createdAt: sameCreatedAt,
    })

    const res = await getCompany(app, "AAPL")
    expect(res.status).toBe(200)
    const parsed = (await res.json()) as {
      valuation: { id: number; result: unknown } | null
    }
    expect(parsed.valuation?.id).toBe(winner.id)
    expect(parsed.valuation?.result).toEqual({ tag: "winner" })
  })
})

describe("E2E — ingesta incremental (troceado por año)", () => {
  it("AMZN troceado por año + currentPrice al final → persistencia en mismo estado final que ingesta completa", async () => {
    const { app, repository } = setup()

    const chunks = splitFixtureByYear(amznFixture)
    for (const chunk of chunks) {
      await postIngest(app, "AMZN", chunk)
    }
    // Enviar currentPrice al final dispara el background
    await postIngest(app, "AMZN", {
      currentPrice: amznFixture.inputs.currentPrice,
      years: [],
    })
    await waitForBackgroundValuation(repository, "AMZN")

    const latest = repository.getLatestValuation("AMZN")
    expect(latest).not.toBeNull()
    expect(latest?.fiscalYearEnd).toBe("2025-12-31")
  })
})
