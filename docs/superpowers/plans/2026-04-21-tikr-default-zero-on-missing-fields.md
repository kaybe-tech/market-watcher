# TIKR field mapper: default a 0 cuando la fila o celda no existe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `mapTikrToPayload` envíe `0` cuando la fila esperada no existe en la tabla de TIKR (caso 1) o cuando la celda específica de la columna está `undefined` (caso 2). Mantener la omisión cuando el valor existe pero `parseAndNormalize` devuelve `null` (caso 3, no parseable).

**Architecture:** Cambio puntual en un solo archivo de la extensión. La API y el engine no se tocan: `applyYearlyFinancialsPatch` ya sobrescribe `null` con valores nuevos, e `isYearComplete` ya considera `0` como completo.

**Tech Stack:** TypeScript, Bun (runtime + test runner), WXT (extension framework), Hono (API), SQLite via Drizzle (BD).

**Spec:** `docs/superpowers/specs/2026-04-21-tikr-default-zero-on-missing-fields-design.md`

---

## File Structure

**Modificado:**
- `apps/extension/src/sources/tikr/fieldMapper.ts` — cambio en `mapTikrToPayload` (líneas 174-186)
- `apps/extension/tests/fieldMapper.test.ts` — actualizar 3 tests existentes que usan `toEqual` y agregar 3 tests nuevos para los tres casos

**Sin cambios:**
- `apps/api/**` (la API ya acepta 0 como valor numérico válido)
- `packages/valuation-engine/**`
- Schema de BD

---

## Task 1: Agregar tests para los tres casos (TDD red)

**Files:**
- Modify: `apps/extension/tests/fieldMapper.test.ts` (agregar 3 tests al final del `describe`)

- [ ] **Step 1: Agregar test para caso (1) — fila ausente → 0**

Agregar dentro del `describe("mapTikrToPayload", ...)`, antes de la llave de cierre final (después de la línea 177):

```ts
test("case (1): fila ausente en la tabla → campo = 0", () => {
  const result = mapTikrToPayload(
    "incomeStatement",
    {
      fiscalYears: ["2024-01-28"],
      rows: [{ label: "Revenues", values: ["10,000"] }],
    },
    "millions",
  )

  expect(result[0]?.incomeStatement?.minorityInterests).toBe(0)
  expect(result[0]?.incomeStatement?.depreciationAmortization).toBe(0)
  expect(result[0]?.incomeStatement?.ebit).toBe(0)
  expect(result[0]?.incomeStatement?.interestExpense).toBe(0)
  expect(result[0]?.incomeStatement?.interestIncome).toBe(0)
  expect(result[0]?.incomeStatement?.taxExpense).toBe(0)
  expect(result[0]?.incomeStatement?.fullyDilutedShares).toBe(0)
})
```

- [ ] **Step 2: Agregar test para caso (2) — celda undefined en una columna → 0**

Justo después del test del Step 1:

```ts
test("case (2): fila existe pero la celda de esa columna es undefined → campo = 0", () => {
  const result = mapTikrToPayload(
    "incomeStatement",
    {
      fiscalYears: ["2023-01-29", "2024-01-28"],
      rows: [
        { label: "Revenues", values: ["10,000", "20,000"] },
        { label: "Operating Income", values: ["1,000"] },
      ],
    },
    "millions",
  )

  expect(result[0]?.incomeStatement?.ebit).toBe(1000)
  expect(result[1]?.incomeStatement?.ebit).toBe(0)
})
```

- [ ] **Step 3: Agregar test para caso (3) — valor no parseable → omitido**

Justo después del test del Step 2:

```ts
test("case (3): celda con valor no parseable → campo omitido del payload", () => {
  const result = mapTikrToPayload(
    "incomeStatement",
    {
      fiscalYears: ["2024-01-28"],
      rows: [
        { label: "Revenues", values: ["10,000"] },
        { label: "Minority Interest", values: ["--"] },
        { label: "Operating Income", values: ["NM"] },
      ],
    },
    "millions",
  )

  expect(result[0]?.incomeStatement?.minorityInterests).toBeUndefined()
  expect(result[0]?.incomeStatement?.ebit).toBeUndefined()
})
```

- [ ] **Step 4: Correr los 3 tests nuevos y verificar el estado esperado**

