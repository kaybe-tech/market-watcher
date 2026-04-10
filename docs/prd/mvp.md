# PRD: Market Watcher MVP

## Resumen

Sistema para automatizar el proceso de valorización de empresas. Replica la lógica de la Plantilla de Valoración General (Módulo 7, IDC v2024.3) en software, eliminando el trabajo manual de llenar hojas de cálculo.

El usuario captura datos financieros desde InvestingPro mediante una extensión de Chrome. El sistema calcula automáticamente las proyecciones a 5 años, valoración por múltiplos, margen de seguridad y red flags.

## Problema

El proceso actual de valorización es completamente manual:

1. Buscar datos financieros en InvestingPro
2. Copiar manualmente los datos del Income Statement, Balance Sheet y Cash Flow a una plantilla Excel
3. Ajustar proyecciones y múltiplos objetivo manualmente
4. Revisar los resultados celda por celda

Esto limita el análisis a ~30 empresas al mes. El objetivo es escalar significativamente esa capacidad.

## Solución

Un sistema compuesto por:

- **Chrome Extension**: Captura los estados financieros directamente de InvestingPro y los envía al API
- **REST API**: Recibe, almacena y procesa los datos financieros. Ejecuta la valorización automáticamente cuando tiene los 3 estados financieros completos
- **Valuation Engine**: Motor de cálculo puro que replica exactamente las fórmulas de la plantilla Excel

## Arquitectura

```
InvestingPro (browser)
  -> Chrome Extension (parsea tablas del DOM -> POST al API)
      -> REST API (Bun + Hono)
          -> Valuation Engine (lógica de cálculo pura)
          -> SQLite (persistencia)
```

### Estructura del monorepo

```
market-watcher/
├── apps/
│   ├── api/                <- REST API (Bun + Hono)
│   └── chrome-extension/   <- Extensión de Chrome
├── packages/
│   ├── valuation-engine/   <- Lógica de cálculo pura
│   └── shared/             <- Tipos, schemas, contratos
├── docs/
│   ├── prd/
│   └── plantillas-de-valorizacion/
├── turbo.json
└── package.json
```

Tecnologías: Bun, Turborepo, Hono, SQLite (via Drizzle), TypeScript.

## API REST

### Endpoints

```
POST /companies                                        <- crear empresa
PUT  /companies/:ticker/price                          <- actualizar precio actual
POST /companies/:ticker/financials/income-statement    <- ingestar IS (múltiples años)
POST /companies/:ticker/financials/balance-sheet       <- ingestar BS (múltiples años)
POST /companies/:ticker/financials/cash-flow           <- ingestar CF (múltiples años)

GET  /companies/:ticker                                <- empresa + valoración
GET  /companies                                        <- listado de empresas
```

### Comportamiento

- La empresa se crea explícitamente via `POST /companies` con los datos de la página principal de InvestingPro (ticker, nombre, sector, exchange).
- El precio de la acción se actualiza via `PUT /companies/:ticker/price`. Este endpoint es independiente para poder actualizar el precio sin recrear la empresa.
- El sistema usa el `sector` para determinar qué flujo de valorización aplicar (ver sección Sectores).
- Los endpoints de financials reciben múltiples años de datos en un solo request. Cada envío corresponde a una página de InvestingPro.
- Cuando el sistema detecta que tiene los 3 estados financieros (IS + BS + CF) y un precio actual, ejecuta la valorización automáticamente.
- Si se actualiza el precio de una empresa que ya tiene los 3 estados financieros, se re-ejecuta la valorización con el nuevo precio.
- Si se envían datos financieros para un ticker que no existe, el API responde con error 404.

### Sectores y flujos de valorización

El sector de la empresa determina qué plantilla de valorización se utiliza:

| Flujo de valorización | Sectores |
|---|---|
| **General** (Módulo 7) | Technology, Healthcare, Consumer Cyclical, Consumer Defensive, Industrials, Basic Materials, Communication Services, Energy, Utilities |
| **Financieras** (Módulo 15) | Financial Services |
| **REITs** (Módulo 16) | Real Estate |

Para el MVP solo se implementa el flujo General. Si se intenta valorar una empresa de sector Financial Services o Real Estate, el sistema almacena los datos pero no ejecuta la valorización (responde indicando que el flujo no está disponible aún).

### Formato de datos - Crear empresa

```json
POST /companies
{
  "ticker": "AMZN",
  "companyName": "Amazon.com Inc",
  "sector": "Technology",
  "exchange": "NASDAQ"
}
```

