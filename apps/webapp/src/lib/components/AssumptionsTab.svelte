<script lang="ts">
import { mult, pctUnsigned } from "$lib/format"
import type { CompanyValuation } from "$lib/types"
import Collapsible from "./Collapsible.svelte"

let { company }: { company: CompanyValuation } = $props()

type Group = "incomeStatement" | "freeCashFlow" | "roic"

const a = $derived(company.assumptions)

const isMultField = (key: string): boolean =>
  key === "netDebtEbitdaRatio" ||
  (key.toLowerCase().endsWith("ratio") === false &&
    (key.endsWith("Multiple") || key.endsWith("Times")))

const formatValue = (key: string, value: number | null): string => {
  if (value === null) return "—"
  if (key === "netDebtEbitdaRatio") return mult(value, 2)
  return pctUnsigned(value, 2)
}

const sections: { group: Group; title: string }[] = [
  { group: "incomeStatement", title: "incomeStatement" },
  { group: "freeCashFlow", title: "freeCashFlow" },
  { group: "roic", title: "roic" },
]
</script>

{#each sections as section, sIdx (section.group)}
	{@const entries = Object.entries(a[section.group] ?? {})}
	<Collapsible
		title={section.title}
		subtitle="{entries.length} supuestos"
		defaultOpen={sIdx === 0}
	>
		<table class="inner-table">
			<thead>
				<tr>
					<th class="row-label">Campo</th>
					<th>Valor</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as [key, value] (key)}
					<tr>
						<td class="row-label" style="font-family: var(--font-mono); font-size: 11.5px;">
							{key}
						</td>
						<td>{formatValue(key, value as number | null)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</Collapsible>
{/each}
