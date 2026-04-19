---
name: commit-conventions
description: Use when creating git commits in market-watcher, writing commit messages, or reviewing commit message format.
---

# Commit Conventions

## Formato

Conventional Commits en español:

```
<tipo>(<scope>): <descripción>

<body (opcional)>

<footer (opcional)>
```

## Tipos

- `feat` — funcionalidad nueva
- `fix` — corrección de bug
- `refactor` — refactor sin cambio funcional
- `docs` — documentación
- `chore` — tareas de mantenimiento, config, dependencias
- `test` — agregar o modificar tests

## Scope

Opcional. Usar cuando agrega claridad sobre qué área del proyecto se afecta. Ejemplos: `engine`, `api`, `ui`, `config`.

## Descripción

- En español
- Imperativo (ej: "agregar", "corregir", "actualizar", no "agregado" o "se agregó")
- Sin punto final
- Concisa

## Body

- Solo cuando el cambio es complejo y la descripción no es suficiente para entender el por qué
- En español
- Explicar motivación y contexto, no repetir el qué

## Footer

- Referencias a issues solo cuando el commit está relacionado a un issue: `refs #5, #12`
- Si no hay issue relacionado, omitir el footer
- NO usar `closes`, `fixes` o `resolves` en commits — los issues se cierran desde el PR

## Ejemplo simple

```
fix: corregir fórmula de split Cash/MktSec
```

## Ejemplo complejo

```
feat(engine): agregar modelo DCF para empresas generales

Implementa el flujo de caja descontado con proyección a 5 años
y valor terminal usando growth rate perpetuo. Se usa WACC como
tasa de descuento.

refs #5
```
