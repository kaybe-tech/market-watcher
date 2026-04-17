import type { Multiples } from "./multiples"
import type { ProjectedYear } from "./projected-year"

export interface TargetPriceSet {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
  average: number | null
  marginOfSafety: number | null
}

export interface Cagr5y {
  per: number | null
  evFcf: number | null
  evEbitda: number | null
  evEbit: number | null
  average: number | null
}

export interface BuyPrice {
  targetReturn: number
  price: number | null
  differenceVsCurrent: number | null
}

export interface IntrinsicValueInputs {
  currentPrice: number
  projected: Record<number, ProjectedYear>
  multiples: Multiples
}

const TARGET_RETURN = 0.15
const PROJECTION_HORIZON = 5

export class IntrinsicValue {
  readonly targetPrice: Record<number, TargetPriceSet>
  readonly cagr5y: Cagr5y
  readonly buyPrice: BuyPrice

  constructor(inputs: IntrinsicValueInputs) {
    const { currentPrice, projected, multiples } = inputs
    if (currentPrice <= 0) {
      throw new Error("IntrinsicValue requires currentPrice > 0")
    }
    const sortedYears = Object.keys(projected)
      .map((y) => Number.parseInt(y, 10))
      .sort((a, b) => a - b)
    if (sortedYears.length !== PROJECTION_HORIZON) {
      throw new Error(
        `IntrinsicValue requires exactly ${PROJECTION_HORIZON} projected years, got ${sortedYears.length}`,
      )
    }

    this.targetPrice = {}
    for (const year of sortedYears) {
      const py = projected[year]
      if (!py) throw new Error(`Missing projected year ${year}`)
      this.targetPrice[year] = IntrinsicValue.computeTargetPrice(
        py,
        multiples,
        currentPrice,
      )
    }

    const fifthYear = sortedYears[sortedYears.length - 1] as number
    const fifthYearTargetPrice = this.targetPrice[fifthYear] as TargetPriceSet
    this.cagr5y = IntrinsicValue.computeCagr5y(
      fifthYearTargetPrice,
      currentPrice,
    )
    this.buyPrice = IntrinsicValue.computeBuyPrice(
      fifthYearTargetPrice,
      currentPrice,
    )
  }

  private static computeTargetPrice(
    py: ProjectedYear,
    multiples: Multiples,
    currentPrice: number,
  ): TargetPriceSet {
    const { netIncome, ebitda, ebit, fullyDilutedShares } = py.incomeStatement
    const { netDebt } = py.valuation
    const { fcf } = py.freeCashFlow
    const target = multiples.target

    const per = IntrinsicValue.computePerTargetPrice(
      netIncome,
      target.per,
      netDebt,
      fullyDilutedShares,
    )
    const evFcf = IntrinsicValue.computeEvTargetPrice(
      fcf,
      target.evFcf,
      netDebt,
      fullyDilutedShares,
    )
    const evEbitda = IntrinsicValue.computeEvTargetPrice(
      ebitda,
      target.evEbitda,
      netDebt,
      fullyDilutedShares,
    )
    const evEbit = IntrinsicValue.computeEvTargetPrice(
      ebit,
      target.evEbit,
      netDebt,
      fullyDilutedShares,
    )
    const average = IntrinsicValue.averageOfNonNull([
      per,
      evFcf,
      evEbitda,
      evEbit,
    ])
    const marginOfSafety = evFcf === null ? null : evFcf / currentPrice - 1

    return { per, evFcf, evEbitda, evEbit, average, marginOfSafety }
  }

  private static computePerTargetPrice(
    netIncome: number,
    targetPer: number | null,
    netDebt: number,
    fullyDilutedShares: number,
  ): number | null {
    if (targetPer === null) return null
    const base = netIncome * targetPer
    if (netDebt < 0) return (base - netDebt) / fullyDilutedShares
    return base / fullyDilutedShares
  }

  private static computeEvTargetPrice(
    metric: number,
    targetMultiple: number | null,
    netDebt: number,
    fullyDilutedShares: number,
  ): number | null {
    if (targetMultiple === null) return null
    return (metric * targetMultiple - netDebt) / fullyDilutedShares
  }

  private static computeCagr5y(
    fifthYear: TargetPriceSet,
    currentPrice: number,
  ): Cagr5y {
    const per = IntrinsicValue.computeCagr(fifthYear.per, currentPrice)
    const evFcf = IntrinsicValue.computeCagr(fifthYear.evFcf, currentPrice)
    const evEbitda = IntrinsicValue.computeCagr(
      fifthYear.evEbitda,
      currentPrice,
    )
    const evEbit = IntrinsicValue.computeCagr(fifthYear.evEbit, currentPrice)
    const average = IntrinsicValue.averageOfNonNull([
      per,
      evFcf,
      evEbitda,
      evEbit,
    ])
    return { per, evFcf, evEbitda, evEbit, average }
  }

  private static computeCagr(
    targetPrice: number | null,
    currentPrice: number,
  ): number | null {
    if (targetPrice === null) return null
    if (targetPrice <= 0) return null
    return (targetPrice / currentPrice) ** (1 / 5) - 1
  }

  private static computeBuyPrice(
    fifthYear: TargetPriceSet,
    currentPrice: number,
  ): BuyPrice {
    const evFcf = fifthYear.evFcf
    if (evFcf === null || evFcf <= 0) {
      return {
        targetReturn: TARGET_RETURN,
        price: null,
        differenceVsCurrent: null,
      }
    }
    const price = evFcf / (1 + TARGET_RETURN) ** 5
    const differenceVsCurrent = (price - currentPrice) / currentPrice
    return { targetReturn: TARGET_RETURN, price, differenceVsCurrent }
  }

  private static averageOfNonNull(values: (number | null)[]): number | null {
    const nonNull = values.filter((v): v is number => v !== null)
    if (nonNull.length === 0) return null
    let sum = 0
    for (const v of nonNull) sum += v
    return sum / nonNull.length
  }
}
