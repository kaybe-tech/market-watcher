export interface ProjectionYearOverride {
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  shareGrowth?: number
  capexMaintenanceSalesRatio?: number
  changeInWorkingCapital?: number
  netDebtEbitdaRatio?: number
}

export interface TargetMultiplesOverride {
  per?: number
  evEbitda?: number
  evEbit?: number
  evFcf?: number
}

export interface ValuationOverrides {
  projections?: Record<number, ProjectionYearOverride>
  targetMultiples?: TargetMultiplesOverride
}
