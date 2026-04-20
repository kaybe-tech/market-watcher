import type { CompanyRepository } from "@/modules/company/repository"

export const waitForBackgroundValuation = async (
  repository: CompanyRepository,
  ticker: string,
  {
    timeoutMs = 3000,
    intervalMs = 10,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = repository.getTickerState(ticker)
    if (state && !state.pendingValuation) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    `background valuation for ${ticker} did not complete within ${timeoutMs}ms`,
  )
}
