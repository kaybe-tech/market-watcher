# PRD: Valuation Engine

## Resumen

Motor de cálculo puro que automatiza la valorización de empresas. Replica la lógica de la Plantilla de Valoración General (Módulo 7, IDC v2024.3) en código, eliminando el trabajo manual de llenar hojas de cálculo.

Recibe datos financieros históricos (10 años) y el precio actual de una acción. Calcula automáticamente las proyecciones a 5 años, valoración por múltiplos, margen de seguridad y red flags.

## Problema

El proceso actual de valorización es completamente manual:

1. Buscar datos financieros en InvestingPro
2. Copiar manualmente los datos del Income Statement, Balance Sheet y Cash Flow a una plantilla Excel
3. Ajustar proyecciones y múltiplos objetivo manualmente
4. Revisar los resultados celda por celda

Esto limita el análisis a ~30 empresas al mes. El primer paso para escalar es automatizar el cálculo: dado un set de datos financieros, producir la valorización completa sin intervención manual.

## Solución

Un motor de cálculo puro — sin IO, sin base de datos, sin API — que:

- Recibe datos financieros crudos + precio actual
- Ejecuta la misma lógica que la plantilla Excel
- Retorna la valorización completa

## Arquitectura

```
market-watcher/
├── packages/
│   └── valuation-engine/
│       ├── src/
│       │   ├── types.ts          <- Interfaces de entrada, salida y tipos intermedios
│       │   ├── historical.ts     <- Fase 1: análisis de datos históricos
│       │   ├── projection.ts     <- Fase 2: proyección año a año
│       │   ├── valuation.ts      <- Fase 3: valoración por múltiplos
│       │   ├── red-flags.ts      <- Fase 4: detección de red flags
│       │   └── engine.ts         <- Orquestador: conecta las 4 fases
│       └── tests/
│           └── fixtures/         <- Datos de Amazon para validación
├── turbo.json
└── package.json
```

Tecnologías: Bun, Turborepo, TypeScript.

### Arquitectura interna del engine

El motor se organiza en 4 fases que se ejecutan secuencialmente:

```
Input ──► Fase 1: Análisis histórico ──► Fase 2: Proyección ──► Fase 3: Valoración ──► Fase 4: Red Flags ──► Output
```

**Fase 1 — Análisis histórico** (`historical.ts`): Lee los 10 años de datos y calcula los promedios y ratios que alimentan las proyecciones (crecimiento de ventas, margen EBIT, tax rate, crecimiento de acciones, ratios de interés, capex mantenimiento, working capital, proporciones de deuda, etc.). Produce un objeto `ProjectionParams`.

**Fase 2 — Proyección año a año** (`projection.ts`): Proyecta los 5 años futuros en un loop secuencial donde cada año usa los resultados del año anterior. **Dentro de cada año, los cálculos se entrelazan entre estados financieros**: primero se proyecta el Income Statement (usando datos del Balance Sheet anterior para interest), luego el Free Cash Flow (usando el IS recién calculado), luego el Balance Sheet (usando IS y FCF), y finalmente ROIC (usando IS y BS). Esta es la fase más compleja del engine.

```
Para cada año [2025e..2029e]:
  is  = f(prev.is, prev.bs, params)        <- interest depende de deuda anterior
  fcf = f(is, prev.bs, params)             <- usa EBITDA, taxes del IS actual
  bs  = f(prev.bs, is, fcf, params)        <- equity depende de NI y FCF
  roic = f(is, bs)                         <- cruza IS y BS del año actual
```

Los Pasos 1, 2 y 3 del proceso de cálculo (detallados más abajo) no se ejecutan secuencialmente — se entrelazan dentro de este loop. Los pasos están documentados por tema para facilitar la referencia de fórmulas, pero la ejecución real es año por año, cruzando los tres estados financieros en cada iteración.

**Fase 3 — Valoración** (`valuation.ts`): Toma los 5 años proyectados y el precio actual. Calcula múltiplos LTM y objetivo (NTM), precio objetivo por 4 métodos para cada año, margen de seguridad, CAGR a 5 años y precio de compra para 15% de retorno.

**Fase 4 — Red Flags** (`red-flags.ts`): Escanea los 10 años históricos contando años que cumplen condiciones de alerta (ventas decrecientes, margen operativo en baja, FCF negativo, ROIC bajo, deuda elevada).

