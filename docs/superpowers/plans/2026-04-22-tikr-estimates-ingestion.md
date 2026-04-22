# TIKR Estimates Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar las estimaciones forward de TIKR (página `tab=est`), persistirlas como overrides en la DB, y producir una segunda valoración paralela con esos overrides mergeados, coexistiendo con la valoración automática actual.

**Architecture:** Una tabla nueva `yearly_estimates` con PK `(ticker, fiscalYearEnd, source)`. Columna `source` en `valuations`. El Flujo 2 corre el engine dos veces cuando hay estimates (auto + merged). La extensión gana una cuarta sección (`estimates`) con su propio parser de tabla que asocia sub-filas `italic` con el main row anterior. Un endpoint `GET /companies/:ticker/valuations?source=<x>` permite inspeccionar una source aislada on-the-fly.

**Tech Stack:** Bun, TypeScript, Drizzle ORM (bun-sqlite), Hono, Valibot, WXT + Svelte (extension), happy-dom (tests).

**Spec:** [`docs/superpowers/specs/2026-04-22-tikr-estimates-ingestion-design.md`](../specs/2026-04-22-tikr-estimates-ingestion-design.md)

---

## File Structure

**Creates:**
- `apps/api/src/modules/company/estimates.ts` — tipos (`IngestEstimatesPayload`, `MergedOverrides`) y función pura `mergeOverridesForTicker`.
- `apps/api/src/db/migrations/0002_<nombre>.sql` — generado por drizzle-kit con `CREATE TABLE yearly_estimates` + `ALTER TABLE valuations ADD source`.
- `apps/extension/src/sources/tikr/estimatesFieldMapper.ts` — mapping posicional de TIKR estimates rows → payload.
- `apps/extension/tests/estimatesFieldMapper.test.ts`.
- `apps/api/tests/estimates.test.ts` — tests end-to-end del endpoint de estimates + dual valuation.

**Modifies:**
- `apps/api/src/modules/company/schema.ts` — nueva tabla `yearlyEstimates`, columna `source` en `valuations`.
- `apps/api/src/modules/company/repository.ts` — métodos de upsert y lookup de estimates; lookup de valuation por source.
- `apps/api/src/modules/company/company.ts` — método `ingestEstimates`, refactor de `runValuation` para dos corridas.
- `apps/api/src/modules/company/validators.ts` — schema Valibot del POST /estimates.
- `apps/api/src/modules/company/routes.ts` — rutas POST /estimates y GET /valuations?source=.
- `apps/extension/src/lib/fiscalYearParser.ts` — regex para `M/D/YY <A|E>`.
- `apps/extension/src/lib/columnFilter.ts` — parámetro `mode`.
- `apps/extension/src/lib/numberParser.ts` — helper `parsePercentCell`.
- `apps/extension/src/lib/apiClient.ts` — función `sendEstimates`.
- `apps/extension/src/sources/tikr/urlMatcher.ts` — `est` → `estimates`.
- `apps/extension/src/sources/tikr/domParser.ts` — aceptar `section` para delegar filter mode.
- `apps/extension/src/sources/tikr/index.ts` — re-exportar `estimatesFieldMapper`.
- `apps/extension/src/popup/App.svelte` — rama para sección estimates.
- `apps/extension/tests/fiscalYearParser.test.ts`, `columnFilter.test.ts`, `urlMatcher.test.ts`, `domParser.test.ts` — casos nuevos.

---

## Task 1: DB schema — tabla `yearly_estimates` + columna `source` en `valuations`

**Files:**
- Modify: `apps/api/src/modules/company/schema.ts`
- Create: `apps/api/src/db/migrations/0002_<generado>.sql` (vía drizzle-kit)
- Test: `apps/api/tests/schema.test.ts` (cases nuevos)

- [ ] **Step 1: Escribir test de schema que falla**

Abrir `apps/api/tests/schema.test.ts` y agregar:

```ts
import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createDb } from "@/db"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

describe("yearly_estimates schema", () => {
  it("permite upsert con clave (ticker, fiscalYearEnd, source)", () => {
    const db = createDb(":memory:")
    migrate(db, { migrationsFolder })
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } }).$client

    sqlite.exec(
      `INSERT INTO yearly_estimates (ticker, fiscal_year_end, source, captured_at, sales_growth, ebit_margin, tax_rate, capex_maintenance_sales_ratio, net_debt_ebitda_ratio)
       VALUES ('NVDA', '2027-01-31', 'tikr', '2026-04-22T10:00:00.000Z', 0.45, 0.62, 0.18, 0.04, -0.5)`,
    )

    const rows = sqlite.query("SELECT * FROM yearly_estimates").all() as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ticker: "NVDA",
      fiscal_year_end: "2027-01-31",
      source: "tikr",
      sales_growth: 0.45,
      ebit_margin: 0.62,
      tax_rate: 0.18,
      capex_maintenance_sales_ratio: 0.04,
      net_debt_ebitda_ratio: -0.5,
    })
  })

  it("valuations tiene columna source con default 'auto'", () => {
    const db = createDb(":memory:")
    migrate(db, { migrationsFolder })
    const sqlite = (db as unknown as { $client: { exec: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } }).$client

    sqlite.exec(
      `INSERT INTO valuations (ticker, fiscal_year_end, result, created_at)
       VALUES ('NVDA', '2026-01-31', '{}', '2026-04-22T10:00:00.000Z')`,
    )

    const rows = sqlite.query("SELECT source FROM valuations").all() as Array<{ source: string }>
    expect(rows[0]?.source).toBe("auto")
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar por tabla/columna ausente**

```bash
cd apps/api && bun test schema.test.ts
```

Esperado: FAIL con `no such table: yearly_estimates` o `no such column: source`.

- [ ] **Step 3: Modificar schema.ts para agregar tabla y columna**

Editar `apps/api/src/modules/company/schema.ts`. Dentro del import existente de drizzle, agregar `primaryKey` si no está, y agregar al final del archivo (después de `valuations` y antes de los `type` exports):

```ts
export const yearlyEstimates = sqliteTable(
  "yearly_estimates",
  {
    ticker: text("ticker").notNull(),
    fiscalYearEnd: text("fiscal_year_end").notNull(),
    source: text("source").notNull(),
    capturedAt: text("captured_at").notNull(),

    salesGrowth: real("sales_growth"),
    ebitMargin: real("ebit_margin"),
    taxRate: real("tax_rate"),
    capexMaintenanceSalesRatio: real("capex_maintenance_sales_ratio"),
    netDebtEbitdaRatio: real("net_debt_ebitda_ratio"),
  },
  (table) => [
    primaryKey({
      columns: [table.ticker, table.fiscalYearEnd, table.source],
    }),
  ],
)
```

Y en el bloque existente de `valuations`, agregar la columna `source` con default:

```ts
export const valuations = sqliteTable("valuations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  fiscalYearEnd: text("fiscal_year_end").notNull(),
  result: text("result", { mode: "json" }).$type<CompanyValuation>().notNull(),
  createdAt: text("created_at").notNull(),
  source: text("source").notNull().default("auto"),
})
```

Al final del archivo, agregar los type exports:

```ts
export type YearlyEstimatesRow = InferSelectModel<typeof yearlyEstimates>
```

- [ ] **Step 4: Generar la migración con drizzle-kit**

```bash
cd apps/api && bun run db:generate
```

Esperado: un archivo nuevo `src/db/migrations/0002_<nombre>.sql` con `CREATE TABLE yearly_estimates` y el ALTER/recreate para `valuations` con la columna `source`.

Verificar visualmente que la migración incluye:
- `CREATE TABLE yearly_estimates` con PK compuesta `(ticker, fiscal_year_end, source)`.
- Modificación de `valuations` que agrega `source TEXT NOT NULL DEFAULT 'auto'` (drizzle-kit puede elegir `ALTER TABLE ADD COLUMN` o recreate vía `__new_valuations`).

- [ ] **Step 5: Correr tests — deben pasar**

```bash
cd apps/api && bun test schema.test.ts
```

Esperado: los 2 casos del schema pasan.

- [ ] **Step 6: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/schema.ts apps/api/src/db/migrations/ apps/api/tests/schema.test.ts
git commit -m "feat(api): agregar tabla yearly_estimates y columna source en valuations"
```

---

## Task 2: Repository — upsert y lookup de estimates, valuations por source

