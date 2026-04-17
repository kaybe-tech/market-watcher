# PRD: Valuation Engine

## Resumen

Motor de cálculo puro que automatiza la valorización de empresas. Replica la lógica de la Plantilla de Valoración General (Módulo 7, IDC v2024.3) en código, eliminando el trabajo manual de llenar hojas de cálculo.

Recibe datos financieros históricos (10 años) y el precio actual de una acción. Calcula automáticamente las proyecciones a 5 años, valoración por múltiplos, margen de seguridad y red flags.

## Problema

El método de valorización por múltiplos, validado por años de uso, está atrapado en una plantilla Excel. Cada empresa requiere llenar la plantilla manualmente, lo que limita la capacidad de análisis y hace imposible automatizar señales de compra/venta a escala.

## Solución

Codificar el método de valorización como un motor de cálculo reutilizable. Recibe datos financieros pre-formateados y produce la misma valorización que la plantilla Excel, sirviendo como pieza fundamental para la automatización del sistema completo.

## Arquitectura

### Estructura del proyecto

```
market-watcher/
├── packages/
│   └── valuation-engine/
│       ├── src/
│       │   ├── company-valuation.ts      <- Orquestador principal
│       │   ├── historical-year.ts        <- Año histórico: inputs → derivados
│       │   ├── projected-year.ts         <- Año proyectado: anterior + assumptions → derivados
│       │   ├── projection-assumptions.ts <- Promedios/ratios históricos
│       │   ├── multiples.ts              <- Múltiplos LTM/NTM/objetivo
│       │   ├── intrinsic-value.ts        <- Precio objetivo, CAGR, precio de compra
│       │   └── index.ts                  <- Export público
│       └── tests/
│           └── fixtures/                 <- Datos de Nvidia, Amazon, Nike y Costco para validación
├── turbo.json
└── package.json
```

Tecnologías: Bun, Turborepo, TypeScript.

### Modelo de datos

#### HistoricalYear

Recibe los inputs de un año y computa todos los campos derivados. Contiene cuatro sub-objetos que reflejan los tabs del Excel. Los cálculos cruzan libremente entre sub-objetos del mismo año. Los campos se computan en orden de dependencia.

