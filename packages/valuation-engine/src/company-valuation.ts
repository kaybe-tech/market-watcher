import {
  type FreeCashFlowInputs,
  HistoricalYear,
  type IncomeStatementInputs,
  type RoicInputs,
} from "./historical-year"
import { IntrinsicValue } from "./intrinsic-value"
import { Multiples } from "./multiples"
import type { ValuationOverrides } from "./overrides"
import { ProjectedYear } from "./projected-year"
import { ProjectionAssumptions } from "./projection-assumptions"

const HEADER_LINE = "═".repeat(62)
const SECTION_LINE = "─".repeat(62)
const LABEL_WIDTH = 14
const COL_WIDTH = 10
const INDENT = "  "

export interface PrintValuationReportOptions {
  write?: (output: string) => void
}

export interface CompanyYearFinancials {
  incomeStatement: IncomeStatementInputs
  freeCashFlow: FreeCashFlowInputs
  roic: RoicInputs
}

export interface CompanyValuationInputs {
  ticker: string
  name?: string
  currentPrice: number
  financials: Record<number, CompanyYearFinancials>
  overrides?: ValuationOverrides
}

const PROJECTION_HORIZON = 5

export class CompanyValuation {
  readonly ticker: string
  readonly name: string | null
  readonly currentPrice: number
  readonly historical: Record<number, HistoricalYear>
  readonly assumptions: ProjectionAssumptions
  readonly projected: Record<number, ProjectedYear>
  readonly multiples: Multiples
  readonly intrinsicValue: IntrinsicValue

  constructor(inputs: CompanyValuationInputs) {
    const { ticker, name, currentPrice, financials, overrides } = inputs
    if (currentPrice <= 0) {
      throw new Error("CompanyValuation requires currentPrice > 0")
    }
    this.ticker = ticker
    this.name = name ?? null
    this.currentPrice = currentPrice

    this.historical = CompanyValuation.buildHistorical(financials, currentPrice)
    this.assumptions = new ProjectionAssumptions({
      historical: this.historical,
      overrides,
    })

    const lastHistoricalYear = CompanyValuation.maxYear(this.historical)
    const lastHistorical = this.historical[lastHistoricalYear] as HistoricalYear

    this.projected = CompanyValuation.buildProjected(
      lastHistorical,
      this.assumptions,
      this.historical,
      currentPrice,
      PROJECTION_HORIZON,
    )

    const firstProjectedYear = lastHistoricalYear + 1
    const firstProjected = this.projected[firstProjectedYear] as ProjectedYear

    this.multiples = new Multiples({
      currentPrice,
      lastHistYear: lastHistorical,
      firstProjYear: firstProjected,
      targetOverrides: overrides?.targetMultiples,
    })

    this.intrinsicValue = new IntrinsicValue({
      currentPrice,
      projected: this.projected,
      multiples: this.multiples,
    })
  }

  printValuationReport(options: PrintValuationReportOptions = {}): string {
    const output = this.buildReport()
    const write = options.write ?? ((s: string) => console.log(s))
    write(output)
    return output
  }

  private buildReport(): string {
    const lines: string[] = []
    lines.push(...this.buildHeader())
    lines.push("")
    lines.push(...this.buildMultiplesSection())
    lines.push("")
    lines.push(...this.buildTargetPriceSection())
    lines.push("")
    lines.push(...this.buildMarginOfSafetySection())
    lines.push("")
    lines.push(...this.buildCagrSection())
    lines.push("")
    lines.push(...this.buildBuyPriceSection())
    lines.push("")
    lines.push(HEADER_LINE)
    return lines.join("\n")
  }

  private buildHeader(): string[] {
    const title = this.name ? `${this.ticker} — ${this.name}` : this.ticker
    return [
      HEADER_LINE,
      `${INDENT}${title}`,
      `${INDENT}Precio actual: ${formatPrice(this.currentPrice)}`,
      HEADER_LINE,
    ]
  }

  private buildMultiplesSection(): string[] {
    const { ltm, ntm, target } = this.multiples
    const header =
      `${INDENT}${padLabel("")}` +
      padRight("LTM") +
      padRight("NTM") +
      padRight("Objetivo")
    const rows: Array<[string, keyof typeof ltm]> = [
      ["PER", "per"],
      ["EV/FCF", "evFcf"],
      ["EV/EBITDA", "evEbitda"],
      ["EV/EBIT", "evEbit"],
    ]
    const body = rows.map(([label, key]) => {
      return (
        `${INDENT}${padLabel(label)}` +
        padRight(formatMultiple(ltm[key])) +
        padRight(formatMultiple(ntm[key])) +
        padRight(formatMultiple(target[key]))
      )
    })
    return [`${INDENT}Múltiplos`, `${INDENT}${SECTION_LINE}`, header, ...body]
  }

