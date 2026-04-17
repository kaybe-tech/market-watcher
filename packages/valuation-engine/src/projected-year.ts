import { HistoricalYear } from "./historical-year"
import type { ProjectionAssumptions } from "./projection-assumptions"

export interface ProjectedIncomeStatement {
  sales: number
  salesYoYGrowth: number
  ebitda: number
  ebitdaMargin: number
  ebitdaYoYGrowth: number
  depreciationAmortization: number
  ebit: number
  ebitMargin: number
  ebitYoYGrowth: number
  interestExpense: number
  interestIncome: number
  totalInterest: number
  earningsBeforeTaxes: number
  taxExpense: number
  taxRate: number
  consolidatedNetIncome: number
  minorityInterests: number | null
  netIncome: number
  netMargin: number
  netIncomeYoYGrowth: number
  fullyDilutedShares: number
  fullyDilutedSharesYoYGrowth: number
  eps: number
  epsYoYGrowth: number
}

export interface ProjectedFreeCashFlow {
  ebitda: number
  capexMaintenance: number
  totalInterest: number
  taxesPaid: number
  workingCapital: number
  changeInWorkingCapital: number
  otherAdjustments: number
  fcf: number
  fcfMargin: number
  fcfYoYGrowth: number
  fcfPerShare: number
  fcfPerShareYoYGrowth: number
  netChangeInCash: number
  capexMaintenanceSalesRatio: number
  workingCapitalSalesRatio: number
  fcfSalesRatio: number
  cashConversion: number | null
}

export interface ProjectedRoic {
  ebitAfterTax: number
  cashMktSec: number
  cashAndEquivalents: number
  marketableSecurities: number
  totalDebt: number
  shortTermDebt: number
  longTermDebt: number
  currentOperatingLeases: number
  nonCurrentOperatingLeases: number
  equity: number
  investedCapital: number
  roe: number | null
  roic: number | null
}

export interface ProjectedValuation {
  marketCap: number
  netDebt: number
  netDebtEbitdaRatio: number
  enterpriseValue: number
}

export interface ProjectedYearInputs {
  year: number
  currentPrice: number
  prev: HistoricalYear | ProjectedYear
  assumptions: ProjectionAssumptions
  historical: Record<number, HistoricalYear>
}

export class ProjectedYear {
  readonly year: number
  readonly incomeStatement: ProjectedIncomeStatement
  readonly freeCashFlow: ProjectedFreeCashFlow
  readonly roic: ProjectedRoic
  readonly valuation: ProjectedValuation

