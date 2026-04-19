# PRD: Data Pipeline

## Resumen

Servicio REST local que recibe datos financieros de empresas desde clientes externos, los persiste, y los utiliza para producir valoraciones automáticas con el Valuation Engine. Expone un endpoint de ingesta (que dispara la valoración en segundo plano cuando llegan datos nuevos) y un endpoint de consulta (que devuelve la última valoración, disparando una sincrónica de respaldo si el ticker está pendiente). Los clientes que alimentan el servicio — como una extensión de Chrome para TIKR — se definen en PRDs separados.

## Problema

El Valuation Engine recibe datos pre-formateados y produce la valoración, pero el paso previo — obtener y organizar los datos — sigue siendo manual. Hoy implica abrir TIKR empresa por empresa, copiar números al Excel plantilla, y decidir a ojo si el análisis del año ya existe o hay que rehacerlo. Con ~30 empresas al mes, ese trabajo domina el tiempo de investigación y bloquea cualquier automatización de señales.

## Solución

El servicio expone un endpoint de ingesta por ticker. Cada request transporta datos financieros estructurados — uno o varios años fiscales — siguiendo un contrato agnóstico al origen. El servicio persiste los datos con inmutabilidad a nivel de campo: los valores ya registrados no se sobreescriben.

La ingesta dispara en segundo plano la valoración cada vez que registra datos nuevos para un ticker. Un endpoint de consulta devuelve la última valoración guardada y, si el ticker está pendiente de valorizar, dispara también la valoración como respaldo, reportando qué campos faltan cuando aún no puede ejecutarse.

La regla de vigencia es data-driven: una valoración sigue siendo válida mientras no aparezca una fecha de cierre fiscal posterior en los datos registrados del ticker. Esto absorbe empresas con cierres fiscales en cualquier mes (enero, agosto, diciembre, etc.) sin lógica de calendario.

## Alcance

### Incluido

**Ingesta y almacenamiento**
- Endpoint HTTP que recibe ingestas por ticker desde cualquier cliente que respete el contrato
- Persistencia estructurada con inmutabilidad a nivel de campo
- Histórico de valoraciones calculadas

**Valorización**
- Recálculo automático en segundo plano disparado por la ingesta cuando se registran datos nuevos para un ticker, y por la consulta cuando el ticker está pendiente
- La consulta de valoración indica qué campos faltan cuando el ticker sigue pendiente y aún no puede valorizarse
- Uso de la Plantilla General (única disponible hoy en el engine)

**Regla de vigencia**
- Una valoración sigue siendo válida mientras los datos registrados no muestren un año fiscal posterior al que la originó

**Agnosticismo al origen**
- El servicio acepta datos de cualquier cliente que respete el contrato del endpoint; no conoce ni asume la fuente de esos datos

### Excluido

- Clientes que alimentan el servicio (extensión de Chrome para TIKR, scripts, integraciones con otros proveedores) — se definen en PRDs separados
- Plantillas de Financieras y REITs
- Red flags y señales automáticas (COMPRAR / WATCHLIST / VENDER / DESCARTAR)
- Autenticación, multi-usuario, deploy remoto
- Dashboard, watchlist, alertas
- Re-evaluación programada o cualquier trigger distinto a la ingesta
- Overrides manuales sobre los inputs del engine
- Sincronización con Excel / hojas de cálculo

## Criterio de éxito

Para validar el servicio se crean fixtures de payloads HTTP (en JSON) para las cuatro empresas de referencia (Nvidia, Amazon, Nike y Costco), construidos a mano a partir de datos de TIKR. Cada fixture contiene una secuencia de payloads que respeta el contrato del endpoint de ingesta y simula lo que un cliente enviaría a lo largo del tiempo. Sobre cada uno de esos fixtures:

1. Al alimentar el servicio con la secuencia completa de payloads del fixture, los datos quedan registrados y se dispara automáticamente la valoración cuando el set está completo para el año fiscal más reciente.

2. La valoración resultante es idéntica a la que produce el Valuation Engine ejecutado directamente contra los mismos datos consolidados (dentro de la tolerancia de redondeo del engine, 0.01%).

3. Si el servicio recibe solo una parte de los payloads necesarios, la consulta de valoración indica qué campos faltan para completar el cálculo.

4. Una re-ingesta del mismo año fiscal reportado no altera los datos ya almacenados; el histórico crece sin corromper la consolidación.

5. Cuando aparece un año fiscal posterior al de la valoración vigente, el sistema lo detecta, recalcula y guarda una nueva valoración sin borrar las anteriores.