### Formato de datos - Actualizar precio

```json
PUT /companies/AMZN/price
{
  "price": 214.75
}
```

### Formato de datos - Income Statement

Cada request envía todos los años disponibles (típicamente 10). Los valores están en millones excepto donde se indique.

```json
POST /companies/AMZN/financials/income-statement
{
  "data": {
    "2015": {
      "totalRevenues": 107006,
      "costOfGoodsSold": -71651,
      "grossProfit": 35355,
      "sellingGeneralAdmin": -20411,
      "rdExpenses": -12540,
      "otherOperatingExpenses": -171,
      "totalOperatingExpenses": -33122,
      "operatingIncome": 2233,
      "interestExpense": -459,
      "interestAndInvestmentIncome": 50,
      "ebtExclUnusualItems": 1551,
      "gainLossOnSaleOfInvestments": -5,
      "assetWritedown": 0,
      "ebtInclUnusualItems": 1546,
      "incomeTaxExpense": -950,
      "netIncome": 596,
      "dilutedEPS": 0.06,
      "weightedAvgDilutedShares": 9540,
      "ebitda": 7879,
      "stockBasedCompensation": 2119,
      "effectiveTaxRate": 0.614,
      "marketCap": 316832,
      "tev": 320991
    }
  }
}
```

### Formato de datos - Balance Sheet

Cada request envía todos los años disponibles (típicamente 10).

```json
POST /companies/AMZN/financials/balance-sheet
{
  "data": {
    "2015": {
      "cashAndEquivalents": 15890,
      "shortTermInvestments": 3918,
      "accountsReceivable": 5654,
      "inventory": 10243,
      "totalCurrentAssets": 35705,
      "netPropertyPlantEquipment": 21838,
      "goodwill": 3759,
      "totalAssets": 64747,
      "accountsPayable": 20397,
      "shortTermBorrowings": 0,
      "currentPortionLongTermDebt": 238,
      "currentPortionCapitalLeases": 3099,
      "unearnedRevenueCurrent": 5118,
      "totalCurrentLiabilities": 33887,
      "longTermDebt": 8227,
      "capitalLeases": 5948,
      "unearnedRevenueNonCurrent": 0,
      "totalLiabilities": 51363,
      "totalEquity": 13384,
      "totalSharesOutstanding": 9417
    }
  }
}
```

### Formato de datos - Cash Flow

Cada request envía todos los años disponibles (típicamente 10).

```json
POST /companies/AMZN/financials/cash-flow
{
  "data": {
    "2015": {
      "netIncome": 596,
      "depreciationAmortization": 5376,
      "amortizationGoodwillIntangibles": 270,
      "stockBasedCompensation": 2119,
      "changeInAccountsReceivable": -1755,
      "changeInInventories": -2187,
      "changeInAccountsPayable": 4294,
      "changeInUnearnedRevenues": 1292,
      "cashFromOperations": 12039,
      "capitalExpenditure": -5387,
      "saleOfPPE": 0,
      "cashAcquisitions": -795,
      "investmentInMarketableSecurities": -1066,
      "cashFromInvesting": -6450,
      "totalDebtIssued": 353,
      "totalDebtRepaid": -4235,
      "repurchaseOfCommonStock": 0,
      "dividendsPaid": 0,
      "cashFromFinancing": -3882,
      "netChangeInCash": 1333,
      "freeCashFlow": 6652
    }
  }
}
```

### Formato de respuesta - GET /companies/:ticker

```json
{
  "ticker": "AMZN",
  "companyName": "Amazon.com Inc",
  "sector": "Technology",
  "exchange": "NASDAQ",
  "currentPrice": 214.75,
  "financials": {
    "incomeStatement": { "status": "complete", "years": [2015, 2024] },
    "balanceSheet": { "status": "complete", "years": [2015, 2024] },
    "cashFlow": { "status": "complete", "years": [2015, 2024] }
  },
  "valuation": {
    "status": "complete",
    "computedAt": "2026-04-10T12:00:00Z",
    "projections": {
      "salesGrowth": [0.2231, 0.2231, 0.2231, 0.2231, 0.2231],
      "ebitMargin": [0.0490, 0.0490, 0.0490, 0.0490, 0.0490],
      "taxRate": [0.2324, 0.2324, 0.2324, 0.2324, 0.2324],
      "shareGrowth": [0.0131, 0.0131, 0.0131, 0.0131, 0.0131]
    },
    "targetMultiples": {
      "per": 36.02,
      "evFcf": 36.02,
      "evEbitda": 16.56,
      "evEbit": 28.48
    },
    "targetPrices": {
      "perExCash":  { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 },
      "evFcf":      { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 },
      "evEbitda":   { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 },
      "evEbit":     { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 },
      "average":    { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 }
    },
    "marginOfSafety": {
      "evFcf": { "2025e": 0, "2026e": 0, "2027e": 0, "2028e": 0, "2029e": 0 }
    },
    "cagr5y": {
      "perExCash": 0,
      "evFcf": 0,
      "evEbitda": 0,
      "evEbit": 0,
      "average": 0
    },
    "buyPriceFor15pctReturn": 0,
    "redFlags": {
      "salesDeclineYears": 0,
      "operatingMarginDeclineYears": 0,
      "negativeFcfYears": 0,
      "poorRoicYears": 0,
      "highDebtYears": 0
    }
  }
}
```