  constructor(inputs: ProjectedYearInputs) {
    const { year, currentPrice, prev, assumptions, historical } = inputs
    this.year = year

    const prevIs = prev.incomeStatement
    const prevFcf = prev.freeCashFlow
    const prevRoic = prev.roic
    const prevValuation = prev.valuation

    // Pasos 1-11: IS parcial (hasta EBITDA)
    const sales = ProjectedYear.computeSales(
      prevIs.sales,
      assumptions.incomeStatement.salesGrowth,
    )
    const salesYoYGrowth = assumptions.incomeStatement.salesGrowth
    const depreciationAmortization =
      ProjectedYear.computeDepreciationAmortization(
        prevIs.depreciationAmortization,
        assumptions.incomeStatement.salesGrowth,
      )
    const ebit = ProjectedYear.computeEbit(
      sales,
      assumptions.incomeStatement.ebitMargin,
    )
    const ebitda = ProjectedYear.computeEbitda(ebit, depreciationAmortization)
    const ebitdaMargin = ProjectedYear.computeEbitdaMargin(ebitda, sales)
    const ebitdaYoYGrowth = ProjectedYear.computeYoYGrowth(
      ebitda,
      prevIs.ebitda,
    )
    const ebitMargin = assumptions.incomeStatement.ebitMargin
    const ebitYoYGrowth = ProjectedYear.computeYoYGrowth(ebit, prevIs.ebit)
    const fullyDilutedShares = ProjectedYear.computeFullyDilutedShares(
      prevIs.fullyDilutedShares,
      assumptions.incomeStatement.shareGrowth,
    )
    const fullyDilutedSharesYoYGrowth = assumptions.incomeStatement.shareGrowth

    // Pasos 12-14: Valuation parcial (netDebt, netDebtEbitdaRatio, marketCap)
    const netDebt = ProjectedYear.computeNetDebt(
      assumptions.roic.netDebtEbitdaRatio,
      ebitda,
    )
    const netDebtEbitdaRatio = assumptions.roic.netDebtEbitdaRatio
    const marketCap = ProjectedYear.computeMarketCap(
      currentPrice,
      fullyDilutedShares,
    )

    // Pasos 15-20: ROIC parcial (descomposición de deuda)
    const cashMktSec = ProjectedYear.computeCashMktSec(
      prev,
      netDebt,
      sales,
      historical,
    )
    const cashAndEquivalents = ProjectedYear.computeCashAndEquivalents(
      prev,
      cashMktSec,
      sales,
    )
    const marketableSecurities = ProjectedYear.computeMarketableSecurities(
      prev,
      cashMktSec,
      sales,
    )
    const totalDebt = ProjectedYear.computeTotalDebt(
      prev,
      netDebt,
      cashMktSec,
      prevValuation.netDebt,
    )
    const shortTermDebt = ProjectedYear.computeDebtSplit(
      prevRoic.shortTermDebt,
      prevRoic.totalDebt,
      totalDebt,
    )
    const longTermDebt = ProjectedYear.computeDebtSplit(
      prevRoic.longTermDebt,
      prevRoic.totalDebt,
      totalDebt,
    )

    // Pasos 21-33: IS completo (interest en adelante)
    const interestExpense = ProjectedYear.computeInterestExpense(
      assumptions.incomeStatement.interestExpenseRate,
      shortTermDebt,
      longTermDebt,
    )
    const interestIncome = ProjectedYear.computeInterestIncome(
      assumptions.incomeStatement.interestIncomeRate,
      marketableSecurities,
    )
    const totalInterest = ProjectedYear.computeTotalInterest(
      interestExpense,
      interestIncome,
    )
    const earningsBeforeTaxes = ProjectedYear.computeEarningsBeforeTaxes(
      ebit,
      totalInterest,
    )
    const taxExpense = ProjectedYear.computeTaxExpense(
      earningsBeforeTaxes,
      assumptions.incomeStatement.taxRate,
    )
    const taxRate = assumptions.incomeStatement.taxRate
    const consolidatedNetIncome = ProjectedYear.computeConsolidatedNetIncome(
      earningsBeforeTaxes,
      taxExpense,
    )
    const minorityInterests = ProjectedYear.computeMinorityInterests(
      prevIs.minorityInterests,
      prevIs.consolidatedNetIncome,
      consolidatedNetIncome,
    )
    const netIncome = ProjectedYear.computeNetIncome(
      consolidatedNetIncome,
      minorityInterests,
    )
    const netMargin = ProjectedYear.computeNetMargin(netIncome, sales)
    const netIncomeYoYGrowth = ProjectedYear.computeYoYGrowth(
      netIncome,
      prevIs.netIncome,
    )
    const eps = ProjectedYear.computeEps(netIncome, fullyDilutedShares)
    const epsYoYGrowth = ProjectedYear.computeYoYGrowth(eps, prevIs.eps)

    this.incomeStatement = {
      sales,
      salesYoYGrowth,
      ebitda,
      ebitdaMargin,
      ebitdaYoYGrowth,
      depreciationAmortization,
      ebit,
      ebitMargin,
      ebitYoYGrowth,
      interestExpense,
      interestIncome,
      totalInterest,
      earningsBeforeTaxes,
      taxExpense,
      taxRate,
      consolidatedNetIncome,
      minorityInterests,
      netIncome,
      netMargin,
      netIncomeYoYGrowth,
      fullyDilutedShares,
      fullyDilutedSharesYoYGrowth,
      eps,
      epsYoYGrowth,
    }

    // Pasos 34-49: FreeCashFlow (sin netChangeInCash)
    const fcfEbitda = ebitda
    const capexMaintenance = ProjectedYear.computeCapexMaintenance(
      assumptions.freeCashFlow.capexMaintenanceSalesRatio,
      sales,
    )
    const fcfTotalInterest = totalInterest
    const taxesPaid = taxExpense
    const changeInWorkingCapital = ProjectedYear.computeChangeInWorkingCapital(
      prev,
      assumptions.freeCashFlow.cwcSalesRatio,
      sales,
    )
    const workingCapital = ProjectedYear.computeWorkingCapital(
      prevFcf.workingCapital,
      changeInWorkingCapital,
    )
    const otherAdjustments =
      ProjectedYear.computeOtherAdjustments(minorityInterests)
    const fcf = ProjectedYear.computeFcf(
      fcfEbitda,
      capexMaintenance,
      fcfTotalInterest,
      taxesPaid,
      changeInWorkingCapital,
      otherAdjustments,
    )
    const fcfMargin = ProjectedYear.computeFcfMargin(fcf, sales)
    const fcfYoYGrowth = ProjectedYear.computeYoYGrowth(fcf, prevFcf.fcf)
    const fcfPerShare = ProjectedYear.computeFcfPerShare(
      fcf,
      fullyDilutedShares,
    )
    const fcfPerShareYoYGrowth = ProjectedYear.computeYoYGrowth(
      fcfPerShare,
      prevFcf.fcfPerShare,
    )
    const capexMaintenanceSalesRatio =
      ProjectedYear.computeCapexMaintenanceSalesRatio(capexMaintenance, sales)
    const workingCapitalSalesRatio =
      ProjectedYear.computeWorkingCapitalSalesRatio(workingCapital, sales)
    const fcfSalesRatio = ProjectedYear.computeFcfSalesRatio(fcf, sales)
    const cashConversion = ProjectedYear.computeCashConversion(fcf, fcfEbitda)

    // Pasos 50-56: ROIC completo (equity y ratios)
    const ebitAfterTax = ProjectedYear.computeEbitAfterTax(ebit, taxRate)
    const currentOperatingLeases = ProjectedYear.computeCurrentOperatingLeases(
      prevRoic.currentOperatingLeases,
      assumptions.incomeStatement.salesGrowth,
    )
    const nonCurrentOperatingLeases =
      ProjectedYear.computeNonCurrentOperatingLeases(
        prevRoic.nonCurrentOperatingLeases,
        assumptions.incomeStatement.salesGrowth,
      )
    const equity = ProjectedYear.computeEquity(
      prevRoic.equity,
      netIncome,
      assumptions.incomeStatement.shareGrowth,
      marketCap,
      historical,
      fcf,
    )
    const investedCapital = ProjectedYear.computeInvestedCapital(
      equity,
      shortTermDebt,
      longTermDebt,
      currentOperatingLeases,
      nonCurrentOperatingLeases,
      marketableSecurities,
    )
    const roe = ProjectedYear.computeRoe(netIncome, equity)
    const roicRatio = ProjectedYear.computeRoic(ebitAfterTax, investedCapital)

    this.roic = {
      ebitAfterTax,
      cashMktSec,
      cashAndEquivalents,
      marketableSecurities,
      totalDebt,
      shortTermDebt,
      longTermDebt,
      currentOperatingLeases,
      nonCurrentOperatingLeases,
      equity,
      investedCapital,
      roe,
      roic: roicRatio,
    }

    // Paso 57: Valuation completo (enterpriseValue)
    const enterpriseValue = ProjectedYear.computeEnterpriseValue(
      marketCap,
      netDebt,
    )
    this.valuation = { marketCap, netDebt, netDebtEbitdaRatio, enterpriseValue }

    // Paso 58: FreeCashFlow.netChangeInCash
    const netChangeInCash = ProjectedYear.computeNetChangeInCash(
      netDebt,
      prevValuation.netDebt,
    )

    this.freeCashFlow = {
      ebitda: fcfEbitda,
      capexMaintenance,
      totalInterest: fcfTotalInterest,
      taxesPaid,
      workingCapital,
      changeInWorkingCapital,
      otherAdjustments,
      fcf,
      fcfMargin,
      fcfYoYGrowth,
      fcfPerShare,
      fcfPerShareYoYGrowth,
      netChangeInCash,
      capexMaintenanceSalesRatio,
      workingCapitalSalesRatio,
      fcfSalesRatio,
      cashConversion,
    }
  }

