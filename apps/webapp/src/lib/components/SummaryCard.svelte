<script lang="ts">
import type { Snippet } from "svelte"

let {
  label,
  value,
  valueClass = "",
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: Snippet
} = $props()
</script>

<div class="card card-{valueClass || 'neutral'}">
	<div class="card-label">{label}</div>
	<div class="card-value {valueClass}">{value}</div>
	{#if sub}
		<div class="card-sub">{@render sub()}</div>
	{/if}
</div>
