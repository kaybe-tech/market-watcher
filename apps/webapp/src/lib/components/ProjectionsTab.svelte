<script lang="ts">
import { compact, deltaClass, mult, num, pct, pctUnsigned } from "$lib/format"
import type {
  CompanyValuation,
  FreeCashFlow,
  IncomeStatement,
  Roic,
  Valuation,
  YearData,
} from "$lib/types"
import Collapsible from "./Collapsible.svelte"

let { company }: { company: CompanyValuation } = $props()

type Group = "incomeStatement" | "freeCashFlow" | "roic" | "valuation"

type FmtKind = "compact" | "pct" | "pctUnsigned" | "num" | "mult"

// `sign`: pos green / neg red. `inverse`: opposite (buybacks = green).
// `leverage`: NetDebt/EBITDA — ≤0 green (cash position), >3 red (over-levered).
type ColorKind = "sign" | "inverse" | "leverage"

type FieldDef = {
  key: string
  label: string
  fmt: FmtKind
  color?: ColorKind
}

const incomeFields: ReadonlyArray<FieldDef> = [
  { key: "sales", label: "Sales", fmt: "compact" },
  { key: "salesYoYGrowth", label: "Sales YoY %", fmt: "pct", color: "sign" },
  { key: "ebitda", label: "EBITDA", fmt: "compact", color: "sign" },
  { key: "ebitdaMargin", label: "EBITDA Margin", fmt: "pctUnsigned", color: "sign" },
  { key: "ebitdaYoYGrowth", label: "EBITDA YoY %", fmt: "pct", color: "sign" },
  { key: "depreciationAmortization", label: "D&A", fmt: "compact" },
  { key: "ebit", label: "EBIT", fmt: "compact", color: "sign" },
  { key: "ebitMargin", label: "EBIT Margin", fmt: "pctUnsigned", color: "sign" },
  { key: "ebitYoYGrowth", label: "EBIT YoY %", fmt: "pct", color: "sign" },
  { key: "interestExpense", label: "Interest Expense", fmt: "compact" },
  { key: "interestIncome", label: "Interest Income", fmt: "compact" },
  { key: "totalInterest", label: "Total Interest", fmt: "compact" },
  { key: "earningsBeforeTaxes", label: "EBT", fmt: "compact", color: "sign" },
  { key: "taxExpense", label: "Tax Expense", fmt: "compact" },
  { key: "taxRate", label: "Tax Rate", fmt: "pctUnsigned" },
  {
    key: "consolidatedNetIncome",
    label: "Consolidated Net Income",
    fmt: "compact",
    color: "sign",
  },
  { key: "minorityInterests", label: "Minority Interests", fmt: "compact" },
  { key: "netIncome", label: "Net Income", fmt: "compact", color: "sign" },
  { key: "netMargin", label: "Net Margin", fmt: "pctUnsigned", color: "sign" },
  {
    key: "netIncomeYoYGrowth",
    label: "Net Income YoY %",
    fmt: "pct",
    color: "sign",
  },
  { key: "fullyDilutedShares", label: "Shares (M)", fmt: "num" },
  {
    key: "fullyDilutedSharesYoYGrowth",
    label: "Shares YoY %",
    fmt: "pct",
    color: "inverse",
  },
  { key: "eps", label: "EPS", fmt: "num", color: "sign" },
  { key: "epsYoYGrowth", label: "EPS YoY %", fmt: "pct", color: "sign" },
]

const freeCashFlowFields: ReadonlyArray<FieldDef> = [
  { key: "ebitda", label: "EBITDA", fmt: "compact", color: "sign" },
  { key: "capexMaintenance", label: "Capex Maintenance", fmt: "compact" },
  { key: "totalInterest", label: "Total Interest", fmt: "compact" },
  { key: "taxesPaid", label: "Taxes Paid", fmt: "compact" },
  { key: "inventories", label: "Inventories", fmt: "compact" },
  { key: "accountsReceivable", label: "Accounts Receivable", fmt: "compact" },
  { key: "accountsPayable", label: "Accounts Payable", fmt: "compact" },
  { key: "unearnedRevenue", label: "Unearned Revenue", fmt: "compact" },
  { key: "workingCapital", label: "Working Capital", fmt: "compact" },
  {
    key: "changeInWorkingCapital",
    label: "Δ Working Capital",
    fmt: "compact",
  },
  { key: "otherAdjustments", label: "Other Adjustments", fmt: "compact" },
  { key: "fcf", label: "FCF", fmt: "compact", color: "sign" },
  { key: "fcfMargin", label: "FCF Margin", fmt: "pctUnsigned", color: "sign" },
  { key: "fcfYoYGrowth", label: "FCF YoY %", fmt: "pct", color: "sign" },
  { key: "fcfPerShare", label: "FCF/Share", fmt: "num", color: "sign" },
  {
    key: "fcfPerShareYoYGrowth",
    label: "FCF/Share YoY %",
    fmt: "pct",
    color: "sign",
  },
  {
    key: "capexMaintenanceSalesRatio",
    label: "Capex Maint / Sales",
    fmt: "pctUnsigned",
  },
  { key: "workingCapitalSalesRatio", label: "WC / Sales", fmt: "pctUnsigned" },
  { key: "fcfSalesRatio", label: "FCF / Sales", fmt: "pctUnsigned", color: "sign" },
  { key: "cashConversion", label: "Cash Conversion", fmt: "pctUnsigned", color: "sign" },
  { key: "dividendsPaid", label: "Dividends Paid", fmt: "compact" },
  { key: "dividendsFcfRatio", label: "Dividends / FCF", fmt: "pctUnsigned" },
]