  private static computeSales(prevSales: number, salesGrowth: number): number {
    return prevSales * (1 + salesGrowth)
  }

  private static computeDepreciationAmortization(
    prevDepreciation: number,
    salesGrowth: number,
  ): number {
    return prevDepreciation * (1 + salesGrowth)
  }

  private static computeEbit(sales: number, ebitMargin: number): number {
    return sales * ebitMargin
  }

  private static computeEbitda(
    ebit: number,
    depreciationAmortization: number,
  ): number {
    return ebit - depreciationAmortization
  }

  private static computeEbitdaMargin(ebitda: number, sales: number): number {
    return ebitda / sales
  }

  private static computeYoYGrowth(current: number, prev: number): number {
    return (current - prev) / prev
  }

  private static computeFullyDilutedShares(
    prevShares: number,
    shareGrowth: number,
  ): number {
    return prevShares * (1 + shareGrowth)
  }

  private static computeNetDebt(
    netDebtEbitdaRatio: number,
    ebitda: number,
  ): number {
    return netDebtEbitdaRatio * ebitda
  }

  private static computeMarketCap(
    currentPrice: number,
    fullyDilutedShares: number,
  ): number {
    return currentPrice * fullyDilutedShares
  }

  private static computeCashMktSec(
    prev: HistoricalYear | ProjectedYear,
    netDebt: number,
    sales: number,
    historical: Record<number, HistoricalYear>,
  ): number {
    if (prev instanceof HistoricalYear) {
      if (netDebt > 0) {
        const ratios = Object.values(historical).map((hy) => {
          const cash = hy.roic.cashAndEquivalents + hy.roic.marketableSecurities
          return cash / hy.incomeStatement.sales
        })
        return Math.min(...ratios) * sales
      }
      const prevCash =
        prev.roic.cashAndEquivalents + prev.roic.marketableSecurities
      return (prevCash / Math.abs(prev.valuation.netDebt)) * Math.abs(netDebt)
    }
    return (
      (prev.roic.cashMktSec / Math.abs(prev.valuation.netDebt)) *
      Math.abs(netDebt)
    )
  }