## Chrome Extension

### Funcionalidad

La extensión opera en dos contextos dentro de InvestingPro:

**1. Página principal de la empresa** (`/pro/EXCHANGE:TICKER`):
- URL pattern: `https://www.investing.com/pro/NASDAQGS:AMZN`
- Captura: ticker, nombre, sector, exchange
- Captura: precio actual
- Envía `POST /companies` para crear/registrar la empresa
- Envía `PUT /companies/:ticker/price` con el precio actual

**2. Páginas de estados financieros**:
- Income Statement: `https://www.investing.com/pro/NASDAQGS:AMZN/financials/income_statement`
- Balance Sheet: `https://www.investing.com/pro/NASDAQGS:AMZN/financials/balance_sheet`
- Cash Flow: `https://www.investing.com/pro/NASDAQGS:AMZN/financials/cashflow_statement`
- Parsea la tabla de datos financieros del DOM (todos los años disponibles)
- Detecta el tipo de estado financiero por la URL
- Envía los datos al endpoint correspondiente
- Muestra una notificación de éxito/error

### Flujo del usuario

1. Navegar a InvestingPro > Amazon (página principal)
2. Click en el botón de la extensión -> empresa creada + precio actualizado
3. Navegar a Income Statement (`/financials/income_statement`)
4. Click -> datos enviados (todos los años de la tabla)
5. Navegar a Balance Sheet (`/financials/balance_sheet`)
6. Click -> datos enviados
7. Navegar a Cash Flow Statement (`/financials/cashflow_statement`)
8. Click -> datos enviados -> el API ejecuta la valorización automáticamente

Total: **4 clicks por empresa** (1 para crear + 3 para estados financieros).

Para re-evaluar una empresa existente con precio actualizado: visitar la página principal (1 click para actualizar precio, re-ejecuta valorización) o enviar nuevos estados financieros.

### Requisitos técnicos

- Manifest V3
- Configuración de la URL del API (default: `http://localhost:3000`)
- La extensión parsea los datos y los estructura en el formato JSON esperado por el API
- El parseo es responsabilidad de la extensión, no del API (así el API no depende del DOM de InvestingPro)
- Si se intenta enviar datos financieros para un ticker que no existe, la extensión muestra un mensaje indicando que primero se debe crear la empresa desde la página principal

## Valuation Engine

Motor de cálculo puro sin efectos secundarios (sin IO, sin DB). Recibe datos financieros crudos y parámetros, retorna la valorización completa.

### Datos de entrada

- 10 años de datos históricos: Income Statement, Balance Sheet, Cash Flow Statement
- Precio actual de la acción
- Sector de la empresa (para determinar el flujo de valorización; en el MVP solo se soporta el flujo General)

### Proceso de cálculo

El motor replica exactamente las fórmulas de la Plantilla de Valoración General (Módulo 7, IDC v2024.3). Todas las proyecciones se calculan automáticamente usando promedios históricos.

#### Paso 1: Income Statement proyectado (5 años)

Proyecciones automáticas (constantes los 5 años):

| Campo | Fórmula default |
|---|---|
| Crecimiento de ventas | `AVERAGE(YoY growth de los 9 años disponibles)` |
| Margen EBIT | `AVERAGE(EBIT/Sales de los 10 años)` |
| Tax rate | `AVERAGE(Effective tax rate de los 10 años)` |
| Crecimiento acciones | `AVERAGE(YoY share growth de los 9 años)` |

Cálculos derivados por año proyectado:

```
Sales = Sales_anterior * (1 + crecimiento_ventas)
D&A = D&A_anterior * (1 + crecimiento_ventas)
EBIT = Sales * margen_EBIT
EBITDA = EBIT + abs(D&A)
Interest Expense = -(%_interest_expense_promedio * (ST_Debt + LT_Debt))
Interest Income = %_interest_income_promedio * Marketable_Securities
Total Interest = Interest_Expense + Interest_Income
EBT = EBIT + Total_Interest
Tax = -EBT * tax_rate
Consolidated Net Income = EBT + Tax
Minority Interests = proporcional al año anterior
Net Income = Consolidated_Net_Income + Minority_Interests
Shares = Shares_anterior * (1 + crecimiento_acciones)
EPS = Net_Income / Shares
```

#### Paso 2: Free Cash Flow proyectado

```
CapEx Mtto = Sales * ratio_capex_mantenimiento
  donde ratio_capex_mantenimiento = abs((K4 * L4) + K4) / L3
  (ajusta el último año por growth, luego constante)

Working Capital = Inventories + AR - AP - Unearned_Revenue
  (para proyecciones: WC = WC_anterior + CWC)

CWC (primer año proyectado) = (SUM(CWC histórico) / SUM(Sales histórico)) * Sales_proyectado
CWC (años siguientes) = (CWC_anterior / Sales_anterior) * Sales_actual

FCF = EBITDA + CapEx_Mtto + Total_Interest + Taxes - CWC + Minority_Interests
```

Nota: CapEx Mantenimiento se calcula históricamente como:

```
CapEx Neto = Capital_Expenditure + Sale_of_Intangible_Assets + Sale_of_PPE
CapEx Mantenimiento = MIN(abs(CapEx_Neto), D&A)  (con signo negativo)
  si abs(CapEx_Neto) < D&A -> CapEx_Mtto = CapEx_Neto
  si abs(CapEx_Neto) >= D&A -> CapEx_Mtto = -D&A
```

#### Paso 3: ROIC

```
EBIT_after_tax = EBIT * (1 - effective_tax_rate)

Invested Capital = Equity + ST_Debt + LT_Debt + Current_Operating_Leases
                 + NonCurrent_Operating_Leases - Marketable_Securities

ROIC = EBIT_after_tax / Invested_Capital
ROE = Net_Income / Equity
```

Proyección de componentes del Invested Capital:

```
Operating Leases (current y non-current) = valor_anterior * (1 + sales_growth)

Equity proyectado:
  Equity_new = Equity_prev + Net_Income + (share_growth * Market_Cap)
             - (avg_dividend_%_of_FCF * FCF)

Deuda proyectada (via TIKR_Cálculos):
  Deuda Neta/EBITDA = AVERAGE(histórico), constante 5 años
  Deuda Neta = ratio * EBITDA
  Cash+Mkt_Securities y Deuda_Total se derivan manteniendo proporciones históricas
  Deuda_CP / Deuda_LP mantienen la proporción histórica acumulada
```

#### Paso 4: Valoración

Múltiplos objetivo (defaults):

```
PER objetivo = NTM PER  (precio_actual / EPS del primer año proyectado)
EV/FCF objetivo = PER objetivo  (placeholder)
EV/EBITDA objetivo = NTM EV/EBITDA  (EV del último año / EBITDA del primer año proyectado)
EV/EBIT objetivo = NTM EV/EBIT
```

LTM (Last Twelve Months) se calcula con datos del último año histórico:

```
PER LTM = precio / EPS del último año
EV/FCF LTM = EV / FCF del último año
EV/EBITDA LTM = EV / EBITDA del último año
EV/EBIT LTM = EV / EBIT del último año
```

Precio objetivo por método:

```
PER ex Cash:
  si Deuda_Neta < 0 (caja neta):
    precio = (Net_Income * PER_obj - Deuda_Neta) / Shares
  si Deuda_Neta > 0:
    precio = (Net_Income * PER_obj) / Shares

EV/FCF:
  precio = (FCF * EV_FCF_obj - Deuda_Neta) / Shares

EV/EBITDA:
  precio = (EBITDA * EV_EBITDA_obj - Deuda_Neta) / Shares

EV/EBIT:
  precio = (EBIT * EV_EBIT_obj - Deuda_Neta) / Shares

Promedio = AVERAGE(PER, EV/FCF, EV/EBITDA, EV/EBIT)
```

Métricas de valoración:

```
Margen de seguridad (EV/FCF) = (precio_obj_EV_FCF / precio_actual) - 1

CAGR 5 años = (precio_2029e / precio_actual) ^ (1/5) - 1

Precio de compra para 15% retorno = precio_2029e_EV_FCF / (1.15)^5
```