**Files:**
- Modify: `apps/api/src/modules/company/repository.ts`
- Test: `apps/api/tests/repository.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `apps/api/tests/repository.test.ts`:

```ts
describe("CompanyRepository - yearly_estimates", () => {
  it("upsertEstimate crea fila nueva con capturedAt", () => {
    const { repository } = setup()
    repository.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: 0.62,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.45)
    expect(rows[0]?.ebitMargin).toBe(0.62)
  })

  it("upsertEstimate reemplaza la fila existente (PK ticker+year+source)", () => {
    const { repository } = setup()
    repository.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: 0.62,
      taxRate: 0.18,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    repository.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-05-01T10:00:00.000Z",
      salesGrowth: 0.50,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: 0.04,
      netDebtEbitdaRatio: null,
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      salesGrowth: 0.50,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: 0.04,
      capturedAt: "2026-05-01T10:00:00.000Z",
    })
  })

  it("listSourcesForTicker devuelve sources distintas", () => {
    const { repository } = setup()
    repository.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "tikr",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.45,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    repository.upsertEstimate({
      ticker: "NVDA",
      fiscalYearEnd: "2027-01-31",
      source: "manual",
      capturedAt: "2026-04-22T10:00:00.000Z",
      salesGrowth: 0.50,
      ebitMargin: null,
      taxRate: null,
      capexMaintenanceSalesRatio: null,
      netDebtEbitdaRatio: null,
    })
    const sources = repository.listSourcesForTicker("NVDA")
    expect(new Set(sources)).toEqual(new Set(["tikr", "manual"]))
  })
})

describe("CompanyRepository - valuations por source", () => {
  it("getLatestValuationBySource filtra por source", () => {
    const { repository } = setup()
    repository.insertValuation({
      ticker: "NVDA",
      fiscalYearEnd: "2026-01-31",
      result: {} as never,
      createdAt: "2026-04-22T10:00:00.000Z",
      source: "auto",
    })
    repository.insertValuation({
      ticker: "NVDA",
      fiscalYearEnd: "2026-01-31",
      result: {} as never,
      createdAt: "2026-04-22T10:00:01.000Z",
      source: "merged_estimates",
    })
    expect(repository.getLatestValuationBySource("NVDA", "auto")?.source).toBe("auto")
    expect(repository.getLatestValuationBySource("NVDA", "merged_estimates")?.source).toBe("merged_estimates")
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test repository.test.ts
```

Esperado: FAIL con `repository.upsertEstimate is not a function` y similares.

- [ ] **Step 3: Implementar los métodos en repository.ts**

Editar `apps/api/src/modules/company/repository.ts`. Ajustar el import agregando `yearlyEstimates` y `YearlyEstimatesRow`, e `InferSelectModel` no es necesario porque ya viene desde schema:

```ts
import {
  type TickerStateRow,
  tickerState,
  type ValuationRow,
  valuations,
  type YearlyEstimatesRow,
  yearlyEstimates,
  type YearlyFinancialsRow,
  yearlyFinancials,
} from "./schema"
```

Agregar métodos dentro de la clase (antes del cierre final):

```ts
upsertEstimate(row: YearlyEstimatesRow): void {
  this.db
    .insert(yearlyEstimates)
    .values(row)
    .onConflictDoUpdate({
      target: [
        yearlyEstimates.ticker,
        yearlyEstimates.fiscalYearEnd,
        yearlyEstimates.source,
      ],
      set: {
        capturedAt: row.capturedAt,
        salesGrowth: row.salesGrowth,
        ebitMargin: row.ebitMargin,
        taxRate: row.taxRate,
        capexMaintenanceSalesRatio: row.capexMaintenanceSalesRatio,
        netDebtEbitdaRatio: row.netDebtEbitdaRatio,
      },
    })
    .run()
}

listEstimatesForTicker(ticker: string): YearlyEstimatesRow[] {
  return this.db
    .select()
    .from(yearlyEstimates)
    .where(eq(yearlyEstimates.ticker, ticker))
    .orderBy(desc(yearlyEstimates.fiscalYearEnd))
    .all()
}

listSourcesForTicker(ticker: string): string[] {
  const rows = this.db
    .selectDistinct({ source: yearlyEstimates.source })
    .from(yearlyEstimates)
    .where(eq(yearlyEstimates.ticker, ticker))
    .all()
  return rows.map((row) => row.source)
}

getLatestValuationBySource(
  ticker: string,
  source: string,
): ValuationRow | null {
  const [row] = this.db
    .select()
    .from(valuations)
    .where(and(eq(valuations.ticker, ticker), eq(valuations.source, source)))
    .orderBy(desc(valuations.createdAt), desc(valuations.id))
    .limit(1)
    .all()
  return row ?? null
}
```

Cambiar también la signatura de `insertValuation` para que acepte el `source`:

```ts
insertValuation(row: Omit<ValuationRow, "id">): ValuationRow {
  const [inserted] = this.db.insert(valuations).values(row).returning().all()
  if (!inserted) {
    throw new Error("insertValuation: no row returned from insert")
  }
  return inserted
}
```

(La signatura es la misma — `source` ya es parte de `ValuationRow` después de Task 1. No hay cambio real de tipo, pero el test ahora obliga a pasar `source`.)

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test repository.test.ts
```

Esperado: PASS todos los tests nuevos y los existentes.

Si algún test existente (p. ej. el del repository base) rompe porque el insertValuation existente no pasa `source`, arreglar esos tests agregando `source: "auto"` al payload.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/repository.ts apps/api/tests/repository.test.ts
git commit -m "feat(api): agregar upsert/list de estimates y lookup de valuation por source"
```

---

## Task 3: Merge de overrides — función pura

**Files:**
- Create: `apps/api/src/modules/company/estimates.ts`
- Test: `apps/api/tests/estimates.test.ts`

- [ ] **Step 1: Crear el test file con casos que fallan**

Crear `apps/api/tests/estimates.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import type { YearlyEstimatesRow } from "@/modules/company/schema"
import { mergeOverrides } from "@/modules/company/estimates"

const row = (
  source: string,
  year: string,
  fields: Partial<YearlyEstimatesRow> = {},
): YearlyEstimatesRow => ({
  ticker: "NVDA",
  fiscalYearEnd: year,
  source,
  capturedAt: "2026-04-22T10:00:00.000Z",
  salesGrowth: null,
  ebitMargin: null,
  taxRate: null,
  capexMaintenanceSalesRatio: null,
  netDebtEbitdaRatio: null,
  ...fields,
})

describe("mergeOverrides", () => {
  it("devuelve overrides vacíos si no hay filas", () => {
    expect(mergeOverrides([])).toEqual({ projections: {} })
  })

  it("mapea 1 source a projections por año", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0.45, ebitMargin: 0.62 }),
      row("tikr", "2028-01-31", { salesGrowth: 0.30 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.45, ebitMargin: 0.62 },
        2028: { salesGrowth: 0.30 },
      },
    })
  })

  it("manual gana sobre tikr campo-por-campo", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: 0.45, ebitMargin: 0.62 }),
      row("manual", "2027-01-31", { salesGrowth: 0.50 }),
    ])
    expect(result).toEqual({
      projections: {
        2027: { salesGrowth: 0.50, ebitMargin: 0.62 },
      },
    })
  })

  it("sources desconocidas resuelven en orden alfabético después de manual y tikr", () => {
    const result = mergeOverrides([
      row("zeta", "2027-01-31", { salesGrowth: 0.10 }),
      row("alpha", "2027-01-31", { salesGrowth: 0.20 }),
    ])
    expect(result.projections[2027]).toEqual({ salesGrowth: 0.20 })
  })

  it("omite campos null en todas las sources", () => {
    const result = mergeOverrides([
      row("tikr", "2027-01-31", { salesGrowth: null, ebitMargin: null }),
    ])
    expect(result.projections[2027]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test estimates.test.ts
```

Esperado: FAIL por `Cannot find module '@/modules/company/estimates'`.

- [ ] **Step 3: Crear `apps/api/src/modules/company/estimates.ts`**

```ts
import type {
  ProjectionYearOverride,
  ValuationOverrides,
} from "@market-watcher/valuation-engine"
import type { YearlyEstimatesRow } from "./schema"

const OVERRIDE_FIELDS = [
  "salesGrowth",
  "ebitMargin",
  "taxRate",
  "capexMaintenanceSalesRatio",
  "netDebtEbitdaRatio",
] as const satisfies ReadonlyArray<keyof ProjectionYearOverride>

const SOURCE_PRIORITY: readonly string[] = ["manual", "tikr"]

const sourceRank = (source: string): number => {
  const index = SOURCE_PRIORITY.indexOf(source)
  return index === -1 ? SOURCE_PRIORITY.length : index
}

const compareSources = (a: string, b: string): number => {
  const ra = sourceRank(a)
  const rb = sourceRank(b)
  if (ra !== rb) return ra - rb
  return a.localeCompare(b)
}

const yearOf = (fiscalYearEnd: string): number =>
  Number.parseInt(fiscalYearEnd.slice(0, 4), 10)

export const mergeOverrides = (
  rows: YearlyEstimatesRow[],
): ValuationOverrides => {
  const byYear = new Map<number, YearlyEstimatesRow[]>()
  for (const row of rows) {
    const year = yearOf(row.fiscalYearEnd)
    const bucket = byYear.get(year) ?? []
    bucket.push(row)
    byYear.set(year, bucket)
  }

  const projections: Record<number, ProjectionYearOverride> = {}
  for (const [year, bucket] of byYear) {
    bucket.sort((a, b) => compareSources(a.source, b.source))
    const merged: ProjectionYearOverride = {}
    for (const field of OVERRIDE_FIELDS) {
      for (const row of bucket) {
        const value = row[field]
        if (value !== null && value !== undefined) {
          merged[field] = value
          break
        }
      }
    }
    if (Object.keys(merged).length > 0) {
      projections[year] = merged
    }
  }

  return { projections }
}
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test estimates.test.ts
```

Esperado: PASS los 5 casos.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/estimates.ts apps/api/tests/estimates.test.ts
git commit -m "feat(api): agregar mergeOverrides para resolver ValuationOverrides desde estimates"
```

---

## Task 4: Valibot validator para POST /estimates

**Files:**
- Modify: `apps/api/src/modules/company/validators.ts`
- Test: `apps/api/tests/validators.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `apps/api/tests/validators.test.ts`:

```ts
import { estimatesBodySchema } from "@/modules/company/validators"
import * as v from "valibot"

describe("estimatesBodySchema", () => {
  it("acepta payload mínimo con solo source", () => {
    const result = v.safeParse(estimatesBodySchema, { source: "tikr" })
    expect(result.success).toBe(true)
  })

  it("acepta payload con years", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [
        {
          fiscalYearEnd: "2027-01-31",
          salesGrowth: 0.45,
          ebitMargin: 0.62,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rechaza source vacío", () => {
    const result = v.safeParse(estimatesBodySchema, { source: "" })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd mal formado", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-13-40" }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza campos desconocidos", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-01-31", unknownField: 1 }],
    })
    expect(result.success).toBe(false)
  })

  it("rechaza fiscalYearEnd duplicados", () => {
    const result = v.safeParse(estimatesBodySchema, {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.1 },
        { fiscalYearEnd: "2027-01-31", ebitMargin: 0.5 },
      ],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test validators.test.ts
```

Esperado: FAIL por `estimatesBodySchema` no exportado.

- [ ] **Step 3: Agregar el schema a `validators.ts`**

Al final de `apps/api/src/modules/company/validators.ts`, antes de los type exports:

```ts
const estimateYearSchema = v.strictObject({
  fiscalYearEnd: fiscalYearEndSchema,
  salesGrowth: optionalNumber,
  ebitMargin: optionalNumber,
  taxRate: optionalNumber,
  capexMaintenanceSalesRatio: optionalNumber,
  netDebtEbitdaRatio: optionalNumber,
})

export const estimatesBodySchema = v.pipe(
  v.strictObject({
    source: v.pipe(v.string(), v.minLength(1, "source must not be empty")),
    years: v.optional(v.array(estimateYearSchema)),
  }),
  v.check((input) => {
    const years = input.years ?? []
    const ends = years.map((year) => year.fiscalYearEnd)
    return new Set(ends).size === ends.length
  }, "years must contain unique fiscalYearEnd values"),
)

export type EstimatesBodyInput = v.InferInput<typeof estimatesBodySchema>
export type EstimatesBodyOutput = v.InferOutput<typeof estimatesBodySchema>
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test validators.test.ts
```

Esperado: PASS los 6 casos nuevos.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/validators.ts apps/api/tests/validators.test.ts
git commit -m "feat(api): agregar validator estimatesBodySchema"
```

---

## Task 5: Company.ingestEstimates — upsert + pending flag

**Files:**
- Modify: `apps/api/src/modules/company/company.ts`
- Test: `apps/api/tests/company.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `apps/api/tests/company.test.ts` (o en `estimates.test.ts` — prefiero mantenerlo acá por consistencia con el resto de unit tests de Company):

```ts
describe("Company.ingestEstimates", () => {
  it("crea TickerState si no existe y marca pendingValuation=true", () => {
    const { company, repository } = setup()
    const result = company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        {
          fiscalYearEnd: "2027-01-31",
          salesGrowth: 0.45,
          ebitMargin: 0.62,
        },
      ],
    })
    expect(result.pendingValuation).toBe(true)
    expect(repository.getTickerState("NVDA")).toMatchObject({
      ticker: "NVDA",
      pendingValuation: true,
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.45)
  })

  it("upsert reemplaza la fila existente", () => {
    const { company, repository } = setup()
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.45, ebitMargin: 0.62 },
      ],
    })
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.50 },
      ],
    })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.50)
    expect(rows[0]?.ebitMargin).toBeNull()
  })

  it("payload sin years acepta pero no toca pendingValuation", () => {
    const { company, repository } = setup()
    repository.insertTickerState({
      ticker: "NVDA",
      latestFiscalYearEnd: null,
      pendingValuation: false,
      currentPrice: null,
    })
    const result = company.ingestEstimates("NVDA", { source: "tikr" })
    expect(result.pendingValuation).toBe(false)
    expect(repository.getTickerState("NVDA")?.pendingValuation).toBe(false)
  })
})
```

Asumir que `setup()` devuelve `{ company, repository }` como ya hace en ese test file. Si no, copiá la estructura de los tests vecinos.

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test company.test.ts
```

