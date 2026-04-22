import { describe, expect, test } from "bun:test"
import { CompanyValuation } from "../src/company-valuation"
import * as nvda from "./fixtures/nvda"

const FINANCIALS = nvda.inputs.financials as unknown as ConstructorParameters<
  typeof CompanyValuation
>[0]["financials"]
const TICKER = "NVDA"
const PRICE = nvda.inputs.currentPrice
const PROJECTED_YEARS = [2027, 2028, 2029, 2030, 2031] as const
const FIRST_PROJECTED = 2027

function buildBaseline(): CompanyValuation {
  return new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
  })
}

describe("overrides — bit-idéntico sin overrides", () => {
  const baseline = buildBaseline()
  const explicit = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: undefined,
  })

  for (const year of PROJECTED_YEARS) {
    test(`projected ${year} idéntico`, () => {
      expect(explicit.projected[year]?.incomeStatement).toEqual(
        baseline.projected[year]?.incomeStatement as never,
      )
      expect(explicit.projected[year]?.freeCashFlow).toEqual(
        baseline.projected[year]?.freeCashFlow as never,
      )
      expect(explicit.projected[year]?.roic).toEqual(
        baseline.projected[year]?.roic as never,
      )
      expect(explicit.projected[year]?.valuation).toEqual(
        baseline.projected[year]?.valuation as never,
      )
    })
  }

  test("multiples y intrinsicValue idénticos", () => {
    expect(explicit.multiples.target).toEqual(baseline.multiples.target as never)
    expect(explicit.intrinsicValue.cagr5y).toEqual(
      baseline.intrinsicValue.cagr5y as never,
    )
    expect(explicit.intrinsicValue.buyPrice).toEqual(
      baseline.intrinsicValue.buyPrice as never,
    )
  })
})

describe("overrides — salesGrowth en un año, cascada a años posteriores", () => {
  const overridden = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: { projections: { 2028: { salesGrowth: 0.3 } } },
  })
  const baseline = buildBaseline()

  test("año 2027 (anterior al override) usa el supuesto histórico automático", () => {
    expect(overridden.projected[2027]?.incomeStatement.salesYoYGrowth).toBe(
      baseline.projected[2027]?.incomeStatement.salesYoYGrowth as number,
    )
  })

  test("año 2028 usa el override de 30%", () => {
    expect(overridden.projected[2028]?.incomeStatement.salesYoYGrowth).toBe(0.3)
  })

  test("años 2029, 2030, 2031 cascadean el 30% (sin override propio)", () => {
    for (const y of [2029, 2030, 2031]) {
      expect(overridden.projected[y]?.incomeStatement.salesYoYGrowth).toBe(0.3)
    }
  })

  test("sales del 2028 = sales 2027 × 1.30", () => {
    const sales2027 = overridden.projected[2027]?.incomeStatement.sales as number
    const sales2028 = overridden.projected[2028]?.incomeStatement.sales as number
    expect(sales2028).toBeCloseTo(sales2027 * 1.3, 6)
  })

  test("downstream del 2028 cambia respecto a baseline (ebit, netIncome, fcf, intrinsicValue)", () => {
    const o2028 = overridden.projected[2028]
    const b2028 = baseline.projected[2028]
    expect(o2028?.incomeStatement.ebit).not.toBe(
      b2028?.incomeStatement.ebit as number,
    )
    expect(o2028?.incomeStatement.netIncome).not.toBe(
      b2028?.incomeStatement.netIncome as number,
    )
    expect(o2028?.freeCashFlow.fcf).not.toBe(b2028?.freeCashFlow.fcf as number)
    expect(overridden.intrinsicValue.targetPrice[2028]?.evFcf).not.toBe(
      baseline.intrinsicValue.targetPrice[2028]?.evFcf as number,
    )
  })

  test("año 2027 (sin cascada hacia atrás) tiene downstream idéntico al baseline", () => {
    expect(overridden.projected[2027]?.incomeStatement.sales).toBe(
      baseline.projected[2027]?.incomeStatement.sales as number,
    )
    expect(overridden.projected[2027]?.incomeStatement.netIncome).toBe(
      baseline.projected[2027]?.incomeStatement.netIncome as number,
    )
  })
})

describe("overrides — changeInWorkingCapital absoluto en un año", () => {
  const ABS = -50_000_000
  const overridden = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: {
      projections: { 2028: { changeInWorkingCapital: ABS } },
    },
  })
  const baseline = buildBaseline()

  test("2028 usa exactamente el valor absoluto del override", () => {
    expect(overridden.projected[2028]?.freeCashFlow.changeInWorkingCapital).toBe(
      ABS,
    )
  })

  test("2029+ propaga el ratio implícito ABS/sales_2028", () => {
    const sales2028 = overridden.projected[2028]?.incomeStatement.sales as number
    for (const y of [2029, 2030, 2031]) {
      const salesY = overridden.projected[y]?.incomeStatement.sales as number
      const expected = (ABS / sales2028) * salesY
      expect(
        overridden.projected[y]?.freeCashFlow.changeInWorkingCapital,
      ).toBeCloseTo(expected, 6)
    }
  })

  test("2027 no se altera (cwc previo al override)", () => {
    expect(overridden.projected[2027]?.freeCashFlow.changeInWorkingCapital).toBe(
      baseline.projected[2027]?.freeCashFlow.changeInWorkingCapital as number,
    )
  })

  test("FCF del 2028 reacciona al cwc absoluto", () => {
    expect(overridden.projected[2028]?.freeCashFlow.fcf).not.toBe(
      baseline.projected[2028]?.freeCashFlow.fcf as number,
    )
  })
})

