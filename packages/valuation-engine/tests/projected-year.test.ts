import { describe, expect, test } from "bun:test"
import { ProjectedYear } from "../src/projected-year"
import { ProjectionAssumptions } from "../src/projection-assumptions"
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
    projected: Record<string, Record<string, Record<string, unknown>>>
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const { built } = buildHistoricalYears(mod.inputs)
    const assumptions = new ProjectionAssumptions({ historical: built })
    const projectedYears = Object.keys(mod.expected.projected)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)

    const lastHistoricalYear = Math.max(
      ...Object.keys(built).map((y) => Number.parseInt(y, 10)),
    )
    const lastHistorical = built[lastHistoricalYear]
    if (!lastHistorical) {
      throw new Error(`missing last historical year ${lastHistoricalYear}`)
    }
    const projected: Record<number, ProjectedYear> = {}
    let prev: (typeof built)[number] | ProjectedYear = lastHistorical
    for (const year of projectedYears) {
      const py: ProjectedYear = new ProjectedYear({
        year,
        currentPrice: mod.inputs.currentPrice,
        prev,
        assumptions,
        historical: built,
      })
      projected[year] = py
      prev = py
    }

    for (const year of projectedYears) {
      test(`${year}`, () => {
        const py = projected[year]
        if (!py) throw new Error(`missing built projected year ${year}`)
        const exp = mod.expected.projected[String(year)]
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
          const actualSub = py[sub] as unknown as Record<string, unknown>
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
