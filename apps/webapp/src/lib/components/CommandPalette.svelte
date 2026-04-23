<script lang="ts">
import { tick } from "svelte"
import { goto } from "$app/navigation"
import { palette } from "$lib/stores.svelte"

let q = $state("")
let idx = $state(0)
let inputEl = $state<HTMLInputElement | null>(null)

const results = $derived.by(() => {
  const needle = q.trim().toLowerCase()
  if (!needle) return palette.companies
  return palette.companies.filter(
    (c) =>
      c.ticker.toLowerCase().includes(needle) ||
      c.name?.toLowerCase().includes(needle),
  )
})

$effect(() => {
  if (palette.open) {
    q = ""
    idx = 0
    tick().then(() => inputEl?.focus())
  }
})

$effect(() => {
  // reset idx cuando cambia la query
  void q
  idx = 0
})

const choose = (i: number) => {
  const r = results[i]
  if (!r) return
  palette.close()
  void goto(`/${r.ticker}`)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    e.preventDefault()
    palette.close()
  } else if (e.key === "ArrowDown") {
    e.preventDefault()
    idx = Math.min(results.length - 1, idx + 1)
  } else if (e.key === "ArrowUp") {
    e.preventDefault()
    idx = Math.max(0, idx - 1)
  } else if (e.key === "Enter") {
    e.preventDefault()
    choose(idx)
  }
}
</script>

{#if palette.open}
	<div
		class="palette-backdrop"
		onclick={() => palette.close()}
		role="presentation"
	>
		<div
			class="palette"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={() => {}}
		>
			<div class="palette-input">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					style="color: var(--color-text-faint)"
				>
					<circle cx="11" cy="11" r="7" />
					<path d="m21 21-4.35-4.35" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={q}
					onkeydown={onKey}
					placeholder="Buscar por ticker o nombre…"
					spellcheck="false"
				/>
				<span class="esc">ESC</span>
			</div>
			<div class="palette-list">
				{#if results.length === 0}
					<div class="palette-empty">Sin resultados para "{q}"</div>
				{:else}
					<div class="palette-section-label">Empresas · {results.length}</div>
					{#each results as r, i (r.ticker)}
						<div
							class="palette-item {i === idx ? 'active' : ''}"
							role="option"
							aria-selected={i === idx}
							tabindex="0"
							onmouseenter={() => (idx = i)}
							onclick={() => choose(i)}
							onkeydown={(e) => e.key === 'Enter' && choose(i)}
						>
							<span class="ticker">{r.ticker}</span>
							<span class="name">{r.name ?? ''}</span>
							<span class="action">↵ abrir</span>
						</div>
					{/each}
				{/if}
			</div>
			<div class="palette-footer">
				<span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
				<span><kbd>↵</kbd> abrir · <kbd>esc</kbd> cerrar</span>
			</div>
		</div>
	</div>
{/if}
