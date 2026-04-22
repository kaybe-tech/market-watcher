import { describe, expect, it } from "bun:test"
import * as v from "valibot"
import {
  type IngestBodyInput,
  estimatesBodySchema,
  ingestBodySchema,
  tickerParamSchema,
} from "@/modules/company/validators"

const fullBody: IngestBodyInput = {
  currentPrice: 123.45,
  years: [
    {
      fiscalYearEnd: "2024-12-31",
      incomeStatement: {
        sales: 1000,
        depreciationAmortization: 50,
        ebit: 200,
        interestExpense: 10,
        interestIncome: 5,
        taxExpense: 40,
        minorityInterests: 0,
        fullyDilutedShares: 100,
      },
      freeCashFlow: {
        capexMaintenance: 30,
        inventories: 25,
        accountsReceivable: 60,
        accountsPayable: 45,
        unearnedRevenue: 10,
        dividendsPaid: 20,
      },
      roic: {
        cashAndEquivalents: 100,
        marketableSecurities: 50,
        shortTermDebt: 30,
        longTermDebt: 200,
        currentOperatingLeases: 5,
        nonCurrentOperatingLeases: 15,
        equity: 500,
      },
    },
  ],
}

describe("ingestBodySchema — casos del issue", () => {
  it("acepta body válido completo con todos los campos", () => {
    const result = v.safeParse(ingestBodySchema, fullBody)
    expect(result.success).toBe(true)
  })

  it("acepta body mínimo con un año sin sub-objetos", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(true)
  })

  it("acepta body sin currentPrice", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza currentPrice null explícito", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: null,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza currentPrice = 0", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: 0,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza currentPrice negativo", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: -5,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza currentPrice como string", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: "100",
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza body sin years", () => {
    const result = v.safeParse(ingestBodySchema, { currentPrice: 10 })
    expect(result.success).toBe(false)
  })

  it("acepta years vacío", () => {
    const result = v.safeParse(ingestBodySchema, { years: [] })
    expect(result.success).toBe(true)
  })

  it("rechaza año sin fiscalYearEnd", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ incomeStatement: { sales: 100 } }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd con formato inválido", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024/12/31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo desconocido en root", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: 10,
      years: [{ fiscalYearEnd: "2024-12-31" }],
      foo: "bar",
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo desconocido en un año", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-12-31", extra: 1 }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo desconocido en incomeStatement", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: 100, mystery: 1 },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo desconocido en freeCashFlow", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          freeCashFlow: { capexMaintenance: 10, mystery: 1 },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo desconocido en roic", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          roic: { equity: 100, mystery: 1 },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campo numérico opcional con null explícito", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: null },
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza dos años con el mismo fiscalYearEnd", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-12-31" }, { fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("tickerParamSchema", () => {
  it("rechaza ticker vacío", () => {
    const result = v.safeParse(tickerParamSchema, { ticker: "" })
    expect(result.success).toBe(false)
  })

  it("acepta ticker válido", () => {
    const result = v.safeParse(tickerParamSchema, { ticker: "NVDA" })
    expect(result.success).toBe(true)
  })

  it("rechaza objeto sin la propiedad ticker", () => {
    const result = v.safeParse(tickerParamSchema, {})
    expect(result.success).toBe(false)
  })
})

describe("ingestBodySchema — casos borde numéricos", () => {
  it("acepta currentPrice positivo muy pequeño (0.0001)", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: 0.0001,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza currentPrice = NaN", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: Number.NaN,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza currentPrice = Infinity", () => {
    const result = v.safeParse(ingestBodySchema, {
      currentPrice: Number.POSITIVE_INFINITY,
      years: [{ fiscalYearEnd: "2024-12-31" }],
    })
    expect(result.success).toBe(false)
  })

  it("acepta campo numérico opcional con valor 0", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          roic: { shortTermDebt: 0 },
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("acepta campo numérico opcional con valor negativo", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          freeCashFlow: { dividendsPaid: -100 },
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza campo numérico opcional con string numérico", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: { sales: "123" },
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe("ingestBodySchema — casos borde de fechas", () => {
  it("acepta 2024-02-29 (año bisiesto)", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-02-29" }],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza 2023-02-29 (no bisiesto)", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2023-02-29" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza 2024-02-30", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-02-30" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza 2024-13-01", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-13-01" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza timestamp ISO completo", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "2024-12-31T00:00:00Z" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd vacío", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [{ fiscalYearEnd: "" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("ingestBodySchema — casos borde estructurales", () => {
  it("rechaza body como array", () => {
    const result = v.safeParse(ingestBodySchema, [])
    expect(result.success).toBe(false)
  })

  it("rechaza body null", () => {
    const result = v.safeParse(ingestBodySchema, null)
    expect(result.success).toBe(false)
  })

  it("rechaza years que no sea array", () => {
    const result = v.safeParse(ingestBodySchema, { years: {} })
    expect(result.success).toBe(false)
  })

  it("acepta sub-objeto vacío incomeStatement: {}", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: {},
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza sub-objeto opcional con null explícito (incomeStatement: null)", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        {
          fiscalYearEnd: "2024-12-31",
          incomeStatement: null,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza tres años cuando dos comparten fiscalYearEnd", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        { fiscalYearEnd: "2022-12-31" },
        { fiscalYearEnd: "2023-12-31" },
        { fiscalYearEnd: "2022-12-31" },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("acepta tres años con fiscalYearEnd distintos", () => {
    const result = v.safeParse(ingestBodySchema, {
      years: [
        { fiscalYearEnd: "2022-12-31" },
        { fiscalYearEnd: "2023-12-31" },
        { fiscalYearEnd: "2024-12-31" },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza campo desconocido aunque su valor sea undefined", () => {
    const result = v.safeParse(ingestBodySchema, {
      foo: undefined,
      years: [],
    })
    expect(result.success).toBe(false)
  })
})

describe("tickerParamSchema — casos borde", () => {
  it("acepta ticker con solo espacios (la limpieza es del handler)", () => {
    const result = v.safeParse(tickerParamSchema, { ticker: "   " })
    expect(result.success).toBe(true)
  })
})

describe("estimatesBodySchema", () => {
  it("acepta payload mínimo con solo source", () => {
    const result = v.safeParse(estimatesBodySchema, { source: "tikr" })
    expect(result.success).toBe(true)
  })

  it("acepta payload con years", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [
        {
          fiscalYearEnd: "2027-01-31",
          salesGrowth: 0.45,
          ebitMargin: 0.62,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza source vacío", () => {
    const result = v.safeParse(estimatesBodySchema, { source: "" })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd mal formado", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-13-40" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campos desconocidos", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-01-31", unknownField: 1 }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd duplicados", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.1 },
        { fiscalYearEnd: "2027-01-31", ebitMargin: 0.5 },
      ],
    })
    expect(result.success).toBe(false)
  })
})
