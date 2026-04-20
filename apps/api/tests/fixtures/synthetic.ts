import type { IngestBody, IngestYearBody } from "./engine"

type IncomeStatementFields = {
  sales: number
  depreciationAmortization: number
  ebit: number
  interestExpense: number
  interestIncome: number
  taxExpense: number
  minorityInterests: number
  fullyDilutedShares: number
}

type FreeCashFlowFields = {
  capexMaintenance: number
  inventories: number
  accountsReceivable: number
  accountsPayable: number
  unearnedRevenue: number
  dividendsPaid: number
}

type RoicFields = {
  cashAndEquivalents: number
  marketableSecurities: number
  shortTermDebt: number
  longTermDebt: number
  currentOperatingLeases: number
  nonCurrentOperatingLeases: number
  equity: number
}

const BASE_INCOME: IncomeStatementFields = {
  sales: 100000,
  depreciationAmortization: -5000,
  ebit: 20000,
  interestExpense: -500,
  interestIncome: 100,
  taxExpense: -4000,
  minorityInterests: 0,
  fullyDilutedShares: 1000,
}

const BASE_FCF: FreeCashFlowFields = {
  capexMaintenance: -3000,
  inventories: 2000,
  accountsReceivable: 1500,
  accountsPayable: 1800,
  unearnedRevenue: 500,
  dividendsPaid: 0,
}

const BASE_ROIC: RoicFields = {
  cashAndEquivalents: 10000,
  marketableSecurities: 5000,
  shortTermDebt: 1000,
  longTermDebt: 8000,
  currentOperatingLeases: 500,
  nonCurrentOperatingLeases: 1500,
  equity: 30000,
}

type CompleteYearOverrides = {
  incomeStatement?: Partial<IncomeStatementFields>
  freeCashFlow?: Partial<FreeCashFlowFields>
  roic?: Partial<RoicFields>
}

export const completeYear = (
  fiscalYearEnd: string,
  overrides: CompleteYearOverrides = {},
): IngestYearBody => ({
  fiscalYearEnd,
  incomeStatement: { ...BASE_INCOME, ...overrides.incomeStatement },
  freeCashFlow: { ...BASE_FCF, ...overrides.freeCashFlow },
  roic: { ...BASE_ROIC, ...overrides.roic },
})

type IncompleteYearOmit = {
  incomeStatement?: Array<keyof IncomeStatementFields>
  freeCashFlow?: Array<keyof FreeCashFlowFields>
  roic?: Array<keyof RoicFields>
}

const omitKeys = <T extends object>(
  source: T,
  keys: Array<keyof T> | undefined,
): T => {
  if (!keys || keys.length === 0) return { ...source }
  const result = { ...source }
  for (const key of keys) delete result[key]
  return result
}

export const incompleteYear = (
  fiscalYearEnd: string,
  omit: IncompleteYearOmit = {},
): IngestYearBody => ({
  fiscalYearEnd,
  incomeStatement: omitKeys(BASE_INCOME, omit.incomeStatement) as Record<
    string,
    number
  >,
  freeCashFlow: omitKeys(BASE_FCF, omit.freeCashFlow) as Record<string, number>,
  roic: omitKeys(BASE_ROIC, omit.roic) as Record<string, number>,
})

export const buildIngestBody = (
  years: IngestYearBody[],
  currentPrice?: number,
): IngestBody =>
  currentPrice === undefined ? { years } : { currentPrice, years }
