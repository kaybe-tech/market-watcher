<script lang="ts">
import { onMount } from "svelte"
import {
  DEFAULT_API_URL,
  getApiUrl,
  isValidApiUrl,
  setApiUrl,
} from "../storage/settings"

let value = DEFAULT_API_URL
let feedback: { kind: "success" | "error"; message: string } | null = null

onMount(async () => {
  value = await getApiUrl()
})

const save = async (): Promise<void> => {
  if (!isValidApiUrl(value)) {
    feedback = { kind: "error", message: "La URL no es válida." }
    return
  }
  await setApiUrl(value)
  feedback = { kind: "success", message: "Guardado ✓" }
}
</script>

<main>
  <h1>Opciones</h1>
  <p class="muted">Configura a qué endpoint envía la extensión los datos.</p>
  <label>
    URL base del API
    <input type="url" bind:value placeholder="http://localhost:3000" />
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
