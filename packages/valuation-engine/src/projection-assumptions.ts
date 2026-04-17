import type { HistoricalYear } from "./historical-year"

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

export interface ProjectionAssumptionsInputs {
  historical: Record<number, HistoricalYear>
}

export class ProjectionAssumptions {
  readonly incomeStatement: IncomeStatementAssumptions
  readonly freeCashFlow: FreeCashFlowAssumptions
  readonly roic: RoicAssumptions

  constructor(inputs: ProjectionAssumptionsInputs) {
    const years = ProjectionAssumptions.sortedYears(inputs.historical)
    if (years.length === 0) {
      throw new Error("ProjectionAssumptions requires at least one year")
    }

    this.incomeStatement = ProjectionAssumptions.buildIncomeStatement(years)
    this.freeCashFlow = ProjectionAssumptions.buildFreeCashFlow(
      years,
      this.incomeStatement.salesGrowth,
    )
    this.roic = ProjectionAssumptions.buildRoic(years)
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
    return Math.abs(sumInterestExpense) / sumDebt
  }

  private static computeInterestIncomeRate(years: HistoricalYear[]): number {
    const sumInterestIncome = ProjectionAssumptions.sum(
      years.map((y) => y.incomeStatement.interestIncome),
    )
    const sumMarketableSecurities = ProjectionAssumptions.sum(
      years.map((y) => y.roic.marketableSecurities),
    )
    return sumInterestIncome / sumMarketableSecurities
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
