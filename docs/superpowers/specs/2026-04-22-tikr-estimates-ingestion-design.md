# Spec: Ingesta de estimates de TIKR con valoración paralela

## Contexto

El valuation engine está incorporando (en rama separada, PRD `docs/prd/engine-overrides.md`) el soporte para `ValuationOverrides`: un parámetro opcional que permite inyectar supuestos manuales por año proyectado y target multiples, con un modelo cascada. El engine queda listo para consumir overrides, pero falta la capa que los produce y los persiste.

TIKR publica en `https://app.tikr.com/stock/estimates?...&tab=est` una página con consenso de analistas: sales, EBIT, EBITDA, EPS, free cash flow y otros supuestos para los próximos ~4 años fiscales. Hoy esa página no se captura — la extensión solo soporta income statement, balance sheet y cash flow statement, y además filtra explícitamente las columnas con sufijo `E` en todas ellas. El inversor no tiene forma de contrastar "valoración con supuestos automáticos del engine" vs "valoración con el consenso del mercado" sin salir del sistema.

Este spec suma una cuarta sección a la extensión (estimates), un endpoint nuevo en la API, una tabla nueva en la DB (multi-source desde día uno) y una segunda corrida del engine con overrides mergeados. El resultado: `GET /companies/:ticker` devuelve dos valoraciones en paralelo — `valuation` (automática, contrato actual intacto) y `valuationWithEstimates` (con overrides aplicados) — y un endpoint adicional permite inspeccionar la valoración de una source específica bajo demanda.

## Problema

1. Los overrides del engine hoy no tienen productor: para usarlos hay que invocar el engine directamente desde código, instanciando `CompanyValuation` con `overrides` manuales.
2. El consenso de analistas que publica TIKR es la primera fuente natural de overrides, pero la extensión lo filtra.
3. La DB no modela estimates: `yearly_financials` es inmutable a nivel de campo y solo describe datos fiscales históricos. Los estimates son mutables (el consenso se revisa mes a mes) y tienen provenance (hoy TIKR; mañana InvestingPro o estimates manuales del usuario).
4. El contrato del `GET /companies/:ticker` asume una sola valoración por ticker. No expresa la dualidad "auto vs consenso".

## Solución

**Ingesta:** la extensión gana una sección `estimates` con su propio `urlMatcher`, `domParser` y `fieldMapper`. La API gana un endpoint `POST /companies/:ticker/estimates` que recibe un payload estructurado con campos que mapean 1:1 a `ProjectionYearOverride`. La DB gana una tabla nueva `yearly_estimates`, con la source como parte de la clave primaria para soportar múltiples fuentes de estimates por ticker.

**Persistencia:** a diferencia de `yearly_financials` (inmutable por campo, histórico cerrado), `yearly_estimates` aplica upsert total por `(ticker, fiscalYearEnd, source)`. Cada re-ingesta reemplaza la fila completa. Campos no enviados pasan a `null`.

**Valoración:** el Flujo 2 del pipeline corre ahora hasta dos veces por invocación exitosa: una con `overrides` vacíos (preserva comportamiento actual), otra con `overrides` mergeados si el ticker tiene al menos un registro de estimates. Ambas valoraciones se persisten en `valuations` con una columna nueva `source` (`"auto"` | `"merged_estimates"`).

**Merge:** al armar los overrides mergeados se aplica prioridad campo-por-campo `manual > tikr > otras`. Las sources inexistentes se saltan; los campos ausentes caen al comportamiento cascada del engine (valor automático del año 1 propagándose).

**Consulta:** `GET /companies/:ticker` suma `valuationWithEstimates: ValuationResult | null` y `availableEstimateSources: string[]`. El campo `valuation` existente no cambia. Un endpoint nuevo `GET /companies/:ticker/valuations?source=<source>` calcula on-the-fly una valoración usando solo los overrides de esa source (sin persistir, sin contaminación de otras sources).

## Alcance

### Incluido

