import { describe, expect, test } from "bun:test"
import * as amzn from "./fixtures/amzn"
import * as cost from "./fixtures/cost"
import * as nke from "./fixtures/nke"
import * as nvda from "./fixtures/nvda"
import {
  buildHistoricalYears,
  type FixtureInputs,
  isClose,
} from "./helpers/fixtures"

type FixtureModule = {
  inputs: FixtureInputs
  expected: {
    historical: Record<string, Record<string, Record<string, unknown>>>
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const { years, built } = buildHistoricalYears(mod.inputs)

    for (const year of years) {
      test(`${year}`, () => {
        const hy = built[year]
        if (!hy) throw new Error(`missing built year ${year}`)
        const exp = mod.expected.historical[String(year)]
        if (!exp) throw new Error(`missing expected for ${year}`)
        const subObjects = [
          "incomeStatement",
          "freeCashFlow",
          "roic",
          "valuation",
        ] as const
        for (const sub of subObjects) {
          const expectedSub = exp[sub]
          if (!expectedSub)
            throw new Error(`missing expected sub ${sub} for ${year}`)
          const actualSub = hy[sub] as unknown as Record<string, unknown>
          for (const key of Object.keys(expectedSub)) {
            const a = actualSub[key]
            const e = expectedSub[key]
            const ok = isClose(a, e)
            expect(
              ok,
              `${name} ${year} ${sub}.${key} -> got ${String(a)}, want ${String(e)}`,
            ).toBe(true)
          }
        }
      })
    }
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