```
HistoricalYear
├── year: number
├── currentPrice: number | null
├── prev: HistoricalYear | null
├── incomeStatement
├── freeCashFlow
├── roic
└── valuation
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | year | number | |
| | currentPrice | number \| null | Null para años no-actuales; el último año histórico recibe el precio real |
| | prev | HistoricalYear \| null | Año histórico anterior. Null en el primer año |
| incomeStatement | sales | number | Positivo |
| incomeStatement | depreciationAmortization | number | Negativo. Proviene de los flujos de caja operativos |
| incomeStatement | ebit | number | Negativo si hay pérdida operativa |
| incomeStatement | interestExpense | number | Negativo |
| incomeStatement | interestIncome | number | Positivo |
| incomeStatement | taxExpense | number | Negativo. Positivo solo si es devolución de impuestos |
| incomeStatement | minorityInterests | number | Positivo. Mismo signo que el reporte financiero |
| incomeStatement | fullyDilutedShares | number | En millones |
| freeCashFlow | capexMaintenance | number | Negativo o cero. Se ingresa directo (MIN vs D&A ya aplicado) |
| freeCashFlow | inventories | number | |
| freeCashFlow | accountsReceivable | number | |
| freeCashFlow | accountsPayable | number | |
| freeCashFlow | unearnedRevenue | number | |
| freeCashFlow | dividendsPaid | number | Negativo o cero. Usado para proyección de equity |
| roic | cashAndEquivalents | number | |
| roic | marketableSecurities | number | |
| roic | shortTermDebt | number | |
| roic | longTermDebt | number | |
| roic | currentOperatingLeases | number | |
| roic | nonCurrentOperatingLeases | number | |
| roic | equity | number | |

**Campos**

*incomeStatement*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| sales | number | input | |
| salesYoYGrowth | number \| null | calculado | `(sales - prev.sales) / prev.sales`. Null si no hay año anterior |
| ebitda | number | calculado | `ebit - depreciationAmortization` |
| ebitdaMargin | number | calculado | `ebitda / sales` |
| ebitdaYoYGrowth | number \| null | calculado | `(ebitda - prev.ebitda) / prev.ebitda`. Null si no hay año anterior |
| depreciationAmortization | number | input | Negativo |
| ebit | number | input | |
| ebitMargin | number | calculado | `ebit / sales` |
| ebitYoYGrowth | number \| null | calculado | `(ebit - prev.ebit) / prev.ebit`. Null si no hay año anterior |
| interestExpense | number | input | Negativo |
| interestIncome | number | input | Positivo |
| totalInterest | number | calculado | `interestExpense + interestIncome` |
| earningsBeforeTaxes | number | calculado | `ebit + totalInterest` |
| taxExpense | number | input | Negativo |
| taxRate | number | calculado | `ABS(taxExpense) / earningsBeforeTaxes` |
| consolidatedNetIncome | number | calculado | `earningsBeforeTaxes + taxExpense` |
| minorityInterests | number | input | Positivo |
| netIncome | number | calculado | `consolidatedNetIncome + minorityInterests` |
| netMargin | number | calculado | `netIncome / sales` |
| netIncomeYoYGrowth | number \| null | calculado | `(netIncome - prev.netIncome) / prev.netIncome`. Null si no hay año anterior |
| fullyDilutedShares | number | input | En millones |
| fullyDilutedSharesYoYGrowth | number \| null | calculado | `(shares - prev.shares) / prev.shares`. Null si no hay año anterior |
| eps | number | calculado | `netIncome / fullyDilutedShares` |
| epsYoYGrowth | number \| null | calculado | `(eps - prev.eps) / prev.eps`. Null si no hay año anterior |

*freeCashFlow*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| ebitda | number | calculado | `incomeStatement.ebitda` |
| capexMaintenance | number | input | Negativo o cero |
| totalInterest | number | calculado | `incomeStatement.totalInterest` |
| taxesPaid | number | calculado | `incomeStatement.taxExpense` |
| inventories | number | input | |
| accountsReceivable | number | input | |
| accountsPayable | number | input | |
| unearnedRevenue | number | input | |
| workingCapital | number | calculado | `inventories + accountsReceivable - accountsPayable - unearnedRevenue` |
| changeInWorkingCapital | number \| null | calculado | `workingCapital - prev.workingCapital`. Null si no hay año anterior |
| otherAdjustments | number | calculado | `incomeStatement.minorityInterests` |
| fcf | number | calculado | `ebitda + capexMaintenance + totalInterest + taxesPaid - changeInWorkingCapital + otherAdjustments` |
| fcfMargin | number | calculado | `fcf / incomeStatement.sales` |
| fcfYoYGrowth | number \| null | calculado | `(fcf - prev.fcf) / prev.fcf`. Null si no hay año anterior |
| fcfPerShare | number | calculado | `fcf / incomeStatement.fullyDilutedShares` |
| fcfPerShareYoYGrowth | number \| null | calculado | `(fcfPerShare - prev.fcfPerShare) / prev.fcfPerShare`. Null si no hay año anterior |
| capexMaintenanceSalesRatio | number | calculado | `ABS(capexMaintenance) / incomeStatement.sales` |
| workingCapitalSalesRatio | number | calculado | `workingCapital / incomeStatement.sales` |
| fcfSalesRatio | number | calculado | `fcf / incomeStatement.sales` |
| cashConversion | number \| null | calculado | `fcf / ebitda`. Null si EBITDA es 0 |
| dividendsPaid | number | input | Negativo o cero |
| dividendsFcfRatio | number \| null | calculado | `ABS(dividendsPaid) / fcf`. Null si FCF <= 0 |

*roic*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| ebitAfterTax | number | calculado | `incomeStatement.ebit * (1 - incomeStatement.taxRate)` |
| cashAndEquivalents | number | input | |
| marketableSecurities | number | input | |
| shortTermDebt | number | input | |
| longTermDebt | number | input | |
| totalDebt | number | calculado | `shortTermDebt + longTermDebt` |
| currentOperatingLeases | number | input | |
| nonCurrentOperatingLeases | number | input | |
| equity | number | input | |
| investedCapital | number | calculado | `equity + shortTermDebt + longTermDebt + currentOperatingLeases + nonCurrentOperatingLeases - marketableSecurities` |
| roe | number \| null | calculado | `incomeStatement.netIncome / equity`. Null si equity es 0 |
| roic | number \| null | calculado | `ebitAfterTax / investedCapital`. Null si investedCapital es 0 |

*valuation*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| marketCap | number \| null | calculado | `currentPrice * incomeStatement.fullyDilutedShares`. Null si currentPrice es null |
| netDebt | number | calculado | `(roic.shortTermDebt + roic.longTermDebt) - (roic.cashAndEquivalents + roic.marketableSecurities)` |
| netDebtEbitdaRatio | number \| null | calculado | `netDebt / incomeStatement.ebitda`. Null si EBITDA es 0 |
| enterpriseValue | number \| null | calculado | `marketCap + netDebt`. Null si marketCap es null |

**Orden de cálculo**

Cada campo solo puede calcularse después de que todas sus dependencias estén disponibles.

*incomeStatement* (16 campos calculados):

1. ebitda
2. salesYoYGrowth
3. ebitdaMargin
4. ebitdaYoYGrowth
5. ebitMargin
6. ebitYoYGrowth
7. totalInterest
8. fullyDilutedSharesYoYGrowth
9. earningsBeforeTaxes
10. taxRate
11. consolidatedNetIncome
12. netIncome
13. netMargin
14. netIncomeYoYGrowth
15. eps
16. epsYoYGrowth

*freeCashFlow* (16 campos calculados):

17. ebitda
18. totalInterest
19. taxesPaid
20. workingCapital
21. changeInWorkingCapital
22. otherAdjustments
23. fcf
24. fcfMargin
25. fcfYoYGrowth
26. fcfPerShare
27. fcfPerShareYoYGrowth
28. capexMaintenanceSalesRatio
29. workingCapitalSalesRatio
30. fcfSalesRatio
31. cashConversion
32. dividendsFcfRatio

*roic* (5 campos calculados):

33. ebitAfterTax
34. totalDebt
35. investedCapital
36. roe
37. roic

*valuation* (4 campos calculados):

38. marketCap
39. netDebt
40. netDebtEbitdaRatio
41. enterpriseValue

#### ProjectionAssumptions

Promedios y ratios calculados desde los años históricos. Constantes para los 5 años proyectados.

```
ProjectionAssumptions
├── incomeStatement
├── freeCashFlow
└── roic
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | historical | { [year]: HistoricalYear } | Años históricos completos |

