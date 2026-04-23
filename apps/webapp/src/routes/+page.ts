import { fetchCompanies } from "$lib/api"
import type { CompanyListItem } from "$lib/types"
import type { PageLoad } from "./$types"

export const ssr = false

export type DashboardLoad = {
  rows: CompanyListItem[]
  error: string | null
}

export const load: PageLoad<DashboardLoad> = async ({ fetch }) => {
  try {
    const rows = await fetchCompanies(fetch)
    return { rows, error: null }
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : "unknown error",
    }
  }
}
