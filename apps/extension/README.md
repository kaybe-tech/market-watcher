# @market-watcher/extension

Extensión de navegador (Chrome, Manifest V3) que captura datos financieros históricos desde [TIKR](https://app.tikr.com) y los envía al API de Market Watcher para alimentar el pipeline de valoración.

El MVP soporta únicamente TIKR, pero la estructura (`src/sources/<fuente>/`) está preparada para sumar fuentes adicionales (InvestingPro, StockAnalysis, etc.) sin tocar el código existente.

## Qué hace

- Detecta, a partir del query param `tab` de `app.tikr.com`, si el usuario está en **Income Statement** (`tab=is`), **Balance Sheet** (`tab=bs`) o **Cash Flow Statement** (`tab=cf`).
- Extrae del DOM: ticker, precio actual, unidades (_Millions_/_Thousands_/_Billions_), años fiscales cerrados visibles y los valores de la tabla.
- Excluye columnas con sufijo `E` (estimates) y la columna `LTM`.
- Normaliza todos los valores a millones antes de enviarlos.
- Arma un payload parcial que respeta el contrato de `POST /companies/:ticker/data` y lo envía al API configurado.

Un envío = una sección de una empresa. Para llenar una empresa completa, se navega entre las 3 secciones y se dispara un envío en cada una; la inmutabilidad a nivel de campo del pipeline consolida los sub-objetos.

## Instalación en desarrollo

Desde la raíz del monorepo:

```bash
bun install
```

Para trabajar con recarga automática:

```bash
cd apps/extension
bun run dev
```

WXT abre Chrome con la extensión cargada desde `.output/chrome-mv3-dev/`.

Para generar un build estático cargable como _unpacked_:

```bash
bun run build
```

El bundle queda en `apps/extension/.output/chrome-mv3/`. En `chrome://extensions`, activá **Developer mode** y usá **Load unpacked** apuntando a esa carpeta.

## Uso

1. Correr el API local (`bun run dev` en `apps/extension`, o el equivalente de `apps/api`).
2. Abrir en Chrome una empresa en TIKR y navegar a **Income Statement**, **Balance Sheet** o **Cash Flow Statement**.
3. Click en el ícono de la extensión. El popup muestra un preview con sección detectada, ticker, rango de años históricos, precio actual y unidades.
4. Click en **Enviar**. El popup informa `Enviado ✓` o un mensaje de error con el detalle del API o de red.
5. Repetir en las 3 secciones contables para completar la empresa.

## Configuración

La URL base del API se configura desde la **options page** (click en el link _Opciones_ del popup, o _Options_ en `chrome://extensions`).

- Valor por defecto: `http://localhost:3000`.
- Se persiste en `chrome.storage.local`.
- Se lee antes de cada envío; cambiarla surte efecto sin reinstalar ni recargar.

## Permisos

- `storage` — persistir la URL del API.
- `activeTab` + `scripting` — leer el DOM de la pestaña activa al abrir el popup.
- `host_permissions: ["https://app.tikr.com/*"]` — único host sobre el que opera.

La extensión no autentica, no guarda estado de negocio, no cachea empresas enviadas.

## Desarrollo

```bash
bun run test        # bun test (unidades + domParser sobre fixtures)
bun run typecheck   # svelte-check
bun run build       # wxt build (Chrome MV3)
```

### Estructura

```
src/
├── entrypoints/          entrypoints WXT (popup, options)
├── popup/                componente raíz del popup Svelte
├── options/              componente raíz de la options page
├── sources/tikr/         lógica específica de TIKR
│   ├── urlMatcher.ts     URL → sección contable
│   ├── domParser.ts      DOM → ticker, precio, unidades, tabla
│   ├── fieldMapper.ts    filas TIKR → sub-objetos del contrato del API
│   └── index.ts
├── lib/                  lógica pura reutilizable entre fuentes
│   ├── numberParser.ts   parser de celdas y normalización por unidades
│   ├── columnFilter.ts   filtro de columnas estimates y LTM
│   ├── fiscalYearParser.ts   headers M/D/YY → YYYY-MM-DD
│   └── apiClient.ts      cliente fetch contra POST /companies/:ticker/data
└── storage/
    └── settings.ts       lectura/escritura de la URL del API

tests/
├── fixtures/tikr/        fragmentos HTML congelados (4 empresas × 3 secciones)
└── *.test.ts             unit tests de lógica pura + domParser sobre fixtures
```

### Agregar una fuente nueva

Crear una carpeta hermana dentro de `src/sources/` con sus propios `urlMatcher`, `domParser` y `fieldMapper`. No se requiere tocar el código de fuentes existentes.