**Orquestador** (`engine.ts`): Conecta las 4 fases en secuencia:

```
valuate(input) {
  params     = analyzeHistorical(input)           // Fase 1
  projected  = projectAll(input, params)          // Fase 2
  valuation  = computeValuation(projected, price) // Fase 3
  redFlags   = detectRedFlags(input)              // Fase 4
  return { projected, valuation, redFlags }
}
```

## Datos de entrada

El engine recibe un único objeto con toda la información necesaria para valorizar una empresa. Los datos financieros se agrupan por año, y dentro de cada año por estado financiero (`is`, `bs`, `cf`). Los valores monetarios están en millones excepto donde se indique.

### Estructura general

```json
{
  "ticker": "AMZN",
  "companyName": "Amazon.com Inc",
  "sector": "Technology",
  "currentPrice": 214.75,
  "financials": {
    "2015": {
      "is": { "totalRevenues": 107006, "..." : "..." },
      "bs": { "cashAndEquivalents": 15890, "..." : "..." },
      "cf": { "netIncome": 596, "..." : "..." }
    },
    "2016": { "is": { "..." : "..." }, "bs": { "..." : "..." }, "cf": { "..." : "..." } },
    "...": "hasta 2024"
  }
}
```

Se esperan 10 años de datos históricos (típicamente 2015–2024). El año es la unidad principal de agrupación porque las fórmulas cruzan estados financieros libremente dentro de un mismo año. Los sub-objetos `is`, `bs` y `cf` mantienen la distinción por estado financiero para evitar colisiones de nombres (ej: `netIncome` existe en IS y CF) y preservar la semántica del dominio.

### Income Statement (`is`)

```json
{
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
  "minorityInterest": 0,
  "netIncome": 596,
  "dilutedEPS": 0.06,
  "weightedAvgDilutedShares": 9540,
  "ebitda": 7879,
  "stockBasedCompensation": 2119,
  "effectiveTaxRate": 0.614,
  "marketCap": 316832,
  "tev": 320991
}
```

### Balance Sheet (`bs`)

```json
{
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
```

### Cash Flow (`cf`)

```json
{
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
  "saleOfIntangibleAssets": 0,
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
```

### Sectores y flujos de valorización

El sector de la empresa determina qué flujo de valorización se utiliza:

| Flujo de valorización | Sectores |
|---|---|
| **General** (Módulo 7) | Technology, Healthcare, Consumer Cyclical, Consumer Defensive, Industrials, Basic Materials, Communication Services, Energy, Utilities |
| **Financieras** (Módulo 15) | Financial Services |
| **REITs** (Módulo 16) | Real Estate |

Solo se implementa el flujo General. Si el sector es Financial Services o Real Estate, el engine retorna un error indicando que el flujo no está disponible.

## Proceso de cálculo

El motor replica exactamente las fórmulas de la Plantilla de Valoración General (Módulo 7, IDC v2024.3). Todas las proyecciones se calculan automáticamente usando promedios históricos.

### Mapeo de variables a campos del input

Las fórmulas de esta sección usan nombres cortos. Esta tabla mapea cada variable al campo exacto del input:

| Variable en fórmulas | Campo del input | Notas |
|---|---|---|
| Sales | `is.totalRevenues` | |
| D&A | `cf.depreciationAmortization` + `cf.amortizationGoodwillIntangibles` | Suma de ambos. Valores positivos en el input |
| EBIT | `is.operatingIncome` | |
| EBITDA | Calculado | `EBIT + ABS(D&A)` en proyecciones. Histórico: `is.ebitda` |
| Interest Expense | `is.interestExpense` | Valor negativo en el input |
| Interest Income | `is.interestAndInvestmentIncome` | |
| EBT | Calculado | `EBIT + Total Interest`. No usa `is.ebtInclUnusualItems` |
| Tax | `is.incomeTaxExpense` | Valor negativo en el input |
| Tax Rate | Calculado | `ABS(is.incomeTaxExpense) / EBT` por año, luego se promedia. No usa `is.effectiveTaxRate` |
| Minority Interests | `is.minorityInterest` | |
| Net Income | `is.netIncome` | |
| EPS | `is.dilutedEPS` | |
| Shares | `is.weightedAvgDilutedShares` | |
| Market Cap | `is.marketCap` | Solo para histórico |
| EV (Enterprise Value) | Calculado | `precio_actual * Shares + Deuda_Neta`. No usa `is.tev` |
| SBC | `is.stockBasedCompensation` | |
| Cash | `bs.cashAndEquivalents` | |
| Marketable Securities | `bs.shortTermInvestments` | = Total Cash & ST Investments - Cash |
| ST Debt | `bs.shortTermBorrowings` + `bs.currentPortionLongTermDebt` | Suma de ambos campos |
| LT Debt | `bs.longTermDebt` | |
| Current Operating Leases | `bs.currentPortionCapitalLeases` | El Excel usa capital leases como proxy |
| NonCurrent Operating Leases | `bs.capitalLeases` | El Excel usa capital leases como proxy |
| Equity | `bs.totalEquity` | |
| Inventory | `bs.inventory` | |
| AR (Accounts Receivable) | `bs.accountsReceivable` | |
| AP (Accounts Payable) | `bs.accountsPayable` | |
| Unearned Revenue | `bs.unearnedRevenueCurrent` + `bs.unearnedRevenueNonCurrent` | Suma de ambos |
| Capital Expenditure | `cf.capitalExpenditure` | Valor negativo en el input |
| Sale of Intangible Assets | `cf.saleOfIntangibleAssets` | |
| Sale of PPE | `cf.saleOfPPE` | |
| FCF | `cf.freeCashFlow` | |
| Dividends Paid | `cf.dividendsPaid` | |
| Repurchase of Common Stock | `cf.repurchaseOfCommonStock` | |
| Total Debt Issued | `cf.totalDebtIssued` | |
| Total Debt Repaid | `cf.totalDebtRepaid` | Valor negativo en el input |
| Cash Acquisitions | `cf.cashAcquisitions` | Valor negativo en el input |

### Paso 1: Income Statement proyectado (5 años)

Proyecciones automáticas (constantes los 5 años):

| Campo | Fórmula default |
|---|---|
| Crecimiento de ventas | `AVERAGE(YoY growth de los 9 años disponibles)` |
| Margen EBIT | `AVERAGE(EBIT/Sales de los 10 años)` |
| Tax rate | `AVERAGE(ABS(incomeTaxExpense) / EBT de los 10 años)` donde EBT = EBIT + Total Interest |
| Crecimiento acciones | `AVERAGE(YoY share growth de los 9 años)` |

Cálculos derivados por año proyectado:

```
Sales = Sales_anterior * (1 + crecimiento_ventas)
D&A = D&A_anterior * (1 + crecimiento_ventas)
  donde D&A = cf.depreciationAmortization + cf.amortizationGoodwillIntangibles
EBIT = Sales * margen_EBIT
EBITDA = EBIT + ABS(D&A)
Interest Expense = -(avg_%_interest_expense * (ST_Debt + LT_Debt))
  donde avg_%_interest_expense = ABS(SUM(interestExpense histórico)) / SUM(ST_Debt + LT_Debt histórico)
Interest Income = avg_%_interest_income * Marketable_Securities
  donde avg_%_interest_income = SUM(interestAndInvestmentIncome histórico) / SUM(shortTermInvestments histórico)
Total Interest = Interest_Expense + Interest_Income
EBT = EBIT + Total_Interest
Tax = -EBT * tax_rate
  donde tax_rate = AVERAGE(ABS(incomeTaxExpense[y]) / (EBIT[y] + TotalInterest[y]) para cada año)
Consolidated Net Income = EBT + Tax
Minority Interests = (MI_anterior / ConsolidatedNI_anterior) * ConsolidatedNI_actual
  (mantiene la proporción de MI sobre Consolidated NI del año anterior)
Net Income = Consolidated_Net_Income + Minority_Interests
Shares = Shares_anterior * (1 + crecimiento_acciones)
EPS = Net_Income / Shares
```

### Paso 2: Free Cash Flow proyectado

