import type { HistoricalYear } from "./historical-year"
import type { ValuationOverrides } from "./overrides"

export interface IncomeStatementAssumptions {
  salesGrowth: number
  ebitMargin: number
  taxRate: number
  shareGrowth: number
  interestExpenseRate: number
  interestIncomeRate: number
}

export interface FreeCashFlowAssumptions {
  capexMaintenanceSalesRatio: number
  cwcSalesRatio: number
}

export interface RoicAssumptions {
  netDebtEbitdaRatio: number
}

export interface ResolvedYearAssumptions {
  incomeStatement: IncomeStatementAssumptions
  freeCashFlow: FreeCashFlowAssumptions
  roic: RoicAssumptions
  changeInWorkingCapitalOverride: number | null
}

export interface ProjectionAssumptionsInputs {
  historical: Record<number, HistoricalYear>
  overrides?: ValuationOverrides
}

export class ProjectionAssumptions {
  readonly incomeStatement: IncomeStatementAssumptions
  readonly freeCashFlow: FreeCashFlowAssumptions
  readonly roic: RoicAssumptions

  private readonly firstProjectedYear: number
  private readonly overrides: ValuationOverrides | undefined
  private readonly resolvedCache = new Map<number, ResolvedYearAssumptions>()

  constructor(inputs: ProjectionAssumptionsInputs) {
    const years = ProjectionAssumptions.sortedYears(inputs.historical)
    if (years.length === 0) {
      throw new Error("ProjectionAssumptions requires at least one year")
    }

    this.overrides = inputs.overrides
    const last = years[years.length - 1] as HistoricalYear
    this.firstProjectedYear = last.year + 1

    this.incomeStatement = ProjectionAssumptions.buildIncomeStatement(years)
    this.freeCashFlow = ProjectionAssumptions.buildFreeCashFlow(
      years,
      this.incomeStatement.salesGrowth,
    )
    this.roic = ProjectionAssumptions.buildRoic(years)
  }

  forYear(year: number): ResolvedYearAssumptions {
    const cached = this.resolvedCache.get(year)
    if (cached) return cached

    const yearOverride = this.overrides?.projections?.[year]

    let prevIncomeStatement: IncomeStatementAssumptions
    let prevFreeCashFlow: FreeCashFlowAssumptions
    let prevRoic: RoicAssumptions

    if (year <= this.firstProjectedYear) {
      prevIncomeStatement = this.incomeStatement
      prevFreeCashFlow = this.freeCashFlow
      prevRoic = this.roic
    } else {
      const prev = this.forYear(year - 1)
      prevIncomeStatement = prev.incomeStatement
      prevFreeCashFlow = prev.freeCashFlow
      prevRoic = prev.roic
    }

    const resolved: ResolvedYearAssumptions = {
      incomeStatement: {
        salesGrowth:
          yearOverride?.salesGrowth ?? prevIncomeStatement.salesGrowth,
        ebitMargin: yearOverride?.ebitMargin ?? prevIncomeStatement.ebitMargin,
        taxRate: yearOverride?.taxRate ?? prevIncomeStatement.taxRate,
        shareGrowth:
          yearOverride?.shareGrowth ?? prevIncomeStatement.shareGrowth,
        interestExpenseRate: prevIncomeStatement.interestExpenseRate,
        interestIncomeRate: prevIncomeStatement.interestIncomeRate,
      },
      freeCashFlow: {
        capexMaintenanceSalesRatio:
          yearOverride?.capexMaintenanceSalesRatio ??
          prevFreeCashFlow.capexMaintenanceSalesRatio,
        cwcSalesRatio: prevFreeCashFlow.cwcSalesRatio,
      },
      roic: {
        netDebtEbitdaRatio:
          yearOverride?.netDebtEbitdaRatio ?? prevRoic.netDebtEbitdaRatio,
      },
      changeInWorkingCapitalOverride:
        yearOverride?.changeInWorkingCapital ?? null,
    }

    this.resolvedCache.set(year, resolved)
    return resolved
  }

  private static sortedYears(
    historical: Record<number, HistoricalYear>,
  ): HistoricalYear[] {
    return Object.keys(historical)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
      .map((y) => {
        const hy = historical[y]
        if (hy === undefined) throw new Error(`Missing historical year ${y}`)
        return hy
      })
  }

