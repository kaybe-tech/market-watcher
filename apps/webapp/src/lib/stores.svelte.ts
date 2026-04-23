import type { CompanyListItem } from "./types"

class PaletteStore {
  open = $state(false)
  companies = $state<CompanyListItem[]>([])

  openPalette() {
    this.open = true
  }
  close() {
    this.open = false
  }
  toggle() {
    this.open = !this.open
  }
  setCompanies(items: CompanyListItem[]) {
    this.companies = items
  }
}

export const palette = new PaletteStore()
