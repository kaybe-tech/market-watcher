import type {
  TickerStateRow,
  YearlyFinancialsRow,
} from "@/modules/company/schema"

export const completeYearRow = (
  ticker: string,
  fiscalYearEnd: string,
  overrides: Partial<YearlyFinancialsRow> = {},
): YearlyFinancialsRow => ({
  ticker,
  fiscalYearEnd,
  sales: 100,
  depreciationAmortization: 10,
  ebit: 50,
  interestExpense: 5,
  interestIncome: 2,
  taxExpense: 8,
  minorityInterests: 0,
  fullyDilutedShares: 1000,
  capexMaintenance: 15,
  inventories: 20,
  accountsReceivable: 30,
  accountsPayable: 25,
  unearnedRevenue: 5,
  dividendsPaid: 10,
  cashAndEquivalents: 40,
  marketableSecurities: 10,
  shortTermDebt: 5,
  longTermDebt: 30,
  currentOperatingLeases: 2,
  nonCurrentOperatingLeases: 8,
  equity: 200,
  ...overrides,
})

export const tickerStateRow = (
  overrides: Partial<TickerStateRow> = {},
): TickerStateRow => ({
  ticker: "AAPL",
  latestFiscalYearEnd: "2025-09-27",
  pendingValuation: true,
  currentPrice: 180,
  ...overrides,
})

export const fullYearPayload = (fiscalYearEnd: string) => ({
  fiscalYearEnd,
  incomeStatement: {
    sales: 100,
    depreciationAmortization: 10,
    ebit: 50,
    interestExpense: 5,
    interestIncome: 2,
    taxExpense: 8,
    minorityInterests: 0,
    fullyDilutedShares: 1000,
  },
  freeCashFlow: {
    capexMaintenance: 15,
    inventories: 20,
    accountsReceivable: 30,
    accountsPayable: 25,
    unearnedRevenue: 5,
    dividendsPaid: 10,
  },
  roic: {
    cashAndEquivalents: 40,
    marketableSecurities: 10,
    shortTermDebt: 5,
    longTermDebt: 30,
    currentOperatingLeases: 2,
    nonCurrentOperatingLeases: 8,
    equity: 200,
  },
})
