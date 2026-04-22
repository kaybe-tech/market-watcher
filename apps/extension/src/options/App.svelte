<script lang="ts">
import { onMount } from "svelte"
import {
  DEFAULT_API_URL,
  DEFAULT_ESTIMATE_YEARS_LIMIT,
  getApiUrl,
  getEstimateYearsLimit,
  isValidApiUrl,
  isValidEstimateYearsLimit,
  setApiUrl,
  setEstimateYearsLimit,
} from "../storage/settings"

let apiUrl = DEFAULT_API_URL
let estimateYearsLimit: number = DEFAULT_ESTIMATE_YEARS_LIMIT
let feedback: { kind: "success" | "error"; message: string } | null = null

onMount(async () => {
  apiUrl = await getApiUrl()
  estimateYearsLimit = await getEstimateYearsLimit()
})

const save = async (): Promise<void> => {
  if (!isValidApiUrl(apiUrl)) {
    feedback = { kind: "error", message: "La URL no es válida." }
    return
  }
  if (!isValidEstimateYearsLimit(estimateYearsLimit)) {
    feedback = {
      kind: "error",
      message: "Años de estimates debe ser un entero entre 1 y 10.",
    }
    return
  }
  await Promise.all([
    setApiUrl(apiUrl),
    setEstimateYearsLimit(estimateYearsLimit),
  ])
  feedback = { kind: "success", message: "Guardado ✓" }
}
</script>

<main>
  <h1>Opciones</h1>
  <p class="muted">Configura cómo la extensión envía datos al API.</p>
  <label>
    URL base del API
    <input type="url" bind:value={apiUrl} placeholder="http://localhost:3000" />
  </label>
  <label>
    Años de estimates a considerar
    <input
      type="number"
      min="1"
      max="10"
      step="1"
      bind:value={estimateYearsLimit}
    />
    <span class="muted hint">
      Solo se envían los primeros N años proyectados (los más cercanos). Los
      años más lejanos suelen tener menos analistas y peor consenso.
    </span>
  </label>
  <button type="button" on:click={save}>Guardar</button>
  {#if feedback}
    <p class={feedback.kind}>{feedback.message}</p>
  {/if}
</main>

<style>
  main {
    max-width: 420px;
    margin: 32px auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1 {
    margin: 0;
    font-size: 1.3em;
  }
  .muted {
    color: #888;
    margin: 0;
  }
  .hint {
    font-size: 0.8em;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.9em;
  }
  input {
    padding: 0.55em 0.75em;
    border: 1px solid #444;
    background: #1a1a1a;
    color: inherit;
    border-radius: 6px;
    font-family: inherit;
    font-size: 1em;
  }
  .success {
    color: #4ade80;
  }
  .error {
    color: #f87171;
  }
</style>
