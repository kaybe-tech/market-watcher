---
name: issue-workflow
description: Use when classifying, planning, or working on GitHub issues from kaybe-tech/market-watcher — before creating branches, implementing, or drafting PRs.
---

# Issue Workflow

## Herramientas

Operaciones remotas sobre issues usan el MCP de GitHub:
- `mcp__github__get_issue` — leer el contenido del issue
- `mcp__github__list_issues` / `mcp__github__search_issues` — cuando se trabajan varios o hay que encontrarlos
- `mcp__github__add_issue_comment` — comentar hallazgos o resultados
- `mcp__github__update_issue` — cambiar labels, assignees o estado

## Clasificación del issue

Primero leer el issue con `mcp__github__get_issue`. Luego clasificar por **tipo de trabajo**:
- **Código** — Implementar feature, fix, refactor. Produce cambios en el codebase.
- **Documentación** — Escribir o actualizar docs, PRDs, specs. Produce cambios en archivos pero no en código funcional.
- **Investigación** — Analizar, comparar opciones, responder preguntas técnicas. No produce cambios en archivos.
- **Discusión/Definición** — El issue necesita input humano, decisiones de diseño, o es ambiguo. No se puede resolver sin más contexto.

Después por **complejidad** (solo para tipos que producen cambios):
- **Simple** — Alcance claro, cambio pequeño y obvio, un solo archivo o pocos archivos.
- **Complejo** — Requiere decisiones de diseño, múltiples archivos, feature nueva.

## Flujo según tipo

**Código / Documentación:**
- Crear branch con convención (`feat/`, `fix/`, `refactor/`, `docs/`)
- Si complejo → plan + confirmación. Si simple → directo.
- Implementar → pausa para revisión humana → commit + abrir PR tras aprobación (ver skill `pr-conventions`).

**Investigación:**
- No crear branch ni PR
- Investigar y presentar hallazgos al usuario
- Preguntar si quiere comentar los resultados en el issue con `mcp__github__add_issue_comment`

**Discusión/Definición:**
- Presentar el contexto del issue
- Ofrecer perspectiva o análisis si es posible
- Preguntar al usuario cómo quiere proceder

## Convenciones de branch

- `feat/` — features, funcionalidad nueva
- `fix/` — bugs, correcciones
- `refactor/` — refactors
- `docs/` — documentación
- Nombre descriptivo en inglés, kebab-case, sin número de issue
- Una sola branch cuando se trabajan varios issues juntos
- Tipo predominante cuando los issues son mixtos
