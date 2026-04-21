<script lang="ts">
import { onMount } from "svelte"
import type { IngestPayload, IngestYear } from "../lib/apiClient"
import { sendIngest } from "../lib/apiClient"
import type { TikrPageData } from "../sources/tikr/domParser"
import { parseTikrPage } from "../sources/tikr/domParser"
import { mapTikrToPayload } from "../sources/tikr/fieldMapper"
import type { TikrSection } from "../sources/tikr/urlMatcher"
import { matchTikrUrl } from "../sources/tikr/urlMatcher"
import { getApiUrl } from "../storage/settings"

const SECTION_LABEL: Record<TikrSection, string> = {
  incomeStatement: "Income Statement",
  balanceSheet: "Balance Sheet",
  cashFlowStatement: "Cash Flow Statement",
}

type Preview = {
  section: TikrSection
  data: TikrPageData
  years: IngestYear[]
}

type Status =
  | { kind: "loading" }
  | { kind: "unsupported"; message: string }
  | { kind: "ready"; preview: Preview }
  | { kind: "sending"; preview: Preview }
  | { kind: "success"; ticker: string; section: TikrSection }
  | { kind: "error"; message: string; preview: Preview }

let status: Status = { kind: "loading" }

const extractHtml = (): string => document.documentElement.outerHTML

const loadPage = async (): Promise<void> => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !tab.id) {
    status = {
      kind: "unsupported",
      message: "No se pudo leer la pestaña activa.",
    }
    return
  }
  const section = matchTikrUrl(tab.url)
  if (!section) {
    status = {
      kind: "unsupported",
      message: "Abre una sección de TIKR (Income, Balance o Cash Flow).",
    }
    return
  }
  let html: string
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractHtml,
    })
    html = (injection?.result as string | undefined) ?? ""
  } catch (err) {
    status = {
      kind: "unsupported",
      message:
        err instanceof Error ? err.message : "No se pudo leer el contenido.",
    }
    return
  }
  if (!html) {
    status = {
      kind: "unsupported",
      message: "La página no entregó contenido.",
    }
    return
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  const data = parseTikrPage(doc.body)
  if (!data.ticker || data.table.fiscalYears.length === 0 || !data.unit) {
    status = {
      kind: "unsupported",
      message:
        "No se pudo extraer ticker, años fiscales o unidades de esta página.",
    }
    return
  }
  const years = mapTikrToPayload(section, data.table, data.unit)
  status = { kind: "ready", preview: { section, data, years } }
}

const send = async (preview: Preview): Promise<void> => {
  status = { kind: "sending", preview }
  const payload: IngestPayload = { years: preview.years }
  if (preview.data.currentPrice !== null && preview.data.currentPrice > 0) {
    payload.currentPrice = preview.data.currentPrice
  }
  const ticker = preview.data.ticker ?? ""
  const apiUrl = await getApiUrl()
  const result = await sendIngest(apiUrl, ticker, payload)
  if (result.ok) {
    status = { kind: "success", ticker, section: preview.section }
  } else {
    status = {
      kind: "error",
      message:
        result.status === null
          ? `Error de red: ${result.message}`
          : `Error ${result.status}: ${result.message}`,
      preview,
    }
  }
}

const openOptions = (): void => {
  void browser.runtime.openOptionsPage?.()
}

onMount(() => {
  void loadPage()
})
</script>

<main>
  <header>
    <h1>Market Watcher</h1>
    <button type="button" class="link" on:click={openOptions}>Opciones</button>
  </header>

  {#if status.kind === "loading"}
    <p class="muted">Leyendo la página de TIKR…</p>
  {:else if status.kind === "unsupported"}
    <p class="error">{status.message}</p>
  {:else if status.kind === "success"}
    <p class="success">
      Enviado ✓ {status.ticker} — {SECTION_LABEL[status.section]}
    </p>
  {:else}
    {@const preview = status.preview}
    {@const years = preview.data.table.fiscalYears}
    <section class="preview">
      <div class="row">
        <span class="label">Sección</span>
        <span>{SECTION_LABEL[preview.section]}</span>
      </div>
      <div class="row">
        <span class="label">Ticker</span>
        <span>{preview.data.ticker}</span>
      </div>
      <div class="row">
        <span class="label">Años</span>
        <span>{years[0]} → {years[years.length - 1]} ({years.length})</span>
      </div>
      <div class="row">
        <span class="label">Precio</span>
        <span>{preview.data.currentPrice !== null ? preview.data.currentPrice : "—"}</span>
      </div>
      <div class="row">
        <span class="label">Unidades</span>
        <span>{preview.data.unit}</span>
      </div>
    </section>
    <button
      type="button"
      on:click={() => send(preview)}
      disabled={status.kind === "sending"}
    >
      {status.kind === "sending" ? "Enviando…" : "Enviar"}
    </button>
    {#if status.kind === "error"}
      <p class="error">{status.message}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h1 {
    font-size: 1.1em;
    margin: 0;
  }
  .link {
    background: none;
    border: none;
    color: #6aa6ff;
    padding: 0;
    font-size: 0.85em;
    cursor: pointer;
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px;
    border: 1px solid #333;
    border-radius: 6px;
    font-size: 0.9em;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .label {
    color: #888;
  }
  .muted {
    color: #888;
  }
  .success {
    color: #4ade80;
  }
  .error {
    color: #f87171;
    white-space: pre-wrap;
  }
</style>
