# TIKR field mapper: default a 0 cuando la fila o celda no existe

## Contexto

El engine de valoración bloquea la evaluación de empresas si cualquier campo del input viene como `null`. NVDA está cargada en BD con varios campos `null` que TIKR omite legítimamente cuando su valor real es 0:

- `incomeStatement.minorityInterests` (todos los años: NVDA no tiene subsidiarias con interés minoritario)
- `roic.shortTermDebt` (varios años sin amortización corriente de deuda LP)
- `roic.currentOperatingLeases` y `roic.nonCurrentOperatingLeases` (años sin arrendamientos capitalizados)

Estos `null` provienen de `apps/extension/src/sources/tikr/fieldMapper.ts`, que omite el campo del payload cuando no encuentra la fila esperada en la tabla de TIKR. Al llegar a la API, el campo ausente se persiste como `null` en BD y `isYearComplete` (`apps/api/src/modules/company/company.ts:373`) marca el año incompleto, dejando la valoración en `pending: true` indefinidamente.

## Objetivo

Que la extensión envíe `0` cuando una fila esperada no existe en la tabla de TIKR o cuando la celda específica de esa columna está vacía, asumiendo que "ausente en TIKR" equivale a "valor real cero". Mantener la omisión solo cuando la celda tiene contenido pero no es parseable, para no enmascarar bugs del parser.

## Alcance

Un solo archivo cambia: `apps/extension/src/sources/tikr/fieldMapper.ts`.

No cambian:
- API (`apps/api`).
- Engine (`packages/valuation-engine`).
- Schema de BD ni migraciones.
- Validators del payload (`apps/api/src/modules/company/validators.ts`).
- Lógica de `currentPrice` (sigue siendo opcional; el default 0 no aplica a precios).

## Diseño

### Cambio en `mapTikrToPayload`

La función itera por cada `FieldDefinition` y hoy descarta el campo en tres condiciones. El nuevo comportamiento por caso:

| Caso | Hoy | Nuevo |
|------|-----|-------|
| (1) `findRow` no encuentra ninguna de las labels en `byLabel` | `continue` (campo ausente del payload) | `applyValue(..., 0)` |
| (2) `row.values[columnIndex]` es `undefined` | `continue` | `applyValue(..., 0)` |
| (3) `parseAndNormalize(raw, unit)` devuelve `null` | `continue` | **Sin cambio:** `continue` |

El caso (3) se mantiene porque indica que la celda tiene contenido que el parser no entendió. Tratarlo como 0 enmascararía silenciosamente formatos nuevos no soportados (por ejemplo, si TIKR cambiara su DOM o introdujera un formato inesperado en columnas críticas como `sales` o `ebit`).

### Aplica a todos los campos por igual

El default 0 aplica a cualquier `FieldDefinition` en `INCOME_STATEMENT_FIELDS`, `BALANCE_SHEET_FIELDS` y `CASH_FLOW_FIELDS`. No se introduce una lista blanca/negra de campos: el comportamiento es uniforme.

### Por qué no se requieren cambios en la API

- La API ya acepta `0` como valor numérico válido para todos los campos del payload.
- `applyYearlyFinancialsPatch` (`apps/api/src/modules/company/company.ts:336`) ya sobrescribe valores `null` existentes en BD cuando el payload trae un nuevo valor. Re-scrapear NVDA con la extensión actualizada llenará los huecos automáticamente.
- `isYearComplete` (`apps/api/src/modules/company/company.ts:373`) marca incompleto cualquier `null`. Al recibir `0`, el año pasa a completo y se dispara la valoración en background.

## Tests

Actualizar los tests existentes de `fieldMapper` en `apps/extension/tests/`:

- Los casos que hoy verifican "el campo no se incluye en el payload cuando la fila no existe" deben pasar a verificar "el campo = 0 cuando la fila no existe".
- Los casos análogos para "celda undefined en esa columna" pasan a "campo = 0".
- El caso de "celda con contenido no parseable" mantiene su aserción actual (campo ausente del payload).

Agregar al menos un test por cada uno de los tres casos para que el contrato quede explícito.

## Migración de datos

No se ejecuta script de migración. El plan es:

1. Aplicar el cambio en la extensión.
2. Re-scrapear NVDA manualmente desde TIKR (income statement, balance sheet, cash flow).
3. Verificar end-to-end que `curl http://localhost:3000/companies/NVDA` devuelve `valuation` no-null y `pending: false`.

Como NVDA es la única empresa cargada hoy, no hace falta limpiar nada más.

## Validación end-to-end

1. Build/reload de la extensión.
2. Abrir TIKR para NVDA y disparar el scrape de las tres secciones.
3. `curl http://localhost:3000/companies/NVDA | jq` debe mostrar:
   - `pending: false`
   - `valuation` con resultado del engine
   - `missing` ausente o vacío

## Riesgos

- **Falso 0 enmascara bugs futuros del DOM de TIKR.** Si TIKR cambia su HTML y deja de exponer una fila crítica (`Total Revenues`, `Operating Income`, etc.), la extensión enviaría 0 silenciosamente y el engine produciría una valoración basura. Mitigación parcial: el caso (3) sí se mantiene como faltante, pero (1) y (2) no. Se acepta este riesgo porque es la opción explícitamente elegida (permisivo amplio).
- **Distinción "no aplica" vs "no encontrado" se pierde.** En BD ya no se distingue entre "TIKR no exponía la fila" y "el valor real era 0". Aceptable para el caso de uso actual.
