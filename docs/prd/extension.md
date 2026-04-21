# PRD: Browser Extension

## Resumen

Extensión de navegador (Chrome, Manifest V3) que automatiza la captura de datos financieros históricos desde **tikr.com** y los envía al servicio API del monorepo (`apps/api`) mediante el endpoint `POST /companies/:ticker/data` definido en el PRD de Data Pipeline. El MVP soporta únicamente TIKR, pero la app se ubica en `apps/extension` (nombre genérico) y se estructura para poder incorporar más fuentes (InvestingPro, StockAnalysis, etc.) sin crear extensiones paralelas.

## Problema

El Valuation Engine y el Data Pipeline ya resuelven el cálculo y la persistencia de los datos financieros, pero la captura sigue siendo manual: abrir TIKR empresa por empresa, copiar los números de cada sección contable (Income Statement, Balance Sheet, Cash Flow Statement) a un Excel intermedio, y trasladarlos desde ahí al sistema. Con ~30 empresas al mes, este trabajo domina el tiempo útil de investigación y es propenso a errores de tipeo, de unidad (millones vs. billones) y de atribución a un año fiscal equivocado. El servicio API ya acepta ingestas estructuradas con payload parcial por sección; lo que falta es un cliente que capture los datos directamente desde el DOM de TIKR.

## Solución

La extensión detecta, por la URL de la pestaña activa, en qué sección de una empresa TIKR está el usuario (Income Statement, Balance Sheet o Cash Flow Statement). Al abrir el popup, lee del DOM el ticker, el precio de la cabecera, el indicador de unidades y los valores de la tabla visible, normaliza los valores a millones y los muestra como preview.

Cuando el usuario hace click en "Enviar", la extensión arma un payload parcial con los campos correspondientes a la sección detectada y lo envía al endpoint de ingesta del API por cada año fiscal histórico visible. La inmutabilidad a nivel de campo del pipeline permite consolidar los tres sub-objetos (`incomeStatement`, `freeCashFlow`, `roic`) conforme llegan los envíos parciales. Para llenar una empresa completa, el usuario navega entre las 3 secciones y dispara un envío en cada una.

La URL base del API se configura vía una options page persistida en `chrome.storage`. La extensión no tiene autenticación.

## Alcance

### Incluido

**Detección de contexto**
- Identificación, a partir del query param `tab` de la URL de la pestaña, de si el usuario está en Income Statement (`tab=is`), Balance Sheet (`tab=bs`) o Cash Flow Statement (`tab=cf`) de una empresa en TIKR.
- Extracción del ticker desde la cabecera de la página.
- Identificación del indicador de unidades visible en la página (_millions_, _thousands_, _billions_).

**Extracción**
- Lectura de los valores tabulares para cada año fiscal histórico visible de la sección detectada, con exclusión de las columnas marcadas como estimates.
- Extracción del precio actual desde la cabecera de la página.

**Preview previo al envío**
- Popup que muestra, antes de enviar: sección detectada, ticker, rango de años históricos visibles y precio actual.

**Envío al API**
- Composición de un payload parcial que respeta el contrato de `POST /companies/:ticker/data` (solo los sub-objetos correspondientes a la sección detectada).
- Normalización de los valores a millones previo al envío.
- Envío al endpoint y feedback en el popup según el código de respuesta del API.

**Configuración**
- Options page con un input para la URL base del API, con default `http://localhost:3000`, persistida en `chrome.storage`.
- La URL configurada se lee antes de cada request; cambiarla surte efecto sin reinstalar la extensión.

**Extensibilidad estructural**
- El código que interpreta URLs, parsea el DOM y mapea campos se separa por fuente (p. ej. `src/sources/tikr/`), dejando espacio para que una fuente nueva se agregue como carpeta hermana sin modificar las existentes.

### Excluido

- Soporte para otras fuentes distintas de TIKR (InvestingPro, StockAnalysis, etc.) — se definen en PRDs separados.
- Autenticación, usuarios múltiples, sincronización con un API desplegado.
- Consulta post-envío del estado de la empresa ni visualización de la valoración dentro de la extensión.
- Captura de columnas de estimates o soporte de forecasts de analistas.
- Captura batch de múltiples empresas en una sola acción; un envío = una sección de una empresa.
- Modificación del contrato del API ni del endpoint `POST /companies/:ticker/data`.
- Tests end-to-end automatizados del scraping del DOM de TIKR.
- Dashboard, watchlist, alertas dentro de la extensión.

