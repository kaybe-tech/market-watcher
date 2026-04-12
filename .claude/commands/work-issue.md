Trabaja en uno o más issues de GitHub del repositorio kaybe-tech/market-watcher.

Input: $ARGUMENTS contiene uno o más números de issue separados por espacio (ej: "5" o "5 12 23").

Lee `.claude/skills/issue-workflow.md` antes de proceder.

Sigue este flujo paso a paso:

## 1. Obtener los issues

Para cada número en $ARGUMENTS, obtén el issue de GitHub (título, descripción, labels, comentarios) del repo kaybe-tech/market-watcher. Muestra un resumen de cada issue al usuario.

## 2. Clasificar el issue

Siguiendo las lineaciones de `issue-workflow.md`, clasifica cada issue por tipo de trabajo y complejidad. Informa al usuario la clasificación.

## 3. Ejecutar según tipo

Sigue el flujo correspondiente definido en `issue-workflow.md`:

**Si es Código / Documentación:**
1. Crear branch desde `main` siguiendo las convenciones de branch de `issue-workflow.md`
2. Si complejo → presentar plan y esperar confirmación. Si simple → implementar directo.
3. Implementar los cambios.
4. Mostrar resumen de cambios y DETENERSE. Esperar aprobación humana. Si el usuario pide correcciones, aplicarlas y volver a esperar.
5. Tras aprobación: hacer un solo commit y crear PR.

**Si es Investigación:**
1. Investigar y presentar hallazgos al usuario.
2. Preguntar si quiere que comente los resultados en el issue de GitHub.

**Si es Discusión/Definición:**
1. Presentar el contexto del issue y ofrecer perspectiva.
2. Preguntar al usuario cómo quiere proceder.
