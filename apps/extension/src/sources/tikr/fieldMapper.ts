import type { IngestYear } from "../../lib/apiClient"
import type { Unit } from "../../lib/numberParser"
import { parseAndNormalize } from "../../lib/numberParser"
import type { TikrSection } from "./urlMatcher"

type FieldGroup = "incomeStatement" | "freeCashFlow" | "roic"

type FieldDefinition = {
  group: FieldGroup
  field: string
  labels: string[]
}

const INCOME_STATEMENT_FIELDS: FieldDefinition[] = [
  {
    group: "incomeStatement",
    field: "sales",
    labels: ["Revenues", "Total Revenues"],
  },
  {
    group: "incomeStatement",
    field: "depreciationAmortization",
    labels: [
      "Total Depreciation & Amortization",
      "Depreciation & Amortization",
    ],
  },
  { group: "incomeStatement", field: "ebit", labels: ["Operating Income"] },
  {
    group: "incomeStatement",
    field: "interestExpense",
    labels: ["Interest Expense"],
  },
  {
    group: "incomeStatement",
    field: "interestIncome",
    labels: ["Interest And Investment Income"],
  },
  {
    group: "incomeStatement",
    field: "taxExpense",
    labels: ["Income Tax Expense"],
  },
  {
    group: "incomeStatement",
    field: "minorityInterests",
    labels: ["Minority Interest"],
  },
  {
    group: "incomeStatement",
    field: "fullyDilutedShares",
    labels: ["Weighted Average Diluted Shares Outstanding"],
  },
]

const BALANCE_SHEET_FIELDS: FieldDefinition[] = [
  {
    group: "roic",
    field: "cashAndEquivalents",
    labels: ["Cash And Equivalents"],
  },
  {
    group: "roic",
    field: "marketableSecurities",
    labels: ["Short Term Investments"],
  },
  {
    group: "roic",
    field: "shortTermDebt",
    labels: ["Current Portion of Long-Term Debt"],
  },
  { group: "roic", field: "longTermDebt", labels: ["Long-Term Debt"] },
  {
    group: "roic",
    field: "currentOperatingLeases",
    labels: ["Current Portion of Capital Lease Obligations"],
  },
  {
    group: "roic",
    field: "nonCurrentOperatingLeases",
    labels: ["Capital Leases"],
  },
  { group: "roic", field: "equity", labels: ["Total Equity"] },
  { group: "freeCashFlow", field: "inventories", labels: ["Inventory"] },
  {
    group: "freeCashFlow",
    field: "accountsReceivable",
    labels: ["Accounts Receivable"],
  },
  {
    group: "freeCashFlow",
    field: "accountsPayable",
    labels: ["Accounts Payable"],
  },
  {
    group: "freeCashFlow",
    field: "unearnedRevenue",
    labels: ["Unearned Revenue Current"],
  },
]

const CASH_FLOW_FIELDS: FieldDefinition[] = [
  {
    group: "incomeStatement",
    field: "depreciationAmortization",
    labels: [
      "Total Depreciation & Amortization",
      "Depreciation & Amortization",
    ],
  },
  {
    group: "freeCashFlow",
    field: "capexMaintenance",
    labels: ["Capital Expenditure"],
  },
  {
    group: "freeCashFlow",
    field: "dividendsPaid",
    labels: [
      "Common Dividends Paid",
      "Common & Preferred Stock Dividends Paid",
    ],
  },
]

const FIELDS_BY_SECTION: Record<TikrSection, FieldDefinition[]> = {
  incomeStatement: INCOME_STATEMENT_FIELDS,
  balanceSheet: BALANCE_SHEET_FIELDS,
  cashFlowStatement: CASH_FLOW_FIELDS,
}

export type TableRow = {
  label: string
  values: string[]
}

export type ParsedTable = {
  fiscalYears: string[]
  rows: TableRow[]
}

const findRow = (
  byLabel: Map<string, TableRow>,
  labels: string[],
): TableRow | undefined => {
  for (const label of labels) {
    const match = byLabel.get(label)
    if (match) return match
  }
  return undefined
}

const applyValue = (
  year: IngestYear,
  group: FieldGroup,
  field: string,
  value: number,
): void => {
  let bucket = year[group]
  if (!bucket) {
    bucket = {}
    year[group] = bucket
  }
  bucket[field as keyof typeof bucket] = value
}

export const mapTikrToPayload = (
  section: TikrSection,
  table: ParsedTable,
  unit: Unit,
): IngestYear[] => {
  const fields = FIELDS_BY_SECTION[section]
  const byLabel = new Map(table.rows.map((row) => [row.label, row]))
  return table.fiscalYears.map((fiscalYearEnd, columnIndex) => {
    const year: IngestYear = { fiscalYearEnd }
    for (const definition of fields) {
      const row = findRow(byLabel, definition.labels)
      if (!row) continue
      const raw = row.values[columnIndex]
      if (raw === undefined) continue
      const normalized = parseAndNormalize(raw, unit)
      if (normalized === null) continue
      applyValue(year, definition.group, definition.field, normalized)
    }
    return year
  })
}
