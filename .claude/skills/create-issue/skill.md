---
name: create-issue
description: Crea issues estructurados en GitHub adaptándose al tipo de issue
user-invocable: true
---

# Skill: Crear Issue en GitHub

Crea issues en GitHub con estructura consistente, adaptando el contenido según el tipo de issue.

## Invocación

```
/create-issue [descripción libre o contexto del issue]
```

## Flujo

1. **Entender el contexto** — Lee lo que el usuario describe. Si hay un PRD u otro documento de referencia mencionado, léelo.
2. **Reunir información suficiente** — Si falta información para crear un issue concreto y sin ambigüedades, primero intenta obtenerla investigando (leyendo código, PRDs, issues existentes). Si aún no es suficiente, pregunta al usuario. No asumir ni inventar detalles.
3. **Determinar el tipo de issue** — Según la naturaleza del trabajo (infra/setup, cálculo, endpoint, etc.), busca si existe un reference en `references/[tipo]/` dentro de la carpeta de este skill.
4. **Si existe un reference**, léelo y aplica sus reglas al estructurar el issue.
5. **Si no existe un reference**, usa solo la estructura base. No inventes reglas.
6. **Proponer el issue al usuario** — Muestra el borrador completo antes de crearlo. No crear sin aprobación.
6. **Iterar** — El usuario puede pedir cambios. Ajustar hasta que esté conforme.
7. **Crear el issue** — Usar `gh issue create` con título, body y labels.

## Estructura base (todos los issues)

Todos los issues comparten estos elementos:

- **Título** — Corto y descriptivo
- **Descripción** — Contexto breve de qué y por qué
- **Alcance** — Lista concreta de lo que incluye este issue
- **Criterios de aceptación** — Condiciones verificables (checkboxes en GitHub)
- **Dependencias** — Otros issues que bloquean este (o "Ninguna")
- **Labels** — Usar los labels existentes en el repositorio

## Reglas generales

- **No agregar ruido** — Si algo no se hace en este issue, no se menciona. No nombrar trabajo futuro ni cosas que quedan fuera.
- **Ser concreto** — Decisiones técnicas con detalle suficiente para implementar. No dejar ambigüedades.
- **Alcance acotado** — Cada issue debe tener un alcance claro y limitado. Si crece demasiado, sugerir dividirlo.
- **Placeholders explícitos** — Si el issue requiere crear algo temporal, indicar que debe marcarse con `// TODO: eliminar — placeholder para validar [razón]`.
