import * as v from "valibot"

const optionalNumber = v.optional(v.number())

const incomeStatementSchema = v.strictObject({
  sales: optionalNumber,
  depreciationAmortization: optionalNumber,
  ebit: optionalNumber,
  interestExpense: optionalNumber,
  interestIncome: optionalNumber,
  taxExpense: optionalNumber,
  minorityInterests: optionalNumber,
  fullyDilutedShares: optionalNumber,
})

const freeCashFlowSchema = v.strictObject({
  capexMaintenance: optionalNumber,
  inventories: optionalNumber,
  accountsReceivable: optionalNumber,
  accountsPayable: optionalNumber,
  unearnedRevenue: optionalNumber,
  dividendsPaid: optionalNumber,
})

const roicSchema = v.strictObject({
  cashAndEquivalents: optionalNumber,
  marketableSecurities: optionalNumber,
  shortTermDebt: optionalNumber,
  longTermDebt: optionalNumber,
  currentOperatingLeases: optionalNumber,
  nonCurrentOperatingLeases: optionalNumber,
  equity: optionalNumber,
})

const fiscalYearEndSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "fiscalYearEnd must follow YYYY-MM-DD"),
  v.check((value) => {
    const [yearStr, monthStr, dayStr] = value.split("-")
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, "fiscalYearEnd must be a real calendar date"),
)

const yearSchema = v.strictObject({
  fiscalYearEnd: fiscalYearEndSchema,
  incomeStatement: v.optional(incomeStatementSchema),
  freeCashFlow: v.optional(freeCashFlowSchema),
  roic: v.optional(roicSchema),
})

export const ingestBodySchema = v.pipe(
  v.strictObject({
    currentPrice: v.optional(
      v.pipe(
        v.number(),
        v.check((n) => !Number.isNaN(n), "currentPrice must not be NaN"),
        v.finite("currentPrice must be a finite number"),
        v.gtValue(0, "currentPrice must be greater than 0"),
      ),
    ),
    years: v.array(yearSchema),
  }),
  v.check((input) => {
    const ends = input.years.map((year) => year.fiscalYearEnd)
    return new Set(ends).size === ends.length
  }, "years must contain unique fiscalYearEnd values"),
)

export const tickerParamSchema = v.object({
  ticker: v.pipe(
    v.string(),
    v.minLength(1, "ticker must not be empty"),
    v.transform((value) => value.toUpperCase()),
  ),
})

export type IngestBodyInput = v.InferInput<typeof ingestBodySchema>
export type IngestBodyOutput = v.InferOutput<typeof ingestBodySchema>
export type TickerParamInput = v.InferInput<typeof tickerParamSchema>
export type TickerParamOutput = v.InferOutput<typeof tickerParamSchema>