## Criterio de éxito

Para validar el MVP se ejercita el flujo end-to-end contra el API corriendo local con las empresas **NVDA, AAPL, TSM y NKE**. Sobre cada una de ellas:

1. La extensión se instala en Chrome desde el build de `wxt build` en modo unpacked sin errores ni advertencias críticas.

2. Al navegar a las 3 páginas contables de la empresa en TIKR, el popup detecta correctamente la sección, el ticker, el rango de años históricos visibles y el precio actual, y los muestra en su preview.

3. Clickear "Enviar" en cada una de las 3 páginas produce 3 respuestas `200 OK` del API. Una consulta posterior a `GET /companies/:ticker` devuelve la empresa con los 27 campos poblados para cada año fiscal enviado y con una valoración generada.

4. Cambiar la URL del API desde la options page surte efecto en el siguiente envío, sin reinstalar ni recargar la extensión manualmente.

5. Cuando el API responde con un código distinto de 200 (o la red falla), el popup muestra un mensaje de error legible en lugar del feedback de éxito; cuando una celda de la tabla aparece como `--`, `—` o vacía, el payload omite ese campo sin romper el envío.

6. Las columnas marcadas como estimates (sufijo `E`) nunca aparecen como años en el payload enviado al API.

7. Los tests unitarios de la lógica pura (normalizador numérico, parser de celdas, detector de estimates, mapeo TIKR → contrato del API) y los del `domParser` sobre los fixtures HTML pasan.

## Flujos

### Flujo 1: Detección de contexto al abrir el popup

Describe cómo la extensión reconoce en qué sección de TIKR está el usuario y prepara el preview.

**Disparador**: el usuario hace click en el ícono de la extensión estando en una pestaña cuya URL corresponde a una empresa en TIKR.

**Pasos**:

1. La extensión lee la URL de la pestaña activa. Si el dominio no es `app.tikr.com` o si el path / query param `tab` no corresponde a una sección soportada (`is`, `bs`, `cf`), el popup muestra un mensaje indicando que la página actual no es soportada y termina.

2. La extensión mapea el valor de `tab` a la sección contable: `is` → Income Statement, `bs` → Balance Sheet, `cf` → Cash Flow Statement.

3. La extensión ejecuta un script sobre el DOM de la pestaña para extraer:
   - El ticker desde la cabecera de la página.
   - El precio actual desde la cabecera.
   - El indicador de unidades visible cerca de la tabla (_$ in millions_, _$ in thousands_, _$ in billions_).
   - Los encabezados de columna de la tabla principal, filtrando las columnas con sufijo `E` (estimates).
   - Los valores de cada fila, por cada columna histórica no filtrada.

4. La extensión muestra en el popup el preview con: sección detectada, ticker, rango de años históricos (el menor y mayor de los años no-estimate), precio actual, y un botón **Enviar**.

5. Si cualquier dato esencial no se pudo extraer (ticker, ningún año histórico, o sección no identificada), el botón Enviar queda deshabilitado y el popup indica el problema.

### Flujo 2: Envío de datos al API

Describe cómo la extensión transforma los valores extraídos en un payload válido y los envía al API.

**Disparador**: el usuario hace click en el botón Enviar del popup tras un Flujo 1 exitoso.

**Pasos**:

1. La extensión construye, para cada año histórico visible, un objeto `year` con `fiscalYearEnd` y exactamente uno de los sub-objetos del contrato del API (`incomeStatement`, `freeCashFlow` o `roic`) según la sección detectada. Los campos de la página Balance Sheet que el schema agrupa en `roic` y los que agrupa en `freeCashFlow` se colocan en los sub-objetos correspondientes; desde la página Cash Flow Statement solo se envían los campos que el schema contempla dentro de `freeCashFlow`.

