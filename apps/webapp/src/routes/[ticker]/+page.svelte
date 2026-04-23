<script lang="ts">
import { goto, invalidateAll } from "$app/navigation"
import { page } from "$app/state"
import AssumptionsTab from "$lib/components/AssumptionsTab.svelte"
import OverviewTab from "$lib/components/OverviewTab.svelte"
import ProjectionsTab from "$lib/components/ProjectionsTab.svelte"
import SummaryCard from "$lib/components/SummaryCard.svelte"
import {
  deltaClass,
  fullTime,
  money,
  pct,
  pctUnsigned,
  relTime,
} from "$lib/format"
import { AUTO_SOURCE, MERGED_ESTIMATES_SOURCE } from "$lib/valuation-sources"

let { data } = $props()
let tab = $state<"overview" | "projections" | "assumptions">("overview")

const now = new Date()

const view = $derived(data.view)
const valuation = $derived(data.valuation)
const availableSources = $derived(data.availableSources)
const selectedSource = $derived(data.selectedSource)
const selectedValuationRow = $derived(
  selectedSource && view ? (view.valuations[selectedSource] ?? null) : null,
)

const labelForSource = (source: string): string => {
  if (source === AUTO_SOURCE) return "Automática"
  if (source === MERGED_ESTIMATES_SOURCE) return "Mezcla de estimates"
  return source
    .split(/[-_\s]+/)
    .map((part) => (part ? part[0]?.toUpperCase() + part.slice(1) : part))
    .join(" ")
}

const handleSourceChange = (event: Event) => {
  const target = event.currentTarget as HTMLSelectElement
  const next = target.value
  const url = new URL(page.url)
  url.searchParams.set("source", next)
  void goto(url, { keepFocus: true, noScroll: true })
}

const firstProjYear = $derived.by(() => {
  if (!valuation) return null
  const ys = Object.keys(valuation.projected)
    .map((y) => Number.parseInt(y, 10))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
  return ys[0] ?? null
})

const tp1y = $derived.by(() => {
  if (!valuation || firstProjYear === null) return null
  return valuation.intrinsicValue.targetPrice[firstProjYear] ?? null
})

const buyPriceDiff = $derived(
  valuation?.intrinsicValue.buyPrice.differenceVsCurrent ?? null,
)

const cagr3y = $derived.by(() => {
  if (!valuation || !view?.currentPrice || view.currentPrice <= 0) return null
  const ys = Object.keys(valuation.projected)
    .map((y) => Number.parseInt(y, 10))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
  const thirdYear = ys[2]
  if (thirdYear === undefined) return null
  const target = valuation.intrinsicValue.targetPrice[thirdYear]?.evFcf
  if (target == null) return null
  return (target / view.currentPrice) ** (1 / 3) - 1
})

</script>

