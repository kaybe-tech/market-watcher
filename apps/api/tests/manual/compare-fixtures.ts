/**
 * Manual: ingesta los 4 fixtures del engine contra un servidor en vivo y
 * compara la valoración persistida con el `expected` del fixture con
 * tolerancia 0.01%. No corre bajo `bun test`; requiere servidor arriba.
 *
 * Uso:
 *   bun run apps/api/src/index.ts           # en otra terminal, DB migrada
 *   bun apps/api/tests/manual/compare-fixtures.ts
 *
 * BASE se toma de $API_BASE (default http://localhost:3000).
 */
import { writeFileSync } from "node:fs"
import { isClose } from "@market-watcher/valuation-engine/tests/helpers/fixtures"
import {
  amznFixture,
  costFixture,
  type EngineFixture,
  nkeFixture,
  nvdaFixture,
  toIngestBody,
} from "../fixtures/engine"

const BASE = process.env.API_BASE ?? "http://localhost:3000"
const FIXTURES: EngineFixture[] = [
  amznFixture,
  costFixture,
  nkeFixture,
  nvdaFixture,
]
const SECTIONS = [
  "historical",
  "assumptions",
  "projected",
  "multiples",
  "intrinsicValue",
] as const

const post = (ticker: string, body: unknown) =>
  fetch(`${BASE}/companies/${ticker}/data`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json())

const get = (ticker: string) =>
  fetch(`${BASE}/companies/${ticker}`).then((r) => r.json())

type Diff = { path: string; actual: unknown; expected: unknown }

const diffDeep = (
  actual: unknown,
  expected: unknown,
  path: string,
  out: Diff[],
) => {
  if (
    expected === null ||
    typeof expected === "number" ||
    typeof actual === "number"
  ) {
    if (!isClose(actual, expected)) out.push({ path, actual, expected })
    return
  }
  if (typeof expected !== "object" || expected === undefined) {
    if (actual !== expected) out.push({ path, actual, expected })
    return
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      out.push({ path, actual, expected })
      return
    }
    for (let i = 0; i < expected.length; i++) {
      diffDeep(actual[i], expected[i], `${path}[${i}]`, out)
    }
    return
  }
  if (typeof actual !== "object" || actual === null) {
    out.push({ path, actual, expected })
    return
  }
  const actualObj = actual as Record<string, unknown>
  const expectedObj = expected as Record<string, unknown>
  for (const key of Object.keys(expectedObj)) {
    diffDeep(actualObj[key], expectedObj[key], `${path}.${key}`, out)
  }
}

console.log(`BASE = ${BASE}`)
console.log("--- Ingesta ---")
for (const f of FIXTURES) {
  const body = toIngestBody(f)
  const r = await post(f.inputs.ticker, body)
  console.log(
    `POST /companies/${f.inputs.ticker}/data → ${JSON.stringify(r)} (${body.years.length} años, currentPrice=${body.currentPrice})`,
  )
}

await new Promise((r) => setTimeout(r, 2000))

console.log("\n--- Comparación con fixtures (tolerancia 0.01%) ---")
let totalDiffs = 0
for (const f of FIXTURES) {
  const ticker = f.inputs.ticker
  const response = (await get(ticker)) as {
    valuation: { result: Record<string, unknown> } | null
  }
  const result = response.valuation?.result
  if (!result) {
    console.log(`${ticker}: SIN VALUATION`)
    continue
  }
  const expected = f.expected as Record<string, unknown>
  const diffs: Diff[] = []
  for (const section of SECTIONS) {
    diffDeep(result[section], expected[section], section, diffs)
  }

  totalDiffs += diffs.length
  if (diffs.length === 0) {
    console.log(`${ticker}: ✓ 0 diferencias`)
    continue
  }
  console.log(`${ticker}: ✗ ${diffs.length} diferencias`)
  for (const d of diffs.slice(0, 5)) {
    console.log(
      `  ${d.path}: expected=${JSON.stringify(d.expected)} actual=${JSON.stringify(d.actual)}`,
    )
  }
  if (diffs.length > 5) console.log(`  ... y ${diffs.length - 5} más`)
  writeFileSync(
    `/tmp/${ticker.toLowerCase()}-diffs.json`,
    JSON.stringify(diffs, null, 2),
  )
}

console.log(`\nTotal diferencias: ${totalDiffs}`)
if (totalDiffs > 0) process.exit(1)
