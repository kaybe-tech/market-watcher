# Rules: Infra / Setup

Reglas para issues de configuración de infraestructura, tooling y estructura de proyecto.

## Cuándo aplica

Cuando el issue trata sobre:
- Configuración de monorepo, bundlers, package managers
- Setup de linters, formatters, herramientas de desarrollo
- Estructura de directorios y scaffolding de packages
- Configuración de TypeScript, CI/CD, pipelines

## Reglas de alcance

- El alcance se limita a lo que se configura. No mencionar apps o packages que no se crean en este issue.
- Si se configuran herramientas (linter, formatter), especificar las reglas concretas — no solo "configurar Biome" sino qué reglas aplican.
- Si se crean packages o módulos, definir qué exportan (aunque sea un placeholder).

## Reglas de criterios de aceptación

- Los criterios deben ser comandos ejecutables que validan la configuración (ej. `bun install`, `bun run build`, `bun run lint`).
- Si hay interacción entre packages (imports cruzados), incluir un criterio que lo valide.

## Reglas sobre placeholders

- Si el issue requiere crear código temporal para validar que la infraestructura funciona (tests triviales, tipos dummy, importaciones de prueba), debe quedar explícito en el alcance.
- Todo placeholder debe marcarse con `// TODO: eliminar — placeholder para validar [pipeline/wiring/etc.]` con indicación clara de que debe eliminarse o reemplazarse.
