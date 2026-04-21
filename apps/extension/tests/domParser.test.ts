import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { parseTikrPage } from "../src/sources/tikr/domParser"

const REFERENCE_YEAR = 2026
const FIXTURE_DIR = new URL("./fixtures/tikr/", import.meta.url)

const loadFixture = async (name: string) => {
  const file = Bun.file(new URL(name, FIXTURE_DIR))
  const html = await file.text()
  const window = new Window()
  window.document.body.innerHTML = html
  return parseTikrPage(
    window.document.body as unknown as ParentNode,
    REFERENCE_YEAR,
  )
}

const EXPECTED_PRICE: Record<string, number> = {
  nvda: 202.06,
  aapl: 273.05,
  tsm: 2025,
  nke: 46.48,
}

const EXPECTED_TICKER: Record<string, string> = {
  nvda: "NVDA",
  aapl: "AAPL",
  tsm: "2330",
  nke: "NKE",
}

const TICKERS = ["nvda", "aapl", "tsm", "nke"] as const
const SECTIONS = [
  "income-statement",
  "balance-sheet",
  "cash-flow-statement",
] as const

describe("parseTikrPage", () => {
  for (const ticker of TICKERS) {
    for (const section of SECTIONS) {
      test(`${ticker}/${section}: basic metadata`, async () => {
        const data = await loadFixture(`${ticker}-${section}.html`)
        expect(data.ticker).toBe(EXPECTED_TICKER[ticker])
        expect(data.unit).toBe("millions")
        expect(data.currentPrice).toBeGreaterThan(0)
      })

      test(`${ticker}/${section}: fiscal years excluded estimates and LTM`, async () => {
        const data = await loadFixture(`${ticker}-${section}.html`)
        expect(data.table.fiscalYears.length).toBeGreaterThan(0)
        for (const fy of data.table.fiscalYears) {
          expect(fy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          expect(fy.endsWith("E")).toBe(false)
        }
      })
    }
  }

  test("NVDA income statement: revenues match known values", async () => {
    const data = await loadFixture("nvda-income-statement.html")
    expect(data.currentPrice).toBe(EXPECTED_PRICE.nvda)
    const revenues = data.table.rows.find((row) => row.label === "Revenues")
    expect(revenues).toBeDefined()
    expect(revenues?.values.length).toBe(data.table.fiscalYears.length)
    const firstYearIndex = data.table.fiscalYears.indexOf("2017-01-29")
    expect(firstYearIndex).toBeGreaterThanOrEqual(0)
    expect(revenues?.values[firstYearIndex]).toBe("6,910.00")
  })

  test("NVDA balance sheet: cash row present", async () => {
    const data = await loadFixture("nvda-balance-sheet.html")
    const cash = data.table.rows.find(
      (row) => row.label === "Cash And Equivalents",
    )
    expect(cash).toBeDefined()
    expect(cash?.values.length).toBe(data.table.fiscalYears.length)
  })

  test("NVDA cash flow statement: capex row present", async () => {
    const data = await loadFixture("nvda-cash-flow-statement.html")
    const capex = data.table.rows.find(
      (row) => row.label === "Capital Expenditure",
    )
    expect(capex).toBeDefined()
    expect(capex?.values.length).toBe(data.table.fiscalYears.length)
  })

  test("AAPL price reads from header", async () => {
    const data = await loadFixture("aapl-income-statement.html")
    expect(data.currentPrice).toBe(EXPECTED_PRICE.aapl)
  })

  test("fiscal years are sorted in table order (oldest first)", async () => {
    const data = await loadFixture("tsm-balance-sheet.html")
    const years = data.table.fiscalYears
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i] > years[i - 1]).toBe(true)
    }
  })
})
