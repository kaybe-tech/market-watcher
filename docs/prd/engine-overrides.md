# PRD: Manual Overrides en Valuation Engine

## Resumen

Extender el paquete `@market-watcher/valuation-engine` para que el constructor de `CompanyValuation` acepte **overrides manuales opcionales** sobre los supuestos de proyección y los target multiples. Cuando hay un override, el engine lo usa para los cálculos downstream; cuando no, el comportamiento es idéntico al actual.

## Problema

El engine extrae automáticamente todos los supuestos (`salesGrowth`, `ebitMargin`, `taxRate`, etc.) como promedios históricos y los aplica uniformemente a los 5 años proyectados. Esto funciona para screening rápido, pero el inversor con tesis específica (p. ej.: "año 1 crecerá 20% por un catalyst, luego normaliza a 8%") no tiene forma de expresarla. Hoy, cualquier ajuste requiere forkear el engine o calcular la valoración fuera del sistema.

## Solución

Añadir un parámetro opcional `overrides` al constructor de `CompanyValuation`. Este parámetro acepta:

1. **Overrides por año proyectado** sobre los supuestos de Income Statement, FCF y valoración.
2. **Overrides de target multiples** (valores únicos, no por año).

Internamente, las proyecciones cambian su modelo de supuesto de "un valor aplicado a los 5 años" a **modelo cascada**:

- Año 1: usa el promedio histórico (comportamiento actual) a menos que haya override.
- Año N (2–5): copia el valor del año N−1 a menos que haya override en ese año.
- Para `changeInWorkingCapital` (absoluto $), la cascada ya existe en el engine (`(ΔWC_{N-1} / sales_{N-1}) × sales_N`); un override inyecta un valor absoluto y el ratio implícito se propaga naturalmente.

Sin overrides, el modelo cascada produce los mismos números que hoy (todos los años heredan el mismo valor histórico). Con overrides, cada año puede tener supuestos distintos y el usuario puede modelar escenarios con catalysts o normalización.

## Alcance

**Incluido:**
- Tipos públicos `ValuationOverrides` exportados desde `packages/valuation-engine/src/index.ts`.
- Parámetro `overrides?: ValuationOverrides` en `CompanyValuationInputs`.
- Campos overridables por año proyectado:
  - `salesGrowth`, `ebitMargin`, `taxRate`, `shareGrowth` (ratios/%).
  - `capexMaintenanceSalesRatio` (ratio).
  - `changeInWorkingCapital` (valor absoluto en $, no ratio).
  - `netDebtEbitdaRatio` (ratio).
- Campos overridables únicos (no por año): `targetMultiples.per`, `targetMultiples.evEbitda`, `targetMultiples.evEbit`, `targetMultiples.evFcf`.
- Cambio del modelo de supuestos a cascada (año N hereda de año N−1 cuando no hay override).
- Tests unitarios nuevos cubriendo cascada, overrides parciales, propagación de overrides a cálculos downstream (ej: override de `ebitMargin` afecta EBIT, EBITDA, net income, FCF, intrinsic value).
- Preservación de behavior: llamar `CompanyValuation` sin `overrides` produce resultados **bit-idénticos** a los actuales sobre los fixtures existentes (AMZN, COST, NKE, NVDA).

**Excluido:**
- Cambios en `apps/api`, base de datos, o UI. Otros PRDs abordarán persistencia e ingestión de overrides desde la API.
- Override de `interestExpenseRate`, `interestIncomeRate`, o `capexMaintenance` directo (este último queda cubierto por `capexMaintenanceSalesRatio` × `salesGrowth`).
- Validación de rangos de overrides (modelo permisivo: el usuario es responsable de la cordura de sus inputs).
- Comparación lado-a-lado automática vs manual (quien quiera comparar, instancia dos `CompanyValuation` — uno con overrides y otro sin — y los compara externamente).

## Criterio de éxito

1. **Bit-idéntico sin overrides**: correr `bun test` sobre los fixtures actuales (AMZN, COST, NKE, NVDA) sin pasar `overrides` produce exactamente los mismos números que antes del cambio (valores de proyecciones, múltiplos, intrinsic value, CAGR, buy price).