6. Una consulta posterior del ticker devuelve la última valoración almacenada.

## Flujos

### Flujo 1: Ingesta de datos

Describe cómo el servicio procesa una ingesta de datos financieros para un ticker.

**Disparador**: un cliente envía un request al endpoint de ingesta con los datos financieros de un ticker (el precio actual y uno o más años fiscales, cada uno con los campos del engine que el cliente haya logrado obtener).

**Pasos**:

1. El servicio valida el request contra el contrato de ingesta. Si el body está mal formado, responde con error y termina.

2. El servicio persiste los datos para cada año presente en el envío, aplicando inmutabilidad a nivel de campo: un campo que ya tiene valor no se sobreescribe.

3. Si alguno de los años aportados es posterior al último año fiscal registrado para este ticker (o si es la primera vez que se ve este ticker), el servicio actualiza ese valor en el estado del ticker. Re-ingestas de años ya registrados no alteran este valor. Si el envío incluye `currentPrice`, el servicio actualiza ese valor en el estado del ticker.

4. Si el envío produjo al menos una escritura efectiva (algún campo que estaba null pasó a tener valor, o se creó un año nuevo), el servicio marca al ticker como pendiente de valorizar. Actualizar `currentPrice` no cuenta como escritura efectiva a estos efectos.

5. Si tras el paso anterior el ticker quedó marcado como pendiente, el servicio dispara en segundo plano el flujo **Valoración de una compañía** y continúa sin esperar su resultado.

6. El servicio responde al cliente confirmando que la ingesta fue exitosa.

### Flujo 2: Valoración de una compañía

Describe cómo el servicio transforma los datos financieros disponibles en una valoración ejecutando el engine y persistiendo el resultado. No se dispara directamente por una acción del usuario: ocurre siempre como consecuencia de una ingesta o de una consulta que encuentra al ticker en estado pendiente.

**Disparador**: el ticker está en estado pendiente de valorizar (marcado así por el Flujo 1 o detectado así por el Flujo 3).

**Pasos**:

1. El servicio verifica si ya hay una ejecución en curso de este mismo flujo para el mismo ticker. Si la hay, descarta la invocación y termina sin ejecutar el engine y sin modificar el estado del ticker.

2. El servicio reúne los datos registrados del ticker para el año fiscal más reciente y hasta los 9 años históricos previos (10 años en total como máximo).

3. Verifica si los datos disponibles cubren los campos que el engine necesita para ejecutar una valoración. La valoración requiere al menos 2 años fiscales consecutivos —y hasta 10— donde todos los campos de los sub-objetos `incomeStatement`, `freeCashFlow` y `roic` estén poblados, y que el `currentPrice` del ticker esté presente.

4. Si los datos son suficientes:
   - Invoca al engine con los datos disponibles.
   - Si el engine lanza una excepción durante el cálculo, el error se registra en logs y el ticker permanece en estado pendiente; ninguna valoración se persiste.
   - Si el engine retorna un resultado exitoso, persiste el resultado como una nueva entrada del histórico de valoraciones del ticker, asociada al año fiscal más reciente.
   - Si la persistencia fue exitosa, limpia la marca de pendiente del estado del ticker.

5. Si los datos son insuficientes:
   - No se produce valoración. El ticker permanece en estado pendiente para un próximo intento.

### Flujo 3: Consulta de valoración

Describe cómo el cliente accede a la valoración vigente de un ticker y al estado actual del mismo (incluidos los campos faltantes si aplica). Si el ticker quedó pendiente y la valoración no llegó a ejecutarse por el flujo de ingesta, este flujo la dispara como respaldo.

**Disparador**: el cliente consulta la valoración de un ticker.

**Pasos**:

1. El servicio busca el estado del ticker. Si no existe registro, responde indicando que no hay información para ese ticker y termina.

2. Si el ticker está marcado como pendiente de valorizar, el servicio ejecuta el flujo **Valoración de una compañía** de manera sincrónica y espera su resultado.

3. El servicio responde al cliente con:
   - La valoración más reciente del ticker, si existe.
   - El estado del ticker, incluidos los flags `pending` y `valuationInProgress`.
   - Si el ticker sigue pendiente tras el intento: los campos faltantes a nivel del ticker (como `currentPrice` si nunca se ha enviado) y, para cada año fiscal con datos incompletos, los sub-objetos del engine (`incomeStatement`, `freeCashFlow`, `roic`) con los nombres de los campos que aún no tienen valor.

## Arquitectura

### Stack tecnológico

**Existente (monorepo)**

