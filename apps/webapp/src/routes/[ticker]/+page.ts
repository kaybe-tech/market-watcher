import { ApiError, fetchCompanyView } from "$lib/api"
import type { CompanyValuation, CompanyView, ValuationRow } from "$lib/types"
import { AUTO_SOURCE, MERGED_ESTIMATES_SOURCE } from "$lib/valuation-sources"
import type { PageLoad } from "./$types"

export const ssr = false

export type DetailLoad = {
  ticker: string
  view: CompanyView | null
  valuation: CompanyValuation | null
  selectedSource: string | null
  availableSources: string[]
  notFound: boolean
  error: string | null
}

const sortSources = (sources: string[]): string[] => {
  const extras: string[] = []
  for (const source of sources) {
    if (source === AUTO_SOURCE || source === MERGED_ESTIMATES_SOURCE) continue
    extras.push(source)
  }
  extras.sort((a, b) => a.localeCompare(b))
  const head: string[] = []
  if (sources.includes(AUTO_SOURCE)) head.push(AUTO_SOURCE)
  if (sources.includes(MERGED_ESTIMATES_SOURCE))
    head.push(MERGED_ESTIMATES_SOURCE)
  return [...head, ...extras]
}

const resolveSource = (
  available: string[],
  requested: string | null,
): string | null => {
  if (available.length === 0) return null
  if (requested && available.includes(requested)) return requested
  if (available.includes(MERGED_ESTIMATES_SOURCE))
    return MERGED_ESTIMATES_SOURCE
  if (available.includes(AUTO_SOURCE)) return AUTO_SOURCE
  return available[0] ?? null
}

export const load: PageLoad<DetailLoad> = async ({ fetch, params, url }) => {
  const ticker = params.ticker
  const requestedSource = url.searchParams.get("source")
  try {
    const view = await fetchCompanyView(ticker, fetch)
    const availableSources = sortSources(Object.keys(view.valuations))
    const selectedSource = resolveSource(availableSources, requestedSource)
    const selected: ValuationRow | null =
      selectedSource !== null
        ? (view.valuations[selectedSource] ?? null)
        : null
    const valuation: CompanyValuation | null =
      selected && !view.pending && !view.valuationInProgress
        ? selected.result
        : null
    return {
      ticker,
      view,
      valuation,
      selectedSource,
      availableSources,
      notFound: false,
      error: null,
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return {
        ticker,
        view: null,
        valuation: null,
        selectedSource: null,
        availableSources: [],
        notFound: true,
        error: null,
      }
    }
    return {
      ticker,
      view: null,
      valuation: null,
      selectedSource: null,
      availableSources: [],
      notFound: false,
      error: err instanceof Error ? err.message : "unknown error",
    }
  }
}