const roicFields: ReadonlyArray<FieldDef> = [
  { key: "ebitAfterTax", label: "EBIT After Tax", fmt: "compact", color: "sign" },
  { key: "cashAndEquivalents", label: "Cash & Equivalents", fmt: "compact" },
  {
    key: "marketableSecurities",
    label: "Marketable Securities",
    fmt: "compact",
  },
  { key: "shortTermDebt", label: "Short-Term Debt", fmt: "compact" },
  { key: "longTermDebt", label: "Long-Term Debt", fmt: "compact" },
  { key: "totalDebt", label: "Total Debt", fmt: "compact" },
  {
    key: "currentOperatingLeases",
    label: "Current Op. Leases",
    fmt: "compact",
  },
  {
    key: "nonCurrentOperatingLeases",
    label: "Non-Current Op. Leases",
    fmt: "compact",
  },
  { key: "equity", label: "Equity", fmt: "compact" },
  { key: "investedCapital", label: "Invested Capital", fmt: "compact" },
  { key: "roe", label: "ROE", fmt: "pctUnsigned", color: "sign" },
  { key: "roic", label: "ROIC", fmt: "pctUnsigned", color: "sign" },
]

const valuationFields: ReadonlyArray<FieldDef> = [
  { key: "marketCap", label: "Market Cap", fmt: "compact" },
  { key: "netDebt", label: "Net Debt", fmt: "compact" },
  {
    key: "netDebtEbitdaRatio",
    label: "NetDebt / EBITDA",
    fmt: "mult",
    color: "leverage",
  },
  { key: "enterpriseValue", label: "Enterprise Value", fmt: "compact" },
]

const sortedYears = (record: Record<number, YearData>) =>
  Object.keys(record)
    .map((y) => Number.parseInt(y, 10))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)

const histYears = $derived(sortedYears(company.historical))
const projYears = $derived(sortedYears(company.projected))

const formatValue = (v: unknown, fmt: FmtKind): string => {
  if (typeof v !== "number" && v !== null && v !== undefined) return "—"
  const n = v as number | null | undefined
  switch (fmt) {
    case "compact":
      return compact(n, 1)
    case "pct":
      return pct(n, 1)
    case "pctUnsigned":
      return pctUnsigned(n, 1)
    case "num":
      return num(n, 2)
    case "mult":
      return mult(n, 2)
  }
}

const cellValue = (
  yearData: YearData | undefined,
  group: Group,
  field: string,
): number | null | undefined => {
  if (!yearData) return undefined
  const sub = yearData[group] as
    | IncomeStatement
    | FreeCashFlow
    | Roic
    | Valuation
    | undefined
  if (!sub) return undefined
  return (sub as Record<string, number | null>)[field]
}

const sections: {
  group: Group
  title: string
  fields: ReadonlyArray<FieldDef>
}[] = [
  { group: "incomeStatement", title: "incomeStatement", fields: incomeFields },
  { group: "freeCashFlow", title: "freeCashFlow", fields: freeCashFlowFields },
  { group: "roic", title: "roic", fields: roicFields },
  { group: "valuation", title: "valuation", fields: valuationFields },
]

const colorClass = (
  v: number | null | undefined,
  color: ColorKind | undefined,
): string => {
  if (color === undefined || v == null || !Number.isFinite(v)) return ""
  if (color === "sign") return deltaClass(v)
  if (color === "inverse") return deltaClass(-v)
  // leverage: NetDebt/EBITDA. ≤0 = cash position (good), >3 = over-levered (bad).
  if (v <= 0) return "pos"
  if (v > 3) return "neg"
  return ""
}
</script>

<div class="panel-head" style="border: 1px solid var(--color-border); border-bottom: 0; border-radius: 6px 6px 0 0;">
	<h3>Histórico + Proyectado</h3>
	<span class="panel-sub">{histYears.length} años hist · {projYears.length} años proyectados · todos los campos del engine</span>
</div>

{#each sections as section, sIdx (section.group)}
	<Collapsible
		title={section.title}
		subtitle="{section.fields.length} campos · {histYears.length + projYears.length} años"
		defaultOpen={sIdx === 0}
	>
		<div class="wide-scroll">
			<table class="wide-table">
				<thead>
					<tr>
						<th class="row-label">Concepto</th>
						{#each histYears as y (y)}
							<th>{y}</th>
						{/each}
						<th class="separator"></th>
						{#each projYears as y (y)}
							<th class="proj-head">{y}e</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each section.fields as f (f.key)}
						<tr>
							<td class="row-label">{f.label}</td>
							{#each histYears as y (y)}
								{@const v = cellValue(company.historical[y], section.group, f.key)}
								<td class={colorClass(v, f.color)}>{formatValue(v, f.fmt)}</td>
							{/each}
							<td class="separator"></td>
							{#each projYears as y (y)}
								{@const v = cellValue(company.projected[y], section.group, f.key)}
								<td class="proj-cell {colorClass(v, f.color)}">{formatValue(v, f.fmt)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</Collapsible>
{/each}