  private static computeCashAndEquivalents(
    prev: HistoricalYear | ProjectedYear,
    cashMktSec: number,
    sales: number,
  ): number {
    if (prev instanceof HistoricalYear) {
      const prevCash =
        prev.roic.cashAndEquivalents + prev.roic.marketableSecurities
      return (prev.roic.cashAndEquivalents / prevCash) * cashMktSec
    }
    return (prev.roic.cashAndEquivalents / prev.incomeStatement.sales) * sales
  }

  private static computeMarketableSecurities(
    prev: HistoricalYear | ProjectedYear,
    cashMktSec: number,
    sales: number,
  ): number {
    if (prev instanceof HistoricalYear) {
      const prevCash =
        prev.roic.cashAndEquivalents + prev.roic.marketableSecurities
      return (prev.roic.marketableSecurities / prevCash) * cashMktSec
    }
    return (prev.roic.marketableSecurities / prev.incomeStatement.sales) * sales
  }

  private static computeTotalDebt(
    prev: HistoricalYear | ProjectedYear,
    netDebt: number,
    cashMktSec: number,
    prevNetDebt: number,
  ): number {
    if (prev instanceof HistoricalYear) {
      if (netDebt > 0) return netDebt + cashMktSec
      return (prev.roic.totalDebt / Math.abs(prevNetDebt)) * Math.abs(netDebt)
    }
    return (prev.roic.totalDebt / Math.abs(prevNetDebt)) * Math.abs(netDebt)
  }

  private static computeDebtSplit(
    prevPart: number,
    prevTotalDebt: number,
    totalDebt: number,
  ): number {
    return (prevPart / prevTotalDebt) * totalDebt
  }

  private static computeInterestExpense(
    interestExpenseRate: number,
    shortTermDebt: number,
    longTermDebt: number,
  ): number {
    return -(interestExpenseRate * (shortTermDebt + longTermDebt))
  }

  private static computeInterestIncome(
    interestIncomeRate: number,
    marketableSecurities: number,
  ): number {
    return interestIncomeRate * marketableSecurities
  }

  private static computeTotalInterest(
    interestExpense: number,
    interestIncome: number,
  ): number {
    return interestExpense + interestIncome
  }

  private static computeEarningsBeforeTaxes(
    ebit: number,
    totalInterest: number,
  ): number {
    return ebit + totalInterest
  }

  private static computeTaxExpense(
    earningsBeforeTaxes: number,
    taxRate: number,
  ): number {
    return -earningsBeforeTaxes * taxRate
  }

  private static computeConsolidatedNetIncome(
    earningsBeforeTaxes: number,
    taxExpense: number,
  ): number {
    return earningsBeforeTaxes + taxExpense
  }

  private static computeMinorityInterests(
    prevMinorityInterests: number | null,
    prevConsolidatedNetIncome: number,
    consolidatedNetIncome: number,
  ): number | null {
    if (prevConsolidatedNetIncome === 0) return null
    const prevMi = prevMinorityInterests ?? 0
    return (prevMi / prevConsolidatedNetIncome) * consolidatedNetIncome
  }

  private static computeNetIncome(
    consolidatedNetIncome: number,
    minorityInterests: number | null,
  ): number {
    return consolidatedNetIncome + (minorityInterests ?? 0)
  }

  private static computeNetMargin(netIncome: number, sales: number): number {
    return netIncome / sales
  }

  private static computeEps(
    netIncome: number,
    fullyDilutedShares: number,
  ): number {
    return netIncome / fullyDilutedShares
  }

  private static computeCapexMaintenance(
    capexMaintenanceSalesRatio: number,
    sales: number,
  ): number {
    return -capexMaintenanceSalesRatio * sales
  }

