import type { HistoricalYear } from "./historical-year"
import type { ProjectedYear } from "./projected-year"

export interface MultipleSet {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
}

export interface MultiplesInputs {
  currentPrice: number
  lastHistYear: HistoricalYear
  firstProjYear: ProjectedYear
}

export class Multiples {
  readonly ltm: MultipleSet
  readonly ntm: MultipleSet
  readonly target: MultipleSet

  constructor(inputs: MultiplesInputs) {
    const { currentPrice, lastHistYear, firstProjYear } = inputs

    const ltmPer = Multiples.computePer(
      currentPrice,
      lastHistYear.incomeStatement.eps,
    )
    const ltmEvFcf = Multiples.computeEvRatio(
      lastHistYear.valuation.enterpriseValue,
      lastHistYear.freeCashFlow.fcf,
    )
    const ltmEvEbitda = Multiples.computeEvRatio(
      lastHistYear.valuation.enterpriseValue,
      lastHistYear.incomeStatement.ebitda,
    )
    const ltmEvEbit = Multiples.computeEvRatio(
      lastHistYear.valuation.enterpriseValue,
      lastHistYear.incomeStatement.ebit,
    )
    this.ltm = {
      per: ltmPer,
      evFcf: ltmEvFcf,
      evEbitda: ltmEvEbitda,
      evEbit: ltmEvEbit,
    }

    const ntmPer = Multiples.computePer(
      currentPrice,
      firstProjYear.incomeStatement.eps,
    )
    const ntmEvFcf = Multiples.computeEvRatio(
      firstProjYear.valuation.enterpriseValue,
      firstProjYear.freeCashFlow.fcf,
    )
    const ntmEvEbitda = Multiples.computeEvRatio(
      firstProjYear.valuation.enterpriseValue,
      firstProjYear.incomeStatement.ebitda,
    )
    const ntmEvEbit = Multiples.computeEvRatio(
      firstProjYear.valuation.enterpriseValue,
      firstProjYear.incomeStatement.ebit,
    )
    this.ntm = {
      per: ntmPer,
      evFcf: ntmEvFcf,
      evEbitda: ntmEvEbitda,
      evEbit: ntmEvEbit,
    }

    const targetPer = ntmPer
    this.target = {
      per: targetPer,
      evFcf: targetPer,
      evEbitda: ntmEvEbitda,
      evEbit: ntmEvEbit,
    }
  }

  private static computePer(currentPrice: number, eps: number): number | null {
    if (eps === 0) return null
    return currentPrice / eps
  }

  private static computeEvRatio(
    enterpriseValue: number | null,
    denominator: number,
  ): number | null {
    if (enterpriseValue === null) return null
    if (denominator === 0) return null
    return enterpriseValue / denominator
  }
}
