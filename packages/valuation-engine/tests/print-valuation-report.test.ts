import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CompanyValuation } from "../src/company-valuation"
import * as amzn from "./fixtures/amzn"
import * as cost from "./fixtures/cost"
import * as nke from "./fixtures/nke"
import * as nvda from "./fixtures/nvda"
import type { FixtureInputs } from "./helpers/fixtures"

const SNAPSHOTS_DIR = join(import.meta.dir, "fixtures", "reports")

type FixtureModule = {
  inputs: FixtureInputs
}

function runFixture(name: string, mod: FixtureModule) {
  describe(name, () => {
    test("snapshot", () => {
      const valuation = new CompanyValuation(mod.inputs)
      const actual = valuation.printValuationReport({ write: () => {} })
      const expected = readFileSync(join(SNAPSHOTS_DIR, `${name}.txt`), "utf8")
      expect(actual).toBe(expected)
    })
  })
}

runFixture("nvda", nvda as unknown as FixtureModule)
runFixture("amzn", amzn as unknown as FixtureModule)
runFixture("nke", nke as unknown as FixtureModule)
runFixture("cost", cost as unknown as FixtureModule)