**Campos**

*incomeStatement*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| salesGrowth | number | calculado | `avg(salesYoYGrowth)` de los 9 años disponibles |
| ebitMargin | number | calculado | `avg(ebitMargin)` de los 10 años |
| taxRate | number | calculado | `avg(taxRate)` de los 10 años |
| shareGrowth | number | calculado | `avg(fullyDilutedSharesYoYGrowth)` de los 9 años disponibles |
| interestExpenseRate | number | calculado | `ABS(sum(interestExpense)) / sum(roic.shortTermDebt + roic.longTermDebt)` de los 10 años |
| interestIncomeRate | number | calculado | `sum(interestIncome) / sum(roic.marketableSecurities)` de los 10 años |

*freeCashFlow*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| capexMaintenanceSalesRatio | number | calculado | `ABS(historical[lastYear].freeCashFlow.capexMaintenance * (1 + incomeStatement.salesGrowth)) / (historical[lastYear].incomeStatement.sales * (1 + incomeStatement.salesGrowth))` |
| cwcSalesRatio | number | calculado | `sum(changeInWorkingCapital) / sum(sales excluyendo primer año)` de los 9 años |

*roic*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| netDebtEbitdaRatio | number | calculado | `avg(valuation.netDebtEbitdaRatio)` de los 10 años |

**Orden de cálculo**

*incomeStatement* (6 campos):

1. salesGrowth
2. ebitMargin
3. taxRate
4. shareGrowth
5. interestExpenseRate
6. interestIncomeRate

*freeCashFlow* (2 campos) — depende de incomeStatement.salesGrowth:

7. capexMaintenanceSalesRatio
8. cwcSalesRatio

*roic* (1 campo):

9. netDebtEbitdaRatio

#### ProjectedYear

Recibe el año anterior y los `ProjectionAssumptions` para computar todos los campos. Contiene los mismos cuatro sub-objetos que `HistoricalYear`. El cálculo cruza entre sub-objetos: el IS se computa en dos partes (antes y después de la descomposición de deuda).