```
CapEx Mtto proyectado = -ratio_capex_mantenimiento * Sales  (valor negativo)
  donde ratio_capex_mantenimiento = ABS(lastHistCapexMtto * (1 + salesGrowth)) / firstProjSales
  (se calcula una vez con el último año histórico ajustado por growth, luego es constante los 5 años)

Working Capital = Inventories + AR - AP - Unearned_Revenue

CWC histórico:
  si AP_año_anterior > 0: CWC = WC_actual - WC_anterior
  si AP_año_anterior <= 0: CWC = 0
  (el primer año histórico no tiene CWC; hay 9 valores de CWC para 10 años)

CWC primer año proyectado = (SUM(CWC histórico) / SUM(Sales histórico excluyendo primer año)) * Sales_proyectado
CWC años siguientes = (CWC_anterior / Sales_anterior) * Sales_actual

WC proyectado = WC_anterior + CWC

FCF = EBITDA + CapEx_Mtto + Total_Interest + Taxes - CWC + Minority_Interests
```

Nota: CapEx Mantenimiento se calcula históricamente como:

```
CapEx Neto = Capital_Expenditure + Sale_of_Intangible_Assets + Sale_of_PPE
CapEx Mantenimiento:
  si ABS(CapEx_Neto) < D&A -> CapEx_Mtto = CapEx_Neto  (valor negativo, menor que D&A)
  si ABS(CapEx_Neto) >= D&A -> CapEx_Mtto = -D&A       (se topa en D&A)
```

Donde D&A = `cf.depreciationAmortization` + `cf.amortizationGoodwillIntangibles` (ambos positivos en el input).

### Paso 3: ROIC

```
EBIT_after_tax = EBIT * (1 - Tax_Rate)

Invested Capital = Equity + ST_Debt + LT_Debt
                 + Current_Operating_Leases + NonCurrent_Operating_Leases
                 - Marketable_Securities

Donde:
  ST_Debt = shortTermBorrowings + currentPortionLongTermDebt
  Marketable_Securities = shortTermInvestments
  Current_Operating_Leases = currentPortionCapitalLeases
  NonCurrent_Operating_Leases = capitalLeases

ROIC = EBIT_after_tax / Invested_Capital
ROE = Net_Income / Equity
```

Proyección de componentes del Invested Capital:

```
Operating Leases (current y non-current) = valor_anterior * (1 + sales_growth)

Equity proyectado:
  Market_Cap_proyectado = precio_actual * Shares_proyectadas
  Equity_new = Equity_prev + Net_Income + (share_growth * Market_Cap_proyectado)
             - (avg_dividend_%_of_FCF * FCF)
  donde avg_dividend_%_of_FCF = AVERAGE(dividendos_%_FCF de los 2 últimos años históricos)
  y dividendos_%_FCF = ABS(dividendsPaid) / FCF (solo si FCF > 0, sino 0)

Deuda Neta proyectada:
  ratio_deuda_neta_ebitda = AVERAGE(Deuda_Neta/EBITDA de los 10 años históricos), constante 5 años
  Deuda_Neta = ratio_deuda_neta_ebitda * EBITDA

Cash + Marketable Securities proyectados:
  si Deuda_Neta > 0 (primer año):
    Cash_MktSec = MIN(% histórico Cash_MktSec/Sales) * Sales_proyectado
  si Deuda_Neta <= 0 (caja neta, primer año):
    Cash_MktSec = Cash_MktSec_anterior / ABS(DeudaNeta_anterior) * ABS(DeudaNeta_actual)
  Años siguientes: Cash_MktSec = Cash_MktSec_anterior / ABS(DeudaNeta_anterior) * ABS(DeudaNeta_actual)

  Cash individual: primer año mantiene proporción Cash/Total del último histórico;
                   años siguientes se escala proporcionalmente a ventas
  Marketable Securities: misma lógica que Cash

Deuda Total proyectada:
  si Deuda_Neta > 0: Deuda_Total = Deuda_Neta + Cash_MktSec
  si Deuda_Neta <= 0: Deuda_Total = DeudaTotal_anterior / ABS(DeudaNeta_anterior) * ABS(DeudaNeta_actual)
  Años siguientes: mantiene proporción sobre Deuda Neta

  Deuda_CP: primer año = DeudaCP_anterior / DeudaTotal_anterior * DeudaTotal_actual
            años siguientes = DeudaCP_anterior / DeudaTotal_anterior * DeudaTotal_actual
  Deuda_LP: misma lógica que Deuda_CP
```

