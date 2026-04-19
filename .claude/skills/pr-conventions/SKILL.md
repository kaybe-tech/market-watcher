---
name: pr-conventions
description: Use when creating pull requests in market-watcher, writing PR titles or bodies, or assigning reviewers.
---

# PR Conventions

## Título

- En español
- Conciso, describe el cambio principal
- Sin número de issue en el título

## Body

Estructura:

```
## Resumen
<1-3 bullet points describiendo qué se hizo y por qué>

## Cambios
<lista de los cambios principales realizados>

## Issues
Closes #N, #M
```

- La sección "Issues" solo se incluye cuando el PR está relacionado a issues
- `Closes` para cerrar los issues al mergear

## Assignee

- Siempre asignar a `kaybe-tech`

## Ejemplo simple (con issue)

```
Título: Corregir fórmula de split Cash/MktSec

## Resumen
- Corrige el cálculo de split entre Cash y Market Securities que no coincidía con el Excel de referencia

## Cambios
- Actualizar fórmula en engine/split.ts

## Issues
Closes #5
```

## Ejemplo complejo (con issues)

```
Título: Agregar modelo DCF para empresas generales

## Resumen
- Implementa el modelo de valorización DCF con proyección a 5 años
- Incluye cálculo de WACC y valor terminal con growth rate perpetuo

## Cambios
- Crear módulo engine/dcf con lógica de proyección y descuento
- Agregar tipos e interfaces para inputs del modelo
- Agregar tests unitarios para el cálculo de WACC

## Issues
Closes #5, #12
```

## Ejemplo sin issue

```
Título: Actualizar dependencias del proyecto

## Resumen
- Actualiza Bun y dependencias principales a sus últimas versiones estables

## Cambios
- Actualizar bun.lockb
- Ajustar imports deprecados en engine/utils.ts
```