- Bun 1.3.12 — runtime y package manager
- Turborepo 2.9.6 — orquestación del monorepo
- TypeScript 6
- Biome 2.4.12 — lint y format
- Workspaces en `packages/*`

**Servicio REST**

- Hono — framework HTTP
- `@hono/standard-validator` + Valibot — validación de payloads de entrada
- `bun:sqlite` — driver SQLite nativo de Bun
- Drizzle ORM — schema declarativo, migraciones y queries tipadas

El servicio exporta `AppType = typeof app` para que los clientes puedan consumir el contrato con tipado end-to-end vía `hono/client` (`hc` / `hcWithType`).

**Testing**

- `bun:test` como runner
- SQLite en memoria para tests de integración (sin mocks de DB)

### Principios

**Módulo por bounded context.** Un módulo representa un contexto delimitado del dominio. Hoy hay uno: `company`. Nuevos contextos con sus propios aggregates (watchlist, signals, portfolio) van como módulos hermanos, no como sub-partes.

**OOP pragmático.** Clases con comportamiento para el núcleo del dominio (`Company`, `CompanyRepository`). Funcional en los bordes que ya son funcionales por diseño (rutas Hono, validadores Valibot, schema Drizzle).

**Regla de promoción.** Empezar con pocos archivos. Partir un archivo en varios cuando pierde navegabilidad (~300 líneas) o cuando aparece un concepto con invariantes propios. No anticipar estructura por features futuras.

**Inversión de dependencias mínima.** Interfaces solo cuando hay dos implementaciones reales. Un repositorio con una sola implementación no justifica un `IRepository`.

**Disparo en segundo plano in-process.** Las tareas posteriores a la respuesta del request (p. ej. el Flujo 2 disparado desde el Flujo 1) se ejecutan como promesas no-awaited dentro del mismo proceso del servicio. Sin queue externa, sin worker thread, sin mecanismo distribuido.

### Estructura del proyecto

Solo se listan paths nuevos. Lo único que cambia en la raíz es agregar `"apps/*"` a `workspaces` en `package.json`.

```
apps/
└── api/
    ├── src/
    │   ├── modules/
    │   │   └── company/
    │   │       ├── company.ts           clase Company: reglas (inmutabilidad, vigencia, completitud, consolidación) y operaciones (ingestData, getValuation)
    │   │       ├── repository.ts        clase CompanyRepository: queries Drizzle sobre las tablas del módulo
    │   │       ├── routes.ts            handlers Hono que instancian Company y delegan
    │   │       ├── validators.ts        schemas Valibot para request bodies
    │   │       └── schema.ts            tablas Drizzle del módulo
    │   ├── db/
    │   │   ├── index.ts                 conexión bun:sqlite + instancia Drizzle
    │   │   └── migrations/              generadas por drizzle-kit
    │   ├── app.ts                       compone las rutas de los módulos, exporta AppType
    │   └── index.ts                     arranca el servidor Hono
    ├── tests/
    │   └── fixtures/                    payloads HTTP en JSON por empresa (Nvidia, Amazon, Nike, Costco)
    ├── drizzle.config.ts
    ├── package.json                     "@market-watcher/api"
    └── tsconfig.json
```

### Modelo de datos

El módulo `company` persiste tres entidades. La forma de los datos financieros reutiliza los tipos que exporta `valuation-engine`, específicamente los campos que `HistoricalYear` espera como inputs bajo `incomeStatement`, `freeCashFlow` y `roic`.

#### YearlyFinancials

Contiene los inputs financieros que el engine necesita para un (ticker, año fiscal). Su shape son los tres sub-objetos del año del engine con sus campos correspondientes.

- Clave única: `(ticker, fiscalYearEnd)`.
- Todos los campos son nullable al crearse el registro.
- Se pueblan progresivamente: cada ingesta actualiza los campos que el cliente haya logrado obtener para ese año.
- **Inmutabilidad a nivel de campo**: una vez que un campo tiene un valor no-null, ingestas posteriores no lo sobreescriben.
- Los campos contextuales del engine (`year`, `currentPrice`, `prev`) se derivan al momento de invocar al engine: `year` de la clave, `currentPrice` del estado del ticker, `prev` del encadenamiento con el año anterior del mismo ticker.
- **Series consecutivas ante gaps, con cap de 10 años**: el engine consume únicamente la serie consecutiva más reciente de años completos empezando por `latestFiscalYearEnd`, con un máximo de 10 años. Si hay un año intermedio con datos incompletos, los años anteriores al gap quedan excluidos. Si la serie consecutiva resultante tiene menos de 2 años, la valoración no se ejecuta y el ticker permanece en estado pendiente.

