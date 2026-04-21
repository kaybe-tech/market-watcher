import { describe, expect, test } from "bun:test"
import { matchTikrUrl } from "../src/sources/tikr/urlMatcher"

describe("matchTikrUrl", () => {
  test.each([
    ["https://app.tikr.com/stock/financials?cid=1&tab=is", "incomeStatement"],
    ["https://app.tikr.com/stock/financials?cid=1&tab=bs", "balanceSheet"],
    ["https://app.tikr.com/stock/financials?cid=1&tab=cf", "cashFlowStatement"],
  ] as const)("maps %p", (url, expected) => {
    expect(matchTikrUrl(url)).toBe(expected)
  })

  test("is case-insensitive on tab value", () => {
    expect(matchTikrUrl("https://app.tikr.com/stock/financials?tab=IS")).toBe(
      "incomeStatement",
    )
  })

  test.each([
    "https://app.tikr.com/stock/financials",
    "https://app.tikr.com/stock/financials?tab=unknown",
    "https://example.com/stock/financials?tab=is",
    "about:blank",
  ])("returns null for %p", (url) => {
    expect(matchTikrUrl(url)).toBeNull()
  })
})