  private static buildIncomeStatement(
    years: HistoricalYear[],
  ): IncomeStatementAssumptions {
    const salesGrowth = ProjectionAssumptions.computeSalesGrowth(years)
    const ebitMargin = ProjectionAssumptions.computeEbitMargin(years)
    const taxRate = ProjectionAssumptions.computeTaxRate(years)
    const shareGrowth = ProjectionAssumptions.computeShareGrowth(years)
    const interestExpenseRate =
      ProjectionAssumptions.computeInterestExpenseRate(years)
    const interestIncomeRate =
      ProjectionAssumptions.computeInterestIncomeRate(years)

    return {
      salesGrowth,
      ebitMargin,
      taxRate,
      shareGrowth,
      interestExpenseRate,
      interestIncomeRate,
    }
  }

  private static buildFreeCashFlow(
    years: HistoricalYear[],
    salesGrowth: number,
  ): FreeCashFlowAssumptions {
    const last = years[years.length - 1] as HistoricalYear
    const capexMaintenanceSalesRatio =
      ProjectionAssumptions.computeCapexMaintenanceSalesRatio(last, salesGrowth)
    const cwcSalesRatio = ProjectionAssumptions.computeCwcSalesRatio(years)

    return { capexMaintenanceSalesRatio, cwcSalesRatio }
  }

  private static buildRoic(years: HistoricalYear[]): RoicAssumptions {
    const netDebtEbitdaRatio =
      ProjectionAssumptions.computeNetDebtEbitdaRatio(years)
    return { netDebtEbitdaRatio }
  }

  private static computeSalesGrowth(years: HistoricalYear[]): number {
    return ProjectionAssumptions.averageNonNull(
      years,
      (y) => y.incomeStatement.salesYoYGrowth,
    )
  }

  private static computeEbitMargin(years: HistoricalYear[]): number {
    return ProjectionAssumptions.average(
      years.map((y) => y.incomeStatement.ebitMargin),
    )
  }

  private static computeTaxRate(years: HistoricalYear[]): number {
    return ProjectionAssumptions.average(
      years.map((y) => y.incomeStatement.taxRate),
    )
  }

  private static computeShareGrowth(years: HistoricalYear[]): number {
    return ProjectionAssumptions.averageNonNull(
      years,
      (y) => y.incomeStatement.fullyDilutedSharesYoYGrowth,
    )
  }

  private static computeInterestExpenseRate(years: HistoricalYear[]): number {
    const sumInterestExpense = ProjectionAssumptions.sum(
      years.map((y) => y.incomeStatement.interestExpense),
    )
    const sumDebt = ProjectionAssumptions.sum(
      years.map((y) => y.roic.shortTermDebt + y.roic.longTermDebt),
    )
    if (sumDebt === 0) return 0
    return Math.abs(sumInterestExpense) / sumDebt
  }

  private static computeInterestIncomeRate(years: HistoricalYear[]): number {
    const sumInterestIncome = ProjectionAssumptions.sum(
      years.map((y) => y.incomeStatement.interestIncome),
    )
    const sumCashMktSec = ProjectionAssumptions.sum(
      years.map((y) => y.roic.cashAndEquivalents + y.roic.marketableSecurities),
    )
    if (sumCashMktSec === 0) return 0
    return sumInterestIncome / sumCashMktSec
  }

  private static computeCapexMaintenanceSalesRatio(
    last: HistoricalYear,
    salesGrowth: number,
  ): number {
    const growthFactor = 1 + salesGrowth
    return (
      Math.abs(last.freeCashFlow.capexMaintenance * growthFactor) /
      (last.incomeStatement.sales * growthFactor)
    )
  }

  private static computeCwcSalesRatio(years: HistoricalYear[]): number {
    const cwcValues: number[] = []
    const salesValues: number[] = []
    for (const y of years) {
      const cwc = y.freeCashFlow.changeInWorkingCapital
      if (cwc === null) continue
      cwcValues.push(cwc)
      salesValues.push(y.incomeStatement.sales)
    }
    return (
      ProjectionAssumptions.sum(cwcValues) /
      ProjectionAssumptions.sum(salesValues)
    )
  }

  private static computeNetDebtEbitdaRatio(years: HistoricalYear[]): number {
    return ProjectionAssumptions.averageNonNull(
      years,
      (y) => y.valuation.netDebtEbitdaRatio,
    )
  }

  private static sum(values: number[]): number {
    let total = 0
    for (const v of values) total += v
    return total
  }

  private static average(values: number[]): number {
    return ProjectionAssumptions.sum(values) / values.length
  }

  private static averageNonNull(
    years: HistoricalYear[],
    selector: (y: HistoricalYear) => number | null,
  ): number {
    const values = years.map(selector).filter((v): v is number => v !== null)
    return ProjectionAssumptions.average(values)
  }
}
