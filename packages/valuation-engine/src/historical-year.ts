export interface IncomeStatementInputs {
  sales: number
  depreciationAmortization: number
  ebit: number
  interestExpense: number
  interestIncome: number
  taxExpense: number
  minorityInterests: number
  fullyDilutedShares: number
}

export interface FreeCashFlowInputs {
  capexMaintenance: number
  inventories: number
  accountsReceivable: number
  accountsPayable: number
  unearnedRevenue: number
  dividendsPaid: number
}

export interface RoicInputs {
  cashAndEquivalents: number
  marketableSecurities: number
  shortTermDebt: number
  longTermDebt: number
  currentOperatingLeases: number
  nonCurrentOperatingLeases: number
  equity: number
}

export interface HistoricalYearInputs {
  year: number
  currentPrice: number | null
  incomeStatement: IncomeStatementInputs
  freeCashFlow: FreeCashFlowInputs
  roic: RoicInputs
  prev?: HistoricalYear | null
}

export interface IncomeStatement {
  sales: number
  salesYoYGrowth: number | null
  ebitda: number
  ebitdaMargin: number
  ebitdaYoYGrowth: number | null
  depreciationAmortization: number
  ebit: number
  ebitMargin: number
  ebitYoYGrowth: number | null
  interestExpense: number
  interestIncome: number
  totalInterest: number
  earningsBeforeTaxes: number
  taxExpense: number
  taxRate: number
  consolidatedNetIncome: number
  minorityInterests: number
  netIncome: number
  netMargin: number
  netIncomeYoYGrowth: number | null
  fullyDilutedShares: number
  fullyDilutedSharesYoYGrowth: number | null
  eps: number
  epsYoYGrowth: number | null
}

export interface FreeCashFlow {
  ebitda: number
  capexMaintenance: number
  totalInterest: number
  taxesPaid: number
  inventories: number
  accountsReceivable: number
  accountsPayable: number
  unearnedRevenue: number
  workingCapital: number
  changeInWorkingCapital: number | null
  otherAdjustments: number
  fcf: number
  fcfMargin: number
  fcfYoYGrowth: number | null
  fcfPerShare: number
  fcfPerShareYoYGrowth: number | null
  capexMaintenanceSalesRatio: number
  workingCapitalSalesRatio: number
  fcfSalesRatio: number
  cashConversion: number | null
  dividendsPaid: number
  dividendsFcfRatio: number | null
}

export interface Roic {
  ebitAfterTax: number
  cashAndEquivalents: number
  marketableSecurities: number
  shortTermDebt: number
  longTermDebt: number
  totalDebt: number
  currentOperatingLeases: number
  nonCurrentOperatingLeases: number
  equity: number
  investedCapital: number
  roe: number | null
  roic: number | null
}

export interface Valuation {
  marketCap: number | null
  netDebt: number
  netDebtEbitdaRatio: number | null
  enterpriseValue: number | null
}

export class HistoricalYear {
  readonly year: number
  readonly incomeStatement: IncomeStatement
  readonly freeCashFlow: FreeCashFlow
  readonly roic: Roic
  readonly valuation: Valuation

  constructor(inputs: HistoricalYearInputs) {
    const prev = inputs.prev ?? null
    this.year = inputs.year
    this.incomeStatement = HistoricalYear.buildIncomeStatement(
      inputs.incomeStatement,
      prev,
    )
    this.freeCashFlow = HistoricalYear.buildFreeCashFlow(
      inputs.freeCashFlow,
      this.incomeStatement,
      prev,
    )
    this.roic = HistoricalYear.buildRoic(inputs.roic, this.incomeStatement)
    this.valuation = HistoricalYear.buildValuation(
      this.incomeStatement,
      this.roic,
      inputs.currentPrice,
    )
  }

