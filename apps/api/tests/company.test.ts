import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createDb } from "@/db"
import { Company } from "@/modules/company/company"
import { CompanyRepository } from "@/modules/company/repository"
import type { YearlyFinancialsRow } from "@/modules/company/schema"
import { completeYearRow, tickerStateRow } from "./fixtures/company"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setup = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  const repository = new CompanyRepository(db)
  return { company: new Company(repository), repository }
}

describe("Company - ingestData", () => {
  it("ticker nuevo + body completo → crea TickerState y yearly_financials con pending=true", () => {
    const { company, repository } = setup()

    company.ingestData("AAPL", {
      currentPrice: 180.5,
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 100, ebit: 50 },
          roic: { equity: 200 },
        },
      ],
    })

    expect(repository.getTickerState("AAPL")).toEqual({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: true,
      currentPrice: 180.5,
    })
    const row = repository.getYearlyFinancials("AAPL", "2024-12-31")
    expect(row?.sales).toBe(100)
    expect(row?.ebit).toBe(50)
    expect(row?.equity).toBe(200)
    expect(row?.dividendsPaid).toBeNull()
  })

  it("ticker existente + campos null poblados por ingesta → patch aplicado, pending=true", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: false,
      currentPrice: 100,
    })
    repository.insertYearlyFinancials(
      completeYearRow("AAPL", "2024-12-31", { sales: null, ebit: null }),
    )

    company.ingestData("AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 999, ebit: 888 },
        },
      ],
    })

    const row = repository.getYearlyFinancials("AAPL", "2024-12-31")
    expect(row?.sales).toBe(999)
    expect(row?.ebit).toBe(888)
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(true)
  })

  it("ticker nuevo + solo currentPrice → crea TickerState con latestFiscalYearEnd null y pending=false", () => {
    const { company, repository } = setup()

    company.ingestData("AAPL", { currentPrice: 150, years: [] })

    expect(repository.getTickerState("AAPL")).toEqual({
      ticker: "AAPL",
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: 150,
    })
  })

  it("ticker nuevo + años sin sub-objetos efectivos y sin currentPrice → no crea TickerState", () => {
    const { company, repository } = setup()

    company.ingestData("AAPL", { years: [{ fiscalYearEnd: "2024-12-31" }] })

    expect(repository.getTickerState("AAPL")).toBeNull()
    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")).toBeNull()
  })

  it("ticker existente + solo currentPrice distinto → actualiza price sin marcar pendiente", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: false,
      currentPrice: 100,
    })

    company.ingestData("AAPL", { currentPrice: 200, years: [] })

    const state = repository.getTickerState("AAPL")
    expect(state?.currentPrice).toBe(200)
    expect(state?.pendingValuation).toBe(false)
  })

  it("campo ya poblado con valor entrante distinto → no se altera ni marca pendiente", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: "2024-12-31",
      pendingValuation: false,
      currentPrice: 100,
    })
    repository.insertYearlyFinancials(
      completeYearRow("AAPL", "2024-12-31", { sales: 100 }),
    )

    company.ingestData("AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 999 },
        },
      ],
    })

    expect(repository.getYearlyFinancials("AAPL", "2024-12-31")?.sales).toBe(
      100,
    )
    expect(repository.getTickerState("AAPL")?.pendingValuation).toBe(false)
  })

  it("ticker existente con latestFiscalYearEnd null + año efectivo → actualiza latestFiscalYearEnd", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "AAPL",
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: 100,
    })

    company.ingestData("AAPL", {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 100 },
        },
      ],
    })

    const state = repository.getTickerState("AAPL")
    expect(state?.latestFiscalYearEnd).toBe("2024-12-31")
    expect(state?.pendingValuation).toBe(true)
  })
})