Esperado: FAIL por `company.ingestEstimates is not a function`.

- [ ] **Step 3: Agregar `ingestEstimates` a `Company` en `company.ts`**

Primero agregar el tipo al inicio del archivo (cerca de `IngestPayload`):

```ts
export type IncomingEstimateYear = {
  fiscalYearEnd: string
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  capexMaintenanceSalesRatio?: number
  netDebtEbitdaRatio?: number
}

export type IngestEstimatesPayload = {
  source: string
  years?: IncomingEstimateYear[]
}
```

Luego agregar el método dentro de la clase (puede ir cerca de `ingestData`):

```ts
ingestEstimates(
  ticker: string,
  payload: IngestEstimatesPayload,
): IngestResult {
  return this.repository.runInTransaction(() => {
    const previousState = this.repository.getTickerState(ticker)
    const capturedAt = new Date().toISOString()

    const years = payload.years ?? []
    let hasWrites = false
    for (const year of years) {
      this.repository.upsertEstimate({
        ticker,
        fiscalYearEnd: year.fiscalYearEnd,
        source: payload.source,
        capturedAt,
        salesGrowth: year.salesGrowth ?? null,
        ebitMargin: year.ebitMargin ?? null,
        taxRate: year.taxRate ?? null,
        capexMaintenanceSalesRatio: year.capexMaintenanceSalesRatio ?? null,
        netDebtEbitdaRatio: year.netDebtEbitdaRatio ?? null,
      })
      hasWrites = true
    }

    if (!hasWrites) {
      return { pendingValuation: previousState?.pendingValuation ?? false }
    }

    if (previousState === null) {
      this.repository.insertTickerState({
        ticker,
        latestFiscalYearEnd: null,
        pendingValuation: true,
        currentPrice: null,
      })
    } else if (!previousState.pendingValuation) {
      this.repository.updateTickerState(ticker, { pendingValuation: true })
    }

    return { pendingValuation: true }
  })
}
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test company.test.ts
```

Esperado: PASS los 3 casos nuevos.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/company.ts apps/api/tests/company.test.ts
git commit -m "feat(api): agregar Company.ingestEstimates con upsert y pending flag"
```

---

## Task 6: Route POST /companies/:ticker/estimates

**Files:**
- Modify: `apps/api/src/modules/company/routes.ts`
- Test: `apps/api/tests/routes.test.ts`

- [ ] **Step 1: Escribir test que falla**

Agregar al final de `apps/api/tests/routes.test.ts`:

```ts
describe("POST /companies/:ticker/estimates", () => {
  it("acepta payload válido y persiste", async () => {
    const { app, repository } = setup()
    const res = await app.request("/companies/NVDA/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "tikr",
        years: [
          { fiscalYearEnd: "2027-01-31", salesGrowth: 0.45, ebitMargin: 0.62 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    const rows = repository.listEstimatesForTicker("NVDA")
    expect(rows).toHaveLength(1)
    expect(rows[0]?.salesGrowth).toBe(0.45)
  })

  it("rechaza source vacío con 400", async () => {
    const { app } = setup()
    const res = await app.request("/companies/NVDA/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "", years: [] }),
    })
    expect(res.status).toBe(400)
  })

  it("normaliza ticker a mayúsculas", async () => {
    const { app, repository } = setup()
    const res = await app.request("/companies/nvda/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "tikr",
        years: [{ fiscalYearEnd: "2027-01-31", salesGrowth: 0.45 }],
      }),
    })
    expect(res.status).toBe(200)
    expect(repository.listEstimatesForTicker("NVDA")).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test routes.test.ts
```

Esperado: FAIL con `404` o error similar porque la ruta no existe.

- [ ] **Step 3: Agregar la ruta en `routes.ts`**

Editar `apps/api/src/modules/company/routes.ts`. Agregar en el import:

```ts
import {
  estimatesBodySchema,
  ingestBodySchema,
  tickerParamSchema,
} from "./validators"
```

Después de la ruta `POST /companies/:ticker/data`, agregar:

```ts
routes.post(
  "/companies/:ticker/estimates",
  sValidator("param", tickerParamSchema),
  sValidator("json", estimatesBodySchema),
  (c) => {
    const { ticker } = c.req.valid("param")
    const body = c.req.valid("json")
    const result = company.ingestEstimates(ticker, body)
    if (result.pendingValuation) {
      void company.valuate(ticker).catch((err) => {
        console.error(`background valuation failed for ${ticker}:`, err)
      })
    }
    return c.json({ success: true })
  },
)
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test routes.test.ts
```

Esperado: PASS los 3 casos nuevos.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/routes.ts apps/api/tests/routes.test.ts
git commit -m "feat(api): agregar endpoint POST /companies/:ticker/estimates"
```

---

## Task 7: Company.runValuation — segunda corrida con merged estimates

**Files:**
- Modify: `apps/api/src/modules/company/company.ts`
- Test: `apps/api/tests/valuation.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Agregar al final de `apps/api/tests/valuation.test.ts` (o donde viva el test de `runValuation` / `valuate`):

```ts
describe("Company.valuate con estimates", () => {
  it("genera dos valuations (auto y merged_estimates) cuando hay estimates", async () => {
    const { company, repository } = setupWithCompleteFinancials("NVDA")
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.45, ebitMargin: 0.62 },
      ],
    })
    await company.valuate("NVDA")
    const all = repository.listValuationsForTicker("NVDA")
    const sources = new Set(all.map((v) => v.source))
    expect(sources).toEqual(new Set(["auto", "merged_estimates"]))
  })

  it("solo genera auto si no hay estimates", async () => {
    const { company, repository } = setupWithCompleteFinancials("NVDA")
    await company.valuate("NVDA")
    const all = repository.listValuationsForTicker("NVDA")
    expect(all.map((v) => v.source)).toEqual(["auto"])
  })

  it("pendingValuation=false después de correr (auto exitoso)", async () => {
    const { company, repository } = setupWithCompleteFinancials("NVDA")
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.30 },
      ],
    })
    await company.valuate("NVDA")
    expect(repository.getTickerState("NVDA")?.pendingValuation).toBe(false)
  })
})
```

`setupWithCompleteFinancials(ticker)` debe reutilizar los fixtures existentes (p. ej. `amznFixture` o similar). Si no hay un helper así, crearlo con:

```ts
const setupWithCompleteFinancials = (ticker: string) => {
  const { company, repository } = setup()
  // usa un fixture existente (amznFixture, etc.) para sembrar 10 años completos
  for (const year of amznFixture.years) {
    company.ingestData(ticker, { years: [year] })
  }
  repository.updateTickerState(ticker, { currentPrice: 180 })
  return { company, repository }
}
```

Adaptar según los helpers reales del test file.

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test valuation.test.ts
```

