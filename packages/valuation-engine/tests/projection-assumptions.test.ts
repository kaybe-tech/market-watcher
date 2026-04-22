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

describe("interestIncomeRate con distintos denominadores", () => {
  const baseFinancials = (
    mktSec: number,
  ): FixtureInputs["financials"][string] => ({
    incomeStatement: {
      sales: 100,
      depreciationAmortization: -10,
      ebit: 20,
      interestExpense: -1,
      interestIncome: 0.5,
      taxExpense: -5,
      minorityInterests: 0,
      fullyDilutedShares: 10,
    },
    freeCashFlow: {
      capexMaintenance: -2,
      inventories: 10,
      accountsReceivable: 5,
      accountsPayable: 3,
      unearnedRevenue: 0,
      dividendsPaid: -1,
    },
    roic: {
      cashAndEquivalents: 20,
      marketableSecurities: mktSec,
      shortTermDebt: 1,
      longTermDebt: 5,
      currentOperatingLeases: 0,
      nonCurrentOperatingLeases: 0,
      equity: 50,
    },
  })

  test("usa cash + marketableSecurities como denominador", () => {
    const { built } = buildHistoricalYears({
      ticker: "TEST",
      currentPrice: 10,
      financials: {
        "2023": baseFinancials(10),
        "2024": baseFinancials(10),
      },
    })
    const a = new ProjectionAssumptions({ historical: built })
    expect(a.incomeStatement.interestIncomeRate).toBeCloseTo(1 / 60, 10)
  })

  test("retorna 0 cuando cash + marketableSecurities == 0", () => {
    const noCashOrMktSec = (): FixtureInputs["financials"][string] => {
      const f = baseFinancials(0)
      f.roic.cashAndEquivalents = 0
      return f
    }
    const { built } = buildHistoricalYears({
      ticker: "TEST",
      currentPrice: 10,
      financials: {
        "2023": noCashOrMktSec(),
        "2024": noCashOrMktSec(),
      },
    })
    const a = new ProjectionAssumptions({ historical: built })
    expect(a.incomeStatement.interestIncomeRate).toBe(0)
  })

  test("interestExpenseRate retorna 0 cuando sumDebt == 0", () => {
    const noDebt = (): FixtureInputs["financials"][string] => {
      const f = baseFinancials(0)
      f.roic.shortTermDebt = 0
      f.roic.longTermDebt = 0
      return f
    }
    const { built } = buildHistoricalYears({
      ticker: "TEST",
      currentPrice: 10,
      financials: {
        "2023": noDebt(),
        "2024": noDebt(),
      },
    })
    const a = new ProjectionAssumptions({ historical: built })
    expect(a.incomeStatement.interestExpenseRate).toBe(0)
  })
})