describe("Company - applyYearlyFinancialsPatch (inmutabilidad)", () => {
  it("año inexistente + datos entrantes → patch con todos los campos, escritura efectiva y año nuevo", () => {
    const { company } = setup()
    const result = company.applyYearlyFinancialsPatch(null, {
      fiscalYearEnd: "2025-09-27",
      incomeStatement: { sales: 1, ebit: 2 },
      freeCashFlow: { capexMaintenance: 3 },
    })
    expect(result.isNewYear).toBe(true)
    expect(result.hasWrites).toBe(true)
    expect(result.patch).toEqual({ sales: 1, ebit: 2, capexMaintenance: 3 })
  })

  it("año inexistente + envío sin sub-objetos financieros → sin escritura efectiva", () => {
    const { company } = setup()
    const result = company.applyYearlyFinancialsPatch(null, {
      fiscalYearEnd: "2025-09-27",
    })
    expect(result.isNewYear).toBe(true)
    expect(result.hasWrites).toBe(false)
    expect(result.patch).toEqual({})
  })

  it("año existente totalmente poblado + envío con los mismos campos → sin escritura efectiva", () => {
    const { company } = setup()
    const current = completeYearRow("AAPL", "2025-09-27")
    const result = company.applyYearlyFinancialsPatch(current, {
      fiscalYearEnd: "2025-09-27",
      incomeStatement: { sales: 999, ebit: 888 },
      freeCashFlow: { capexMaintenance: 777 },
      roic: { equity: 666 },
    })
    expect(result.isNewYear).toBe(false)
    expect(result.hasWrites).toBe(false)
    expect(result.patch).toEqual({})
  })

  it("año existente con campos en null + envío que los trae → solo esos campos entran a la escritura", () => {
    const { company } = setup()
    const current = completeYearRow("AAPL", "2025-09-27", {
      sales: null,
      ebit: null,
      capexMaintenance: null,
    })
    const result = company.applyYearlyFinancialsPatch(current, {
      fiscalYearEnd: "2025-09-27",
      incomeStatement: { sales: 111, ebit: 222, interestExpense: 333 },
      freeCashFlow: { capexMaintenance: 444, inventories: 555 },
    })
    expect(result.isNewYear).toBe(false)
    expect(result.hasWrites).toBe(true)
    expect(result.patch).toEqual({
      sales: 111,
      ebit: 222,
      capexMaintenance: 444,
    })
  })

  it("año existente con un campo ya poblado + envío con valor distinto para ese campo → no se altera", () => {
    const { company } = setup()
    const current = completeYearRow("AAPL", "2025-09-27", { sales: 100 })
    const result = company.applyYearlyFinancialsPatch(current, {
      fiscalYearEnd: "2025-09-27",
      incomeStatement: { sales: 999 },
    })
    expect(result.isNewYear).toBe(false)
    expect(result.hasWrites).toBe(false)
    expect(result.patch).toEqual({})
  })
})

describe("Company - consolidateConsecutiveYears", () => {
  it("historial de 2 años completos consecutivos → serie de 2", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("AAPL", "2025-09-27"),
      completeYearRow("AAPL", "2024-09-27"),
    ]
    const series = company.consolidateConsecutiveYears(rows, "2025-09-27")
    expect(series.map((r) => r.fiscalYearEnd)).toEqual([
      "2025-09-27",
      "2024-09-27",
    ])
  })

  it("historial con un año intermedio incompleto → serie limitada a años completos hasta el gap", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("AAPL", "2025-09-27"),
      completeYearRow("AAPL", "2024-09-27", { sales: null }),
      completeYearRow("AAPL", "2023-09-27"),
      completeYearRow("AAPL", "2022-09-27"),
    ]
    const series = company.consolidateConsecutiveYears(rows, "2025-09-27")
    expect(series.map((r) => r.fiscalYearEnd)).toEqual(["2025-09-27"])
  })

  it("historial de 15 años completos consecutivos → serie de 10", () => {
    const { company } = setup()
    const rows: YearlyFinancialsRow[] = []
    for (let year = 2025; year >= 2011; year--) {
      rows.push(completeYearRow("AAPL", `${year}-09-27`))
    }
    const series = company.consolidateConsecutiveYears(rows, "2025-09-27")
    expect(series).toHaveLength(10)
    expect(series[0]?.fiscalYearEnd).toBe("2025-09-27")
    expect(series[9]?.fiscalYearEnd).toBe("2016-09-27")
  })

  it("latestFiscalYearEnd con datos incompletos → serie vacía", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("AAPL", "2025-09-27", { equity: null }),
      completeYearRow("AAPL", "2024-09-27"),
    ]
    const series = company.consolidateConsecutiveYears(rows, "2025-09-27")
    expect(series).toEqual([])
  })

  it("latestFiscalYearEnd null → serie vacía aunque haya rows históricos", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("AAPL", "2025-09-27"),
      completeYearRow("AAPL", "2024-09-27"),
    ]
    const series = company.consolidateConsecutiveYears(rows, null)
    expect(series).toEqual([])
  })

  it("fiscal years con drift de día/mes (estilo NVDA) → serie completa", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("NVDA", "2026-01-25"),
      completeYearRow("NVDA", "2025-01-26"),
      completeYearRow("NVDA", "2024-01-28"),
      completeYearRow("NVDA", "2023-01-29"),
    ]
    const series = company.consolidateConsecutiveYears(rows, "2026-01-25")
    expect(series.map((r) => r.fiscalYearEnd)).toEqual([
      "2026-01-25",
      "2025-01-26",
      "2024-01-28",
      "2023-01-29",
    ])
  })

  it("salto de año fiscal (falta un año entero) → serie corta hasta el gap", () => {
    const { company } = setup()
    const rows = [
      completeYearRow("NVDA", "2026-01-25"),
      completeYearRow("NVDA", "2025-01-26"),
      completeYearRow("NVDA", "2023-01-29"),
    ]
    const series = company.consolidateConsecutiveYears(rows, "2026-01-25")
    expect(series.map((r) => r.fiscalYearEnd)).toEqual([
      "2026-01-25",
      "2025-01-26",
    ])
  })
})