Esperado: FAIL porque `runValuation` solo inserta una valoración.

- [ ] **Step 3: Refactor `runValuation` en `company.ts`**

Reemplazar el método `runValuation` por:

```ts
private runValuation(ticker: string): void {
  const state = this.repository.getTickerState(ticker)
  if (!state || state.latestFiscalYearEnd === null) return
  if (state.currentPrice === null) return

  const rows = this.repository.listYearlyFinancialsForTicker(ticker)
  const series = this.consolidateConsecutiveYears(
    rows,
    state.latestFiscalYearEnd,
  )
  if (series.length < MIN_CONSECUTIVE_YEARS_FOR_VALUATION) return

  const financials = this.buildEngineFinancials(series)
  const createdAt = new Date().toISOString()
  const autoOk = this.runAutoValuation(
    ticker,
    state.currentPrice,
    state.latestFiscalYearEnd,
    financials,
    createdAt,
  )
  if (!autoOk) return

  const estimateRows = this.repository.listEstimatesForTicker(ticker)
  if (estimateRows.length > 0) {
    this.runMergedEstimatesValuation(
      ticker,
      state.currentPrice,
      state.latestFiscalYearEnd,
      financials,
      estimateRows,
      createdAt,
    )
  }

  this.repository.updateTickerState(ticker, { pendingValuation: false })
}

private runAutoValuation(
  ticker: string,
  currentPrice: number,
  fiscalYearEnd: string,
  financials: Record<number, CompanyYearFinancials>,
  createdAt: string,
): boolean {
  try {
    const valuation = new CompanyValuation({
      ticker,
      currentPrice,
      financials,
    })
    this.repository.insertValuation({
      ticker,
      fiscalYearEnd,
      result: valuation,
      createdAt,
      source: "auto",
    })
    return true
  } catch (err) {
    console.error(`valuation engine (auto) failed for ${ticker}:`, err)
    return false
  }
}

private runMergedEstimatesValuation(
  ticker: string,
  currentPrice: number,
  fiscalYearEnd: string,
  financials: Record<number, CompanyYearFinancials>,
  estimateRows: YearlyEstimatesRow[],
  createdAt: string,
): void {
  const overrides = mergeOverrides(estimateRows)
  try {
    const valuation = new CompanyValuation({
      ticker,
      currentPrice,
      financials,
      overrides,
    })
    this.repository.insertValuation({
      ticker,
      fiscalYearEnd,
      result: valuation,
      createdAt,
      source: "merged_estimates",
    })
  } catch (err) {
    console.error(
      `valuation engine (merged_estimates) failed for ${ticker}:`,
      err,
    )
  }
}
```

Actualizar imports al inicio del archivo:

```ts
import {
  CompanyValuation,
  type CompanyYearFinancials,
} from "@market-watcher/valuation-engine"
import { mergeOverrides } from "./estimates"
import type { CompanyRepository } from "./repository"
import type {
  TickerStateRow,
  ValuationRow,
  YearlyEstimatesRow,
  YearlyFinancialsRow,
} from "./schema"
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test
```

Esperado: PASS todos, incluyendo los 3 nuevos de `valuation.test.ts`.

Si algún test previo fallaba por `insertValuation` sin `source`, arreglar en esos tests agregando `source: "auto"`.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/company.ts apps/api/tests/valuation.test.ts
git commit -m "feat(api): correr engine 2 veces (auto + merged_estimates) cuando hay estimates"
```

---

## Task 8: GET /companies/:ticker — agregar valuationWithEstimates + availableEstimateSources

**Files:**
- Modify: `apps/api/src/modules/company/company.ts`
- Modify: `apps/api/src/modules/company/routes.ts`
- Test: `apps/api/tests/company.test.ts`, `apps/api/tests/routes.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

En `apps/api/tests/routes.test.ts`:

```ts
describe("GET /companies/:ticker con estimates", () => {
  it("response incluye valuationWithEstimates cuando hay estimates", async () => {
    const { app, company } = setupWithCompleteFinancialsViaRoute("NVDA")
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-01-31", salesGrowth: 0.45 }],
    })
    await company.valuate("NVDA")

    const res = await app.request("/companies/NVDA")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.valuation).not.toBeNull()
    expect(body.valuationWithEstimates).not.toBeNull()
    expect(body.availableEstimateSources).toEqual(["tikr"])
  })

  it("valuationWithEstimates es null cuando no hay estimates", async () => {
    const { app } = setupWithCompleteFinancialsViaRoute("NVDA")
    const res = await app.request("/companies/NVDA")
    const body = (await res.json()) as Record<string, unknown>
    expect(body.valuationWithEstimates).toBeNull()
    expect(body.availableEstimateSources).toEqual([])
  })
})
```

`setupWithCompleteFinancialsViaRoute` es un helper que siembra financials + currentPrice como hoy hacen los tests existentes; adaptar al patrón del archivo.

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test routes.test.ts
```

Esperado: FAIL — la response no tiene `valuationWithEstimates` ni `availableEstimateSources`.

- [ ] **Step 3: Actualizar `CompanyView` y `getCompanyView` en `company.ts`**

En `apps/api/src/modules/company/company.ts`, ajustar el tipo `CompanyView`:

```ts
export type CompanyView = {
  ticker: string
  latestFiscalYearEnd: string | null
  currentPrice: number | null
  valuation: ValuationRow | null
  valuationWithEstimates: ValuationRow | null
  availableEstimateSources: string[]
  pending: boolean
  valuationInProgress: boolean
  missing?: MissingSummary
}
```

Y `getCompanyView`:

```ts
async getCompanyView(ticker: string): Promise<CompanyView | null> {
  const initialState = this.repository.getTickerState(ticker)
  if (initialState === null) return null

  let state = initialState
  if (initialState.pendingValuation) {
    await this.valuate(ticker)
    state = this.repository.getTickerState(ticker) ?? initialState
  }

  const view: CompanyView = {
    ticker,
    latestFiscalYearEnd: state.latestFiscalYearEnd,
    currentPrice: state.currentPrice,
    valuation: this.repository.getLatestValuationBySource(ticker, "auto"),
    valuationWithEstimates: this.repository.getLatestValuationBySource(
      ticker,
      "merged_estimates",
    ),
    availableEstimateSources: this.repository.listSourcesForTicker(ticker),
    pending: state.pendingValuation,
    valuationInProgress: this.hasValuationInProgress(ticker),
  }

  if (state.pendingValuation) {
    const rows = this.repository.listYearlyFinancialsForTicker(ticker)
    view.missing = this.consolidateMissing(state, rows)
  }

  return view
}
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/api && bun test
```

Esperado: PASS todos, incluyendo los nuevos.

Si algún test existente usaba `view.valuation = <el más reciente>` pero ahora ese método filtra por `source="auto"`, puede haber fallos en tests que esperaban el valuation sin filtrar. Ajustar esos tests para que usen `"auto"` explícito si hace falta, o arreglar el patrón de seeding para que siempre inserte con `source="auto"`.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/company.ts apps/api/tests/routes.test.ts apps/api/tests/company.test.ts
git commit -m "feat(api): exponer valuationWithEstimates y availableEstimateSources en GET /companies/:ticker"
```

