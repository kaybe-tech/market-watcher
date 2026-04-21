import { filterFiscalYearColumns } from "../../lib/columnFilter"
import type { Unit } from "../../lib/numberParser"
import { parseCell, parseUnit } from "../../lib/numberParser"
import type { ParsedTable, TableRow } from "./fieldMapper"

export type TikrPageData = {
  ticker: string | null
  currentPrice: number | null
  unit: Unit | null
  table: ParsedTable
}

const UNIT_BUTTON_MAP: Record<string, Unit> = {
  b: "billions",
  mm: "millions",
  k: "thousands",
}

const text = (el: Element | null | undefined): string => {
  if (!el) return ""
  return (el.textContent ?? "").replace(/\u00a0/g, " ").trim()
}

const extractTicker = (root: ParentNode): string | null => {
  const value = text(root.querySelector(".ticker-symbol"))
  return value.length > 0 ? value : null
}

const extractPrice = (root: ParentNode): number | null => {
  const first = root.querySelector(".price-wrapper span")
  const raw = text(first).replace(/[^\d.,()-]/g, "")
  return parseCell(raw)
}

const extractUnit = (root: ParentNode): Unit | null => {
  const description = root.querySelector(".newfilter-description")
  const fromDescription = parseUnit(text(description))
  if (fromDescription) return fromDescription
  const active = root.querySelector(
    "#unit-select button.v-btn--active .v-btn__content",
  )
  return UNIT_BUTTON_MAP[text(active).toLowerCase()] ?? null
}

const extractTable = (root: ParentNode, referenceYear: number): ParsedTable => {
  const table = root.querySelector("table.fintab")
  if (!table) return { fiscalYears: [], rows: [] }
  const headers = Array.from(table.querySelectorAll("thead th"))
    .slice(1)
    .map((cell) => text(cell))
  const columns = filterFiscalYearColumns(headers, referenceYear)
  const fiscalYears = columns.map((column) => column.fiscalYearEnd)
  const rows: TableRow[] = []
  for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
    const labelCell = row.querySelector("td.fixedfirstrow")
    if (!labelCell) continue
    const label = text(labelCell)
    if (!label) continue
    const cells = Array.from(row.querySelectorAll("td")).slice(1)
    const values = columns.map((column) => text(cells[column.index]))
    rows.push({ label, values })
  }
  return { fiscalYears, rows }
}

export const parseTikrPage = (
  root: ParentNode,
  referenceYear = new Date().getUTCFullYear(),
): TikrPageData => {
  return {
    ticker: extractTicker(root),
    currentPrice: extractPrice(root),
    unit: extractUnit(root),
    table: extractTable(root, referenceYear),
  }
}