#### TickerState

Plano de control del ticker. Una fila por ticker; se actualiza con cada ingesta.

- Clave única: `ticker`.
- Campos:
  - `latestFiscalYearEnd`: el año fiscal más reciente observado en los datos financieros del ticker.
  - `pendingValuation`: bandera que indica si el ticker tiene una valoración pendiente de cálculo.
  - `currentPrice`: último precio observado en alguna ingesta del ticker. `null` si todavía no se ha enviado ninguno.

#### Valuation

Registros append-only. Cada ejecución exitosa del engine produce un nuevo registro.

- Clave: identificador auto-generado (`id`).
- Campos:
  - `ticker`.
  - `fiscalYearEnd` al que corresponde la valoración.
  - `result`: versión JSON de los datos producidos por `CompanyValuation` del paquete `valuation-engine` (proyecciones, múltiplos, precio objetivo, margen de seguridad, CAGR, precio de compra, y el resto del output del engine).
  - `createdAt`: timestamp del cálculo generado server-side en formato ISO 8601 UTC (p. ej. `2026-04-18T14:23:45.000Z`).

La serialización completa de un registro de esta entidad corresponde al tipo `ValuationResult` que retorna `GET /valuation/:ticker`, con `result` anidado:

```
{
  id: number,
  ticker: string,
  fiscalYearEnd: "YYYY-MM-DD",
  createdAt: "ISO 8601 UTC",
  result: { ...CompanyValuation }
}
```

Cuando hay múltiples registros de `Valuation` para el mismo ticker, el "más reciente" se determina por `createdAt`; en caso de empate, desempata el `id` mayor.

#### Relaciones

- `YearlyFinancials` y `TickerState` se relacionan por `ticker`; un ticker tiene muchos registros de `YearlyFinancials` (uno por año fiscal).
- `Valuation` y `TickerState` se relacionan por `ticker`; un ticker tiene muchos registros de `Valuation`.

### Estado in-memory

Además del estado persistido en SQLite, el servicio mantiene un registro en memoria de los tickers que tienen una ejecución del **Flujo 2** en curso. Este registro cumple dos funciones:

- **Descarte de invocaciones redundantes**: si un trigger del Flujo 2 se dispara para un ticker que ya tiene una ejecución activa, la nueva invocación se descarta sin ejecutar el engine (Flujo 2 paso 1).
- **Exposición del estado al cliente**: alimenta el campo `valuationInProgress` de la respuesta del endpoint `GET /valuation/:ticker`.

El registro no se persiste: su ciclo de vida coincide con el del proceso del servicio. Si el proceso reinicia durante una ejecución del Flujo 2, el registro in-memory se pierde; el ticker queda en su estado persistido (normalmente `pendingValuation = true`) y la valoración se reintenta en la próxima ingesta o consulta que lo encuentre pendiente.

### Contrato de endpoints

Dos endpoints, ambos en el servicio local sin autenticación. En ambos, el path param `ticker` se normaliza a mayúsculas del lado del servicio: `nvda` y `NVDA` refieren al mismo ticker.

El tipo `ValuationResult` (respuesta del GET) queda definido como:

```
type ValuationResult = {
  id: number,
  ticker: string,
  fiscalYearEnd: string,        // ISO date (YYYY-MM-DD)
  createdAt: string,            // ISO 8601 UTC
  result: CompanyValuation      // importado de @market-watcher/valuation-engine
}
```

#### POST /data/ticker/:ticker

Recibe los datos financieros de una empresa desde un cliente. El servicio es agnóstico al origen: acepta campos del engine sin conocer de qué fuente provienen.

**Path params:**
- `ticker`: símbolo de la empresa, en mayúsculas (p. ej. `NVDA`).

**Request body:**

```
{
  currentPrice?: number,
  years: [
    {
      fiscalYearEnd: "YYYY-MM-DD",
      incomeStatement?: {
        sales?: number,
        depreciationAmortization?: number,
        ebit?: number,
        interestExpense?: number,
        interestIncome?: number,
        taxExpense?: number,
        minorityInterests?: number,
        fullyDilutedShares?: number
      },
      freeCashFlow?: {
        capexMaintenance?: number,
        inventories?: number,
        accountsReceivable?: number,
        accountsPayable?: number,
        unearnedRevenue?: number,
        dividendsPaid?: number
      },
      roic?: {
        cashAndEquivalents?: number,
        marketableSecurities?: number,
        shortTermDebt?: number,
        longTermDebt?: number,
        currentOperatingLeases?: number,
        nonCurrentOperatingLeases?: number,
        equity?: number
      }
    }
  ]
}
```