---

## Task 9: Endpoint GET /companies/:ticker/valuations?source=<source> — valoración on-the-fly

**Files:**
- Modify: `apps/api/src/modules/company/company.ts`
- Modify: `apps/api/src/modules/company/routes.ts`
- Modify: `apps/api/src/modules/company/validators.ts`
- Test: `apps/api/tests/routes.test.ts`

- [ ] **Step 1: Escribir test que falla**

En `apps/api/tests/routes.test.ts`:

```ts
describe("GET /companies/:ticker/valuations?source=<source>", () => {
  it("devuelve valoración on-the-fly para una source con datos", async () => {
    const { app, company } = setupWithCompleteFinancialsViaRoute("NVDA")
    company.ingestEstimates("NVDA", {
      source: "tikr",
      years: [
        { fiscalYearEnd: "2027-01-31", salesGrowth: 0.45, ebitMargin: 0.62 },
      ],
    })
    await company.valuate("NVDA")
    const res = await app.request("/companies/NVDA/valuations?source=tikr")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.intrinsicValue).toBeDefined()
  })

  it("404 si la source no tiene datos para el ticker", async () => {
    const { app } = setupWithCompleteFinancialsViaRoute("NVDA")
    const res = await app.request("/companies/NVDA/valuations?source=tikr")
    expect(res.status).toBe(404)
  })

  it("400 si source no es string válido", async () => {
    const { app } = setupWithCompleteFinancialsViaRoute("NVDA")
    const res = await app.request("/companies/NVDA/valuations")
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/api && bun test routes.test.ts
```

Esperado: FAIL — la ruta no existe.

- [ ] **Step 3: Agregar método `runOnTheFlyValuationBySource` a `Company`**

En `company.ts`:

```ts
runOnTheFlyValuationBySource(
  ticker: string,
  source: string,
): CompanyValuation | null {
  const state = this.repository.getTickerState(ticker)
  if (!state || state.latestFiscalYearEnd === null) return null
  if (state.currentPrice === null) return null

  const estimateRows = this.repository
    .listEstimatesForTicker(ticker)
    .filter((row) => row.source === source)
  if (estimateRows.length === 0) return null

  const rows = this.repository.listYearlyFinancialsForTicker(ticker)
  const series = this.consolidateConsecutiveYears(
    rows,
    state.latestFiscalYearEnd,
  )
  if (series.length < MIN_CONSECUTIVE_YEARS_FOR_VALUATION) return null

  const financials = this.buildEngineFinancials(series)
  const overrides = mergeOverrides(estimateRows)
  try {
    return new CompanyValuation({
      ticker,
      currentPrice: state.currentPrice,
      financials,
      overrides,
    })
  } catch (err) {
    console.error(
      `on-the-fly valuation for ${ticker} source=${source} failed:`,
      err,
    )
    return null
  }
}
```

- [ ] **Step 4: Agregar validator y ruta**

En `validators.ts`, agregar:

```ts
export const sourceQuerySchema = v.object({
  source: v.pipe(v.string(), v.minLength(1, "source must not be empty")),
})
```

En `routes.ts`:

```ts
import {
  estimatesBodySchema,
  ingestBodySchema,
  sourceQuerySchema,
  tickerParamSchema,
} from "./validators"

// ...dentro de createCompanyRoutes, después del GET /companies/:ticker:

routes.get(
  "/companies/:ticker/valuations",
  sValidator("param", tickerParamSchema),
  sValidator("query", sourceQuerySchema),
  (c) => {
    const { ticker } = c.req.valid("param")
    const { source } = c.req.valid("query")
    const valuation = company.runOnTheFlyValuationBySource(ticker, source)
    if (valuation === null) {
      return c.json({ error: "no_data_for_source", ticker, source }, 404)
    }
    return c.json(valuation)
  },
)
```

- [ ] **Step 5: Correr tests — deben pasar**

```bash
cd apps/api && bun test routes.test.ts
```

Esperado: PASS los 3 casos nuevos.

- [ ] **Step 6: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/src/modules/company/company.ts apps/api/src/modules/company/routes.ts apps/api/src/modules/company/validators.ts apps/api/tests/routes.test.ts
git commit -m "feat(api): agregar GET /companies/:ticker/valuations?source= para valoración on-the-fly por source"
```

---

## Task 10: Extension — parser de % y fiscal year con sufijo

**Files:**
- Modify: `apps/extension/src/lib/numberParser.ts`
- Modify: `apps/extension/src/lib/fiscalYearParser.ts`
- Test: `apps/extension/tests/numberParser.test.ts`, `apps/extension/tests/fiscalYearParser.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

En `apps/extension/tests/numberParser.test.ts`, agregar:

```ts
import { parsePercentCell } from "../src/lib/numberParser"

describe("parsePercentCell", () => {
  it("convierte 25.4% → 0.254", () => {
    expect(parsePercentCell("25.4%")).toBeCloseTo(0.254)
  })

  it("convierte (24.8%) → -0.248 (paréntesis negativo)", () => {
    expect(parsePercentCell("(24.8%)")).toBeCloseTo(-0.248)
  })

  it("retorna null si la celda está vacía", () => {
    expect(parsePercentCell("--")).toBeNull()
    expect(parsePercentCell("")).toBeNull()
  })

  it("retorna null si no tiene el símbolo %", () => {
    expect(parsePercentCell("25.4")).toBeNull()
  })
})
```

En `apps/extension/tests/fiscalYearParser.test.ts`, agregar:

```ts
describe("parseFiscalYearHeader con sufijo A/E (página estimates)", () => {
  it("1/31/27 E → 2027-01-31 y flag estimate=true", () => {
    expect(parseFiscalYearHeader("1/31/27 E")).toEqual({
      fiscalYearEnd: "2027-01-31",
      kind: "estimate",
    })
  })

  it("1/31/23 A → 2023-01-31 y flag estimate=false", () => {
    expect(parseFiscalYearHeader("1/31/23 A")).toEqual({
      fiscalYearEnd: "2023-01-31",
      kind: "actual",
    })
  })

  it("1/31/23 sin sufijo → kind=actual (compat backwards con IS/BS/CF)", () => {
    expect(parseFiscalYearHeader("1/31/23")).toEqual({
      fiscalYearEnd: "2023-01-31",
      kind: "actual",
    })
  })

  it("1/25/27E sin espacio → kind=estimate (compat backwards con IS/BS/CF)", () => {
    expect(parseFiscalYearHeader("1/25/27E")).toEqual({
      fiscalYearEnd: "2027-01-25",
      kind: "estimate",
    })
  })
})
```

Nota importante: estos tests CAMBIAN el shape de `parseFiscalYearHeader` — hoy devuelve `string | null`, ahora devolverá `{ fiscalYearEnd, kind } | null`. Los callers se actualizan en Task 11.

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/extension && bun test
```

Esperado: FAIL por `parsePercentCell` no exportado y por el cambio de shape de `parseFiscalYearHeader`.

- [ ] **Step 3: Implementar `parsePercentCell` en `numberParser.ts`**

Al final de `apps/extension/src/lib/numberParser.ts`, agregar:

```ts
export const parsePercentCell = (raw: string): number | null => {
  const trimmed = raw.replace(/\u00a0/g, " ").trim()
  if (EMPTY_CELL_VALUES.has(trimmed)) return null
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")")
  const inner = negative ? trimmed.slice(1, -1) : trimmed
  if (!inner.endsWith("%")) return null
  const withoutPercent = inner.slice(0, -1)
  const cleaned = withoutPercent.replace(/,/g, "").replace(/\s/g, "")
  if (cleaned === "") return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return (negative ? -parsed : parsed) / 100
}
```

- [ ] **Step 4: Cambiar shape de `parseFiscalYearHeader` en `fiscalYearParser.ts`**

Reemplazar el contenido completo de `apps/extension/src/lib/fiscalYearParser.ts` por:

```ts
const HEADER_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s*([AE]))?$/

export type FiscalYearColumnKind = "actual" | "estimate"

export type ParsedFiscalYearHeader = {
  fiscalYearEnd: string
  kind: FiscalYearColumnKind
}

export const pivotTwoDigitYear = (
  yy: number,
  referenceYear: number,
): number => {
  const threshold = (referenceYear % 100) + 10
  return yy > threshold ? 1900 + yy : 2000 + yy
}

