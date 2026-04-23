<script lang="ts">
import type { Snippet } from "svelte"
import { untrack } from "svelte"

let {
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: Snippet
} = $props()

let open = $state(untrack(() => defaultOpen))
</script>

<div class="collapsible {open ? 'open' : ''}">
	<div
		class="collapsible-head"
		role="button"
		tabindex="0"
		onclick={() => (open = !open)}
		onkeydown={(e) => e.key === 'Enter' && (open = !open)}
	>
		<svg
			class="chev"
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
		>
			<path d="m9 6 6 6-6 6" />
		</svg>
		<span class="title">{title}</span>
		{#if subtitle}
			<span class="count-label">{subtitle}</span>
		{/if}
	</div>
	{#if open}
		<div>{@render children()}</div>
	{/if}
</div>
