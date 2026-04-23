<script lang="ts">
import { deltaClass, money, mult, pct } from "$lib/format"
import type { CompanyValuation } from "$lib/types"

let { company }: { company: CompanyValuation } = $props()

const m = $derived(company.multiples)
const tp = $derived(company.intrinsicValue.targetPrice)
const years = $derived(
  Object.keys(tp)
    .map((y) => Number.parseInt(y, 10))
    .sort((a, b) => a - b),
)

const multipleRows: {
  label: string
  k: "per" | "evFcf" | "evEbitda" | "evEbit"
}[] = [
  { label: "PER", k: "per" },
  { label: "EV/FCF", k: "evFcf" },
  { label: "EV/EBITDA", k: "evEbitda" },
  { label: "EV/EBIT", k: "evEbit" },
]
</script>

<div class="two-col">
	<div class="panel">
		<div class="panel-head">
			<h3>Múltiplos</h3>
			<span class="panel-sub">LTM · NTM · Target</span>
		</div>
		<table class="inner-table">
			<thead>
				<tr>
					<th class="row-label">Múltiplo</th>
					<th>LTM</th>
					<th>NTM</th>
					<th>Target</th>
				</tr>
			</thead>
			<tbody>
				{#each multipleRows as row (row.k)}
					<tr>
						<td class="row-label">{row.label}</td>
						<td>{mult(m.ltm[row.k])}</td>
						<td>{mult(m.ntm[row.k])}</td>
						<td>{mult(m.target[row.k])}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="panel">
		<div class="panel-head">
			<h3>Target price por año × método</h3>
			<span class="panel-sub">$USD · MoS vs precio actual</span>
		</div>
		<div style="overflow-x: auto;">
			<table class="inner-table" style="min-width: 640px;">
				<thead>
					<tr>
						<th class="row-label">Método</th>
						{#each years as y (y)}
							<th>{y}e</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each multipleRows as row (row.k)}
						<tr>
							<td class="row-label">{row.label}</td>
							{#each years as y (y)}
								{@const price = tp[y]?.[row.k]}
								<td class={price != null && company.currentPrice ? deltaClass(price - company.currentPrice) : ''}>{money(price)}</td>
							{/each}
						</tr>
					{/each}
					<tr class="emphasis">
						<td class="row-label">Promedio</td>
						{#each years as y (y)}
							<td class={deltaClass(tp[y]?.marginOfSafety)}>{money(tp[y]?.average)}</td>
						{/each}
					</tr>
					<tr class="mos-row">
						<td class="row-label">Margin of Safety</td>
						{#each years as y (y)}
							<td class={deltaClass(tp[y]?.marginOfSafety)}>{pct(tp[y]?.marginOfSafety)}</td>
						{/each}
					</tr>
				</tbody>
			</table>
		</div>
	</div>
</div>
