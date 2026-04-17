import { describe, expect, test } from "bun:test"
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
    assumptions: Record<string, Record<string, unknown>>
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const { built } = buildHistoricalYears(mod.inputs)
    const assumptions = new ProjectionAssumptions({ historical: built })

    const subObjects = ["incomeStatement", "freeCashFlow", "roic"] as const
    for (const sub of subObjects) {
      test(sub, () => {
        const expectedSub = mod.expected.assumptions[sub]
        if (!expectedSub) throw new Error(`missing expected sub ${sub}`)
        const actualSub = assumptions[sub] as unknown as Record<string, unknown>
        for (const key of Object.keys(expectedSub)) {
          const a = actualSub[key]
          const e = expectedSub[key]
          const ok = isClose(a, e)
          expect(
            ok,
            `${name} assumptions.${sub}.${key} -> got ${String(a)}, want ${String(e)}`,
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