  private buildTargetPriceSection(): string[] {
    const years = this.projectedYearsSorted()
    const header = `${INDENT}${padLabel("")}${years.map((y) => padRight(`${y}e`)).join("")}`
    const rows: Array<
      [string, keyof (typeof this.intrinsicValue.targetPrice)[number]]
    > = [
      ["PER", "per"],
      ["EV/FCF", "evFcf"],
      ["EV/EBITDA", "evEbitda"],
      ["EV/EBIT", "evEbit"],
      ["Promedio", "average"],
    ]
    const body = rows.map(([label, key]) => {
      const cells = years
        .map((y) => {
          const tp = this.intrinsicValue.targetPrice[y]
          return padRight(formatPrice(tp ? tp[key] : null))
        })
        .join("")
      return `${INDENT}${padLabel(label)}${cells}`
    })
    return [
      `${INDENT}Precio objetivo`,
      `${INDENT}${SECTION_LINE}`,
      header,
      ...body,
    ]
  }

  private buildMarginOfSafetySection(): string[] {
    const years = this.projectedYearsSorted()
    const header = `${INDENT}${padLabel("")}${years.map((y) => padRight(`${y}e`)).join("")}`
    const cells = years
      .map((y) => {
        const tp = this.intrinsicValue.targetPrice[y]
        return padRight(formatPercentSigned(tp ? tp.marginOfSafety : null))
      })
      .join("")
    const row = `${INDENT}${padLabel("")}${cells}`
    return [
      `${INDENT}Margen de seguridad (EV/FCF)`,
      `${INDENT}${SECTION_LINE}`,
      header,
      row,
    ]
  }

  private buildCagrSection(): string[] {
    const cagr = this.intrinsicValue.cagr5y
    const rows: Array<[string, keyof typeof cagr]> = [
      ["PER", "per"],
      ["EV/FCF", "evFcf"],
      ["EV/EBITDA", "evEbitda"],
      ["EV/EBIT", "evEbit"],
      ["Promedio", "average"],
    ]
    const body = rows.map(
      ([label, key]) =>
        `${INDENT}${padLabel(label)}${padRight(formatPercent(cagr[key]))}`,
    )
    return [`${INDENT}CAGR 5 años`, `${INDENT}${SECTION_LINE}`, ...body]
  }

  private buildBuyPriceSection(): string[] {
    const { price, differenceVsCurrent } = this.intrinsicValue.buyPrice
    const summary =
      price === null
        ? "—"
        : `${formatPrice(price)} (${formatPercentSigned(differenceVsCurrent)} vs precio actual)`
    return [
      `${INDENT}Precio de compra (15% retorno)`,
      `${INDENT}${SECTION_LINE}`,
      `${INDENT}${summary}`,
    ]
  }

  private projectedYearsSorted(): number[] {
    return Object.keys(this.projected)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
  }

  private static buildHistorical(
    financials: Record<number, CompanyYearFinancials>,
    currentPrice: number,
  ): Record<number, HistoricalYear> {
    const years = Object.keys(financials)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
    if (years.length === 0) {
      throw new Error("CompanyValuation requires at least one historical year")
    }
    const lastYear = years[years.length - 1] as number

    const built: Record<number, HistoricalYear> = {}
    let prev: HistoricalYear | null = null
    for (const year of years) {
      const data = financials[year]
      if (!data) throw new Error(`missing financials for year ${year}`)
      const hy: HistoricalYear = new HistoricalYear({
        year,
        currentPrice: year === lastYear ? currentPrice : null,
        incomeStatement: data.incomeStatement,
        freeCashFlow: data.freeCashFlow,
        roic: data.roic,
        prev,
      })
      built[year] = hy
      prev = hy
    }
    return built
  }

  private static buildProjected(
    lastHistorical: HistoricalYear,
    assumptions: ProjectionAssumptions,
    historical: Record<number, HistoricalYear>,
    currentPrice: number,
    horizon: number,
  ): Record<number, ProjectedYear> {
    const projected: Record<number, ProjectedYear> = {}
    let prev: HistoricalYear | ProjectedYear = lastHistorical
    const firstYear = lastHistorical.year + 1
    for (let i = 0; i < horizon; i++) {
      const year = firstYear + i
      const py: ProjectedYear = new ProjectedYear({
        year,
        currentPrice,
        prev,
        assumptions,
        historical,
      })
      projected[year] = py
      prev = py
    }
    return projected
  }

  private static maxYear(years: Record<number, unknown>): number {
    return Math.max(...Object.keys(years).map((y) => Number.parseInt(y, 10)))
  }
}

function padLabel(text: string): string {
  return text.padEnd(LABEL_WIDTH, " ")
}

function padRight(text: string): string {
  return text.padStart(COL_WIDTH, " ")
}

function formatMultiple(value: number | null): string {
  if (value === null) return "—"
  return value.toFixed(2)
}

function formatPrice(value: number | null): string {
  if (value === null) return "—"
  return `$${value.toFixed(2)}`
}

function formatPercent(value: number | null): string {
  if (value === null) return "—"
  return `${(value * 100).toFixed(1)}%`
}

function formatPercentSigned(value: number | null): string {
  if (value === null) return "—"
  const pct = value * 100
  const sign = pct >= 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}