  private static computeChangeInWorkingCapital(
    prev: HistoricalYear | ProjectedYear,
    cwcSalesRatio: number,
    sales: number,
  ): number {
    if (prev instanceof HistoricalYear) {
      return cwcSalesRatio * sales
    }
    return (
      (prev.freeCashFlow.changeInWorkingCapital / prev.incomeStatement.sales) *
      sales
    )
  }

  private static computeWorkingCapital(
    prevWorkingCapital: number,
    changeInWorkingCapital: number,
  ): number {
    return prevWorkingCapital + changeInWorkingCapital
  }

  private static computeOtherAdjustments(
    minorityInterests: number | null,
  ): number {
    return minorityInterests ?? 0
  }

  private static computeFcf(
    ebitda: number,
    capexMaintenance: number,
    totalInterest: number,
    taxesPaid: number,
    changeInWorkingCapital: number,
    otherAdjustments: number,
  ): number {
    return (
      ebitda +
      capexMaintenance +
      totalInterest +
      taxesPaid -
      changeInWorkingCapital +
      otherAdjustments
    )
  }

  private static computeFcfMargin(fcf: number, sales: number): number {
    return fcf / sales
  }

  private static computeFcfPerShare(
    fcf: number,
    fullyDilutedShares: number,
  ): number {
    return fcf / fullyDilutedShares
  }

  private static computeCapexMaintenanceSalesRatio(
    capexMaintenance: number,
    sales: number,
  ): number {
    return Math.abs(capexMaintenance) / sales
  }

  private static computeWorkingCapitalSalesRatio(
    workingCapital: number,
    sales: number,
  ): number {
    return workingCapital / sales
  }

  private static computeFcfSalesRatio(fcf: number, sales: number): number {
    return fcf / sales
  }

  private static computeCashConversion(
    fcf: number,
    ebitda: number,
  ): number | null {
    if (ebitda === 0) return null
    return fcf / ebitda
  }

  private static computeEbitAfterTax(ebit: number, taxRate: number): number {
    return ebit * (1 - taxRate)
  }

  private static computeCurrentOperatingLeases(
    prevCurrentOperatingLeases: number,
    salesGrowth: number,
  ): number {
    return prevCurrentOperatingLeases * (1 + salesGrowth)
  }

  private static computeNonCurrentOperatingLeases(
    prevNonCurrentOperatingLeases: number,
    salesGrowth: number,
  ): number {
    return prevNonCurrentOperatingLeases * (1 + salesGrowth)
  }

  private static computeEquity(
    prevEquity: number,
    netIncome: number,
    shareGrowth: number,
    marketCap: number,
    historical: Record<number, HistoricalYear>,
    fcf: number,
  ): number {
    const avgDividendsFcfRatio =
      ProjectedYear.averageLastTwoDividendsFcfRatio(historical)
    return (
      prevEquity +
      netIncome +
      shareGrowth * marketCap -
      avgDividendsFcfRatio * fcf
    )
  }

  private static averageLastTwoDividendsFcfRatio(
    historical: Record<number, HistoricalYear>,
  ): number {
    const sortedYears = Object.keys(historical)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
    const lastTwo = sortedYears.slice(-2)
    const ratios: number[] = []
    for (const y of lastTwo) {
      const hy = historical[y]
      if (!hy) continue
      const ratio = hy.freeCashFlow.dividendsFcfRatio
      if (ratio !== null) ratios.push(ratio)
    }
    if (ratios.length === 0) return 0
    let sum = 0
    for (const r of ratios) sum += r
    return sum / ratios.length
  }

  private static computeInvestedCapital(
    equity: number,
    shortTermDebt: number,
    longTermDebt: number,
    currentOperatingLeases: number,
    nonCurrentOperatingLeases: number,
    marketableSecurities: number,
  ): number {
    return (
      equity +
      shortTermDebt +
      longTermDebt +
      currentOperatingLeases +
      nonCurrentOperatingLeases -
      marketableSecurities
    )
  }

  private static computeRoe(netIncome: number, equity: number): number | null {
    if (equity === 0) return null
    return netIncome / equity
  }

  private static computeRoic(
    ebitAfterTax: number,
    investedCapital: number,
  ): number | null {
    if (investedCapital === 0) return null
    return ebitAfterTax / investedCapital
  }

  private static computeEnterpriseValue(
    marketCap: number,
    netDebt: number,
  ): number {
    return marketCap + netDebt
  }

  private static computeNetChangeInCash(
    netDebt: number,
    prevNetDebt: number,
  ): number {
    if (netDebt > 0) return netDebt - prevNetDebt
    return prevNetDebt - netDebt
  }
}
