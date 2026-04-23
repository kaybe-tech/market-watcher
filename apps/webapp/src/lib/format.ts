export const money = (v: number | null | undefined, digits = 2): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  return (
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  )
}

export const pct = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign + (v * 100).toFixed(digits)}%`
}

export const pctUnsigned = (
  v: number | null | undefined,
  digits = 1,
): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
}

export const num = (v: number | null | undefined, digits = 0): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const mult = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(digits)}×`
}

export const compact = (v: number | null | undefined, digits = 1): string => {
  if (v == null || !Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(digits)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(digits)}K`
  return v.toFixed(digits)
}

export const relTime = (
  iso: string | null | undefined,
  now = new Date(),
): string => {
  if (!iso) return "—"
  const d = new Date(iso)
  const diffMs = now.getTime() - d.getTime()
  const h = Math.floor(diffMs / 3_600_000)
  if (h < 1) {
    const m = Math.max(1, Math.floor(diffMs / 60_000))
    return `hace ${m}m`
  }
  if (h < 24) return `hace ${h}h`
  const days = Math.floor(h / 24)
  return `hace ${days}d`
}

export const fullTime = (iso: string | null | undefined): string => {
  if (!iso) return "—"
  return `${new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC`
}

export type DeltaClass = "pos" | "neg" | "zero" | ""

export const deltaClass = (v: number | null | undefined): DeltaClass => {
  if (v == null) return ""
  if (v > 0) return "pos"
  if (v < 0) return "neg"
  return "zero"
}
