import { parseCell, parsePercentCell } from "../../lib/numberParser"
import type { ParsedTable } from "./fieldMapper"

export type EstimateYearPayload = {
  fiscalYearEnd: string
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  capexMaintenanceSalesRatio?: number
  netDebtEbitdaRatio?: number
}

const trimLabel = (label: string) => label.replace(/\s+/g, " ").trim()

const MAIN_REVENUE = "Revenue"
const MAIN_EBIT = "EBIT"
const SUB_CHANGE_YOY = "% Change YoY"
const SUB_EBIT_MARGINS = "% EBIT Margins"
const SINGLE_TAX = "Effective Tax Rate (%)"
const SINGLE_NET_DEBT_EBITDA = "Net Debt/EBITDA"
const SINGLE_CAPEX = "Capital Expenditure"

type RowIndex = { label: string; values: string[] }

const findSub = (
  rows: RowIndex[],
  mainIndex: number,
  subLabel: string,
): RowIndex | undefined => {
  for (let i = mainIndex + 1; i < rows.length; i += 1) {
    const label = rows[i].label
    if (label === subLabel) return rows[i]
    if (label.startsWith("%")) continue // other italic sub-rows
    return undefined
  }
  return undefined
}

const findRow = (
  rows: RowIndex[],
  label: string,
): { row: RowIndex; index: number } | undefined => {
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].label === label) return { row: rows[i], index: i }
  }
  return undefined
}

export const mapTikrEstimatesToPayload = (
  table: ParsedTable,
  maxYears?: number,
): EstimateYearPayload[] => {
  const rows: RowIndex[] = table.rows.map((r) => ({
    label: trimLabel(r.label),
    values: r.values,
  }))

  const revenueHit = findRow(rows, MAIN_REVENUE)
  const ebitHit = findRow(rows, MAIN_EBIT)
  const taxRow = findRow(rows, SINGLE_TAX)?.row
  const netDebtRow = findRow(rows, SINGLE_NET_DEBT_EBITDA)?.row
  const capexRow = findRow(rows, SINGLE_CAPEX)?.row

  const salesGrowthRow =
    revenueHit && findSub(rows, revenueHit.index, SUB_CHANGE_YOY)
  const ebitMarginRow =
    ebitHit && findSub(rows, ebitHit.index, SUB_EBIT_MARGINS)

  const years = table.fiscalYears.map((fiscalYearEnd, columnIndex) => {
    const year: EstimateYearPayload = { fiscalYearEnd }

    const salesGrowth = salesGrowthRow
      ? parsePercentCell(salesGrowthRow.values[columnIndex] ?? "")
      : null
    if (salesGrowth !== null) year.salesGrowth = salesGrowth

    const ebitMargin = ebitMarginRow
      ? parsePercentCell(ebitMarginRow.values[columnIndex] ?? "")
      : null
    if (ebitMargin !== null) year.ebitMargin = ebitMargin

    const taxRate = taxRow
      ? parsePercentCell(taxRow.values[columnIndex] ?? "")
      : null
    if (taxRate !== null) year.taxRate = taxRate

    const netDebtEbitda = netDebtRow
      ? parseCell(netDebtRow.values[columnIndex] ?? "")
      : null
    if (netDebtEbitda !== null) year.netDebtEbitdaRatio = netDebtEbitda

    if (capexRow && revenueHit) {
      const capex = parseCell(capexRow.values[columnIndex] ?? "")
      const revenue = parseCell(revenueHit.row.values[columnIndex] ?? "")
      if (capex !== null && revenue !== null && revenue !== 0) {
        year.capexMaintenanceSalesRatio = Math.abs(capex) / revenue
      }
    }

    return year
  })

  if (maxYears === undefined) return years
  return [...years]
    .sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd))
    .slice(0, maxYears)
}
