export type TikrSection =
  | "incomeStatement"
  | "balanceSheet"
  | "cashFlowStatement"
  | "estimates"

const TAB_TO_SECTION: Record<string, TikrSection> = {
  is: "incomeStatement",
  bs: "balanceSheet",
  cf: "cashFlowStatement",
  est: "estimates",
}

export const SUPPORTED_HOST = "app.tikr.com"

export const matchTikrUrl = (rawUrl: string): TikrSection | null => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.hostname !== SUPPORTED_HOST) return null
  const tab = parsed.searchParams.get("tab")
  if (!tab) return null
  return TAB_TO_SECTION[tab.toLowerCase()] ?? null
}