**Reglas de validación:**

- Modo estricto: se rechaza el request (400) si aparecen campos desconocidos en cualquier nivel del body.
- Los campos presentes deben ser del tipo correcto; si no, 400.
- Un campo financiero con valor `null` explícito se rechaza con 400; los campos opcionales simplemente se omiten.
- `years` es requerido; `fiscalYearEnd` dentro de cada año también. `currentPrice` es opcional; cuando se envía, actualiza el precio del ticker.
- Si `years` contiene más de un elemento con el mismo `fiscalYearEnd`, el request se rechaza con 400.
- Todos los sub-objetos (`incomeStatement`, `freeCashFlow`, `roic`) y todos los campos dentro de ellos son opcionales.
- `years` puede venir vacío: se acepta y no se procesa. La respuesta sigue siendo `200 OK` con `{ success: true }` y no dispara valoración.
- Un elemento de `years` sin ningún campo efectivo (sub-objetos ausentes o vacíos) se acepta pero no se procesa: no genera escritura en DB. Si todos los elementos de `years` caen en este caso, la respuesta sigue siendo `200 OK` sin disparar valoración.

**Respuesta exitosa (200 OK):**

```
{ success: true }
```

Sin información sobre resultado de valoración o campos faltantes (eso vive en el GET).

**Errores:**
- `400 Bad Request`: body mal formado (campos desconocidos, tipos incorrectos, `fiscalYearEnd` no parseable).
- `500 Internal Server Error`: fallo de persistencia.

#### GET /valuation/:ticker

Devuelve la valoración del ticker y, si sigue pendiente tras el intento sincrónico, qué campos faltan para poder valorizar.

**Path params:**
- `ticker`: símbolo de la empresa.

**Request body:** ninguno.

**Respuesta cuando el ticker tiene registro (200 OK):**

```
{
  ticker: string,
  latestFiscalYearEnd: "YYYY-MM-DD",
  currentPrice: number | null,
  valuation: ValuationResult | null,
  pending: boolean,
  valuationInProgress: boolean,
  missing?: {
    ticker?: string[],              // p. ej. ["currentPrice"]
    years?: [
      {
        fiscalYearEnd: "YYYY-MM-DD",
        incomeStatement?: string[],
        freeCashFlow?: string[],
        roic?: string[]
      }
    ]
  }
}
```

- `valuation`: `ValuationResult` correspondiente a la última ejecución exitosa del engine para ese ticker (por `createdAt` más reciente; desempate por `id` mayor). `null` si el ticker nunca se ha valorizado.
- `pending`: `true` si el ticker sigue pendiente tras el intento sincrónico disparado por este request.
- `valuationInProgress`: `true` si el servicio tiene un Flujo 2 en ejecución para este ticker al momento de responder, disparado por una ingesta previa, una consulta previa, o este mismo request. Informativo — permite al cliente saber que una nueva valoración puede estar por completarse; se recomienda re-consultar si el valor es `true`.
- `missing`: presente solo cuando `pending === true`. `ticker` enumera los campos faltantes a nivel del ticker (p. ej. `currentPrice` cuando el precio nunca se ha enviado); se omite si no hay. `years` enumera, para cada año con datos incompletos, los sub-objetos del engine con los nombres exactos de los campos que aún no están presentes tal como los expone `HistoricalYear` como inputs; los sub-objetos sin campos faltantes se omiten, y la clave `years` se omite si no hay años con gaps.

**Respuesta cuando el ticker no tiene registro (404 Not Found):**

```
{ error: "ticker_not_found", ticker: string }
```

### Dependencias entre workspaces

- `@market-watcher/api` → `@market-watcher/valuation-engine`: `Company` instancia `CompanyValuation` directamente para ejecutar valoraciones (sin adapter).
- `@market-watcher/valuation-engine`: sin dependencias del pipeline, se mantiene puro.
- `@market-watcher/api` exporta `AppType` para que clientes externos (definidos en PRDs separados) puedan consumir el contrato con tipado end-to-end vía `hono/client`.

## Cambios asociados fuera de este PRD

Trabajo relacionado con el pipeline pero que debe ejecutarse como tareas separadas en otros paquetes:

- **Eliminar `sector` del paquete `valuation-engine`**: el campo no se consume en ninguna fórmula del engine y solo aparece como etiqueta en `printValuationReport()`. No forma parte del contrato de ingesta del servicio. Removerlo del engine simplifica la interfaz de `CompanyValuation` y evita pasar placeholders desde cualquier cliente. Refactorización acotada al paquete del engine.