```
ProjectedYear
├── year: number
├── incomeStatement
├── freeCashFlow
├── roic
└── valuation
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | year | number | |
| | currentPrice | number | |
| | prev | HistoricalYear \| ProjectedYear | Año anterior |
| | assumptions | ProjectionAssumptions | |
| | historical | { [year]: HistoricalYear } | Para MIN cashMktSec/sales y avg dividendsFcfRatio últimos 2 años |

**Campos**

*incomeStatement*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| sales | number | calculado | `prev.sales * (1 + assumptions.incomeStatement.salesGrowth)` |
| salesYoYGrowth | number | calculado | `assumptions.incomeStatement.salesGrowth` |
| depreciationAmortization | number | calculado | `prev.depreciationAmortization * (1 + assumptions.incomeStatement.salesGrowth)` |
| ebit | number | calculado | `sales * assumptions.incomeStatement.ebitMargin` |
| ebitda | number | calculado | `ebit - depreciationAmortization` |
| ebitdaMargin | number | calculado | `ebitda / sales` |
| ebitdaYoYGrowth | number | calculado | `(ebitda - prev.ebitda) / prev.ebitda` |
| ebitMargin | number | calculado | `assumptions.incomeStatement.ebitMargin` |
| ebitYoYGrowth | number | calculado | `(ebit - prev.ebit) / prev.ebit` |
| interestExpense | number | calculado | `-(assumptions.incomeStatement.interestExpenseRate * (roic.shortTermDebt + roic.longTermDebt))` |
| interestIncome | number | calculado | `assumptions.incomeStatement.interestIncomeRate * roic.marketableSecurities` |
| totalInterest | number | calculado | `interestExpense + interestIncome` |
| earningsBeforeTaxes | number | calculado | `ebit + totalInterest` |
| taxExpense | number | calculado | `-earningsBeforeTaxes * assumptions.incomeStatement.taxRate` |
| taxRate | number | calculado | `assumptions.incomeStatement.taxRate` |
| consolidatedNetIncome | number | calculado | `earningsBeforeTaxes + taxExpense` |
| minorityInterests | number \| null | calculado | `(prev.minorityInterests / prev.consolidatedNetIncome) * consolidatedNetIncome`. Null si prev.consolidatedNetIncome es 0 |
| netIncome | number | calculado | `consolidatedNetIncome + minorityInterests` |
| netMargin | number | calculado | `netIncome / sales` |
| netIncomeYoYGrowth | number | calculado | `(netIncome - prev.netIncome) / prev.netIncome` |
| fullyDilutedShares | number | calculado | `prev.fullyDilutedShares * (1 + assumptions.incomeStatement.shareGrowth)` |
| fullyDilutedSharesYoYGrowth | number | calculado | `assumptions.incomeStatement.shareGrowth` |
| eps | number | calculado | `netIncome / fullyDilutedShares` |
| epsYoYGrowth | number | calculado | `(eps - prev.eps) / prev.eps` |

*freeCashFlow*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| ebitda | number | calculado | `incomeStatement.ebitda` |
| capexMaintenance | number | calculado | `-assumptions.freeCashFlow.capexMaintenanceSalesRatio * incomeStatement.sales` |
| totalInterest | number | calculado | `incomeStatement.totalInterest` |
| taxesPaid | number | calculado | `incomeStatement.taxExpense` |
| changeInWorkingCapital | number | calculado | Primer año: `assumptions.freeCashFlow.cwcSalesRatio * incomeStatement.sales`. Siguientes: `(prev.changeInWorkingCapital / prev.incomeStatement.sales) * incomeStatement.sales` |
| workingCapital | number | calculado | `prev.workingCapital + changeInWorkingCapital` |
| otherAdjustments | number | calculado | `incomeStatement.minorityInterests` |
| fcf | number | calculado | `ebitda + capexMaintenance + totalInterest + taxesPaid - changeInWorkingCapital + otherAdjustments` |
| fcfMargin | number | calculado | `fcf / incomeStatement.sales` |
| fcfYoYGrowth | number | calculado | `(fcf - prev.fcf) / prev.fcf` |
| fcfPerShare | number | calculado | `fcf / incomeStatement.fullyDilutedShares` |
| fcfPerShareYoYGrowth | number | calculado | `(fcfPerShare - prev.fcfPerShare) / prev.fcfPerShare` |
| netChangeInCash | number | calculado | `IF(valuation.netDebt > 0, valuation.netDebt - prev.valuation.netDebt, prev.valuation.netDebt - valuation.netDebt)` |
| capexMaintenanceSalesRatio | number | calculado | `ABS(capexMaintenance) / incomeStatement.sales` |
| workingCapitalSalesRatio | number | calculado | `workingCapital / incomeStatement.sales` |
| fcfSalesRatio | number | calculado | `fcf / incomeStatement.sales` |
| cashConversion | number \| null | calculado | `fcf / ebitda`. Null si EBITDA es 0 |

*roic*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| ebitAfterTax | number | calculado | `incomeStatement.ebit * (1 - incomeStatement.taxRate)` |
| cashMktSec | number | calculado | Primer año con netDebt > 0: `MIN((historicalYear.cashAndEquivalents + historicalYear.marketableSecurities) / historicalYear.incomeStatement.sales)` calculado para cada año histórico, multiplicado por `incomeStatement.sales`. Primer año con netDebt <= 0 (prev es HistoricalYear): `(prev.cashAndEquivalents + prev.marketableSecurities) / ABS(prev.valuation.netDebt) * ABS(valuation.netDebt)`. Siguientes (prev es ProjectedYear): `prev.cashMktSec / ABS(prev.valuation.netDebt) * ABS(valuation.netDebt)` |
| cashAndEquivalents | number | calculado | Primer año (prev es HistoricalYear): `(prev.cashAndEquivalents / (prev.cashAndEquivalents + prev.marketableSecurities)) * cashMktSec`. Siguientes (prev es ProjectedYear): `(prev.cashAndEquivalents / prev.incomeStatement.sales) * incomeStatement.sales` |
| marketableSecurities | number | calculado | Primer año (prev es HistoricalYear): `(prev.marketableSecurities / (prev.cashAndEquivalents + prev.marketableSecurities)) * cashMktSec`. Siguientes (prev es ProjectedYear): `(prev.marketableSecurities / prev.incomeStatement.sales) * incomeStatement.sales` |
| totalDebt | number | calculado | Primer año: `IF(valuation.netDebt > 0, valuation.netDebt + cashMktSec, prev.totalDebt / ABS(prev.valuation.netDebt) * ABS(valuation.netDebt))`. Siguientes: `prev.totalDebt / ABS(prev.valuation.netDebt) * ABS(valuation.netDebt)` |
| shortTermDebt | number | calculado | `(prev.shortTermDebt / prev.totalDebt) * totalDebt` |
| longTermDebt | number | calculado | `(prev.longTermDebt / prev.totalDebt) * totalDebt` |
| currentOperatingLeases | number | calculado | `prev.currentOperatingLeases * (1 + assumptions.incomeStatement.salesGrowth)` |
| nonCurrentOperatingLeases | number | calculado | `prev.nonCurrentOperatingLeases * (1 + assumptions.incomeStatement.salesGrowth)` |
| equity | number | calculado | `prev.equity + incomeStatement.netIncome + (assumptions.incomeStatement.shareGrowth * valuation.marketCap) - (avg(last2HistYears.freeCashFlow.dividendsFcfRatio) * freeCashFlow.fcf)` |
| investedCapital | number | calculado | `equity + shortTermDebt + longTermDebt + currentOperatingLeases + nonCurrentOperatingLeases - marketableSecurities` |
| roe | number \| null | calculado | `incomeStatement.netIncome / equity`. Null si equity es 0 |
| roic | number \| null | calculado | `ebitAfterTax / investedCapital`. Null si investedCapital es 0 |

*valuation*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| marketCap | number | calculado | `currentPrice * incomeStatement.fullyDilutedShares` |
| netDebt | number | calculado | `assumptions.roic.netDebtEbitdaRatio * incomeStatement.ebitda` |
| netDebtEbitdaRatio | number | calculado | `assumptions.roic.netDebtEbitdaRatio` |
| enterpriseValue | number | calculado | `marketCap + netDebt` |

**Orden de cálculo** (58 pasos, cruza entre sub-objetos):

*IS parcial — hasta EBITDA:*

1. incomeStatement.sales
2. incomeStatement.salesYoYGrowth
3. incomeStatement.depreciationAmortization
4. incomeStatement.ebit
5. incomeStatement.ebitda
6. incomeStatement.ebitdaMargin
7. incomeStatement.ebitdaYoYGrowth
8. incomeStatement.ebitMargin
9. incomeStatement.ebitYoYGrowth
10. incomeStatement.fullyDilutedShares
11. incomeStatement.fullyDilutedSharesYoYGrowth

*Valuation parcial — netDebt:*

12. valuation.netDebt
13. valuation.netDebtEbitdaRatio
14. valuation.marketCap

*ROIC parcial — descomposición de deuda:*

15. roic.cashMktSec
16. roic.cashAndEquivalents
17. roic.marketableSecurities
18. roic.totalDebt
19. roic.shortTermDebt
20. roic.longTermDebt

*IS completo — interest en adelante:*

21. incomeStatement.interestExpense
22. incomeStatement.interestIncome
23. incomeStatement.totalInterest
24. incomeStatement.earningsBeforeTaxes
25. incomeStatement.taxExpense
26. incomeStatement.taxRate
27. incomeStatement.consolidatedNetIncome
28. incomeStatement.minorityInterests
29. incomeStatement.netIncome
30. incomeStatement.netMargin
31. incomeStatement.netIncomeYoYGrowth
32. incomeStatement.eps
33. incomeStatement.epsYoYGrowth

*FreeCashFlow:*

34. freeCashFlow.ebitda
35. freeCashFlow.capexMaintenance
36. freeCashFlow.totalInterest
37. freeCashFlow.taxesPaid
38. freeCashFlow.changeInWorkingCapital
39. freeCashFlow.workingCapital
40. freeCashFlow.otherAdjustments
41. freeCashFlow.fcf
42. freeCashFlow.fcfMargin
43. freeCashFlow.fcfYoYGrowth
44. freeCashFlow.fcfPerShare
45. freeCashFlow.fcfPerShareYoYGrowth
46. freeCashFlow.capexMaintenanceSalesRatio
47. freeCashFlow.workingCapitalSalesRatio
48. freeCashFlow.fcfSalesRatio
49. freeCashFlow.cashConversion

*ROIC completo — equity y ratios:*

50. roic.ebitAfterTax
51. roic.currentOperatingLeases
52. roic.nonCurrentOperatingLeases
53. roic.equity
54. roic.investedCapital
55. roic.roe
56. roic.roic

*Valuation completo:*

57. valuation.enterpriseValue

*FreeCashFlow — netChangeInCash:*

58. freeCashFlow.netChangeInCash

#### Multiples

Múltiplos de valoración. Se calculan después de tener los años históricos y proyectados completos.

```
Multiples
├── ltm: { per, evFcf, evEbitda, evEbit }
├── ntm: { per, evFcf, evEbitda, evEbit }
└── target: { per, evFcf, evEbitda, evEbit }
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | currentPrice | number | |
| | lastHistYear | HistoricalYear | Último año histórico |
| | firstProjYear | ProjectedYear | Primer año proyectado |

