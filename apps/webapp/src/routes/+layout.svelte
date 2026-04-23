<script lang="ts">
import "../app.css"
import { page } from "$app/state"
import CommandPalette from "$lib/components/CommandPalette.svelte"
import TopBar from "$lib/components/TopBar.svelte"
import { palette } from "$lib/stores.svelte"

let { children } = $props()

const breadcrumb = $derived.by(() => {
  const ticker = page.params.ticker
  if (ticker) {
    return [
      { label: "Dashboard", active: false, href: "/" },
      { label: ticker, active: true },
    ]
  }
  return [{ label: "Dashboard", active: true }]
})

$effect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      palette.toggle()
    }
  }
  window.addEventListener("keydown", onKey)
  return () => window.removeEventListener("keydown", onKey)
})
</script>

<div class="shell">
	<TopBar {breadcrumb} />
	<div class="content">
		{@render children()}
	</div>
	<CommandPalette />
</div>