2. **Override aplicado en un campo y año**: dado un fixture (ej: NVDA), pasar `overrides.projections[2028].salesGrowth = 0.30` debe:
   - Modificar el `salesGrowth` del año 2028 al 30%.
   - Propagar ese 30% al año 2029, 2030, 2031 (cascada) salvo que también estén overrideados.
   - Mantener el año 2027 (año 1) con el supuesto histórico automático.
   - Alterar coherentemente las líneas downstream (`sales`, `ebit`, `netIncome`, `fcf`, `intrinsicValue`) del año 2028 en adelante.

3. **Override absoluto de `changeInWorkingCapital`**: pasar `overrides.projections[2028].changeInWorkingCapital = 50_000_000` debe:
   - Usar exactamente `50_000_000` como `changeInWorkingCapital` del 2028.
   - Propagar el ratio implícito `50_000_000 / sales_2028` a los años 2029+.
   - No tocar el `cwcSalesRatio` que sigue extrayéndose de histórico (solo se usa para año 1 sin override).

4. **Override de target multiples**: pasar `overrides.targetMultiples.per = 25` debe usar 25 como P/E objetivo en el cálculo de `intrinsicValue.targetPrice.per` y recalcular el CAGR y buy price consecuentemente; los demás múltiplos (`evEbitda`, `evEbit`, `evFcf`) siguen con NTM automático.

5. **Tests explícitos**: nuevos tests en `packages/valuation-engine/tests/overrides.test.ts` cubriendo los 4 flujos anteriores + cascada parcial (override año 2 y año 4, años 3 y 5 heredan del año anterior) + override simultáneo de múltiples campos.

## Flujos

### Flujo 1: Valoración sin overrides (comportamiento actual preservado)

```ts
const valuation = new CompanyValuation({
  ticker: "NVDA",
  currentPrice: 850,
  financials,
})
```

Resultado: idéntico al actual. Engine extrae promedios históricos, aplica el mismo valor a los 5 años (vía cascada que parte del año 1 automático).

### Flujo 2: Override de un supuesto en un año específico

```ts
const valuation = new CompanyValuation({
  ticker: "NVDA",
  currentPrice: 850,
  financials,
  overrides: {
    projections: {
      2028: { salesGrowth: 0.30 },
    },
  },
})
```

Resultado: año 2027 usa el `salesGrowth` automático (promedio histórico). Año 2028 usa 30%. Años 2029, 2030, 2031 heredan 30% por cascada. El impacto se propaga a `sales`, `ebit`, `netIncome`, `fcf`, `intrinsicValue`.

### Flujo 3: Tesis explícita multi-año con escenario de normalización

```ts
overrides: {
  projections: {
    2027: { salesGrowth: 0.25, ebitMargin: 0.40 },
    2028: { salesGrowth: 0.20 },
    2029: { salesGrowth: 0.15, ebitMargin: 0.35 },
    2030: { salesGrowth: 0.10 },
    2031: { salesGrowth: 0.08 },
  },
  targetMultiples: { per: 20, evEbitda: 12 },
}
```

Resultado: cada año tiene su propio `salesGrowth`; `ebitMargin` cascadea desde 2027 (40%) hasta que 2029 lo sobrescribe a 35% y 2030–2031 lo heredan. Target multiples `per=20` y `evEbitda=12` reemplazan los NTM en el cálculo de intrinsic value.

### Flujo 4: Override absoluto de `changeInWorkingCapital`

```ts
overrides: {
  projections: {
    2028: { changeInWorkingCapital: -50_000_000 },
  },
}
```

Resultado: año 2028 usa −$50M exactos. Años 2029+ escalan con el ratio implícito `-50M / sales_2028` aplicado a sus respectivas ventas proyectadas (propagación natural del engine).

## Arquitectura

### Stack

