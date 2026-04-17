import { describe, expect, test } from "bun:test"
import { type MultipleSet, Multiples } from "../src/multiples"
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
    projected: Record<string, Record<string, unknown>>
    multiples: {
      ltm: MultipleSet
      ntm: MultipleSet
      target: MultipleSet
    }
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const { built } = buildHistoricalYears(mod.inputs)
    const assumptions = new ProjectionAssumptions({ historical: built })

    const lastHistoricalYear = Math.max(
      ...Object.keys(built).map((y) => Number.parseInt(y, 10)),
    )
    const lastHistorical = built[lastHistoricalYear]
    if (!lastHistorical) {
      throw new Error(`missing last historical year ${lastHistoricalYear}`)
    }

    const firstProjectedYear = Math.min(
      ...Object.keys(mod.expected.projected).map((y) => Number.parseInt(y, 10)),
    )
    const firstProjected = new ProjectedYear({
      year: firstProjectedYear,
      currentPrice: mod.inputs.currentPrice,
      prev: lastHistorical,
      assumptions,
      historical: built,
    })

    const multiples = new Multiples({
      currentPrice: mod.inputs.currentPrice,
      lastHistYear: lastHistorical,
      firstProjYear: firstProjected,
    })

    const subObjects = ["ltm", "ntm", "target"] as const
    for (const sub of subObjects) {
      test(sub, () => {
        const expectedSub = mod.expected.multiples[sub]
        const actualSub = multiples[sub] as unknown as Record<string, unknown>
        for (const key of Object.keys(expectedSub)) {
          const a = actualSub[key]
          const e = (expectedSub as unknown as Record<string, unknown>)[key]
          const ok = isClose(a, e)
          expect(
            ok,
            `${name} multiples.${sub}.${key} -> got ${String(a)}, want ${String(e)}`,
          ).toBe(true)
        }
      })
    }
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