describe("Company - isYearComplete", () => {
  it("año con los 21 campos poblados → completo", () => {
    const { company } = setup()
    expect(company.isYearComplete(completeYearRow("AAPL", "2025-09-27"))).toBe(
      true,
    )
  })

  it("año con cualquier campo null → incompleto", () => {
    const { company } = setup()
    const row = completeYearRow("AAPL", "2025-09-27", { equity: null })
    expect(company.isYearComplete(row)).toBe(false)
  })
})

describe("Company - missingFieldsOfYear", () => {
  it("año totalmente poblado → sin entradas", () => {
    const { company } = setup()
    expect(
      company.missingFieldsOfYear(completeYearRow("AAPL", "2025-09-27")),
    ).toEqual({})
  })

  it("año con campos faltantes en varios sub-objetos → agrupado, omite sub-objetos completos", () => {
    const { company } = setup()
    const row = completeYearRow("AAPL", "2025-09-27", {
      sales: null,
      ebit: null,
      capexMaintenance: null,
    })
    expect(company.missingFieldsOfYear(row)).toEqual({
      incomeStatement: ["sales", "ebit"],
      freeCashFlow: ["capexMaintenance"],
    })
  })
})

describe("Company - missingTickerFields", () => {
  it("currentPrice presente → sin faltantes", () => {
    const { company } = setup()
    expect(company.missingTickerFields(tickerStateRow())).toEqual([])
  })

  it("currentPrice null → incluye currentPrice", () => {
    const { company } = setup()
    expect(
      company.missingTickerFields(tickerStateRow({ currentPrice: null })),
    ).toEqual(["currentPrice"])
  })
})

describe("Company.ingestEstimates", () => {
  it("crea TickerState si no existe y marca pendingValuation=true", () => {
    const { company, repository } = setup()
    const result = company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        {
          fiscalYearEnd: "2027-01-31",
          salesGrowth: 0.45,
          ebitMargin: 0.62,
        },
      ],
    })
    expect(result.pendingValuation).toBe(true)
    expect(repository.getTickerState("NVDA")).toMatchObject({
      ticker: "NVDA",
      pendingValuation: true,
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.45)
  })

  it("upsert reemplaza la fila existente", () => {
    const { company, repository } = setup()
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.45, ebitMargin: 0.62 },
      ],
    })
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.50 },
      ],
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.50)
    expect(rows[0]?.ebitMargin).toBeNull()
  })

  it("payload sin years acepta pero no toca pendingValuation", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "NVDA",
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: null,
    })
    const result = company.ingestEstimates("NVDA", { source: "tikr" })
    expect(result.pendingValuation).toBe(false)
    expect(repository.getTickerState("NVDA")?.pendingValuation).toBe(false)
  })
})

describe("Company - consolidateMissing", () => {
  it("precio presente y todos los años completos → resumen vacío", () => {
    const { company } = setup()
    const summary = company.consolidateMissing(tickerStateRow(), [
      completeYearRow("AAPL", "2025-09-27"),
      completeYearRow("AAPL", "2024-09-27"),
    ])
    expect(summary).toEqual({})
  })

  it("sin precio y todos los años completos → resumen con solo ticker", () => {
    const { company } = setup()
    const summary = company.consolidateMissing(
      tickerStateRow({ currentPrice: null }),
      [completeYearRow("AAPL", "2025-09-27")],
    )
    expect(summary).toEqual({ ticker: ["currentPrice"] })
  })

  it("precio y un año incompleto + otros completos → resumen con solo years, listando el incompleto", () => {
    const { company } = setup()
    const summary = company.consolidateMissing(tickerStateRow(), [
      completeYearRow("AAPL", "2025-09-27"),
      completeYearRow("AAPL", "2024-09-27", {
        sales: null,
        equity: null,
      }),
    ])
    expect(summary).toEqual({
      years: [
        {
          fiscalYearEnd: "2024-09-27",
          incomeStatement: ["sales"],
          roic: ["equity"],
        },
      ],
    })
  })

  it("sin precio y varios años con gaps → resumen con ambas claves", () => {
    const { company } = setup()
    const summary = company.consolidateMissing(
      tickerStateRow({ currentPrice: null }),
      [
        completeYearRow("AAPL", "2025-09-27", { sales: null }),
        completeYearRow("AAPL", "2024-09-27", { capexMaintenance: null }),
      ],
    )
    expect(summary).toEqual({
      ticker: ["currentPrice"],
      years: [
        { fiscalYearEnd: "2025-09-27", incomeStatement: ["sales"] },
        { fiscalYearEnd: "2024-09-27", freeCashFlow: ["capexMaintenance"] },
      ],
    })
  })

  it("años completos nunca aparecen en la clave years", () => {
    const { company } = setup()
    const summary = company.consolidateMissing(
      tickerStateRow({ currentPrice: null }),
      [
        completeYearRow("AAPL", "2025-09-27"),
        completeYearRow("AAPL", "2024-09-27", { equity: null }),
        completeYearRow("AAPL", "2023-09-27"),
      ],
    )
    expect(summary.years?.map((y) => y.fiscalYearEnd)).toEqual(["2024-09-27"])
  })
})
