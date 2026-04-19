import type { CompanyValuation } from "@market-watcher/valuation-engine"
import type { InferSelectModel } from "drizzle-orm"
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"

export const yearlyFinancials = sqliteTable(
  "yearly_financials",
  {
    ticker: text("ticker").notNull(),
    fiscalYearEnd: text("fiscal_year_end").notNull(),

    sales: real("sales"),
    depreciationAmortization: real("depreciation_amortization"),
    ebit: real("ebit"),
    interestExpense: real("interest_expense"),
    interestIncome: real("interest_income"),
    taxExpense: real("tax_expense"),
    minorityInterests: real("minority_interests"),
    fullyDilutedShares: real("fully_diluted_shares"),

    capexMaintenance: real("capex_maintenance"),
    inventories: real("inventories"),
    accountsReceivable: real("accounts_receivable"),
    accountsPayable: real("accounts_payable"),
    unearnedRevenue: real("unearned_revenue"),
    dividendsPaid: real("dividends_paid"),

    cashAndEquivalents: real("cash_and_equivalents"),
    marketableSecurities: real("marketable_securities"),
    shortTermDebt: real("short_term_debt"),
    longTermDebt: real("long_term_debt"),
    currentOperatingLeases: real("current_operating_leases"),
    nonCurrentOperatingLeases: real("non_current_operating_leases"),
    equity: real("equity"),
  },
  (table) => [primaryKey({ columns: [table.ticker, table.fiscalYearEnd] })],
)

export const tickerState = sqliteTable("ticker_state", {
  ticker: text("ticker").primaryKey(),
  latestFiscalYearEnd: text("latest_fiscal_year_end").notNull(),
  pendingValuation: integer("pending_valuation", { mode: "boolean" })
    .notNull()
    .default(true),
  currentPrice: real("current_price"),
})

export const valuations = sqliteTable("valuations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  fiscalYearEnd: text("fiscal_year_end").notNull(),
  result: text("result", { mode: "json" }).$type<CompanyValuation>().notNull(),
  createdAt: text("created_at").notNull(),
})

export type TickerStateRow = InferSelectModel<typeof tickerState>
export type YearlyFinancialsRow = InferSelectModel<typeof yearlyFinancials>
export type ValuationRow = InferSelectModel<typeof valuations>