Run: `cd apps/extension && bun test tests/fieldMapper.test.ts`

Expected:
- `case (1): fila ausente...` → **FAIL** (los `expect(...).toBe(0)` fallan porque hoy los campos son `undefined`)
- `case (2): fila existe pero la celda...` → **FAIL** (el segundo `toBe(0)` falla porque hoy es `undefined`)
- `case (3): celda con valor no parseable...` → **PASS** (ya hoy se omiten los no parseables)

Si algún test no muestra ese estado, leer el output, no avanzar.

- [ ] **Step 5: Commit los tests nuevos (TDD red)**

```bash
git add apps/extension/tests/fieldMapper.test.ts
git commit -m "test(extension): agregar tests para casos de fila/celda ausente y no parseable"
```

---

## Task 2: Implementar el cambio en `mapTikrToPayload`

**Files:**
- Modify: `apps/extension/src/sources/tikr/fieldMapper.ts` (función `mapTikrToPayload`, líneas 167-187)

- [ ] **Step 1: Reemplazar el cuerpo de `mapTikrToPayload`**

Reemplazar las líneas 174-186 (el `return table.fiscalYears.map(...)`) por:

```ts
  return table.fiscalYears.map((fiscalYearEnd, columnIndex) => {
    const year: IngestYear = { fiscalYearEnd }
    for (const definition of fields) {
      const row = findRow(byLabel, definition.labels)
      if (!row) {
        applyValue(year, definition.group, definition.field, 0)
        continue
      }
      const raw = row.values[columnIndex]
      if (raw === undefined) {
        applyValue(year, definition.group, definition.field, 0)
        continue
      }
      const normalized = parseAndNormalize(raw, unit)
      if (normalized === null) continue
      applyValue(year, definition.group, definition.field, normalized)
    }
    return year
  })
```

- [ ] **Step 2: Correr los 3 tests nuevos y verificar que pasan**

Run: `cd apps/extension && bun test tests/fieldMapper.test.ts -t "case ("`

Expected: los 3 tests `case (1)`, `case (2)`, `case (3)` → **PASS**.

- [ ] **Step 3: Correr la suite completa y observar qué tests existentes rompen**

Run: `cd apps/extension && bun test tests/fieldMapper.test.ts`

Expected (esto es lo que se va a ver después de la implementación):
- 3 tests fallan por aserciones `toEqual` que esperaban menos campos:
  - `maps income statement rows into incomeStatement`
  - `balance sheet splits into roic and freeCashFlow`
  - `omits fields with empty or dash values`
- Los demás tests (que usan aserciones específicas) → PASS.

No commitear hasta el Task 3.

---

## Task 3: Actualizar tests existentes que rompieron

**Files:**
- Modify: `apps/extension/tests/fieldMapper.test.ts`

- [ ] **Step 1: Actualizar test "maps income statement rows into incomeStatement" (líneas 5-36)**

Reemplazar el bloque `expect(result[0]).toEqual({...})` (líneas 25-34) por:

```ts
    expect(result[0]).toEqual({
      fiscalYearEnd: "2023-01-29",
      incomeStatement: {
        sales: 26974,
        ebit: 4224,
        interestExpense: -262,
        taxExpense: -187,
        fullyDilutedShares: 2507,
        depreciationAmortization: 0,
        interestIncome: 0,
        minorityInterests: 0,
      },
    })
```

(El segundo `expect(result[1]?.incomeStatement?.sales).toBe(60922)` no cambia.)

- [ ] **Step 2: Actualizar test "balance sheet splits into roic and freeCashFlow" (líneas 38-68)**

Reemplazar el bloque `expect(result[0]).toEqual({...})` (líneas 55-67) por:

```ts
    expect(result[0]).toEqual({
      fiscalYearEnd: "2024-01-28",
      roic: {
        cashAndEquivalents: 7280,
        marketableSecurities: 18704,
        longTermDebt: 8459,
        equity: 42978,
        shortTermDebt: 0,
        currentOperatingLeases: 0,
        nonCurrentOperatingLeases: 0,
      },
      freeCashFlow: {
        inventories: 5282,
        accountsPayable: 2699,
        accountsReceivable: 0,
        unearnedRevenue: 0,
      },
    })
```