export const parseFiscalYearHeader = (
  header: string,
  referenceYear = new Date().getUTCFullYear(),
): ParsedFiscalYearHeader | null => {
  const match = HEADER_PATTERN.exec(header.trim())
  if (!match) return null
  const [, mm, dd, yy, suffix] = match
  const month = Number(mm)
  const day = Number(dd)
  const shortYear = Number(yy)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const fullYear = pivotTwoDigitYear(shortYear, referenceYear)
  const date = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  const mmStr = String(month).padStart(2, "0")
  const ddStr = String(day).padStart(2, "0")
  const fiscalYearEnd = `${fullYear}-${mmStr}-${ddStr}`
  const kind: FiscalYearColumnKind = suffix === "E" ? "estimate" : "actual"
  return { fiscalYearEnd, kind }
}
```

- [ ] **Step 5: Correr tests — deben pasar los del parser**

```bash
cd apps/extension && bun test numberParser.test.ts fiscalYearParser.test.ts
```

Esperado: PASS los tests directos. Algunos otros tests (de `columnFilter`, `domParser`) van a fallar por el cambio de shape — eso se arregla en Task 11.

- [ ] **Step 6: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/lib/numberParser.ts apps/extension/src/lib/fiscalYearParser.ts apps/extension/tests/numberParser.test.ts apps/extension/tests/fiscalYearParser.test.ts
git commit -m "feat(extension): soportar % cells y sufijo A/E en fiscal year parser"
```

---

## Task 11: Extension — columnFilter gana parámetro `mode`

**Files:**
- Modify: `apps/extension/src/lib/columnFilter.ts`
- Test: `apps/extension/tests/columnFilter.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Reemplazar el contenido relevante de `apps/extension/tests/columnFilter.test.ts` agregando/ajustando:

```ts
import { filterFiscalYearColumns } from "../src/lib/columnFilter"

