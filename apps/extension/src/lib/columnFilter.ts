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
    const fiscalYearEnd = parseFiscalYearHeader(headers[index], referenceYear)
    if (fiscalYearEnd === null) continue
    result.push({ index, fiscalYearEnd })
  }
  return result
}