2. Cada valor numérico se normaliza a millones aplicando el factor del indicador de unidades detectado en el Flujo 1: _billions_ multiplica por 1000, _thousands_ divide por 1000, _millions_ deja el valor tal cual. Las comas de miles se eliminan y los paréntesis `(x)` se traducen a negativos.

3. Los campos cuya celda original estaba vacía, con `--` o `—`, se omiten del payload.

4. El payload completo incluye también el `currentPrice` extraído de la cabecera.

5. La extensión lee la URL base del API desde `chrome.storage` (con default `http://localhost:3000`) y envía un request `POST {apiUrl}/companies/:ticker/data` con el payload.

6. Si la respuesta es `200 OK`, el popup muestra _"Enviado ✓"_ indicando la sección y el ticker. Si la respuesta es un código de error (4xx, 5xx) o el request falla por red, el popup muestra _"Error: {mensaje}"_ con el detalle que entregue el API o el error de red.

### Flujo 3: Configuración de la URL del API

Describe cómo el usuario cambia el endpoint al que la extensión envía los datos.

**Disparador**: el usuario abre la options page de la extensión desde el menú de Chrome o desde un link en el popup.

**Pasos**:

1. La options page lee desde `chrome.storage` la URL base configurada y la muestra en un input (si no hay valor guardado, muestra el default `http://localhost:3000`).

2. El usuario edita el valor y lo confirma. La extensión valida que el valor sea una URL sintácticamente válida. Si no lo es, la options page muestra un error y no guarda.

3. Si el valor es válido, la options page lo persiste en `chrome.storage`. El próximo envío iniciado desde el Flujo 2 utilizará el nuevo valor sin pasos adicionales.

## Arquitectura

### Stack tecnológico

**Existente (monorepo)**

- Bun — runtime y package manager.
- Turborepo — orquestación del monorepo.
- TypeScript.
- Biome — lint y format.

**Extensión**