- Tabla `yearly_estimates` en SQLite con PK compuesta `(ticker, fiscalYearEnd, source)` y columnas para los campos de `ProjectionYearOverride` salvo los no disponibles en TIKR (ver exclusiones).
- Columna `source: text` en `valuations`. Migración agrega columna y setea los registros existentes a `"auto"`.
- Endpoint `POST /companies/:ticker/estimates` con payload validado por Valibot (`source` requerido, `years` opcional).
- Actualización del Flujo 2 para ejecutar la segunda corrida con overrides mergeados cuando hay estimates. Si esa segunda corrida lanza excepción, se loggea y no invalida la corrida auto.
- Cambios en `GET /companies/:ticker`: agregar `valuationWithEstimates` y `availableEstimateSources` al response. El campo `valuation` mantiene shape actual.
- Endpoint nuevo `GET /companies/:ticker/valuations?source=<source>` que corre el engine on-the-fly con solo los overrides de esa source. Devuelve `404` si la source no tiene registros para el ticker.
- Extensión: nueva sección `estimates` en `TikrSection`. `urlMatcher` mapea `tab=est` → `estimates`. `columnFilter` gana un `mode: "historical" | "estimates"` que controla qué sufijos (`A`/`E`) pasan. `fiscalYearParser` maneja el formato `M/D/YY <A|E>` (con espacio) usado en la página de estimates.
- Nuevo `estimatesFieldMapper` que itera filas en orden con state `lastMainLabel` para asociar sub-filas `italic` (`% Change YoY`, `% EBIT Margins`) con su main row correspondiente.
- Popup de la extensión detecta la sección estimates, muestra preview con años futuros visibles y campos que va a enviar, y dispara el POST.
- Fixture `apps/extension/tests/fixtures/tikr/nvda-estimates.html` (ya creado). Tests del `domParser` y `fieldMapper` sobre ese fixture.
- Tests de integración en `apps/api`: ingesta de estimates produce fila en `yearly_estimates`; Flujo 2 con estimates produce dos filas en `valuations`; `GET` devuelve ambas valoraciones; endpoint por source funciona.

### Excluido

- Campos de override no disponibles en la página de estimates de TIKR: `shareGrowth`, `changeInWorkingCapital`. Quedan sin productor; el engine cascadea desde el valor automático del año 1. Si en el futuro aparecen en otra página o source, se suma por PRD separado.
- `targetMultiples.*` (`per`, `evEbitda`, `evEbit`, `evFcf`): la página de estimates no los expone. No se modela tabla ni endpoint para ellos hoy. Cuando aparezca una source que los provea (p. ej. estimates manuales), el PRD correspondiente crea la tabla y extiende el merge.
- Estimates manuales del usuario: source `"manual"` está declarada en el modelo pero no hay endpoint ni UI que la produzca. Queda para PRD futuro. La lógica de merge ya la soporta por diseño (prioridad `manual > tikr`).
- Validación semántica de ranges (p. ej. `taxRate` entre 0 y 1): modelo permisivo, mismo criterio que el PRD de overrides.
- Comparación visual lado-a-lado en un cliente: el spec expone ambas valoraciones pero no construye UI; los clientes consumen el endpoint y comparan por su cuenta.
- Autenticación y multi-usuario: se mantiene el modelo del pipeline actual (servicio local sin auth).

## Criterio de éxito

1. **Ingesta end-to-end**: al abrir la extensión en `https://app.tikr.com/stock/estimates?...&tab=est` de NVDA, el popup muestra ticker, años futuros (4 fiscal years con sufijo `E`), campos a enviar. Click en Enviar → response `200` del API → fila presente en `yearly_estimates` con `source="tikr"`.

2. **Segunda corrida del engine**: después de una ingesta de financials completa (los 10 años) + ingesta de estimates, `GET /companies/:ticker` devuelve `valuation` (no null) y `valuationWithEstimates` (no null). Los números de `valuationWithEstimates` son distintos a los de `valuation` en los campos que TIKR overridea (`salesGrowth`, `ebitMargin`, `taxRate`, `netDebtEbitdaRatio`, `capexMaintenanceSalesRatio`).

