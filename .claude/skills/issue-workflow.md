## Clasificación del issue

Primero por **tipo de trabajo**:
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
- Implementar → pausa para revisión humana → commit + PR tras aprobación.

**Investigación:**
- No crear branch ni PR
- Investigar y presentar hallazgos al usuario
- Preguntar si quiere que comente los resultados en el issue de GitHub

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
