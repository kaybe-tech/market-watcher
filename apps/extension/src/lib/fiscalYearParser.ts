const HEADER_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s*([AE]))?$/

export type FiscalYearColumnKind = "actual" | "estimate"

export type ParsedFiscalYearHeader = {
  fiscalYearEnd: string
  kind: FiscalYearColumnKind
}

export const pivotTwoDigitYear = (
  yy: number,
  referenceYear: number,
): number => {
  const threshold = (referenceYear % 100) + 10
  return yy > threshold ? 1900 + yy : 2000 + yy
}

export const parseFiscalYearHeader = (
  header: string,
  referenceYear = new Date().getUTCFullYear(),
): ParsedFiscalYearHeader | null => {
  const match = HEADER_PATTERN.exec(header.trim())
  if (!match) return null
  const [, mm, dd, yy, suffix] = match
  const month = Number(mm)
  const day = Number(dd)
  const shortYear = Number(yy)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const fullYear = pivotTwoDigitYear(shortYear, referenceYear)
  const date = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  const mmStr = String(month).padStart(2, "0")
  const ddStr = String(day).padStart(2, "0")
  const fiscalYearEnd = `${fullYear}-${mmStr}-${ddStr}`
  const kind: FiscalYearColumnKind = suffix === "E" ? "estimate" : "actual"
  return { fiscalYearEnd, kind }
}