3. **Preservación del contrato actual**: un cliente que solo lee `response.valuation` sigue funcionando sin cambios. Los tests existentes del Flujo 2 sin estimates producen los mismos números que antes.

4. **Upsert de estimates**: re-ingestar estimates del mismo `(ticker, source)` con algún campo diferente reemplaza la fila completa. `capturedAt` se actualiza. Los campos no enviados quedan `null`.

5. **Source aislada on-the-fly**: `GET /companies/:ticker/valuations?source=tikr` devuelve una `ValuationResult` cuyos números coinciden con `valuationWithEstimates` del GET principal (hoy, porque solo existe `tikr`; el merge es trivial). No se persiste una nueva fila en `valuations`. Si el ticker no tiene estimates de esa source, devuelve `404`.

6. **Fallo aislado**: si la segunda corrida del engine lanza una excepción (ej: override con valor absurdo que produce división por cero), la corrida `auto` sigue persistiéndose y `pendingValuation` se limpia. El log registra el error.

7. **Tests del parser sobre el fixture**: `parseTikrEstimatesPage(fixture)` extrae ticker, precio, unit, años proyectados (4 `E`), y asocia correctamente las sub-filas `italic` con el main row anterior.

## Flujos

### Flujo 1: captura de estimates desde la extensión

Disparador: usuario con sesión de TIKR abierta navega a `https://app.tikr.com/stock/estimates?...&tab=est`, clickea el ícono de la extensión.

1. `matchTikrUrl` detecta `tab=est` y devuelve `"estimates"`.
2. La extensión ejecuta `parseTikrEstimatesPage` sobre el DOM de la pestaña:
   - `ticker` desde `.ticker-symbol`.
   - `currentPrice` desde `.price-wrapper span` (mismo selector que las otras páginas).
   - `unit` desde `.newfilter-description` o `#unit-select button.v-btn--active`.
   - Tabla `.fintab`: headers con formato `M/D/YY A` o `M/D/YY E`; filtro modo `"estimates"` conserva solo `E`.
   - Filas: iteración en orden, tracking de `lastMainLabel` por clase (`normal` → main; `italic` → sub).
3. El popup muestra preview: sección `"Estimates"`, ticker, rango de años futuros (menor a mayor), precio actual.
4. Si ticker, años o unit están ausentes, el botón Enviar queda deshabilitado.
5. Click en Enviar → `mapTikrEstimatesToPayload(parsed)` produce el payload para el POST.
6. `apiClient.postEstimates(apiUrl, ticker, payload)` envía el request.
7. Response `200 OK` → popup muestra `"Enviado ✓"`. Error → `"Error: <mensaje>"`.

### Flujo 2: ingesta en la API

Disparador: `POST /companies/:ticker/estimates` con payload validado.

1. Validación Valibot: `source` requerido (string no vacío), `years` opcional (array de objetos con `fiscalYearEnd` + campos de override opcionales).
2. Por cada año del payload:
   - Upsert en `yearly_estimates` con PK `(ticker, fiscalYearEnd, source)`. Los campos no enviados quedan `null` (replace total, no merge).
   - Actualiza `capturedAt`.
3. Detecta si hubo cambio efectivo (al menos un campo distinto al estado previo, o fila nueva). Si sí, marca `pendingValuation = true` en `TickerState`.
4. Dispara Flujo 3 en background (promesa no-awaited).
5. Responde `200 OK` con `{ success: true }`.

### Flujo 3: valoración con dos corridas

Sustituye el Flujo 2 del PRD del pipeline. Disparador: el ticker está marcado como `pendingValuation = true`.