Tasa de reinversión (solo histórico):

```
Inversión_en_crecimiento = ABS(CapEx_Expansion + Cash_Acquisitions)
  donde CapEx_Expansion = CapEx_Neto - CapEx_Mantenimiento

Tasa_reinversión = Inversión_en_crecimiento / FCF  (solo si FCF > 0, sino 0%)
```

### Paso 4: Valoración

Enterprise Value (EV) se calcula — no se usa el campo `tev` del input:

```
Deuda Neta = (ST_Debt + LT_Debt) - (Cash + Marketable_Securities)
Market Cap = precio_actual * Shares
EV = Market Cap + Deuda_Neta
```

Para años proyectados:

```
Market Cap proyectado = precio_actual * Shares_proyectadas
EV proyectado = Market_Cap_proyectado + Deuda_Neta_proyectada
```

Múltiplos LTM (Last Twelve Months) — datos del último año histórico, EV calculado con precio actual:

```
PER LTM = precio_actual / EPS_último_año
EV/FCF LTM = EV_último_año / FCF_último_año
EV/EBITDA LTM = EV_último_año / EBITDA_último_año
EV/EBIT LTM = EV_último_año / EBIT_último_año
```

Múltiplos objetivo NTM (defaults):

```
PER objetivo = precio_actual / EPS_primer_año_proyectado
EV/FCF objetivo = PER objetivo  (placeholder, ajustar manualmente)
EV/EBITDA objetivo = EV_primer_año_proyectado / EBITDA_primer_año_proyectado
EV/EBIT objetivo = EV_primer_año_proyectado / EBIT_primer_año_proyectado
```

Precio objetivo por método (para cada uno de los 5 años proyectados):

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

Margen de seguridad (para cada uno de los 5 años proyectados, método EV/FCF):

```
Margen de seguridad = (precio_obj_EV_FCF / precio_actual) - 1
```

CAGR a 5 años (uno por cada método + promedio):

```
CAGR PER = (precio_PER_5to_año / precio_actual) ^ (1/5) - 1
CAGR EV/FCF = (precio_EV_FCF_5to_año / precio_actual) ^ (1/5) - 1
CAGR EV/EBITDA = (precio_EV_EBITDA_5to_año / precio_actual) ^ (1/5) - 1
CAGR EV/EBIT = (precio_EV_EBIT_5to_año / precio_actual) ^ (1/5) - 1
CAGR Promedio = AVERAGE(4 CAGRs)
```

Precio de compra:

```
Precio de compra para 15% retorno = precio_EV_FCF_5to_año / (1.15)^5
Diferencia vs precio actual = (precio_de_compra - precio_actual) / precio_actual
```

### Paso 5: Red Flags

Conteo de años que cumplen cada condición:

| Red Flag | Condición | Años evaluados |
|---|---|---|
| Decrecimiento de ventas | YoY Sales Growth < 0 | 9 (requiere año anterior para YoY) |
| Decrecimiento de margen operativo | EBIT margin actual < EBIT margin año anterior | 9 (requiere año anterior) |
| FCF negativo | FCF < 0 | 10 |
| ROIC pobre | ROIC < 10% | 10 |
| Ratio deuda elevado | Deuda Neta / EBITDA > 2.5x | 10 |

## Datos auxiliares calculados

El motor también calcula y expone:

**Eficiencia y márgenes** (históricos + proyectados):
- CapEx Mantenimiento / Ventas
- Working Capital / Ventas
- FCF / Ventas (FCF Margin)
- Conversión en Caja (FCF / EBITDA)
- Cash + Marketable Securities / Ventas (solo histórico)

**Indicadores cualitativos** (como % de ventas, solo histórico):
- Impairments: `(ABS(assetWritedown) + ABS(impairmentOfGoodwill)) / Sales`
- Desinversiones: `divestitures / Sales`
- Stock-Based Compensation: `stockBasedCompensation / Sales`
- Emisión de acciones: `issuanceOfCommonStock / Sales`