  private static buildIncomeStatement(
    input: IncomeStatementInputs,
    prev: HistoricalYear | null,
  ): IncomeStatement {
    const {
      sales,
      depreciationAmortization,
      ebit,
      interestExpense,
      interestIncome,
      taxExpense,
      minorityInterests,
      fullyDilutedShares,
    } = input
    const prevIs = prev?.incomeStatement ?? null

    const ebitda = HistoricalYear.computeEbitda(ebit, depreciationAmortization)
    const salesYoYGrowth = HistoricalYear.computeSalesYoYGrowth(
      sales,
      prevIs?.sales,
    )
    const ebitdaMargin = HistoricalYear.computeEbitdaMargin(ebitda, sales)
    const ebitdaYoYGrowth = HistoricalYear.computeEbitdaYoYGrowth(
      ebitda,
      prevIs?.ebitda,
    )
    const ebitMargin = HistoricalYear.computeEbitMargin(ebit, sales)
    const ebitYoYGrowth = HistoricalYear.computeEbitYoYGrowth(
      ebit,
      prevIs?.ebit,
    )
    const totalInterest = HistoricalYear.computeTotalInterest(
      interestExpense,
      interestIncome,
    )
    const fullyDilutedSharesYoYGrowth =
      HistoricalYear.computeFullyDilutedSharesYoYGrowth(
        fullyDilutedShares,
        prevIs?.fullyDilutedShares,
      )
    const earningsBeforeTaxes = HistoricalYear.computeEarningsBeforeTaxes(
      ebit,
      totalInterest,
    )
    const taxRate = HistoricalYear.computeTaxRate(
      taxExpense,
      earningsBeforeTaxes,
    )
    const consolidatedNetIncome = HistoricalYear.computeConsolidatedNetIncome(
      earningsBeforeTaxes,
      taxExpense,
    )
    const netIncome = HistoricalYear.computeNetIncome(
      consolidatedNetIncome,
      minorityInterests,
    )
    const netMargin = HistoricalYear.computeNetMargin(netIncome, sales)
    const netIncomeYoYGrowth = HistoricalYear.computeNetIncomeYoYGrowth(
      netIncome,
      prevIs?.netIncome,
    )
    const eps = HistoricalYear.computeEps(netIncome, fullyDilutedShares)
    const epsYoYGrowth = HistoricalYear.computeEpsYoYGrowth(eps, prevIs?.eps)

    return {
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
  }

  private static buildFreeCashFlow(
    input: FreeCashFlowInputs,
    is: IncomeStatement,
    prev: HistoricalYear | null,
  ): FreeCashFlow {
    const {
      capexMaintenance,
      inventories,
      accountsReceivable,
      accountsPayable,
      unearnedRevenue,
      dividendsPaid,
    } = input
    const prevFcf = prev?.freeCashFlow ?? null

    const ebitda = HistoricalYear.computeFcfEbitda(is.ebitda)
    const totalInterest = HistoricalYear.computeFcfTotalInterest(
      is.totalInterest,
    )
    const taxesPaid = HistoricalYear.computeFcfTaxesPaid(is.taxExpense)
    const workingCapital = HistoricalYear.computeWorkingCapital(
      inventories,
      accountsReceivable,
      accountsPayable,
      unearnedRevenue,
    )
    const changeInWorkingCapital = HistoricalYear.computeChangeInWorkingCapital(
      workingCapital,
      prevFcf?.workingCapital,
    )
    const otherAdjustments = HistoricalYear.computeOtherAdjustments(
      is.minorityInterests,
    )
    const fcf = HistoricalYear.computeFcf(
      ebitda,
      capexMaintenance,
      totalInterest,
      taxesPaid,
      changeInWorkingCapital,
      otherAdjustments,
    )
    const fcfMargin = HistoricalYear.computeFcfMargin(fcf, is.sales)
    const fcfYoYGrowth = HistoricalYear.computeFcfYoYGrowth(fcf, prevFcf?.fcf)
    const fcfPerShare = HistoricalYear.computeFcfPerShare(
      fcf,
      is.fullyDilutedShares,
    )
    const fcfPerShareYoYGrowth = HistoricalYear.computeFcfPerShareYoYGrowth(
      fcfPerShare,
      prevFcf?.fcfPerShare,
    )
    const capexMaintenanceSalesRatio =
      HistoricalYear.computeCapexMaintenanceSalesRatio(
        capexMaintenance,
        is.sales,
      )
    const workingCapitalSalesRatio =
      HistoricalYear.computeWorkingCapitalSalesRatio(workingCapital, is.sales)
    const fcfSalesRatio = HistoricalYear.computeFcfSalesRatio(fcf, is.sales)
    const cashConversion = HistoricalYear.computeCashConversion(fcf, ebitda)
    const dividendsFcfRatio = HistoricalYear.computeDividendsFcfRatio(
      dividendsPaid,
      fcf,
    )

    return {
      ebitda,
      capexMaintenance,
      totalInterest,
      taxesPaid,
      inventories,
      accountsReceivable,
      accountsPayable,
      unearnedRevenue,
      workingCapital,
      changeInWorkingCapital,
      otherAdjustments,
      fcf,
      fcfMargin,
      fcfYoYGrowth,
      fcfPerShare,
      fcfPerShareYoYGrowth,
      capexMaintenanceSalesRatio,
      workingCapitalSalesRatio,
      fcfSalesRatio,
      cashConversion,
      dividendsPaid,
      dividendsFcfRatio,
    }
  }

  private static buildRoic(input: RoicInputs, is: IncomeStatement): Roic {
    const {
      cashAndEquivalents,
      marketableSecurities,
      shortTermDebt,
      longTermDebt,
      currentOperatingLeases,
      nonCurrentOperatingLeases,
      equity,
    } = input

    const ebitAfterTax = HistoricalYear.computeEbitAfterTax(is.ebit, is.taxRate)
    const totalDebt = HistoricalYear.computeTotalDebt(
      shortTermDebt,
      longTermDebt,
    )
    const investedCapital = HistoricalYear.computeInvestedCapital(
      equity,
      shortTermDebt,
      longTermDebt,
      currentOperatingLeases,
      nonCurrentOperatingLeases,
      marketableSecurities,
    )
    const roe = HistoricalYear.computeRoe(is.netIncome, equity)
    const roic = HistoricalYear.computeRoic(ebitAfterTax, investedCapital)

    return {
      ebitAfterTax,
      cashAndEquivalents,
      marketableSecurities,
      shortTermDebt,
      longTermDebt,
      totalDebt,
      currentOperatingLeases,
      nonCurrentOperatingLeases,
      equity,
      investedCapital,
      roe,
      roic,
    }
  }

  private static buildValuation(
    is: IncomeStatement,
    roic: Roic,
    currentPrice: number | null,
  ): Valuation {
    const marketCap = HistoricalYear.computeMarketCap(
      currentPrice,
      is.fullyDilutedShares,
    )
    const netDebt = HistoricalYear.computeNetDebt(
      roic.shortTermDebt,
      roic.longTermDebt,
      roic.cashAndEquivalents,
      roic.marketableSecurities,
    )
    const netDebtEbitdaRatio = HistoricalYear.computeNetDebtEbitdaRatio(
      netDebt,
      is.ebitda,
    )
    const enterpriseValue = HistoricalYear.computeEnterpriseValue(
      marketCap,
      netDebt,
    )

    return { marketCap, netDebt, netDebtEbitdaRatio, enterpriseValue }
  }

  private static computeEbitda(
    ebit: number,
    depreciationAmortization: number,
  ): number {
    return ebit + Math.abs(depreciationAmortization)
  }

  private static computeSalesYoYGrowth(
    sales: number,
    prevSales: number | undefined,
  ): number | null {
    if (prevSales === undefined) return null
    return (sales - prevSales) / prevSales
  }

  private static computeEbitdaMargin(ebitda: number, sales: number): number {
    return ebitda / sales
  }

  private static computeEbitdaYoYGrowth(
    ebitda: number,
    prevEbitda: number | undefined,
  ): number | null {
    if (prevEbitda === undefined) return null
    return (ebitda - prevEbitda) / prevEbitda
  }

  private static computeEbitMargin(ebit: number, sales: number): number {
    return ebit / sales
  }

  private static computeEbitYoYGrowth(
    ebit: number,
    prevEbit: number | undefined,
  ): number | null {
    if (prevEbit === undefined) return null
    return (ebit - prevEbit) / prevEbit
  }

  private static computeTotalInterest(
    interestExpense: number,
    interestIncome: number,
  ): number {
    return interestExpense + interestIncome
  }

  private static computeFullyDilutedSharesYoYGrowth(
    shares: number,
    prevShares: number | undefined,
  ): number | null {
    if (prevShares === undefined) return null
    return (shares - prevShares) / prevShares
  }

  private static computeEarningsBeforeTaxes(
    ebit: number,
    totalInterest: number,
  ): number {
    return ebit + totalInterest
  }

  private static computeTaxRate(
    taxExpense: number,
    earningsBeforeTaxes: number,
  ): number {
    return Math.abs(taxExpense) / earningsBeforeTaxes
  }

  private static computeConsolidatedNetIncome(
    earningsBeforeTaxes: number,
    taxExpense: number,
  ): number {
    return earningsBeforeTaxes + taxExpense
  }

  private static computeNetIncome(
    consolidatedNetIncome: number,
    minorityInterests: number,
  ): number {
    return consolidatedNetIncome + minorityInterests
  }

  private static computeNetMargin(netIncome: number, sales: number): number {
    return netIncome / sales
  }

  private static computeNetIncomeYoYGrowth(
    netIncome: number,
    prevNetIncome: number | undefined,
  ): number | null {
    if (prevNetIncome === undefined) return null
    return (netIncome - prevNetIncome) / prevNetIncome
  }

  private static computeEps(
    netIncome: number,
    fullyDilutedShares: number,
  ): number {
    return netIncome / fullyDilutedShares
  }

  private static computeEpsYoYGrowth(
    eps: number,
    prevEps: number | undefined,
  ): number | null {
    if (prevEps === undefined) return null
    return (eps - prevEps) / prevEps
  }

  private static computeFcfEbitda(incomeStatementEbitda: number): number {
    return incomeStatementEbitda
  }

  private static computeFcfTotalInterest(
    incomeStatementTotalInterest: number,
  ): number {
    return incomeStatementTotalInterest
  }

  private static computeFcfTaxesPaid(
    incomeStatementTaxExpense: number,
  ): number {
    return incomeStatementTaxExpense
  }

  private static computeWorkingCapital(
    inventories: number,
    accountsReceivable: number,
    accountsPayable: number,
    unearnedRevenue: number,
  ): number {
    return inventories + accountsReceivable - accountsPayable - unearnedRevenue
  }

  private static computeChangeInWorkingCapital(
    workingCapital: number,
    prevWorkingCapital: number | undefined,
  ): number | null {
    if (prevWorkingCapital === undefined) return null
    return workingCapital - prevWorkingCapital
  }

  private static computeOtherAdjustments(minorityInterests: number): number {
    return minorityInterests
  }

  private static computeFcf(
    ebitda: number,
    capexMaintenance: number,
    totalInterest: number,
    taxesPaid: number,
    changeInWorkingCapital: number | null,
    otherAdjustments: number,
  ): number {
    return (
      ebitda +
      capexMaintenance +
      totalInterest +
      taxesPaid -
      (changeInWorkingCapital ?? 0) +
      otherAdjustments
    )
  }

  private static computeFcfMargin(fcf: number, sales: number): number {
    return fcf / sales
  }

  private static computeFcfYoYGrowth(
    fcf: number,
    prevFcf: number | undefined,
  ): number | null {
    if (prevFcf === undefined) return null
    return (fcf - prevFcf) / prevFcf
  }

  private static computeFcfPerShare(
    fcf: number,
    fullyDilutedShares: number,
  ): number {
    return fcf / fullyDilutedShares
  }

  private static computeFcfPerShareYoYGrowth(
    fcfPerShare: number,
    prevFcfPerShare: number | undefined,
  ): number | null {
    if (prevFcfPerShare === undefined) return null
    return (fcfPerShare - prevFcfPerShare) / prevFcfPerShare
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

  private static computeDividendsFcfRatio(
    dividendsPaid: number,
    fcf: number,
  ): number | null {
    if (fcf <= 0) return null
    return Math.abs(dividendsPaid) / fcf
  }

  private static computeEbitAfterTax(ebit: number, taxRate: number): number {
    return ebit * (1 - taxRate)
  }

  private static computeTotalDebt(
    shortTermDebt: number,
    longTermDebt: number,
  ): number {
    return shortTermDebt + longTermDebt
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

  private static computeMarketCap(
    currentPrice: number | null,
    fullyDilutedShares: number,
  ): number | null {
    if (currentPrice === null) return null
    return currentPrice * fullyDilutedShares
  }

  private static computeNetDebt(
    shortTermDebt: number,
    longTermDebt: number,
    cashAndEquivalents: number,
    marketableSecurities: number,
  ): number {
    return (
      shortTermDebt + longTermDebt - (cashAndEquivalents + marketableSecurities)
    )
  }

  private static computeNetDebtEbitdaRatio(
    netDebt: number,
    ebitda: number,
  ): number | null {
    if (ebitda === 0) return null
    return netDebt / ebitda
  }

  private static computeEnterpriseValue(
    marketCap: number | null,
    netDebt: number,
  ): number | null {
    if (marketCap === null) return null
    return marketCap + netDebt
  }
}
