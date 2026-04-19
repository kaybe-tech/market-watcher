# Issue tipo: feature

Usar cuando el issue describe una funcionalidad nueva del producto, generalmente derivada de un PRD.

## Estructura del body

````
## Descripción

<Qué se implementa y por qué, en 2-4 líneas. Contexto breve del PRD.>

Referencia: `docs/prd/<archivo>.md`, sección "<sección>".

## Estructura

<Diagrama o descripción de la forma del artefacto: clase, módulo, tipos, etc. Omitir esta sección si no aplica al issue.>

## Alcance

- <Inputs, outputs, pasos clave>
- <Archivos que se crean o modifican>

## Tests

- <Archivo(s) de test y qué cubren>
- <Fixtures si aplica>
- <Tolerancias numéricas si aplica>

## Criterios de aceptación

- [ ] <Criterio verificable>
- [ ] <Criterio verificable>
- [ ] <`bun run check` pasa sin errores / build pasa / etc.>
````

## Labels

- `enhancement` — siempre para features.
- Un label por módulo, paquete o servicio afectado. Labels vigentes conocidos: `valuation-engine`. Si no estás seguro de que un label exista, preguntar al usuario antes de usarlo; no crear labels sin permiso.

## Convenciones

- **Idioma**: prosa en español, identificadores y nombres técnicos en inglés.
- **Tono**: imperativo para acciones, conciso.
- **Título**: corto, en español, sin número de issue, sin punto final.
- **Referencia al PRD**: incluirla siempre que exista.
- **Criterios de aceptación**: verificables y ejecutables, no subjetivos.
- **Terminología de workspaces**: el monorepo distingue `packages/*` (librerías reutilizables, ej: `valuation-engine`) de `apps/*` (aplicaciones ejecutables / servicios, ej: `api`). Al redactar la descripción y estructura, referirse a un workspace de `apps/*` como "servicio" o "app", no como "package" o "librería"; el término "package" a secas queda para los de `packages/*`. El nombre npm del workspace (`@market-watcher/<name>`) se usa solo como identificador técnico.

## Ejemplo de referencia

El issue #7 del repositorio (`CompanyValuation (orquestador) + test end-to-end`) cumple con esta estructura.
