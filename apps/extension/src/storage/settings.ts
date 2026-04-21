const API_URL_KEY = "apiUrl"
export const DEFAULT_API_URL = "http://localhost:3000"

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
