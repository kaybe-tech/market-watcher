// Tipos espejados del API y del valuation-engine. Mantener sincronizados.

export type CompanyListItemSummary = {
  buyPrice: number | null
  buyPriceDiff: number | null
  targetPrice1y: number | null
  mos1y: number | null
  cagr3y: number | null
  cagr5y: number | null
}

export type CompanyListItem = {
  ticker: string
  name: string | null
  currentPrice: number | null
  latestFiscalYearEnd: string | null
  lastValuatedAt: string | null
  pending: boolean
  valuationInProgress: boolean
  summary: CompanyListItemSummary
}

// Engine — sub-objetos.
export type IncomeStatement = {
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

export type FreeCashFlow = {
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

export type Roic = {
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

export type Valuation = {
  marketCap: number | null
  netDebt: number
  netDebtEbitdaRatio: number | null
  enterpriseValue: number | null
}

export type YearData = {
  year: number
  incomeStatement: IncomeStatement
  freeCashFlow: FreeCashFlow
  roic: Roic
  valuation: Valuation
}

export type MultipleSet = {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
}

export type Multiples = {
  ltm: MultipleSet
  ntm: MultipleSet
  target: MultipleSet
}

export type TargetPriceSet = {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
  average: number | null
  marginOfSafety: number | null
}

export type Cagr5y = {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
  average: number | null
}

export type BuyPrice = {
  targetReturn: number
  price: number | null
  differenceVsCurrent: number | null
}

export type IntrinsicValue = {
  targetPrice: Record<number, TargetPriceSet>
  cagr5y: Cagr5y
  buyPrice: BuyPrice
}

export type ProjectionAssumptions = {
  incomeStatement: Record<string, number | null>
  freeCashFlow: Record<string, number | null>
  roic: Record<string, number | null>
}

export type CompanyValuation = {
  ticker: string
  name: string | null
  currentPrice: number
  historical: Record<number, YearData>
  projected: Record<number, YearData>
  multiples: Multiples
  intrinsicValue: IntrinsicValue
  assumptions: ProjectionAssumptions
}

export type MissingYearEntry = {
  fiscalYearEnd: string
  incomeStatement?: string[]
  freeCashFlow?: string[]
  roic?: string[]
}

export type MissingSummary = {
  ticker?: string[]
  years?: MissingYearEntry[]
}

export type ValuationRow = {
  id: number
  ticker: string
  fiscalYearEnd: string
  createdAt: string
  source: string
  result: CompanyValuation
}

export type CompanyView = {
  ticker: string
  latestFiscalYearEnd: string | null
  currentPrice: number | null
  valuations: Record<string, ValuationRow>
  availableEstimateSources: string[]
  pending: boolean
  valuationInProgress: boolean
  missing?: MissingSummary
}

