<script lang="ts">
import { goto, invalidateAll } from "$app/navigation"
import { deltaClass, fullTime, money, pct, relTime } from "$lib/format"
import { palette } from "$lib/stores.svelte"
import type { CompanyListItem } from "$lib/types"

type SortKey =
  | "ticker"
  | "currentPrice"
  | "buyPrice"
  | "buyPriceDiff"
  | "targetPrice1y"
  | "mos1y"
  | "cagr3y"
  | "cagr5y"
  | "lastValuatedAt"
  | "status"

let { data } = $props()

let sortKey = $state<SortKey>("mos1y")
let sortDir = $state<"asc" | "desc">("desc")
let query = $state("")

$effect(() => {
  palette.setCompanies(data.rows)
})

const now = new Date()

const getVal = (r: CompanyListItem, k: SortKey): number | string => {
  switch (k) {
    case "ticker":
      return r.ticker
    case "currentPrice":
      return r.currentPrice ?? Number.NEGATIVE_INFINITY
    case "buyPrice":
      return r.summary.buyPrice ?? Number.NEGATIVE_INFINITY
    case "buyPriceDiff":
      return r.summary.buyPriceDiff ?? Number.NEGATIVE_INFINITY
    case "targetPrice1y":
      return r.summary.targetPrice1y ?? Number.NEGATIVE_INFINITY
    case "mos1y":
      return r.summary.mos1y ?? Number.NEGATIVE_INFINITY
    case "cagr3y":
      return r.summary.cagr3y ?? Number.NEGATIVE_INFINITY
    case "cagr5y":
      return r.summary.cagr5y ?? Number.NEGATIVE_INFINITY
    case "lastValuatedAt":
      return r.lastValuatedAt
        ? new Date(r.lastValuatedAt).getTime()
        : Number.NEGATIVE_INFINITY
    case "status":
      return r.valuationInProgress ? 1 : r.pending ? 2 : 0
  }
}

const sorted = $derived.by(() => {
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? data.rows.filter(
        (r) =>
          r.ticker.toLowerCase().includes(needle) ||
          (r.name?.toLowerCase().includes(needle) ?? false),
      )
    : data.rows.slice()
  filtered.sort((a, b) => {
    const av = getVal(a, sortKey)
    const bv = getVal(b, sortKey)
    if (av === bv) return 0
    const cmp = av > bv ? 1 : -1
    return sortDir === "asc" ? cmp : -cmp
  })
  return filtered
})

const toggleSort = (k: SortKey) => {
  if (sortKey === k) {
    sortDir = sortDir === "asc" ? "desc" : "asc"
  } else {
    sortKey = k
    sortDir = "desc"
  }
}

const isEmpty = $derived(data.rows.length === 0 && data.error === null)

const columns: { k: SortKey; label: string; num: boolean }[] = [
  { k: "ticker", label: "Ticker", num: false },
  { k: "currentPrice", label: "Precio", num: true },
  { k: "buyPrice", label: "Buy price", num: true },
  { k: "buyPriceDiff", label: "Δ vs actual", num: true },
  { k: "targetPrice1y", label: "Target 1y", num: true },
  { k: "mos1y", label: "MoS 1y", num: true },
  { k: "cagr3y", label: "CAGR 3y", num: true },
  { k: "cagr5y", label: "CAGR 5y", num: true },
  { k: "status", label: "Estado", num: false },
  { k: "lastValuatedAt", label: "Última", num: false },
]
</script>

<div class="page-head">
	<div class="page-title">
		<h1>Dashboard</h1>
		<span class="count">{data.rows.length} {data.rows.length === 1 ? 'empresa' : 'empresas'}</span>
	</div>
	{#if !isEmpty}
		<div class="inline-search">
			<svg
				class="icon"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="11" cy="11" r="7" />
				<path d="m21 21-4.35-4.35" />
			</svg>
			<input bind:value={query} placeholder="Filtrar por ticker…" spellcheck="false" />
		</div>
	{/if}
</div>

{#if data.error}
	<div class="banner banner-err">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" />
			<path d="M12 8v4M12 16h.01" />
		</svg>
		No se pudo conectar al API (<span class="mono">{data.error}</span>). Revisa que
		<span class="mono">apps/api</span> esté corriendo.
		<button onclick={() => invalidateAll()}>Reintentar</button>
	</div>
{:else if isEmpty}
	<div class="empty-card">
		<div class="icon-wrap">
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
			>
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<path d="M3 9h18M9 21V9" />
			</svg>
		</div>
		<h3>Aún no has ingestado empresas</h3>
		<p>
			Captura datos desde TIKR con la extensión <code>market-watcher</code> para Chrome → aparecerán
			aquí listas para valorizar.
		</p>
	</div>
{:else}
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					{#each columns as col (col.k)}
						<th
							class="sortable {col.num ? 'num' : ''}"
							role="columnheader"
							tabindex="0"
							onclick={() => toggleSort(col.k)}
							onkeydown={(e) => e.key === 'Enter' && toggleSort(col.k)}
						>
							{col.label}
							<span
								class="sort-icon"
								style={sortKey === col.k ? '' : 'color: var(--color-text-faint)'}
							>
								{#if sortKey !== col.k}↕{:else if sortDir === 'asc'}↑{:else}↓{/if}
							</span>
						</th>
					{/each}
					<th style="width: 24px;"></th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as r (r.ticker)}
					<tr
						onclick={() => goto(`/${r.ticker}`)}
						role="button"
						tabindex="0"
						onkeydown={(e) => e.key === 'Enter' && goto(`/${r.ticker}`)}
					>
						<td><span class="ticker-cell">{r.ticker}</span></td>
						<td class="num">
							{#if r.currentPrice != null}{money(r.currentPrice)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num">
							{#if r.summary.buyPrice != null}{money(r.summary.buyPrice)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num {deltaClass(r.summary.buyPriceDiff)}">
							{#if r.summary.buyPriceDiff != null}{pct(r.summary.buyPriceDiff)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num">
							{#if r.summary.targetPrice1y != null}{money(r.summary.targetPrice1y)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num {deltaClass(r.summary.mos1y)}">
							{#if r.summary.mos1y != null}{pct(r.summary.mos1y)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num {deltaClass(r.summary.cagr3y)}">
							{#if r.summary.cagr3y != null}{pct(r.summary.cagr3y)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td class="num {deltaClass(r.summary.cagr5y)}">
							{#if r.summary.cagr5y != null}{pct(r.summary.cagr5y)}{:else}<span class="dim">—</span>{/if}
						</td>
						<td>
							{#if r.valuationInProgress}
								<span class="badge badge-accent"><span class="badge-dot"></span>en curso</span>
							{:else if r.pending}
								<span class="badge badge-amber">pending</span>
							{:else}
								<span class="badge">valorizada</span>
							{/if}
						</td>
						<td class="dim">
							{#if r.lastValuatedAt}
								<span class="tooltip-anchor" data-tooltip={fullTime(r.lastValuatedAt)}>
									{relTime(r.lastValuatedAt, now)}
								</span>
							{:else}
								<span class="dim">—</span>
							{/if}
						</td>
						<td class="num"><span class="row-arrow">→</span></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
