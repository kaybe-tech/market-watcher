import { inputs as amznInputs } from "@market-watcher/valuation-engine/tests/fixtures/amzn"
import { inputs as costInputs } from "@market-watcher/valuation-engine/tests/fixtures/cost"
import { inputs as nkeInputs } from "@market-watcher/valuation-engine/tests/fixtures/nke"
import { inputs as nvdaInputs } from "@market-watcher/valuation-engine/tests/fixtures/nvda"

type Fixture = typeof amznInputs

const API = process.env.API_URL ?? "http://localhost:3000"

// Scale a fixture's financial values by a multiplier and rebuild years/currentPrice.
const scaleFixture = (
  base: Fixture,
  newTicker: string,
  salesScale: number,
  priceScale: number,
): Fixture => {
  const scaled: Fixture = {
    ticker: newTicker,
    currentPrice: Number((base.currentPrice * priceScale).toFixed(2)),
    financials: {} as Fixture["financials"],
  }
  for (const [year, data] of Object.entries(base.financials)) {
    const yearNum = Number.parseInt(year, 10)
    const scaledYear = {
      incomeStatement: Object.fromEntries(
        Object.entries(data.incomeStatement).map(([k, v]) => [
          k,
          k === "fullyDilutedShares" || k === "minorityInterests"
            ? v
            : Number((v * salesScale).toFixed(1)),
        ]),
      ),
      freeCashFlow: Object.fromEntries(
        Object.entries(data.freeCashFlow).map(([k, v]) => [
          k,
          Number((v * salesScale).toFixed(1)),
        ]),
      ),
      roic: Object.fromEntries(
        Object.entries(data.roic).map(([k, v]) => [
          k,
          Number((v * salesScale).toFixed(1)),
        ]),
      ),
    }
    scaled.financials[yearNum] = scaledYear as (typeof base.financials)[number]
  }
  return scaled
}

// 4 real + 16 derived = 20 tickers
const tickers: Fixture[] = [
  amznInputs,
  nkeInputs,
  nvdaInputs,
  costInputs,
  // Variations of AMZN (e-commerce / retail-tech)
  scaleFixture(amznInputs, "MELI", 0.15, 1.85),
  scaleFixture(amznInputs, "SHOP", 0.05, 0.45),
  scaleFixture(amznInputs, "EBAY", 0.04, 0.28),
  scaleFixture(amznInputs, "ETSY", 0.005, 0.36),
  // Variations of NVDA (chips / hardware)
  scaleFixture(nvdaInputs, "AMD", 0.5, 0.75),
  scaleFixture(nvdaInputs, "AVGO", 0.7, 1.4),
  scaleFixture(nvdaInputs, "TSM", 1.4, 0.85),
  scaleFixture(nvdaInputs, "QCOM", 0.6, 0.6),
  // Variations of NKE (consumer brands)
  scaleFixture(nkeInputs, "LULU", 0.18, 4.5),
  scaleFixture(nkeInputs, "ADIDAS", 0.45, 1.65),
  scaleFixture(nkeInputs, "DKS", 0.25, 1.8),
  scaleFixture(nkeInputs, "UAA", 0.1, 0.13),
  // Variations of COST (defensive retail)
  scaleFixture(costInputs, "WMT", 2.5, 0.07),
  scaleFixture(costInputs, "TGT", 0.42, 0.16),
  scaleFixture(costInputs, "KR", 0.55, 0.08),
  scaleFixture(costInputs, "BJ", 0.08, 0.11),
]

const yearToFiscalYearEnd = (y: number) => `${y}-12-31`

const toIngestBody = (f: Fixture) => ({
  currentPrice: f.currentPrice,
  years: Object.keys(f.financials)
    .map((y) => Number.parseInt(y, 10))
    .sort((a, b) => a - b)
    .map((year) => ({
      fiscalYearEnd: yearToFiscalYearEnd(year),
      incomeStatement: { ...f.financials[year]!.incomeStatement },
      freeCashFlow: { ...f.financials[year]!.freeCashFlow },
      roic: { ...f.financials[year]!.roic },
    })),
})

// Estimates for 12 of the 20: use their last historical year as anchor,
// build 5 forward years with synthetic analyst projections.
const tickersWithEstimates = new Set([
  "AMZN",
  "NVDA",
  "NKE",
  "COST",
  "MELI",
  "AMD",
  "AVGO",
  "LULU",
  "ADIDAS",
  "WMT",
  "TGT",
  "TSM",
])

const buildEstimatesBody = (f: Fixture) => {
  const lastYear = Math.max(
    ...Object.keys(f.financials).map((y) => Number.parseInt(y, 10)),
  )
  const lastData = f.financials[lastYear]!
  const baseEbitMargin = lastData.incomeStatement.ebit / lastData.incomeStatement.sales
  const baseSalesGrowth = lastYear > 2020 ? 0.08 : 0.06
  const baseTaxRate = 0.21
  const baseCapexRatio =
    Math.abs(lastData.freeCashFlow.capexMaintenance) / lastData.incomeStatement.sales
  const baseNetDebtEbitda = -0.5

  const years = []
  for (let i = 1; i <= 5; i++) {
    const decay = i * 0.005
    years.push({
      fiscalYearEnd: yearToFiscalYearEnd(lastYear + i),
      salesGrowth: Math.max(0.03, baseSalesGrowth - decay),
      ebitMargin: baseEbitMargin * (1 + 0.01 * (i - 1)),
      taxRate: baseTaxRate,
      capexMaintenanceSalesRatio: baseCapexRatio,
      netDebtEbitdaRatio: baseNetDebtEbitda + 0.05 * i,
    })
  }
  return { source: "analyst_consensus", years }
}

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} → ${res.status}: ${text}`)
  }
}

console.log(`Seeding ${tickers.length} companies into ${API}…`)
for (const f of tickers) {
  await post(`/companies/${f.ticker}/data`, toIngestBody(f))
  process.stdout.write(`  ${f.ticker} data ✓`)
  if (tickersWithEstimates.has(f.ticker)) {
    await post(`/companies/${f.ticker}/estimates`, buildEstimatesBody(f))
    process.stdout.write(" + estimates ✓")
  }
  console.log()
}

// Wait briefly for background valuations to settle
await new Promise((r) => setTimeout(r, 800))

const list = (await fetch(`${API}/companies`).then((r) => r.json())) as Array<{
  ticker: string
  pending: boolean
  summary: { mos1y: number | null }
}>
console.log(
  `\n${list.length} companies in DB. Pending: ${list.filter((c) => c.pending).length}. With MoS: ${list.filter((c) => c.summary.mos1y !== null).length}.`,
)
console.log(
  list
    .map(
      (c) =>
        `  ${c.ticker.padEnd(7)} ${c.pending ? "pending" : c.summary.mos1y !== null ? `MoS ${(c.summary.mos1y * 100).toFixed(1).padStart(6)}%` : "no-val"}`,
    )
    .join("\n"),
)