- [ ] **Step 3: Actualizar test "omits fields with empty or dash values" (líneas 112-130)**

El test sigue siendo válido pero ahora solo verifica el caso (3). Reemplazar el bloque completo (líneas 112-130) por:

```ts
  test("omite solo campos no parseables; los ausentes pasan a 0", () => {
    const result = mapTikrToPayload(
      "incomeStatement",
      {
        fiscalYears: ["2023-01-29"],
        rows: [
          { label: "Revenues", values: ["10,000"] },
          { label: "Minority Interest", values: ["--"] },
          { label: "Interest Expense", values: ["—"] },
        ],
      },
      "millions",
    )

    expect(result[0]).toEqual({
      fiscalYearEnd: "2023-01-29",
      incomeStatement: {
        sales: 10000,
        depreciationAmortization: 0,
        ebit: 0,
        interestIncome: 0,
        taxExpense: 0,
        fullyDilutedShares: 0,
      },
    })
  })
```

- [ ] **Step 4: Correr la suite completa y verificar que todo pasa**

Run: `cd apps/extension && bun test tests/fieldMapper.test.ts`

Expected: todos los tests del archivo pasan (los 8 originales actualizados + los 3 nuevos = 11 tests pasando).

- [ ] **Step 5: Correr toda la suite de tests de la extensión**

Run: `cd apps/extension && bun test`

Expected: todos los archivos de test pasan. Si alguno no relacionado con `fieldMapper` rompe, leer el output y resolver antes de avanzar.

---

## Task 4: Typecheck y commit del cambio

- [ ] **Step 1: Correr typecheck**

Run: `cd apps/extension && bun run typecheck`

Expected: 0 errores de tipo.

- [ ] **Step 2: Commit del cambio + tests actualizados**

```bash
git add apps/extension/src/sources/tikr/fieldMapper.ts apps/extension/tests/fieldMapper.test.ts
git commit -m "fix(extension): tratar fila o celda ausente en TIKR como valor 0

Cuando una fila esperada no existe en la tabla de TIKR (caso 1) o
la celda de esa columna es undefined (caso 2), enviar 0 en vez de
omitir el campo. Esto evita que valoraciones queden bloqueadas por
empresas como NVDA, donde TIKR no expone filas como Minority Interest
o Capital Leases cuando el valor real es 0.

Se mantiene la omisión cuando el valor existe pero no es parseable
(caso 3, ej: '—', 'NM'), para no enmascarar bugs futuros del parser."
```

---

## Task 5: Validación end-to-end manual

Esta tarea no es automatizable; el usuario debe ejecutarla en su browser.

- [ ] **Step 1: Build de la extensión**

Run: `cd apps/extension && bun run build`

Expected: build sin errores. Output en `apps/extension/.output/chrome-mv3/`.

- [ ] **Step 2: Recargar la extensión en Chrome**

En `chrome://extensions/`, encontrar la extensión `market-watcher` y hacer click en el botón de recargar (icono circular). Si no estaba cargada, cargarla con "Load unpacked" apuntando a `apps/extension/.output/chrome-mv3/`.

- [ ] **Step 3: Verificar que la API está corriendo**

Run: `curl -s http://localhost:3000/health`

Expected: `{"status":"ok","db":{"status":"ok",...}}`. Si no responde, levantar la API con `cd apps/api && bun run dev` y reintentar.

- [ ] **Step 4: Re-scrapear NVDA en TIKR**

Abrir TIKR para NVDA y disparar el scrape de las tres secciones (income statement, balance sheet, cash flow) con la extensión. Esperar a que cada sección se ingiera (verificar en la consola de la extensión que no hay errores).

- [ ] **Step 5: Verificar que la valoración se completó**

Run: `curl -s http://localhost:3000/companies/NVDA | python3 -m json.tool`

Expected:
- `pending: false`
- `valuation` no es `null` (contiene el resultado del engine)
- El campo `missing` no aparece o está vacío

Si `pending: true` persiste, revisar el campo `missing` para identificar qué quedó faltando. Si aparecen otros campos distintos a los previstos en el spec (`minorityInterests`, `shortTermDebt`, `currentOperatingLeases`, `nonCurrentOperatingLeases`), investigar antes de cerrar.