- [WXT](https://wxt.dev) — framework para extensiones de navegador con soporte first-class de Manifest V3. Scaffolding mediante `wxt init`, build mediante `wxt build`, dev con recarga automática mediante `wxt dev`.
- Svelte — framework de UI para el popup y la options page.
- Manifest V3 como target de Chrome.
- `fetch` nativo para las llamadas al API.

**Testing**

- `bun:test` como runner para los tests unitarios.
- Tests de lógica pura sin dependencias del DOM: normalizador numérico, parser de celdas, detector de estimates, mapeo TIKR → contrato del API.
- Tests del `domParser` apoyados en **fixtures HTML** congelados en `apps/extension/tests/fixtures/tikr/` (un fragmento HTML por sección × empresa de referencia). Los fixtures se cargan con `Bun.file()`, se montan en un DOM simulado y se valida que el parser extrae ticker, precio, unidades, años y valores tabulares esperados.
- Sin tests end-to-end contra el DOM en vivo de TIKR en el MVP.

### Principios

**Separación por fuente.** Cada sitio soportado vive en una carpeta propia dentro de `src/sources/`. Agregar una fuente nueva significa crear una carpeta hermana con sus propios `urlMatcher`, `domParser` y `fieldMapper`, sin tocar el código de las fuentes existentes. No se construye una capa de abstracción genérica hasta que una segunda fuente lo justifique.

**Cliente sin estado de negocio.** El único estado persistido es la URL base del API en `chrome.storage`. La extensión no recuerda qué empresas envió, no cachea valoraciones, no hace rollback.

**Permisos MV3 mínimos.** `host_permissions` para el host de TIKR, `storage` para la URL del API, y `activeTab` para operar sobre la pestaña visible cuando el usuario abre el popup.

### Estructura del proyecto

Solo se listan paths nuevos. En la raíz del monorepo no cambia nada: `apps/*` ya está en `workspaces` por el pipeline.

```
apps/
└── extension/
    ├── src/
    │   ├── popup/
    │   │   └── App.svelte              componente raíz del popup: preview + botón Enviar + feedback
    │   ├── options/
    │   │   └── App.svelte              options page: input de URL base del API
    │   ├── sources/
    │   │   └── tikr/
    │   │       ├── urlMatcher.ts       reconoce si una URL de TIKR corresponde a una sección soportada
    │   │       ├── domParser.ts        extrae ticker, precio, unidades, años y valores tabulares desde el DOM
    │   │       ├── fieldMapper.ts      mapea los campos de la página TIKR al sub-objeto del contrato del API
    │   │       └── index.ts            punto único de entrada de la fuente TIKR
    │   ├── lib/
    │   │   ├── numberParser.ts         parser de celdas (comas, paréntesis, guiones) y normalización por unidades
    │   │   ├── estimateFilter.ts       detecta columnas de estimates (sufijo E) y las excluye
    │   │   └── apiClient.ts            cliente fetch contra POST /companies/:ticker/data
    │   └── storage/
    │       └── settings.ts             lectura y escritura de la URL base del API en chrome.storage
    ├── tests/
    │   ├── fixtures/
    │   │   └── tikr/                   fragmentos HTML congelados (income-statement/balance-sheet/cash-flow-statement × NVDA, AAPL, TSM, NKE)
    │   ├── numberParser.test.ts        unit tests de parser y normalización
    │   ├── estimateFilter.test.ts      unit tests del filtro de estimates
    │   ├── fieldMapper.test.ts         unit tests del mapeo TIKR → contrato del API
    │   └── domParser.test.ts           unit tests que cargan los fixtures y validan extracción de ticker, precio, unidades, años y valores
    ├── wxt.config.ts
    ├── package.json                    "@market-watcher/extension"
    └── tsconfig.json
```

### Contrato de extracción

La extensión convierte cada página de TIKR en un fragmento del payload de `POST /companies/:ticker/data`. El mapeo página → sub-objeto no es 1:1: la página Balance Sheet de TIKR contiene campos que el contrato del API agrupa tanto en `roic` como en `freeCashFlow`.

#### Income Statement (TIKR) → `incomeStatement` del payload

Campos esperados en esta página: `sales`, `depreciationAmortization`, `ebit`, `interestExpense`, `interestIncome`, `taxExpense`, `minorityInterests`, `fullyDilutedShares`.

#### Balance Sheet (TIKR) → `roic` + `freeCashFlow` del payload

- A `roic`: `cashAndEquivalents`, `marketableSecurities`, `shortTermDebt`, `longTermDebt`, `currentOperatingLeases`, `nonCurrentOperatingLeases`, `equity`.
- A `freeCashFlow`: `inventories`, `accountsReceivable`, `accountsPayable`, `unearnedRevenue`.

Un envío desde Balance Sheet puede llevar ambos sub-objetos en cada `year` del payload.

#### Cash Flow Statement (TIKR) → `freeCashFlow` del payload

Campos esperados en esta página: `capexMaintenance`, `dividendsPaid`.

#### Cabecera de la página → `currentPrice` del payload

El precio actual se lee de la cabecera en las tres páginas soportadas y se adjunta en cada envío.

### Normalización numérica

Antes de incluir un valor en el payload:

- Si la celda está vacía, contiene `--` o `—`, el campo se omite.
- Las comas de miles se eliminan.
- Los paréntesis se traducen a signo negativo: `(1,234.56)` → `-1234.56`.
- El valor se multiplica o divide según el indicador de unidades visible en la página:
  - `$ in millions` → factor `1`.
  - `$ in thousands` → factor `1/1000`.
  - `$ in billions` → factor `1000`.

El API siempre recibe valores en millones.

### Dependencias entre workspaces

- `@market-watcher/extension` consume el API por HTTP; no depende de `@market-watcher/api` ni de `@market-watcher/valuation-engine` en tiempo de compilación.
- `@market-watcher/api` no se modifica por este PRD.

## Preparación del repositorio

Fragmentos HTML de referencia de TIKR (income statement, balance sheet, cash flow statement de NVDA, AAPL, TSM y NKE) están guardados temporalmente en la raíz del monorepo. Como primer paso de la implementación, estos archivos se mueven a `apps/extension/tests/fixtures/tikr/`, renombrándolos bajo la convención `<ticker-lower>-<section>.html` (p. ej. `nvda-income-statement.html`, `aapl-balance-sheet.html`). Los tests del `domParser` los cargan desde esa ubicación final.
