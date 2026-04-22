import { parseFiscalYearHeader } from "./fiscalYearParser"

export type FiscalYearColumn = {
  index: number
  fiscalYearEnd: string
}

export const filterFiscalYearColumns = (
  headers: string[],
  referenceYear = new Date().getUTCFullYear(),
): FiscalYearColumn[] => {
  const result: FiscalYearColumn[] = []
  for (let index = 0; index < headers.length; index += 1) {
    const parsed = parseFiscalYearHeader(headers[index], referenceYear)
    if (parsed === null) continue
    result.push({ index, fiscalYearEnd: parsed.fiscalYearEnd })
  }
  return result
}