**Asignación de capital** (como % del FCF, solo histórico, solo cuando FCF > 0):
- CapEx Expansión: `ABS(CapEx_Expansion) / FCF`
- Adquisiciones: `ABS(cashAcquisitions) / FCF`
- Dividendos: `ABS(dividendsPaid) / FCF`
- Recompras: `ABS(repurchaseOfCommonStock) / FCF`
- Amortización neta de deuda: `MAX(ABS(totalDebtRepaid) - totalDebtIssued, 0) / FCF` (se clipea a 0 si la empresa emitió más deuda de la que repagó)

**Ratios de rentabilidad** (históricos + proyectados):
- ROE = Net Income / Equity
- ROIC = EBIT×(1-t) / Invested Capital
- Tasa de reinversión = `ABS(CapEx_Expansion + Cash_Acquisitions) / FCF` (solo histórico, solo si FCF > 0)

## Datos de salida

El engine retorna un objeto con la valorización completa, incluyendo:

1. **Income Statement proyectado** (5 años): todos los campos calculados en el Paso 1
2. **Free Cash Flow proyectado** (5 años): CapEx Mtto, Working Capital, CWC, FCF
3. **ROIC y ROE** (históricos + proyectados): EBIT after tax, Invested Capital, ROIC, ROE
4. **Valoración**: múltiplos LTM (4), múltiplos objetivo NTM (4), precio objetivo por método × 5 años (4×5), promedio × 5 años, margen de seguridad EV/FCF × 5 años, CAGR por método (4 + promedio), precio de compra para 15% retorno + diferencia % vs precio actual
5. **Red flags**: conteo de años por cada condición (5 flags)
6. **Datos auxiliares**: eficiencia y márgenes, indicadores cualitativos, asignación de capital, rentabilidad

La estructura exacta de la salida se definirá por los tipos de TypeScript durante la implementación. Lo que importa es que cada valor intermedio sea accesible para validación contra el Excel.

## Datos de referencia para validación

La plantilla de referencia es `docs/plantillas-de-valorizacion/Módulo 7_ Plantilla Valoración IDC v2024.3_ TIKR.xlsx`. Esta es la plantilla genérica que el engine debe replicar.

Para validación se debe crear un fixture con los datos financieros de Amazon (10 años) y llenar la plantilla con esos mismos datos **sin overrides manuales** (usando exclusivamente las fórmulas por defecto). El motor debe reproducir exactamente los mismos resultados que el Excel resultante.

## Alcance

### Incluido

- Valuation Engine con la Plantilla General (Módulo 7)
- Proyecciones 100% automáticas (promedios históricos)
- Fixture de datos de Amazon (10 años, IS + BS + CF) creado a partir de datos reales
- Excel de Amazon llenado con la plantilla de Módulo 7 como referencia de validación
- Tests de validación que comparen la salida del engine contra el Excel de referencia

### Excluido

- REST API y endpoints
- Chrome Extension para captura de datos
- Persistencia en base de datos
- Plantilla de Valoración Financieras (Módulo 15)
- Plantilla de Valoración REITs (Módulo 16)
- Overrides manuales de proyecciones y múltiplos
- Señales automáticas (COMPRAR / WATCHLIST / VENDER / DESCARTAR)
- CLI, dashboard, alertas

## Criterio de éxito

El engine procesa los datos financieros de Amazon (10 años, IS + BS + CF) y produce:

1. Proyecciones a 5 años usando los defaults automáticos
2. Precio objetivo por cada método de valoración
3. Margen de seguridad
4. CAGR a 5 años
5. Precio de compra para 15% de retorno anual
6. Red flags

Los números deben coincidir con los que produce la plantilla Excel cuando se usan las fórmulas por defecto (no los overrides manuales), con una tolerancia de redondeo de 0.01%.

## Próximos pasos (post-engine)

Una vez validado el engine, las siguientes capas del producto:

1. **REST API** (Bun + Hono): endpoints para ingestar datos y consultar valoraciones
2. **Chrome Extension**: captura de datos financieros desde InvestingPro
3. **Persistencia** (SQLite): almacenamiento de empresas y valoraciones
4. **Plantilla Financieras** (Módulo 15): flujo para empresas del sector Financial Services
5. **Plantilla REITs** (Módulo 16): flujo para empresas del sector Real Estate
6. **Overrides manuales**: permitir sobreescribir proyecciones y múltiplos
7. **Señales automáticas**: clasificación COMPRAR / WATCHLIST / VENDER / DESCARTAR
