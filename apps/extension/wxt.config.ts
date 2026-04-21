import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "Market Watcher",
    description:
      "Captura datos financieros desde TIKR y los envía al API de Market Watcher.",
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: ["https://app.tikr.com/*"],
    action: {
      default_title: "Market Watcher",
    },
  },
})