**Campos**

*ltm* (último año histórico)

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| per | number \| null | calculado | `currentPrice / lastHistYear.incomeStatement.eps`. Null si EPS es 0 |
| evFcf | number \| null | calculado | `lastHistYear.valuation.enterpriseValue / lastHistYear.freeCashFlow.fcf`. Null si FCF es 0 |
| evEbitda | number \| null | calculado | `lastHistYear.valuation.enterpriseValue / lastHistYear.incomeStatement.ebitda`. Null si EBITDA es 0 |
| evEbit | number \| null | calculado | `lastHistYear.valuation.enterpriseValue / lastHistYear.incomeStatement.ebit`. Null si EBIT es 0 |

*ntm* (primer año proyectado)

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| per | number \| null | calculado | `currentPrice / firstProjYear.incomeStatement.eps`. Null si EPS es 0 |
| evFcf | number \| null | calculado | `firstProjYear.valuation.enterpriseValue / firstProjYear.freeCashFlow.fcf`. Null si FCF es 0 |
| evEbitda | number \| null | calculado | `firstProjYear.valuation.enterpriseValue / firstProjYear.incomeStatement.ebitda`. Null si EBITDA es 0 |
| evEbit | number \| null | calculado | `firstProjYear.valuation.enterpriseValue / firstProjYear.incomeStatement.ebit`. Null si EBIT es 0 |