1. Lock in-memory (comportamiento actual): si hay un Flujo 3 activo para el ticker, descarta la invocación.
2. Recolecta los 10 años de `yearly_financials` y el `currentPrice` (igual que hoy).
3. Verifica suficiencia de datos (igual que hoy).
4. **Corrida `auto`**: `new CompanyValuation({ ticker, currentPrice, financials })` sin `overrides`. Persiste en `valuations` con `source="auto"`.
5. **Corrida `merged_estimates`** (solo si hay al menos un registro en `yearly_estimates` para el ticker):
   - Resolver merged overrides: para cada `(fiscalYearEnd, campo)`, recorrer las sources en orden de prioridad (`manual`, `tikr`, resto alfabético) y tomar el primer valor no-null encontrado.
   - Construir `ValuationOverrides` con lo resuelto (solo `projections`; `targetMultiples` queda vacío en MVP).
   - `new CompanyValuation({ ticker, currentPrice, financials, overrides })`.
   - Persistir en `valuations` con `source="merged_estimates"`.
   - Try/catch: si esta corrida falla, loggear y continuar (no invalida la auto).
6. Limpia `pendingValuation = false` si al menos la corrida auto fue exitosa.

### Flujo 4: consulta con dos valoraciones

Sustituye el Flujo 3 del PRD del pipeline. Disparador: `GET /companies/:ticker`.

1. Busca `TickerState`. Si no existe, `404`.
2. Si `pendingValuation=true`, ejecuta Flujo 3 sincrónicamente y espera.
3. Arma el response:
   - `valuation`: último `source="auto"` (o null).
   - `valuationWithEstimates`: último `source="merged_estimates"` (o null).
   - `availableEstimateSources`: array distinto de `source` presentes en `yearly_estimates` para el ticker.
   - `missing`, `pending`, `valuationInProgress`: igual que hoy.
4. Responde `200 OK`.

### Flujo 5: consulta por source aislada

Disparador: `GET /companies/:ticker/valuations?source=<source>`.

1. Valida `source` contra el set de sources conocidas (`tikr`, `manual`).
2. Verifica que exista al menos un registro en `yearly_estimates` con ese `(ticker, source)`. Si no, `404`.
3. Recolecta financials + currentPrice igual que en Flujo 3.
4. Construye `ValuationOverrides` solo con los registros de esa source (sin merge).
5. Corre el engine on-the-fly. No persiste.
6. Responde `200 OK` con la `ValuationResult`. Si el engine falla, `500`.

## Arquitectura

### Modelo de datos

#### Tabla `yearly_estimates` (nueva)

Columnas (Drizzle, bun-sqlite):

- `ticker: text notNull` — PK
- `fiscalYearEnd: text notNull` — PK (formato `YYYY-MM-DD`)
- `source: text notNull` — PK (valores iniciales: `"tikr"`, `"manual"`)
- `capturedAt: text notNull` — ISO 8601 UTC, actualizado en cada upsert
- `salesGrowth: real` (nullable)
- `ebitMargin: real` (nullable)
- `taxRate: real` (nullable)
- `capexMaintenanceSalesRatio: real` (nullable)
- `netDebtEbitdaRatio: real` (nullable)
- (nota) `shareGrowth` y `changeInWorkingCapital` NO se incluyen en MVP. Si el futuro los necesita, se agregan por migración.

#### Tabla `valuations` (cambio)

- Nueva columna `source: text notNull` con valores `"auto"` o `"merged_estimates"` en MVP.
- Migración: para las filas existentes, setear `source = "auto"`.

### Contrato de endpoints

#### `POST /companies/:ticker/estimates`

Body:

```
{
  source: string,
  years?: [
    {
      fiscalYearEnd: "YYYY-MM-DD",
      salesGrowth?: number,
      ebitMargin?: number,
      taxRate?: number,
      capexMaintenanceSalesRatio?: number,
      netDebtEbitdaRatio?: number
    }
  ]
}
```

Respuesta: `200 OK` con `{ success: true }`. Errores: `400` si body mal formado, `500` si falla persistencia.

#### `GET /companies/:ticker` (cambio al contrato)

```
{
  ticker: string,
  latestFiscalYearEnd: "YYYY-MM-DD" | null,
  currentPrice: number | null,
  valuation: ValuationResult | null,
  valuationWithEstimates: ValuationResult | null,    // nuevo
  availableEstimateSources: string[],                 // nuevo, puede ser []
  pending: boolean,
  valuationInProgress: boolean,
  missing?: {...}
}
```

