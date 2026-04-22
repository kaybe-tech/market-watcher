const API_URL_KEY = "apiUrl"
export const DEFAULT_API_URL = "http://localhost:3000"

const ESTIMATE_YEARS_LIMIT_KEY = "estimateYearsLimit"
export const DEFAULT_ESTIMATE_YEARS_LIMIT = 3
const MIN_ESTIMATE_YEARS_LIMIT = 1
const MAX_ESTIMATE_YEARS_LIMIT = 10

type StorageArea = {
  get(keys: string | string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

const getStorage = (): StorageArea | null => {
  const globalObj = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageArea } }
    browser?: { storage?: { local?: StorageArea } }
  }
  return (
    globalObj.browser?.storage?.local ??
    globalObj.chrome?.storage?.local ??
    null
  )
}

export const getApiUrl = async (): Promise<string> => {
  const storage = getStorage()
  if (!storage) return DEFAULT_API_URL
  const result = await storage.get(API_URL_KEY)
  const value = result[API_URL_KEY]
  return typeof value === "string" && value.length > 0 ? value : DEFAULT_API_URL
}

export const setApiUrl = async (url: string): Promise<void> => {
  const storage = getStorage()
  if (!storage) return
  await storage.set({ [API_URL_KEY]: url })
}

export const isValidApiUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

export const isValidEstimateYearsLimit = (value: number): boolean =>
  Number.isInteger(value) &&
  value >= MIN_ESTIMATE_YEARS_LIMIT &&
  value <= MAX_ESTIMATE_YEARS_LIMIT

export const getEstimateYearsLimit = async (): Promise<number> => {
  const storage = getStorage()
  if (!storage) return DEFAULT_ESTIMATE_YEARS_LIMIT
  const result = await storage.get(ESTIMATE_YEARS_LIMIT_KEY)
  const value = result[ESTIMATE_YEARS_LIMIT_KEY]
  return typeof value === "number" && isValidEstimateYearsLimit(value)
    ? value
    : DEFAULT_ESTIMATE_YEARS_LIMIT
}

export const setEstimateYearsLimit = async (value: number): Promise<void> => {
  const storage = getStorage()
  if (!storage) return
  await storage.set({ [ESTIMATE_YEARS_LIMIT_KEY]: value })
}