*target* (defaults, sobreescribibles en el futuro)

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| per | number | calculado | `ntm.per` |
| evFcf | number | calculado | `target.per` (placeholder, usa PER como default) |
| evEbitda | number | calculado | `ntm.evEbitda` |
| evEbit | number | calculado | `ntm.evEbit` |

**Orden de cálculo**

1. ltm.per
2. ltm.evFcf
3. ltm.evEbitda
4. ltm.evEbit
5. ntm.per
6. ntm.evFcf
7. ntm.evEbitda
8. ntm.evEbit
9. target.per
10. target.evFcf
11. target.evEbitda
12. target.evEbit

#### IntrinsicValue

Precio objetivo, retorno anualizado y precio de compra. Se calcula después de tener los años proyectados y los múltiplos objetivo.

```
IntrinsicValue
├── targetPrice: { [year]: { per, evFcf, evEbitda, evEbit, average, marginOfSafety } }
├── cagr5y: { per, evFcf, evEbitda, evEbit, average }
└── buyPrice: { targetReturn, price, differenceVsCurrent }
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | currentPrice | number | |
| | projected | { [year]: ProjectedYear } | Años proyectados |
| | multiples | Multiples | Para los múltiplos objetivo |

**Campos**

*targetPrice* (por cada año proyectado)

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| per | number \| null | calculado | Si netDebt < 0: `(netIncome * multiples.target.per - netDebt) / fullyDilutedShares`. Si netDebt > 0: `(netIncome * multiples.target.per) / fullyDilutedShares`. Null si datos insuficientes |
| evFcf | number \| null | calculado | `(fcf * multiples.target.evFcf - netDebt) / fullyDilutedShares`. Null si datos insuficientes |
| evEbitda | number \| null | calculado | `(ebitda * multiples.target.evEbitda - netDebt) / fullyDilutedShares`. Null si datos insuficientes |
| evEbit | number \| null | calculado | `(ebit * multiples.target.evEbit - netDebt) / fullyDilutedShares`. Null si datos insuficientes |
| average | number \| null | calculado | `avg(per, evFcf, evEbitda, evEbit)` |
| marginOfSafety | number \| null | calculado | `(evFcf / currentPrice) - 1` |

Donde `netDebt`, `netIncome`, `fcf`, `ebitda`, `ebit`, `fullyDilutedShares` corresponden al año proyectado.

*cagr5y* (usa el 5to año proyectado)

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| per | number \| null | calculado | `(targetPrice[5thYear].per / currentPrice)^(1/5) - 1` |
| evFcf | number \| null | calculado | `(targetPrice[5thYear].evFcf / currentPrice)^(1/5) - 1` |
| evEbitda | number \| null | calculado | `(targetPrice[5thYear].evEbitda / currentPrice)^(1/5) - 1` |
| evEbit | number \| null | calculado | `(targetPrice[5thYear].evEbit / currentPrice)^(1/5) - 1` |
| average | number \| null | calculado | `avg(per, evFcf, evEbitda, evEbit)` |

*buyPrice*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| targetReturn | number | input | `0.15` (constante, 15%) |
| price | number \| null | calculado | `targetPrice[5thYear].evFcf / (1 + targetReturn)^5` |
| differenceVsCurrent | number \| null | calculado | `(price - currentPrice) / currentPrice` |

**Orden de cálculo**

*targetPrice — por cada año proyectado (×5 años):*
1. targetPrice[year].per
2. targetPrice[year].evFcf
3. targetPrice[year].evEbitda
4. targetPrice[year].evEbit
5. targetPrice[year].average
6. targetPrice[year].marginOfSafety

*cagr5y:*
7. cagr5y.per
8. cagr5y.evFcf
9. cagr5y.evEbitda
10. cagr5y.evEbit
11. cagr5y.average

*buyPrice:*
12. buyPrice.targetReturn
13. buyPrice.price
14. buyPrice.differenceVsCurrent

#### CompanyValuation

Orquestador principal. Representa la valorización completa de una empresa. Al construirse con los datos de entrada, computa automáticamente todos los valores derivados.

```
CompanyValuation
├── ticker: string
├── currentPrice: number
├── sector: string
├── historical: { [year]: HistoricalYear }
├── assumptions: ProjectionAssumptions
├── projected: { [year]: ProjectedYear }
├── multiples: Multiples
└── intrinsicValue: IntrinsicValue
```

**Inputs**

| Sub-objeto | Campo | Tipo | Nota |
|---|---|---|---|
| | ticker | string | |
| | currentPrice | number | |
| | sector | string | |
| | financials | { [year]: { incomeStatement, freeCashFlow, roic } } | 10 años. Cada año contiene los inputs definidos en HistoricalYear |

**Campos**

*propiedades*

| Campo | Tipo | Origen | Fórmula |
|---|---|---|---|
| historical | { [year]: HistoricalYear } | calculado | Construido a partir de `financials`, `currentPrice` y cada `year` |
| assumptions | ProjectionAssumptions | calculado | Construido a partir de `historical` |
| projected | { [year]: ProjectedYear } | calculado | Construido secuencialmente a partir de `assumptions`, `historical` y `currentPrice` |
| multiples | Multiples | calculado | Construido a partir de `currentPrice`, último año histórico y primer año proyectado |
| intrinsicValue | IntrinsicValue | calculado | Construido a partir de `currentPrice`, `projected` y `multiples` |

**Orden de cálculo**

1. historical
2. assumptions
3. projected
4. multiples
5. intrinsicValue

## Informe de valorización

`CompanyValuation` expone un método `printValuationReport()` que imprime en consola un informe legible con los resultados clave para evaluar la empresa:

```
══════════════════════════════════════════════
  AMZN — Amazon.com Inc
  Precio actual: $214.75 | Sector: Technology
