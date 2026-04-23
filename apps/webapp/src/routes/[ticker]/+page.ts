import { ApiError, fetchCompanyValuation, fetchCompanyView } from "$lib/api"
import type { CompanyValuation, CompanyView } from "$lib/types"
import type { PageLoad } from "./$types"

export const ssr = false

export type DetailLoad = {
  ticker: string
  view: CompanyView | null
  valuation: CompanyValuation | null
  notFound: boolean
  error: string | null
}

export const load: PageLoad<DetailLoad> = async ({ fetch, params }) => {
  const ticker = params.ticker
  try {
    const view = await fetchCompanyView(ticker, fetch)
    let valuation: CompanyValuation | null = null
    if (view.valuation && !view.pending && !view.valuationInProgress) {
      valuation = view.valuation.result
    } else if (!view.pending && !view.valuationInProgress) {
      try {
        valuation = await fetchCompanyValuation(ticker, "auto", fetch)
      } catch {
        valuation = null
      }
    }
    return { ticker, view, valuation, notFound: false, error: null }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return {
        ticker,
        view: null,
        valuation: null,
        notFound: true,
        error: null,
      }
    }
    return {
      ticker,
      view: null,
      valuation: null,
      notFound: false,
      error: err instanceof Error ? err.message : "unknown error",
    }
  }
}
