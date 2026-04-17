import { describe, expect, test } from "bun:test"
import { CompanyValuation } from "../src/company-valuation"
import * as amzn from "./fixtures/amzn"
import * as cost from "./fixtures/cost"
import * as nke from "./fixtures/nke"
import * as nvda from "./fixtures/nvda"
import { type FixtureInputs, isClose } from "./helpers/fixtures"

type FixtureModule = {
  inputs: FixtureInputs
  expected: {
    historical: Record<string, Record<string, Record<string, unknown>>>
    assumptions: Record<string, Record<string, unknown>>
    projected: Record<string, Record<string, Record<string, unknown>>>
    multiples: Record<string, Record<string, unknown>>
    intrinsicValue: {
      targetPrice: Record<string, Record<string, unknown>>
      cagr5y: Record<string, unknown>
      buyPrice: Record<string, unknown>
    }
  }
}

function expectClose(path: string, actual: unknown, expected: unknown): void {
  const ok = isClose(actual, expected)
  expect(ok, `${path} -> got ${String(actual)}, want ${String(expected)}`).toBe(
    true,
  )
}

function compareSubObject(
  path: string,
  actual: unknown,
  expected: Record<string, unknown>,
): void {
  const act = actual as Record<string, unknown>
  for (const key of Object.keys(expected)) {
    expectClose(`${path}.${key}`, act[key], expected[key])
  }
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    const valuation = new CompanyValuation(mod.inputs)

    test("scalar properties", () => {
      expect(valuation.ticker).toBe(mod.inputs.ticker)
      expect(valuation.sector).toBe(mod.inputs.sector)
      expectClose(
        "currentPrice",
        valuation.currentPrice,
        mod.inputs.currentPrice,
      )
    })

    describe("historical", () => {
      for (const yearKey of Object.keys(mod.expected.historical)) {
        const year = Number.parseInt(yearKey, 10)
        const expectedYear = mod.expected.historical[yearKey] as Record<
          string,
          Record<string, unknown>
        >
        for (const sub of Object.keys(expectedYear)) {
          test(`${yearKey}.${sub}`, () => {
            const actualYear = valuation.historical[year] as unknown as Record<
              string,
              unknown
            >
            compareSubObject(
              `historical.${yearKey}.${sub}`,
              actualYear[sub],
              expectedYear[sub] as Record<string, unknown>,
            )
          })
        }
      }
    })

    describe("assumptions", () => {
      for (const sub of Object.keys(mod.expected.assumptions)) {
        test(sub, () => {
          const actual = (
            valuation.assumptions as unknown as Record<string, unknown>
          )[sub]
          compareSubObject(
            `assumptions.${sub}`,
            actual,
            mod.expected.assumptions[sub] as Record<string, unknown>,
          )
        })
      }
    })

    describe("projected", () => {
      for (const yearKey of Object.keys(mod.expected.projected)) {
        const year = Number.parseInt(yearKey, 10)
        const expectedYear = mod.expected.projected[yearKey] as Record<
          string,
          Record<string, unknown>
        >
        for (const sub of Object.keys(expectedYear)) {
          test(`${yearKey}.${sub}`, () => {
            const actualYear = valuation.projected[year] as unknown as Record<
              string,
              unknown
            >
            compareSubObject(
              `projected.${yearKey}.${sub}`,
              actualYear[sub],
              expectedYear[sub] as Record<string, unknown>,
            )
          })
        }
      }
    })

    describe("multiples", () => {
      for (const sub of Object.keys(mod.expected.multiples)) {
        test(sub, () => {
          const actual = (
            valuation.multiples as unknown as Record<string, unknown>
          )[sub]
          compareSubObject(
            `multiples.${sub}`,
            actual,
            mod.expected.multiples[sub] as Record<string, unknown>,
          )
        })
      }
    })

    describe("intrinsicValue", () => {
      for (const yearKey of Object.keys(
        mod.expected.intrinsicValue.targetPrice,
      )) {
        const year = Number.parseInt(yearKey, 10)
        test(`targetPrice.${yearKey}`, () => {
          compareSubObject(
            `intrinsicValue.targetPrice.${yearKey}`,
            valuation.intrinsicValue.targetPrice[year],
            mod.expected.intrinsicValue.targetPrice[yearKey] as Record<
              string,
              unknown
            >,
          )
        })
      }

      test("cagr5y", () => {
        compareSubObject(
          "intrinsicValue.cagr5y",
          valuation.intrinsicValue.cagr5y,
          mod.expected.intrinsicValue.cagr5y,
        )
      })

      test("buyPrice", () => {
        compareSubObject(
          "intrinsicValue.buyPrice",
          valuation.intrinsicValue.buyPrice,
          mod.expected.intrinsicValue.buyPrice,
        )
      })
    })
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
