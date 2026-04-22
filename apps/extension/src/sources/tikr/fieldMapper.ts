import type { IngestYear } from "../../lib/apiClient"
import type { Unit } from "../../lib/numberParser"
import { isVisualEmpty, parseAndNormalize } from "../../lib/numberParser"
import type { TikrSection } from "./urlMatcher"

type FieldGroup = "incomeStatement" | "freeCashFlow" | "roic"

type FieldDefinition = {
  group: FieldGroup
  field: string
  labels: string[]
  sum?: boolean
  absolute?: boolean
}

const INCOME_STATEMENT_FIELDS: FieldDefinition[] = [
  {
    group: "incomeStatement",
    field: "sales",
    labels: ["Total Revenues", "Revenues"],
  },
  {
    group: "incomeStatement",
    field: "depreciationAmortization",
    labels: [
      "Total Depreciation & Amortization",
      "Depreciation & Amortization",
    ],
    absolute: true,
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
    labels: ["Current Portion of Long-Term Debt", "Short-term Borrowings"],
    sum: true,
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
    absolute: true,
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

const resolveSingleValue = (
  byLabel: Map<string, TableRow>,
  labels: string[],
  columnIndex: number,
  unit: Unit,
): { kind: "value"; value: number } | { kind: "zero" } | { kind: "skip" } => {
  const row = findRow(byLabel, labels)
  if (!row) return { kind: "zero" }
  const raw = row.values[columnIndex]
  if (raw === undefined) return { kind: "zero" }
  const normalized = parseAndNormalize(raw, unit)
  if (normalized !== null) return { kind: "value", value: normalized }
  if (isVisualEmpty(raw)) return { kind: "zero" }
  return { kind: "skip" }
}

const resolveSumValue = (
  byLabel: Map<string, TableRow>,
  labels: string[],
  columnIndex: number,
  unit: Unit,
): { kind: "value"; value: number } => {
  let total = 0
  for (const label of labels) {
    const row = byLabel.get(label)
    if (!row) continue
    const raw = row.values[columnIndex]
    if (raw === undefined) continue
    const normalized = parseAndNormalize(raw, unit)
    if (normalized !== null) total += normalized
  }
  return { kind: "value", value: total }
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
      const resolved = definition.sum
        ? resolveSumValue(byLabel, definition.labels, columnIndex, unit)
        : resolveSingleValue(byLabel, definition.labels, columnIndex, unit)
      if (resolved.kind === "value") {
        const value = definition.absolute
          ? Math.abs(resolved.value)
          : resolved.value
        applyValue(year, definition.group, definition.field, value)
      } else if (resolved.kind === "zero") {
        applyValue(year, definition.group, definition.field, 0)
      }
    }
    return year
  })
}