{#if data.notFound}
	<div class="not-found">
		<div class="big-code">404</div>
		<h3>No hay información para este ticker</h3>
		<p>
			El ticker <span class="mono">{data.ticker}</span> no ha sido ingestado todavía. Captúralo con
			la extensión o vuelve al dashboard.
		</p>
		<button class="btn-link" onclick={() => goto('/')}>← Volver al Dashboard</button>
	</div>
{:else if data.error}
	<div class="banner banner-err">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" />
			<path d="M12 8v4M12 16h.01" />
		</svg>
		Error: <span class="mono">{data.error}</span>
		<button onclick={() => invalidateAll()}>Reintentar</button>
	</div>
{:else if view}
	<div class="detail-header">
		<div class="detail-left">
			<div class="detail-top">
				<span class="detail-ticker">{view.ticker}</span>
				{#if valuation?.name}
					<span class="detail-name">{valuation.name}</span>
				{/if}
			</div>
			<div class="detail-subline">
				{#if view.latestFiscalYearEnd}
					Datos al {view.latestFiscalYearEnd}<span class="sep">·</span>
				{/if}
				{#if view.valuationInProgress}
					<span style="color: var(--color-accent);">Valoración en curso…</span>
				{:else if view.pending}
					<span style="color: var(--color-amber);">Sin valoración · pending</span>
				{:else if selectedValuationRow?.createdAt}
					Valoración
					<span class="tooltip-anchor" data-tooltip={fullTime(selectedValuationRow.createdAt)}>
						{relTime(selectedValuationRow.createdAt, now)}
					</span>
				{/if}
			</div>
		</div>
		{#if !view.pending && !view.valuationInProgress && availableSources.length > 1 && selectedSource}
			<label class="source-picker">
				<span class="source-picker-label">Valoración</span>
				<select value={selectedSource} onchange={handleSourceChange}>
					{#each availableSources as source (source)}
						<option value={source}>{labelForSource(source)}</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if view.currentPrice != null}
			<div class="detail-price-block">
				<span class="detail-price mono">{money(view.currentPrice)}</span>
				{#if !view.pending && !view.valuationInProgress && cagr3y !== null}
					<span class="detail-delta {deltaClass(cagr3y)}">
						{pct(cagr3y)} CAGR 3y
					</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if view.valuationInProgress}
		<div>
			<div class="banner banner-info">
				<svg
					class="spin"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
				Calculando valoración… el engine está procesando los datos capturados.
				<button onclick={() => invalidateAll()}>Recargar</button>
			</div>
			<div class="progress-bar"></div>
		</div>
	{:else if view.pending}
		<div class="pending-wrap">
			<h3>Faltan datos para valorizar</h3>
			<p>
				La extensión todavía no capturó todos los campos que el engine necesita. Volvé a TIKR y
				relanzá la captura para los años indicados.
			</p>
			{#if view.missing?.ticker && view.missing.ticker.length > 0}
				<div class="missing-year">
					<div class="missing-year-label">Ticker</div>
					<div class="missing-fields">
						{#each view.missing.ticker as f (f)}
							<span class="missing-chip"><span class="obj">ticker.</span>{f}</span>
						{/each}
					</div>
				</div>
			{/if}
			{#each view.missing?.years ?? [] as y (y.fiscalYearEnd)}
				<div class="missing-year">
					<div class="missing-year-label">FY {y.fiscalYearEnd}</div>
					<div class="missing-fields">
						{#each y.incomeStatement ?? [] as f (`is-${f}`)}
							<span class="missing-chip"><span class="obj">incomeStatement.</span>{f}</span>
						{/each}
						{#each y.freeCashFlow ?? [] as f (`fcf-${f}`)}
							<span class="missing-chip"><span class="obj">freeCashFlow.</span>{f}</span>
						{/each}
						{#each y.roic ?? [] as f (`roic-${f}`)}
							<span class="missing-chip"><span class="obj">roic.</span>{f}</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:else if valuation}
		<div class="cards-row">
			<SummaryCard label="Buy price" value={money(valuation.intrinsicValue.buyPrice.price)}>
				{#snippet sub()}
					para retorno
					<b style="color: var(--color-text);"
						>{pctUnsigned(valuation.intrinsicValue.buyPrice.targetReturn)}</b
					> anual<br />
					<span class="inline-delta {deltaClass(buyPriceDiff)}">{pct(buyPriceDiff)}</span> vs actual
				{/snippet}
			</SummaryCard>
			<SummaryCard label="Target price 1y" value={money(tp1y?.evFcf)}>
				{#snippet sub()}
					Método EV/FCF · primer año proyectado
				{/snippet}
			</SummaryCard>
			<SummaryCard
				label="Margin of Safety 1y"
				value={pct(tp1y?.marginOfSafety)}
				valueClass={deltaClass(tp1y?.marginOfSafety ?? null)}
			>
				{#snippet sub()}
					Método EV/FCF · primer año proyectado
				{/snippet}
			</SummaryCard>
			<SummaryCard
				label="CAGR 5y"
				value={pct(valuation.intrinsicValue.cagr5y.evFcf)}
				valueClass={deltaClass(valuation.intrinsicValue.cagr5y.evFcf)}
			>
				{#snippet sub()}
					Método EV/FCF · año 5 proyectado
				{/snippet}
			</SummaryCard>
		</div>

		<div class="tabs-bar">
			{#each [
				{ k: 'overview' as const, label: 'Overview' },
				{ k: 'projections' as const, label: 'Proyecciones' },
				{ k: 'assumptions' as const, label: 'Supuestos' }
			] as t, i (t.k)}
				<button class="tab {tab === t.k ? 'active' : ''}" onclick={() => (tab = t.k)}>
					<span class="tab-num">0{i + 1}</span>{t.label}
				</button>
			{/each}
		</div>

		{#if tab === 'overview'}
			<OverviewTab company={valuation} />
		{:else if tab === 'projections'}
			<ProjectionsTab company={valuation} />
		{:else}
			<AssumptionsTab company={valuation} />
		{/if}
	{/if}
{/if}
