---
name: create-issue
description: Use when creating GitHub issues in kaybe-tech/market-watcher, breaking down a PRD into issues, or drafting issue content collaboratively before publishing.
---

# Create Issue

## Overview

Flujo para crear issues en GitHub en `kaybe-tech/market-watcher`. El usuario propone el trabajo (una tarea suelta, un breakdown de un PRD, etc.); este skill guía la conversación para definir el contenido del issue y solo crea en GitHub cuando el usuario aprueba explícitamente.

## Cuándo usar

- El usuario pide crear uno o más issues en GitHub
- Hay un PRD o spec que se debe descomponer en issues
- El usuario quiere iterar sobre el contenido de un issue antes de publicarlo

## Flujo

1. **Identificar el tipo de issue.** Tipos soportados hoy:
   - `feature` — funcionalidad nueva, típicamente referenciada a un PRD.

   Si el usuario pide otro tipo (bug, docs, research, etc.) y no hay referencia en `references/`, avisar y pedir instrucciones antes de seguir.

2. **Leer la referencia correspondiente** en `references/<tipo>.md` antes de redactar. Cada referencia define la estructura del body, los labels y las convenciones específicas del tipo.

3. **Iterar el contenido con el usuario.** Proponer el borrador; aplicar correcciones hasta que el usuario apruebe explícitamente.

4. **Crear el issue solo tras aprobación.** Usar la tool `mcp__github__create_issue` con:
   - `owner`: `kaybe-tech`
   - `repo`: `market-watcher`
   - `title`: título aprobado
   - `body`: cuerpo en markdown
   - `labels`: array de labels
   - `assignees`: array de usuarios asignados (si aplica)

5. **No tocar nada más.** Este skill crea issues; no crea branches, PRs ni modifica código.

## Reglas

- Nunca crear un issue sin aprobación explícita del usuario para su contenido final.
- Si no estás seguro de que un label exista en el repositorio, preguntar al usuario antes de usarlo; no crear labels sin permiso explícito.
- Nunca asumir el tipo de issue: preguntarlo si no queda claro.
- Idioma: título y cuerpo del issue en español. Identificadores, nombres técnicos, comandos, nombres de archivos, clases, funciones y variables se mantienen en inglés (no se traducen).
- Un issue por invocación de la tool. Si hay varios, iterar cada uno por separado en la conversación.
- Tras crear el issue, responder al usuario con el número y URL del issue creado (vienen en el resultado de la tool).
