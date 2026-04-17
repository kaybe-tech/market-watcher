import { describe, expect, test } from "bun:test"
import {
  type BuyPrice,
  type Cagr5y,
  IntrinsicValue,
  type TargetPriceSet,
} from "../src/intrinsic-value"
import { Multiples } from "../src/multiples"
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
    intrinsicValue: {
      targetPrice: Record<string, TargetPriceSet>
      cagr5y: Cagr5y
      buyPrice: BuyPrice
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

    const projectedYears = Object.keys(mod.expected.projected)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)

    const projected: Record<number, ProjectedYear> = {}
    let prev: typeof lastHistorical | ProjectedYear = lastHistorical
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

    const firstProjected = projected[projectedYears[0] as number]
    if (!firstProjected) throw new Error("missing first projected year")

    const multiples = new Multiples({
      currentPrice: mod.inputs.currentPrice,
      lastHistYear: lastHistorical,
      firstProjYear: firstProjected,
    })

    const intrinsicValue = new IntrinsicValue({
      currentPrice: mod.inputs.currentPrice,
      projected,
      multiples,
    })

    for (const year of projectedYears) {
      test(`targetPrice ${year}`, () => {
        const expectedSet = mod.expected.intrinsicValue.targetPrice[
          String(year)
        ] as TargetPriceSet
        const actualSet = intrinsicValue.targetPrice[year] as TargetPriceSet
        for (const key of Object.keys(
          expectedSet,
        ) as (keyof TargetPriceSet)[]) {
          const a = actualSet[key]
          const e = expectedSet[key]
          const ok = isClose(a, e)
          expect(
            ok,
            `${name} targetPrice.${year}.${key} -> got ${String(a)}, want ${String(e)}`,
          ).toBe(true)
        }
      })
    }

    test("cagr5y", () => {
      const expectedCagr = mod.expected.intrinsicValue.cagr5y
      for (const key of Object.keys(expectedCagr) as (keyof Cagr5y)[]) {
        const a = intrinsicValue.cagr5y[key]
        const e = expectedCagr[key]
        const ok = isClose(a, e)
        expect(
          ok,
          `${name} cagr5y.${key} -> got ${String(a)}, want ${String(e)}`,
        ).toBe(true)
      }
    })

    test("buyPrice", () => {
      const expectedBuy = mod.expected.intrinsicValue.buyPrice
      for (const key of Object.keys(expectedBuy) as (keyof BuyPrice)[]) {
        const a = intrinsicValue.buyPrice[key]
        const e = expectedBuy[key]
        const ok = isClose(a, e)
        expect(
          ok,
          `${name} buyPrice.${key} -> got ${String(a)}, want ${String(e)}`,
        ).toBe(true)
      }
    })
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
