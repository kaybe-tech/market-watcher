import { PUBLIC_API_URL } from "$env/static/public"
import type { CompanyListItem, CompanyView } from "./types"

const baseUrl = (): string => PUBLIC_API_URL || "http://localhost:3000"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "ApiError"
  }
}

type FetchFn = typeof fetch

const request = async <T>(fetchFn: FetchFn, path: string): Promise<T> => {
  const res = await fetchFn(`${baseUrl()}${path}`)
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText} on ${path}`)
  }
  return (await res.json()) as T
}

export const fetchCompanies = (
  fetchFn: FetchFn = fetch,
): Promise<CompanyListItem[]> =>
  request<CompanyListItem[]>(fetchFn, "/companies")

export const fetchCompanyView = (
  ticker: string,
  fetchFn: FetchFn = fetch,
): Promise<CompanyView> => request<CompanyView>(fetchFn, `/companies/${ticker}`)