- TypeScript estricto, Bun test runner.
- Librería pura (funciones/constructores sin efectos).

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `packages/valuation-engine/src/index.ts` | Exportar tipos `ValuationOverrides`, `ProjectionYearOverride`, `TargetMultiplesOverride`. |
| `packages/valuation-engine/src/company-valuation.ts` | Agregar `overrides?: ValuationOverrides` a `CompanyValuationInputs`. Pasar a `ProjectionAssumptions`, `ProjectedYear`, `Multiples`. |
| `packages/valuation-engine/src/projection-assumptions.ts` | Aceptar overrides opcionales. Cambiar modelo interno de "valor único" a "valor por año" con cascada desde año 1. Valores automáticos siguen calculándose igual pero se exponen como año 1 base. |
| `packages/valuation-engine/src/projected-year.ts` | Consumir supuestos per-año desde `ProjectionAssumptions`. Aplicar override absoluto de `changeInWorkingCapital` cuando corresponda. |
| `packages/valuation-engine/src/multiples.ts` | Aceptar overrides de target multiples y usarlos en lugar del NTM cuando existan. |
| `packages/valuation-engine/src/intrinsic-value.ts` | Sin cambios estructurales (consume los target multiples ya resueltos desde `Multiples`). |

### Nuevos archivos

| Archivo | Propósito |
|---------|-----------|
| `packages/valuation-engine/src/overrides.ts` | Tipos públicos `ValuationOverrides`, helpers para resolver el valor efectivo año-a-año con cascada. |
| `packages/valuation-engine/tests/overrides.test.ts` | Tests de los 4 criterios de éxito. |

### Contrato público

```ts
export interface CompanyValuationInputs {
  ticker: string
  name?: string
  currentPrice: number
  financials: Record<number, CompanyYearFinancials>
  overrides?: ValuationOverrides
}

export interface ValuationOverrides {
  projections?: Record<number, ProjectionYearOverride>  // key: año proyectado
  targetMultiples?: TargetMultiplesOverride
}

export interface ProjectionYearOverride {
  salesGrowth?: number
  ebitMargin?: number
  taxRate?: number
  shareGrowth?: number
  capexMaintenanceSalesRatio?: number
  changeInWorkingCapital?: number   // valor absoluto en $
  netDebtEbitdaRatio?: number
}

export interface TargetMultiplesOverride {
  per?: number
  evEbitda?: number
  evEbit?: number
  evFcf?: number
}
```

### Modelo de resolución (cascada)

Para cada campo `f` y año proyectado `y`:

1. Si `overrides.projections[y][f]` existe → usarlo.
2. Si no, si `y` es el primer año proyectado → usar el promedio histórico (cálculo actual de `ProjectionAssumptions`).
3. Si no, usar el valor efectivo resuelto para el año `y − 1` (cascada).

Para `changeInWorkingCapital`, el paso 3 equivale al comportamiento actual del engine: `(ΔWC_{y-1} / sales_{y-1}) × sales_y`, dado que el "valor efectivo" incorpora el override si lo hubo.

Para `targetMultiples.{campo}`:
1. Si `overrides.targetMultiples[campo]` existe → usarlo.
2. Si no → usar el NTM calculado (comportamiento actual).

### Principio de no-regresión

El cambio del modelo interno a "per-año con cascada" debe ser transparente: sobre los fixtures actuales sin overrides, todos los tests existentes siguen pasando sin tolerancias ni ajustes.

## Cambios asociados

- Futuro PRD: exposición de `overrides` vía endpoint de `apps/api` y persistencia (fuera de este PRD).
- Futuro PRD: UI para ingresar overrides desde el dashboard (fuera de este PRD).
- Referencia a PRD base: `docs/prd/done/engine.md`, sección "Proyecciones y supuestos".

## Verificación end-to-end

1. `cd packages/valuation-engine && bun test` — todos los tests existentes pasan sin cambios.
2. `bun test tests/overrides.test.ts` — 4 escenarios nuevos pasan.
3. Verificación manual con fixture NVDA: instanciar `CompanyValuation` con y sin `overrides` desde un script ad-hoc, comparar que los outputs sin overrides son idénticos y que con overrides los valores cambian donde corresponde.
