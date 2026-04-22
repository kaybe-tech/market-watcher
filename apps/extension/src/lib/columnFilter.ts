import { parseFiscalYearHeader } from "./fiscalYearParser"

export type ColumnFilterMode = "historical" | "estimates"

export type FiscalYearColumn = {
  index: number
  fiscalYearEnd: string
}

export const filterFiscalYearColumns = (
  headers: string[],
  referenceYear = new Date().getUTCFullYear(),
  mode: ColumnFilterMode = "historical",
): FiscalYearColumn[] => {
  const result: FiscalYearColumn[] = []
  for (let index = 0; index < headers.length; index += 1) {
    const parsed = parseFiscalYearHeader(headers[index], referenceYear)
    if (parsed === null) continue
    if (mode === "historical" && parsed.kind !== "actual") continue
    if (mode === "estimates" && parsed.kind !== "estimate") continue
    result.push({ index, fiscalYearEnd: parsed.fiscalYearEnd })
  }
  return result
}