#### `GET /companies/:ticker/valuations?source=<source>` (nuevo)

Query param: `source` requerido. Respuesta: `200 OK` con `ValuationResult`. `400` si source inválido, `404` si no hay datos de esa source para el ticker.

### Extensión

Paths nuevos/modificados:

- `apps/extension/src/sources/tikr/urlMatcher.ts`: agregar `est: "estimates"` al `TAB_TO_SECTION`, extender `TikrSection`.
- `apps/extension/src/sources/tikr/domParser.ts`: aceptar `section: TikrSection` (o `mode: "historical" | "estimates"`) y delegar a `filterFiscalYearColumns` con el mode correcto.
- `apps/extension/src/sources/tikr/estimatesFieldMapper.ts` (nuevo): itera filas con state `lastMainLabel` y produce el payload para `POST /estimates`.
- `apps/extension/src/lib/columnFilter.ts`: agregar parámetro `mode` que elige qué sufijo aceptar.
- `apps/extension/src/lib/fiscalYearParser.ts`: extender regex para aceptar `M/D/YY <A|E>` (con espacio). Devolver `{ fiscalYearEnd, suffix }` para que el filtro decida.
- `apps/extension/src/lib/apiClient.ts`: agregar `postEstimates(apiUrl, ticker, payload)`.
- `apps/extension/src/popup/App.svelte`: ramificación según `section === "estimates"`.
- `apps/extension/tests/fixtures/tikr/nvda-estimates.html`: ya creado.
- `apps/extension/tests/estimatesFieldMapper.test.ts` (nuevo).
- `apps/extension/tests/domParser.test.ts`: agregar casos para `section === "estimates"` usando el fixture.

### API

- `apps/api/src/modules/company/schema.ts`: agregar `yearlyEstimates`; agregar columna `source` a `valuations`.
- `apps/api/src/modules/company/validators.ts`: nuevo schema Valibot para el POST de estimates.
- `apps/api/src/modules/company/routes.ts`: nuevas rutas `POST /companies/:ticker/estimates`, `GET /companies/:ticker/valuations`.
- `apps/api/src/modules/company/company.ts`: método `ingestEstimates(ticker, payload)`, método `mergeOverrides(ticker)` que arma el `ValuationOverrides`, Flujo 3 actualizado en `valuate(ticker)` para correr dos veces.
- `apps/api/src/modules/company/repository.ts`: queries para upsert de `yearly_estimates`; lookup de últimos valuations por source.
- `apps/api/src/db/migrations/`: nueva migración generada por drizzle-kit con la tabla nueva y la columna `source` en `valuations`.

### Engine

Sin cambios. El engine ya acepta `overrides?: ValuationOverrides` en `CompanyValuationInputs` (mergeado en `main` vía PR #37). Los tipos `ValuationOverrides`, `ProjectionYearOverride` y `TargetMultiplesOverride` están exportados desde `@market-watcher/valuation-engine` y se consumen directo en `apps/api`.

## Verificación end-to-end

1. `cd apps/api && bun test` — pasa.
2. `cd apps/extension && bun test` — pasa (incluyendo tests nuevos sobre `nvda-estimates.html`).
3. Con el API corriendo local + extensión instalada:
   - Navegar a TIKR → página de estimates de NVDA → enviar desde el popup → `200 OK`.
   - Curl `GET /companies/NVDA` → response incluye `valuation` y `valuationWithEstimates` con números distintos.
   - Curl `GET /companies/NVDA/valuations?source=tikr` → devuelve una valoración on-the-fly.
4. Re-enviar estimates con valores diferentes → `capturedAt` actualizado, `valuationWithEstimates` recomputada.
5. Script ad-hoc: comparar `valuation.intrinsicValue.targetPrice[5].average` vs `valuationWithEstimates.intrinsicValue.targetPrice[5].average` para NVDA; deben diferir.