#### Paso 5: Red Flags

Conteo de años (sobre los 10 años históricos) con:

| Red Flag | Condición |
|---|---|
| Decrecimiento de ventas | YoY Sales Growth < 0 |
| Decrecimiento de margen operativo | EBIT margin actual < EBIT margin año anterior |
| FCF negativo | FCF < 0 |
| ROIC pobre | ROIC < 10% |
| Ratio deuda elevado | Deuda Neta / EBITDA > 2.5x |

### Datos auxiliares calculados

El motor también calcula y expone:

**Eficiencia y márgenes** (históricos + proyectados):
- CapEx Mantenimiento / Ventas
- Working Capital / Ventas
- FCF / Ventas (FCF Margin)
- Conversión en Caja (FCF / EBITDA)

**Asignación de capital** (como % del FCF, solo histórico):
- CapEx Expansión
- Adquisiciones
- Dividendos
- Recompras
- Amortización neta de deuda

**Ratios de rentabilidad** (históricos + proyectados):
- ROE
- ROIC
- Tasa de reinversión (histórico)

## Datos de referencia para validación

Se incluye el archivo `docs/plantillas-de-valorizacion/NASDAQ_AMZN - Amazon.xlsx` como caso de prueba. Este archivo contiene la valorización de Amazon **sin overrides manuales** (usando exclusivamente las fórmulas por defecto de la plantilla).

El motor debe reproducir exactamente los mismos resultados que este Excel cuando se alimenta con los mismos datos crudos de Amazon.

## Alcance del MVP

### Incluido

- Valuation Engine con la Plantilla General (Módulo 7)
- REST API con los endpoints definidos
- Chrome Extension para captura de datos desde InvestingPro
- Persistencia en SQLite
- Proyecciones 100% automáticas (promedios históricos)
- Test de validación contra datos de Amazon

### Excluido (post-MVP)

- Plantilla de Valoración Financieras (Módulo 15)
- Plantilla de Valoración REITs (Módulo 16)
- Overrides manuales de proyecciones y múltiplos
- Señales automáticas (COMPRAR / WATCHLIST / VENDER / DESCARTAR)
- CLI
- Dashboard web
- Sugerencia inteligente de proyecciones
- Re-evaluación periódica automática
- Alertas y notificaciones

## Criterio de éxito

El sistema procesa los datos financieros de Amazon (10 años, IS + BS + CF) y produce:

1. Proyecciones a 5 años usando los defaults automáticos
2. Precio objetivo por cada método de valoración
3. Margen de seguridad
4. CAGR a 5 años
5. Precio de compra para 15% de retorno anual
6. Red flags

Los números deben coincidir con los que produce la plantilla Excel cuando se usan las fórmulas por defecto (no los overrides manuales), con una tolerancia de redondeo de 0.01%.

## Próximas mejoras (post-MVP)

Lista priorizada de mejoras a implementar después del MVP:

### Corto plazo
- **Obtención automática del precio**: El sistema obtiene el precio actual de las acciones automáticamente (via API pública o scraping), eliminando la necesidad de actualizarlo manualmente desde la extensión
- **Overrides manuales**: Permitir que el analista sobreescriba cualquier valor calculado (proyecciones, múltiplos, ratios) manteniendo el patrón computed + override
- **Plantilla Financieras** (Módulo 15): Flujo de valorización para empresas del sector Financial Services (Price/Book, PER, ROA, ROE)
- **Plantilla REITs** (Módulo 16): Flujo de valorización para empresas del sector Real Estate (FFO, AFFO, P/FFO, P/AFFO)

### Mediano plazo
- **Señales automáticas**: Clasificación de empresas en COMPRAR / WATCHLIST / VENDER / DESCARTAR basada en margen de seguridad y red flags
- **CLI**: Interfaz de terminal para consultar valoraciones, listar empresas y ver señales
- **Re-evaluación periódica**: Actualización automática de precios y re-cálculo de valoraciones
- **Alertas**: Notificaciones cuando una empresa cruza umbrales de margen de seguridad

### Largo plazo
- **Sugerencia inteligente de proyecciones**: El sistema sugiere valores para las proyecciones basándose en tendencias, consenso de analistas u otros heurísticos
- **Dashboard web**: Interfaz visual con tablas, gráficos, filtros y comparativas
- **Screening**: Filtrado masivo de empresas por criterios fundamentales para descubrir candidatos