describe("overrides — targetMultiples", () => {
  const overridden = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: { targetMultiples: { per: 25 } },
  })
  const baseline = buildBaseline()

  test("target.per usa el override = 25", () => {
    expect(overridden.multiples.target.per).toBe(25)
  })

  test("targetPrice.per recalculado con per=25", () => {
    const py = overridden.projected[2031]
    if (!py) throw new Error("missing 2031")
    const { netIncome, fullyDilutedShares } = py.incomeStatement
    const { netDebt } = py.valuation
    const base = netIncome * 25
    const expected =
      netDebt < 0
        ? (base - netDebt) / fullyDilutedShares
        : base / fullyDilutedShares
    expect(overridden.intrinsicValue.targetPrice[2031]?.per).toBeCloseTo(
      expected,
      4,
    )
  })

  test("CAGR.per cambia (deriva de target.per); buyPrice no cambia (deriva de target.evFcf)", () => {
    expect(overridden.intrinsicValue.cagr5y.per).not.toBe(
      baseline.intrinsicValue.cagr5y.per as number,
    )
    expect(overridden.intrinsicValue.buyPrice.price).toBe(
      baseline.intrinsicValue.buyPrice.price as number,
    )
  })

  test("evEbitda, evEbit, evFcf siguen con su valor automático (NTM)", () => {
    expect(overridden.multiples.target.evEbitda).toBe(
      baseline.multiples.target.evEbitda as number,
    )
    expect(overridden.multiples.target.evEbit).toBe(
      baseline.multiples.target.evEbit as number,
    )
    expect(overridden.multiples.target.evFcf).toBe(
      baseline.multiples.target.evFcf as number,
    )
  })
})

describe("overrides — cascada parcial (override año 2 y año 4)", () => {
  const overridden = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: {
      projections: {
        2028: { ebitMargin: 0.4 },
        2030: { ebitMargin: 0.35 },
      },
    },
  })
  const baseline = buildBaseline()

  test("2027 mantiene ebitMargin histórico automático", () => {
    expect(overridden.projected[2027]?.incomeStatement.ebitMargin).toBe(
      baseline.projected[2027]?.incomeStatement.ebitMargin as number,
    )
  })

  test("2028 = 0.40 (override directo)", () => {
    expect(overridden.projected[2028]?.incomeStatement.ebitMargin).toBe(0.4)
  })

  test("2029 hereda 0.40 (cascada de 2028)", () => {
    expect(overridden.projected[2029]?.incomeStatement.ebitMargin).toBe(0.4)
  })

  test("2030 = 0.35 (override directo)", () => {
    expect(overridden.projected[2030]?.incomeStatement.ebitMargin).toBe(0.35)
  })

  test("2031 hereda 0.35 (cascada de 2030)", () => {
    expect(overridden.projected[2031]?.incomeStatement.ebitMargin).toBe(0.35)
  })
})

describe("overrides — múltiples campos simultáneos en distintos años", () => {
  const overridden = new CompanyValuation({
    ticker: TICKER,
    currentPrice: PRICE,
    financials: FINANCIALS,
    overrides: {
      projections: {
        2027: { salesGrowth: 0.25, ebitMargin: 0.4 },
        2028: { salesGrowth: 0.2 },
        2029: { salesGrowth: 0.15, ebitMargin: 0.35 },
        2030: { salesGrowth: 0.1 },
        2031: { salesGrowth: 0.08 },
      },
      targetMultiples: { per: 20, evEbitda: 12 },
    },
  })

  test("salesGrowth por año respeta cada override explícito", () => {
    expect(overridden.projected[2027]?.incomeStatement.salesYoYGrowth).toBe(
      0.25,
    )
    expect(overridden.projected[2028]?.incomeStatement.salesYoYGrowth).toBe(0.2)
    expect(overridden.projected[2029]?.incomeStatement.salesYoYGrowth).toBe(
      0.15,
    )
    expect(overridden.projected[2030]?.incomeStatement.salesYoYGrowth).toBe(0.1)
    expect(overridden.projected[2031]?.incomeStatement.salesYoYGrowth).toBe(
      0.08,
    )
  })

  test("ebitMargin cascadea entre años con/sin override", () => {
    expect(overridden.projected[2027]?.incomeStatement.ebitMargin).toBe(0.4)
    expect(overridden.projected[2028]?.incomeStatement.ebitMargin).toBe(0.4)
    expect(overridden.projected[2029]?.incomeStatement.ebitMargin).toBe(0.35)
    expect(overridden.projected[2030]?.incomeStatement.ebitMargin).toBe(0.35)
    expect(overridden.projected[2031]?.incomeStatement.ebitMargin).toBe(0.35)
  })

  test("targetMultiples.per y .evEbitda usan los overrides", () => {
    expect(overridden.multiples.target.per).toBe(20)
    expect(overridden.multiples.target.evEbitda).toBe(12)
  })
})

test("FIRST_PROJECTED matches NVDA fixture", () => {
  expect(FIRST_PROJECTED).toBe(PROJECTED_YEARS[0])
})
