<script lang="ts">
import { goto } from "$app/navigation"
import { palette } from "$lib/stores.svelte"

type Crumb = { label: string; active: boolean; href?: string }
let { breadcrumb }: { breadcrumb: Crumb[] } = $props()
</script>

<div class="topbar">
	<div class="brand" onclick={() => goto('/')} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && goto('/')}>
		<span class="brand-dot"></span>
		<span class="slash">&gt;</span>
		<span><b>market</b><span class="slash">-</span>watcher</span>
	</div>

	<div class="breadcrumb">
		{#each breadcrumb as c, i (i)}
			{#if i > 0}<span class="sep">/</span>{/if}
			{#if c.active}
				<span class="crumb-active">{c.label}</span>
			{:else}
				<span class="crumb-link" role="link" tabindex="0" onclick={() => c.href && goto(c.href)} onkeydown={(e) => e.key === 'Enter' && c.href && goto(c.href)}>
					{c.label}
				</span>
			{/if}
		{/each}
	</div>

	<div class="topbar-right">
		<button class="kbd-hint" onclick={() => palette.openPalette()} title="Abrir paleta de comandos">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="11" cy="11" r="7" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<span>Buscar ticker</span>
			<kbd>⌘K</kbd>
		</button>
	</div>
</div>
