import type {
  ProjectionYearOverride,
  ValuationOverrides,
} from "@market-watcher/valuation-engine"
import type { YearlyEstimatesRow } from "./schema"

// Subconjunto de ProjectionYearOverride: omitimos shareGrowth y
// changeInWorkingCapital porque no están en el schema de yearly_estimates.
const OVERRIDE_FIELDS = [
  "salesGrowth",
  "ebitMargin",
  "taxRate",
  "capexMaintenanceSalesRatio",
  "netDebtEbitdaRatio",
] as const satisfies ReadonlyArray<keyof ProjectionYearOverride>

const SOURCE_PRIORITY: readonly string[] = ["manual", "tikr"]

const sourceRank = (source: string): number => {
  const index = SOURCE_PRIORITY.indexOf(source)
  return index === -1 ? SOURCE_PRIORITY.length : index
}

const compareSources = (a: string, b: string): number => {
  const ra = sourceRank(a)
  const rb = sourceRank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b)
}

const yearOf = (fiscalYearEnd: string): number =>
  Number.parseInt(fiscalYearEnd.slice(0, 4), 10)

export const mergeOverrides = (
  rows: YearlyEstimatesRow[],
): ValuationOverrides => {
  const byYear = new Map<number, YearlyEstimatesRow[]>()
  for (const row of rows) {
    const year = yearOf(row.fiscalYearEnd)
    const bucket = byYear.get(year) ?? []
    bucket.push(row)
    byYear.set(year, bucket)
  }

  const projections: Record<number, ProjectionYearOverride> = {}
  for (const [year, bucket] of byYear) {
    bucket.sort((a, b) => compareSources(a.source, b.source))
    const merged: ProjectionYearOverride = {}
    for (const field of OVERRIDE_FIELDS) {
      for (const row of bucket) {
        const value = row[field]
        if (value !== null && value !== undefined) {
          merged[field] = value
          break
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      projections[year] = merged
    }
  }

  return { projections }
}