describe("filterFiscalYearColumns", () => {
  it("mode='historical' excluye sufijo E y conserva sin-sufijo", () => {
    const cols = filterFiscalYearColumns(
      ["1/29/23", "1/28/24", "1/25/27E", "LTM"],
      2026,
      "historical",
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2023-01-29", "2024-01-28"])
  })

  it("mode='estimates' conserva solo sufijo E (con espacio o sin espacio)", () => {
    const cols = filterFiscalYearColumns(
      ["1/31/23 A", "1/31/26 A", "1/31/27 E", "1/31/28 E", "CAGR"],
      2026,
      "estimates",
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2027-01-31", "2028-01-31"])
  })

  it("mode default ausente = 'historical' (backwards-compat)", () => {
    const cols = filterFiscalYearColumns(
      ["1/29/23", "1/25/27E"],
      2026,
    )
    expect(cols.map((c) => c.fiscalYearEnd)).toEqual(["2023-01-29"])
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/extension && bun test columnFilter.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar `mode` en `columnFilter.ts`**

Reemplazar el contenido de `apps/extension/src/lib/columnFilter.ts`:

```ts
import { parseFiscalYearHeader } from "./fiscalYearParser"

export type ColumnFilterMode = "historical" | "estimates"

export type FiscalYearColumn = {
  index: number
  fiscalYearEnd: string
}

export const filterFiscalYearColumns = (
  headers: string[],
  referenceYear = new Date().getUTCFullYear(),
  mode: ColumnFilterMode = "historical",
): FiscalYearColumn[] => {
  const result: FiscalYearColumn[] = []
  for (let index = 0; index < headers.length; index += 1) {
    const parsed = parseFiscalYearHeader(headers[index], referenceYear)
    if (parsed === null) continue
    if (mode === "historical" && parsed.kind !== "actual") continue
    if (mode === "estimates" && parsed.kind !== "estimate") continue
    result.push({ index, fiscalYearEnd: parsed.fiscalYearEnd })
  }
  return result
}
```

- [ ] **Step 4: Correr tests del extension — deben pasar**

```bash
cd apps/extension && bun test
```

Esperado: PASS columnFilter + los tests de `fiscalYearParser` / `numberParser` siguen pasando. `domParser.test.ts` puede fallar por el cambio de tipo — se arregla en Task 12.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/lib/columnFilter.ts apps/extension/tests/columnFilter.test.ts
git commit -m "feat(extension): agregar mode 'historical' | 'estimates' a filterFiscalYearColumns"
```

---

## Task 12: Extension — urlMatcher y domParser soportan sección `estimates`

**Files:**
- Modify: `apps/extension/src/sources/tikr/urlMatcher.ts`
- Modify: `apps/extension/src/sources/tikr/domParser.ts`
- Test: `apps/extension/tests/urlMatcher.test.ts`, `apps/extension/tests/domParser.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

En `apps/extension/tests/urlMatcher.test.ts`, agregar:

```ts
it("mapea tab=est a 'estimates'", () => {
  expect(
    matchTikrUrl(
      "https://app.tikr.com/stock/estimates?cid=1&tid=2&ref=x&tab=est",
    ),
  ).toBe("estimates")
})
```

En `apps/extension/tests/domParser.test.ts`, agregar:

```ts
import { readFileSync } from "node:fs"
import { Window } from "happy-dom"

const loadFixture = (name: string): ParentNode => {
  const html = readFileSync(
    `${import.meta.dir}/fixtures/tikr/${name}.html`,
    "utf8",
  )
  const window = new Window()
  const document = window.document
  document.body.innerHTML = html
  return document.body
}

describe("parseTikrPage sobre fixture nvda-estimates", () => {
  it("extrae ticker, price, unit y 4 años estimados", () => {
    const root = loadFixture("nvda-estimates")
    const data = parseTikrPage(root, 2026, "estimates")
    expect(data.ticker).toBe("NVDA")
    expect(data.unit).toBe("millions")
    expect(data.currentPrice).not.toBeNull()
    expect(data.table.fiscalYears).toHaveLength(4)
    expect(data.table.fiscalYears[0]).toMatch(/^\d{4}-01-31$/)
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/extension && bun test urlMatcher.test.ts domParser.test.ts
```

Esperado: FAIL por el tab `est` no mapeado y el parámetro `"estimates"` de `parseTikrPage`.

- [ ] **Step 3: Actualizar `urlMatcher.ts`**

Editar `apps/extension/src/sources/tikr/urlMatcher.ts`:

```ts
export type TikrSection =
  | "incomeStatement"
  | "balanceSheet"
  | "cashFlowStatement"
  | "estimates"

const TAB_TO_SECTION: Record<string, TikrSection> = {
  is: "incomeStatement",
  bs: "balanceSheet",
  cf: "cashFlowStatement",
  est: "estimates",
}

export const SUPPORTED_HOST = "app.tikr.com"

export const matchTikrUrl = (rawUrl: string): TikrSection | null => {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.hostname !== SUPPORTED_HOST) return null
  const tab = parsed.searchParams.get("tab")
  if (!tab) return null
  return TAB_TO_SECTION[tab.toLowerCase()] ?? null
}
```

- [ ] **Step 4: Ampliar `domParser.ts` para pasar mode al filter**

Editar `apps/extension/src/sources/tikr/domParser.ts`. Ajustar la signatura de `parseTikrPage` y `extractTable`:

```ts
import type { ColumnFilterMode } from "../../lib/columnFilter"
import { filterFiscalYearColumns } from "../../lib/columnFilter"
import type { Unit } from "../../lib/numberParser"
import { parseCell, parseUnit } from "../../lib/numberParser"
import type { TikrSection } from "./urlMatcher"
import type { ParsedTable, TableRow } from "./fieldMapper"

// (mantener el resto del archivo igual, pero:)

const sectionToMode = (section: TikrSection): ColumnFilterMode =>
  section === "estimates" ? "estimates" : "historical"

const extractTable = (
  root: ParentNode,
  referenceYear: number,
  mode: ColumnFilterMode,
): ParsedTable => {
  const table = root.querySelector("table.fintab")
  if (!table) return { fiscalYears: [], rows: [] }
  const headers = Array.from(table.querySelectorAll("thead th"))
    .slice(1)
    .map((cell) => text(cell))
  const columns = filterFiscalYearColumns(headers, referenceYear, mode)
  // (resto igual)
}

export const parseTikrPage = (
  root: ParentNode,
  referenceYear = new Date().getUTCFullYear(),
  section: TikrSection = "incomeStatement",
): TikrPageData => {
  return {
    ticker: extractTicker(root),
    currentPrice: extractPrice(root),
    unit: extractUnit(root),
    table: extractTable(root, referenceYear, sectionToMode(section)),
  }
}
```

**Nota sobre `extractTable` completa:** el `slice(1)` actual del `thead` funciona si la primera columna es la "fixedfirstheader". En la página de estimates hay también una columna trailing `CAGR`. Como `CAGR` no matcha el regex, `filterFiscalYearColumns` la saltea naturalmente. Sin cambios en la lógica de `slice`/`rows`.

- [ ] **Step 5: Correr tests — deben pasar**

```bash
cd apps/extension && bun test
```

Esperado: PASS todos. Si algún test previo de `parseTikrPage` no pasa `section`, el default `"incomeStatement"` preserva el comportamiento.

- [ ] **Step 6: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/sources/tikr/urlMatcher.ts apps/extension/src/sources/tikr/domParser.ts apps/extension/tests/urlMatcher.test.ts apps/extension/tests/domParser.test.ts
git commit -m "feat(extension): mapear tab=est a section 'estimates' y propagar mode al parser"
```

---

## Task 13: Extension — `estimatesFieldMapper` con asociación posicional de sub-filas

**Files:**
- Create: `apps/extension/src/sources/tikr/estimatesFieldMapper.ts`
- Modify: `apps/extension/src/sources/tikr/index.ts`
- Test: `apps/extension/tests/estimatesFieldMapper.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `apps/extension/tests/estimatesFieldMapper.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { mapTikrEstimatesToPayload } from "../src/sources/tikr/estimatesFieldMapper"
import type { ParsedTable } from "../src/sources/tikr/fieldMapper"

describe("mapTikrEstimatesToPayload", () => {
  it("mapea Revenue → sub-fila % Change YoY → salesGrowth por año", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31", "2028-01-31"],
      rows: [
        { label: "Revenue", values: ["200000", "260000"] },
        { label: "% Change YoY", values: ["30.0%", "30.0%"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", salesGrowth: 0.30 },
      { fiscalYearEnd: "2028-01-31", salesGrowth: 0.30 },
    ])
  })

  it("mapea EBIT → % EBIT Margins → ebitMargin", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "EBIT", values: ["60000"] },
        { label: "% EBIT Margins", values: ["62.0%"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", ebitMargin: 0.62 },
    ])
  })

  it("Effective Tax Rate y Net Debt/EBITDA van directo", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Effective Tax Rate (%)", values: ["18.0%"] },
        { label: "Net Debt/EBITDA", values: ["(0.5)"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      {
        fiscalYearEnd: "2027-01-31",
        taxRate: 0.18,
        netDebtEbitdaRatio: -0.5,
      },
    ])
  })

  it("Capital Expenditure / Revenue → capexMaintenanceSalesRatio", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Revenue", values: ["200000"] },
        { label: "Capital Expenditure", values: ["(8000)"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31", capexMaintenanceSalesRatio: 0.04 },
    ])
  })

  it("celdas vacías (--, —) no se emiten", () => {
    const parsed: ParsedTable = {
      fiscalYears: ["2027-01-31"],
      rows: [
        { label: "Revenue", values: ["200000"] },
        { label: "% Change YoY", values: ["--"] },
      ],
    }
    expect(mapTikrEstimatesToPayload(parsed)).toEqual([
      { fiscalYearEnd: "2027-01-31" },
    ])
  })
})
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
cd apps/extension && bun test estimatesFieldMapper.test.ts
```

Esperado: FAIL por módulo inexistente.

- [ ] **Step 3: Crear `estimatesFieldMapper.ts`**

Crear `apps/extension/src/sources/tikr/estimatesFieldMapper.ts`:

```ts
import { parseCell, parsePercentCell } from "../../lib/numberParser"
import type { ParsedTable } from "./fieldMapper"

export type EstimateYearPayload = {
  fiscalYearEnd: string
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  capexMaintenanceSalesRatio?: number
  netDebtEbitdaRatio?: number
}

const TRIMMED_LABEL = (label: string) => label.replace(/\s+/g, " ").trim()

const MAIN_REVENUE = "Revenue"
const MAIN_EBIT = "EBIT"
const SUB_CHANGE_YOY = "% Change YoY"
const SUB_EBIT_MARGINS = "% EBIT Margins"
const SINGLE_TAX = "Effective Tax Rate (%)"
const SINGLE_NET_DEBT_EBITDA = "Net Debt/EBITDA"
const SINGLE_CAPEX = "Capital Expenditure"

type RowIndex = { label: string; values: string[] }

const findSub = (
  rows: RowIndex[],
  mainIndex: number,
  subLabel: string,
): RowIndex | undefined => {
  for (let i = mainIndex + 1; i < rows.length; i += 1) {
    const label = TRIMMED_LABEL(rows[i].label)
    if (label === subLabel) return rows[i]
    if (label.startsWith("%")) continue // otras sub-filas italic
    return undefined
  }
  return undefined
}

const findRow = (rows: RowIndex[], label: string): { row: RowIndex; index: number } | undefined => {
  for (let i = 0; i < rows.length; i += 1) {
    if (TRIMMED_LABEL(rows[i].label) === label) return { row: rows[i], index: i }
  }
  return undefined
}

export const mapTikrEstimatesToPayload = (
  table: ParsedTable,
): EstimateYearPayload[] => {
  const rows: RowIndex[] = table.rows.map((r) => ({
    label: TRIMMED_LABEL(r.label),
    values: r.values,
  }))

  const revenueHit = findRow(rows, MAIN_REVENUE)
  const ebitHit = findRow(rows, MAIN_EBIT)
  const taxRow = findRow(rows, SINGLE_TAX)?.row
  const netDebtRow = findRow(rows, SINGLE_NET_DEBT_EBITDA)?.row
  const capexRow = findRow(rows, SINGLE_CAPEX)?.row

  const salesGrowthRow =
    revenueHit && findSub(rows, revenueHit.index, SUB_CHANGE_YOY)
  const ebitMarginRow =
    ebitHit && findSub(rows, ebitHit.index, SUB_EBIT_MARGINS)

  return table.fiscalYears.map((fiscalYearEnd, columnIndex) => {
    const year: EstimateYearPayload = { fiscalYearEnd }

    const salesGrowth = salesGrowthRow
      ? parsePercentCell(salesGrowthRow.values[columnIndex] ?? "")
      : null
    if (salesGrowth !== null) year.salesGrowth = salesGrowth

    const ebitMargin = ebitMarginRow
      ? parsePercentCell(ebitMarginRow.values[columnIndex] ?? "")
      : null
    if (ebitMargin !== null) year.ebitMargin = ebitMargin

    const taxRate = taxRow
      ? parsePercentCell(taxRow.values[columnIndex] ?? "")
      : null
    if (taxRate !== null) year.taxRate = taxRate

    const netDebtEbitda = netDebtRow
      ? parseCell(netDebtRow.values[columnIndex] ?? "")
      : null
    if (netDebtEbitda !== null) year.netDebtEbitdaRatio = netDebtEbitda

    if (capexRow && revenueHit) {
      const capex = parseCell(capexRow.values[columnIndex] ?? "")
      const revenue = parseCell(revenueHit.row.values[columnIndex] ?? "")
      if (capex !== null && revenue !== null && revenue !== 0) {
        year.capexMaintenanceSalesRatio = Math.abs(capex) / revenue
      }
    }

    return year
  })
}
```

Actualizar `apps/extension/src/sources/tikr/index.ts`:

```ts
export type { TikrPageData } from "./domParser"
export { parseTikrPage } from "./domParser"
export type { EstimateYearPayload } from "./estimatesFieldMapper"
export { mapTikrEstimatesToPayload } from "./estimatesFieldMapper"
export type { ParsedTable, TableRow } from "./fieldMapper"
export { mapTikrToPayload } from "./fieldMapper"
export type { TikrSection } from "./urlMatcher"
export { matchTikrUrl, SUPPORTED_HOST } from "./urlMatcher"
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
cd apps/extension && bun test estimatesFieldMapper.test.ts
```

Esperado: PASS los 5 casos.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/sources/tikr/estimatesFieldMapper.ts apps/extension/src/sources/tikr/index.ts apps/extension/tests/estimatesFieldMapper.test.ts
git commit -m "feat(extension): mapTikrEstimatesToPayload con asociación posicional main→sub"
```

---

## Task 14: Extension — `apiClient.sendEstimates`

**Files:**
- Modify: `apps/extension/src/lib/apiClient.ts`
- Test: crear test inline en este task

- [ ] **Step 1: Agregar test rápido**

Crear `apps/extension/tests/apiClient.test.ts` (si no existe) o extenderlo:

```ts
import { describe, expect, it, mock } from "bun:test"
import { sendEstimates } from "../src/lib/apiClient"

describe("sendEstimates", () => {
  it("POST al endpoint /estimates con el body serializado", async () => {
    const fetchMock = mock(async () => new Response("{}", { status: 200 }))
    globalThis.fetch = fetchMock as typeof fetch
    const result = await sendEstimates("http://localhost:3000", "NVDA", {
      source: "tikr",
      years: [{ fiscalYearEnd: "2027-01-31", salesGrowth: 0.45 }],
    })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe("http://localhost:3000/companies/NVDA/estimates")
  })
})
```

- [ ] **Step 2: Correr test — debe fallar**

```bash
cd apps/extension && bun test apiClient.test.ts
```

Esperado: FAIL por `sendEstimates` no exportado.

- [ ] **Step 3: Agregar `sendEstimates` en `apiClient.ts`**

Al final de `apps/extension/src/lib/apiClient.ts`, agregar:

```ts
export type EstimateYearInput = {
  fiscalYearEnd: string
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  capexMaintenanceSalesRatio?: number
  netDebtEbitdaRatio?: number
}

export type EstimatesPayload = {
  source: string
  years?: EstimateYearInput[]
}

export const sendEstimates = async (
  apiUrl: string,
  ticker: string,
  payload: EstimatesPayload,
): Promise<IngestResult> => {
  const base = apiUrl.replace(/\/+$/, "")
  const url = `${base}/companies/${encodeURIComponent(ticker)}/estimates`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error"
    return { ok: false, status: null, message }
  }
  if (!response.ok) {
    const message = await parseErrorMessage(response)
    return { ok: false, status: response.status, message }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Correr test — debe pasar**

```bash
cd apps/extension && bun test apiClient.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/lib/apiClient.ts apps/extension/tests/apiClient.test.ts
git commit -m "feat(extension): agregar sendEstimates para POST /companies/:ticker/estimates"
```

---

## Task 15: Popup — rama para sección estimates

**Files:**
- Modify: `apps/extension/src/popup/App.svelte`

- [ ] **Step 1: Modificar App.svelte para detectar sección estimates y usar el mapper correcto**

Reemplazar el contenido actual de `loadPage` y `send` en `apps/extension/src/popup/App.svelte` (sin tocar el markup ni los estilos):

```ts
import { onMount } from "svelte"
import type { EstimatesPayload, IngestPayload, IngestYear } from "../lib/apiClient"
import { sendEstimates, sendIngest } from "../lib/apiClient"
import type { TikrPageData } from "../sources/tikr/domParser"
import { parseTikrPage } from "../sources/tikr/domParser"
import type { EstimateYearPayload } from "../sources/tikr/estimatesFieldMapper"
import { mapTikrEstimatesToPayload } from "../sources/tikr/estimatesFieldMapper"
import { mapTikrToPayload } from "../sources/tikr/fieldMapper"
import type { TikrSection } from "../sources/tikr/urlMatcher"
import { matchTikrUrl } from "../sources/tikr/urlMatcher"
import { getApiUrl } from "../storage/settings"

const SECTION_LABEL: Record<TikrSection, string> = {
  incomeStatement: "Income Statement",
  balanceSheet: "Balance Sheet",
  cashFlowStatement: "Cash Flow Statement",
  estimates: "Estimates",
}

type Preview =
  | {
      kind: "financials"
      section: Exclude<TikrSection, "estimates">
      data: TikrPageData
      years: IngestYear[]
    }
  | {
      kind: "estimates"
      section: "estimates"
      data: TikrPageData
      years: EstimateYearPayload[]
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
    status = { kind: "unsupported", message: "No se pudo leer la pestaña activa." }
    return
  }
  const section = matchTikrUrl(tab.url)
  if (!section) {
    status = {
      kind: "unsupported",
      message:
        "Abre una sección de TIKR (Income, Balance, Cash Flow o Estimates).",
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
      message: err instanceof Error ? err.message : "No se pudo leer el contenido.",
    }
    return
  }
  if (!html) {
    status = { kind: "unsupported", message: "La página no entregó contenido." }
    return
  }
  const doc = new DOMParser().parseFromString(html, "text/html")
  const data = parseTikrPage(doc.body, new Date().getUTCFullYear(), section)
  if (!data.ticker || data.table.fiscalYears.length === 0 || !data.unit) {
    status = {
      kind: "unsupported",
      message:
        "No se pudo extraer ticker, años fiscales o unidades de esta página.",
    }
    return
  }
  if (section === "estimates") {
    const years = mapTikrEstimatesToPayload(data.table)
    status = {
      kind: "ready",
      preview: { kind: "estimates", section, data, years },
    }
  } else {
    const years = mapTikrToPayload(section, data.table, data.unit)
    status = {
      kind: "ready",
      preview: { kind: "financials", section, data, years },
    }
  }
}

const send = async (preview: Preview): Promise<void> => {
  status = { kind: "sending", preview }
  const ticker = preview.data.ticker ?? ""
  const apiUrl = await getApiUrl()
  let result: { ok: true } | { ok: false; status: number | null; message: string }
  if (preview.kind === "estimates") {
    const payload: EstimatesPayload = { source: "tikr", years: preview.years }
    result = await sendEstimates(apiUrl, ticker, payload)
  } else {
    const payload: IngestPayload = { years: preview.years }
    if (preview.data.currentPrice !== null && preview.data.currentPrice > 0) {
      payload.currentPrice = preview.data.currentPrice
    }
    result = await sendIngest(apiUrl, ticker, payload)
  }
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
```

El markup y los estilos no cambian — `SECTION_LABEL[preview.section]` sigue funcionando porque agregamos la entrada `"estimates": "Estimates"`.

- [ ] **Step 2: Typecheck + tests**

```bash
cd apps/extension && bun run typecheck && bun test
```

Esperado: sin errores de tipo, todos los tests pasan.

- [ ] **Step 3: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/extension/src/popup/App.svelte
git commit -m "feat(extension): rama del popup para sección estimates usando sendEstimates"
```

---

## Task 16: Test end-to-end — flujo completo con estimates

**Files:**
- Create: `apps/api/tests/e2e-estimates.test.ts`

- [ ] **Step 1: Crear test end-to-end**

Crear `apps/api/tests/e2e-estimates.test.ts`:

```ts
import { describe, expect, it } from "bun:test"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { createApp } from "@/app"
import { createDb } from "@/db"
import { amznFixture, toIngestBody } from "./fixtures/engine"
import { waitForBackgroundValuation } from "./fixtures/wait"

const migrationsFolder = `${import.meta.dir}/../src/db/migrations`

const setupApp = () => {
  const db = createDb(":memory:")
  migrate(db, { migrationsFolder })
  return createApp(db)
}

describe("E2E estimates", () => {
  it("ingesta financials + estimates + GET produce las dos valuations", async () => {
    const app = setupApp()

    const ingestRes = await app.request("/companies/AMZN/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toIngestBody(amznFixture)),
    })
    expect(ingestRes.status).toBe(200)
    await waitForBackgroundValuation(app, "AMZN")

    const estimatesRes = await app.request("/companies/AMZN/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "tikr",
        years: [
          { fiscalYearEnd: "2026-12-31", salesGrowth: 0.15, ebitMargin: 0.10 },
          { fiscalYearEnd: "2027-12-31", salesGrowth: 0.12, ebitMargin: 0.11 },
        ],
      }),
    })
    expect(estimatesRes.status).toBe(200)
    await waitForBackgroundValuation(app, "AMZN")

    const getRes = await app.request("/companies/AMZN")
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as Record<string, unknown>
    expect(body.valuation).not.toBeNull()
    expect(body.valuationWithEstimates).not.toBeNull()
    expect(body.availableEstimateSources).toEqual(["tikr"])

    // Los precios intrínsecos deben diferir entre auto y with-estimates
    const auto = body.valuation as { result: { intrinsicValue: { buyPrice: { price: number } } } }
    const withEst = body.valuationWithEstimates as typeof auto
    expect(auto.result.intrinsicValue.buyPrice.price).not.toBeCloseTo(
      withEst.result.intrinsicValue.buyPrice.price,
    )
  })

  it("GET source aislada on-the-fly funciona", async () => {
    const app = setupApp()
    await app.request("/companies/AMZN/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toIngestBody(amznFixture)),
    })
    await app.request("/companies/AMZN/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "tikr",
        years: [{ fiscalYearEnd: "2026-12-31", salesGrowth: 0.15 }],
      }),
    })
    await waitForBackgroundValuation(app, "AMZN")
    const res = await app.request("/companies/AMZN/valuations?source=tikr")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.intrinsicValue).toBeDefined()
  })
})
```

Nota: `waitForBackgroundValuation` y `amznFixture` / `toIngestBody` ya existen en `apps/api/tests/fixtures/`. Si los fiscalYearEnd del fixture AMZN no alinean con 2026-12-31 y 2027-12-31, ajustar los años para que sean posteriores al `latestFiscalYearEnd` del fixture.

- [ ] **Step 2: Correr test — debe pasar**

```bash
cd apps/api && bun test e2e-estimates.test.ts
```

Esperado: PASS los 2 casos.

- [ ] **Step 3: Correr suite completa de verificación final**

```bash
cd /Users/karl/Projects/market-watcher
bun run --cwd apps/api test
bun run --cwd apps/extension test
bun run --cwd packages/valuation-engine test
```

Esperado: todos los tests pasan.

- [ ] **Step 4: Commit**

```bash
cd /Users/karl/Projects/market-watcher
git add apps/api/tests/e2e-estimates.test.ts
git commit -m "test(api): agregar E2E de ingesta + dual valuation + source aislada"
```

---

## Verificación end-to-end manual (opcional, post-merge)

1. Arrancar el API:
   ```bash
   cd apps/api && bun run dev
   ```
2. Build de la extensión:
   ```bash
   cd apps/extension && bun run build
   ```
3. Cargar la extensión unpacked en Chrome desde `apps/extension/.output/chrome-mv3`.
4. Abrir TIKR de NVDA, navegar a las 3 pestañas fiscales (IS, BS, CF), enviar cada una.
5. Navegar a la pestaña `estimates` (`tab=est`), enviar.
6. `curl http://localhost:3000/companies/NVDA` — verificar que:
   - `valuation` y `valuationWithEstimates` no son null.
   - `availableEstimateSources === ["tikr"]`.
   - Los números de buyPrice en ambas valoraciones difieren.
7. `curl "http://localhost:3000/companies/NVDA/valuations?source=tikr"` — devuelve una ValuationResult on-the-fly.
