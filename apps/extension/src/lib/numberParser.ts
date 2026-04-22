export type Unit = "millions" | "thousands" | "billions"

const UNIT_FACTOR: Record<Unit, number> = {
  millions: 1,
  thousands: 1 / 1000,
  billions: 1000,
}

const VISUAL_EMPTY_VALUES = new Set(["", "--", "—", "-", "–"])
const UNMEASURABLE_VALUES = new Set(["N/A", "NA", "NM"])
const EMPTY_CELL_VALUES = new Set([
  ...VISUAL_EMPTY_VALUES,
  ...UNMEASURABLE_VALUES,
])

export const isVisualEmpty = (raw: string): boolean =>
  VISUAL_EMPTY_VALUES.has(raw.replace(/ /g, " ").trim())

export const parseCell = (raw: string): number | null => {
  const trimmed = raw.replace(/\u00a0/g, " ").trim()
  if (EMPTY_CELL_VALUES.has(trimmed)) {
    return null
  }
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")")
  const inner = negative ? trimmed.slice(1, -1) : trimmed
  const cleaned = inner.replace(/,/g, "").replace(/\s/g, "")
  if (cleaned === "") {
    return null
  }
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return negative ? -parsed : parsed
}

export const parseUnit = (raw: string): Unit | null => {
  const lower = raw.toLowerCase()
  if (lower.includes("billion")) return "billions"
  if (lower.includes("thousand")) return "thousands"
  if (lower.includes("million")) return "millions"
  return null
}

export const normalizeToMillions = (value: number, unit: Unit): number => {
  return value * UNIT_FACTOR[unit]
}

export const parseAndNormalize = (raw: string, unit: Unit): number | null => {
  const parsed = parseCell(raw)
  if (parsed === null) return null
  return normalizeToMillions(parsed, unit)
}

export const parsePercentCell = (raw: string): number | null => {
  const trimmed = raw.replace(/\u00a0/g, " ").trim()
  if (EMPTY_CELL_VALUES.has(trimmed)) return null
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")")
  const inner = negative ? trimmed.slice(1, -1) : trimmed
  if (!inner.endsWith("%")) return null
  const withoutPercent = inner.slice(0, -1)
  const cleaned = withoutPercent.replace(/,/g, "").replace(/\s/g, "")
  if (cleaned === "") return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return (negative ? -parsed : parsed) / 100
}