══════════════════════════════════════════════

  Múltiplos
  ─────────────────────────────────────────
           LTM      NTM      Objetivo
  PER      58.2     45.3     45.3
  EV/FCF   42.1     35.8     45.3
  EV/EBITDA 22.4    19.1     19.1
  EV/EBIT  35.6     28.7     28.7

  Precio objetivo
  ─────────────────────────────────────────
              2026e   2027e   2028e   2029e   2030e
  PER         $245    $278    $315    $357    $405
  EV/FCF      $232    $268    $309    $356    $411
  EV/EBITDA   $251    $289    $332    $382    $439
  EV/EBIT     $238    $274    $316    $363    $418
  Promedio    $241    $277    $318    $365    $418

  Margen de seguridad (EV/FCF)
  ─────────────────────────────────────────
              2026e   2027e   2028e   2029e   2030e
              +8.0%  +24.8%  +43.9%  +65.8%  +91.3%

  CAGR 5 años
  ─────────────────────────────────────────
  PER          13.5%
  EV/FCF       13.8%
  EV/EBITDA    15.4%
  EV/EBIT      14.2%
  Promedio     14.2%

  Precio de compra (15% retorno)
  ─────────────────────────────────────────
  $204.35 (-4.8% vs precio actual)

══════════════════════════════════════════════
```

Los valores del ejemplo son ilustrativos. El formato real se ajustará a los datos calculados por el engine.

## Datos de referencia para validación

La plantilla de referencia es `docs/plantillas-de-valorizacion/Módulo 7_ Plantilla Valoración IDC v2024.3_ TIKR.xlsx`. Esta es la plantilla genérica que el engine debe replicar.

En `docs/plantillas-de-valorizacion/evaluaciones/` se encuentran las valoraciones completadas de Nvidia, Amazon, Nike y Costco. Estos Excel sirven como fuente para crear los fixtures de prueba — se extraen los datos financieros históricos (inputs) y los resultados calculados (valores esperados).

Para validación se deben crear fixtures con los datos financieros de cada empresa (10 años) y verificar que el motor reproduce exactamente los mismos resultados que los Excel de referencia cuando se usan las fórmulas por defecto (no los overrides manuales), con una tolerancia de redondeo de 0.01%.

## Alcance

### Incluido

- Valuation Engine con la Plantilla General
- Proyecciones 100% automáticas (promedios históricos)
- Informe de valorización en consola (`printValuationReport()`)
- Fixtures de datos de Nvidia, Amazon, Nike y Costco creados a partir de las valoraciones en `docs/plantillas-de-valorizacion/evaluaciones/`
- Tests de validación que comparen la salida del engine contra los Excel de referencia

### Excluido

- REST API y endpoints
- Chrome Extension para captura de datos
- Persistencia en base de datos
- Plantilla de Valoración Financieras
- Plantilla de Valoración REITs
- Overrides manuales de proyecciones y múltiplos
- Red Flags
- Señales automáticas (COMPRAR / WATCHLIST / VENDER / DESCARTAR)
- CLI, dashboard, alertas

## Criterio de éxito

El engine procesa los datos financieros de Nvidia, Amazon, Nike y Costco (10 años cada una) y produce:

1. Años históricos con todos los campos derivados (incomeStatement, freeCashFlow, roic, valuation)
2. Projection assumptions calculados desde los históricos
3. Años proyectados a 5 años usando los assumptions automáticos
4. Múltiplos LTM, NTM y objetivo
5. Precio objetivo por cada método de valoración
6. Margen de seguridad, CAGR a 5 años y precio de compra
7. Informe de valorización impreso en consola

Los números deben coincidir con los que producen los Excel de referencia cuando se usan las fórmulas por defecto (no los overrides manuales), con una tolerancia de redondeo de 0.01%.

## Próximos pasos (post-engine)

Una vez validado el engine, las siguientes capas del producto:

1. **Persistencia** (SQLite): almacenamiento de empresas y valoraciones
2. **REST API** (Bun + Hono): endpoints para ingestar datos y consultar valoraciones
3. **Chrome Extension**: captura de datos financieros desde InvestingPro
4. **Plantilla Financieras**: flujo para empresas del sector Financial Services
5. **Plantilla REITs**: flujo para empresas del sector Real Estate
6. **Overrides manuales**: permitir sobreescribir proyecciones y múltiplos
7. **Red Flags**: Detección de condiciones de alerta sobre datos históricos (ventas decrecientes, margen en baja, FCF negativo, ROIC bajo, deuda elevada)
8. **Señales automáticas**: clasificación COMPRAR / WATCHLIST / VENDER / DESCARTAR
