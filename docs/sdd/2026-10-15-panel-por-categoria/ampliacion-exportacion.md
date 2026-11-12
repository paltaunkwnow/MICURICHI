# Ampliación puntual propuesta — contrato de exportación multitemática

**APROBADA por el usuario el 2026-10-15:** «Sí, corregir y verificar contracts
(Recomendado)». Autorizados los seis archivos listados abajo. Implementación pendiente de
línea base y turno pesado; esta aprobación no habilita otros archivos ni paquetes.

## Problema comprobado por lectura

La migración 0020 exige que los seis campos planos de agua sean nulos para categorías
distintas de Inundaciones. `ReportePublicoSchema` exige enums no nulos para profundidad,
frecuencia y causa; `ReporteTecnicoSchema` lo hereda. `ExportacionGeoJsonSchema` usa ese
feature técnico, y el panel valida el archivo con ese esquema antes de descargarlo.
Por tanto, el contrato rechaza una exportación que incluya reportes de otra categoría con
la representación que exige la base. El auditor independiente señaló este bloqueo de CA5.
No se ha reproducido contra una base real con otra categoría, ni se activará para probarlo.
El auditor reprodujo el rechazo con datos sintéticos mediante Node: 22 casos comparan el
esquema actual y dos variantes construidas solo en memoria. Evidencia ignorada:
`.turbo/m5-2026-10-15/repro-exportacion-evidencia.json`. Esto valida la propuesta, no acredita
todavía una implementación ni una prueba de descarga en el panel.

Referencias: `packages/contracts/src/esquemas/reporte.ts:299`,
`packages/contracts/src/esquemas/admin.ts:52`,
`packages/db/migraciones/0020_base_multicategoria.sql:189` y
`apps/panel-admin/src/lib/api.ts:299` (líneas anteriores a M5).

## Corrección mínima propuesta y límites

P3, carpeta designada `packages/contracts/`: adaptar únicamente la forma técnica usada por
la exportación a los datos multitemáticos ya enviados por el servidor. Mantener el feature
legado de Inundaciones válido y estricto; en otras categorías permitir los campos planos nulos
que exige la base, sin inventar valores de agua. Conservar validación de geometría, estados,
campos comunes, metadatos de exportación, totales y truncamiento. No quitar la validación del
panel ni reescribir el archivo descargado. Los esquemas generales de respuestas pública/técnica
no se amplían en esta corrección; su coherencia para categorías futuras se registra aparte.

Diseño contrastado: unión de la rama técnica actual intacta con una variante de exportación
que admite nulos en los tres enums y exige categoría explícita no vacía y distinta de
`inundacion`. La condición debe quedar representada en OpenAPI, además de validarse al ejecutar.
No exigir que toda exportación ajena traiga únicamente nulos: eso rechazaría payloads que
el contrato anterior aceptaba. No usar una ampliación global ni perder compatibilidad heredada.

Archivos autorizables concretos:

- `packages/contracts/src/esquemas/admin.ts`: esquema de exportación y tipo inferido.
- `packages/contracts/test/contrato-0-22.test.ts`: casos de representación por categoría,
  legado, inválidos y preservación de validación común.
- `packages/contracts/package.json`: versión menor 0.22.0 por cambio de contrato.
- `packages/contracts/CHANGELOG.md` y `packages/contracts/README.md`: alcance y compatibilidad.
- `packages/contracts/openapi/openapi.yaml`: regeneración por el build, sin edición manual.

El panel consume el contrato actualizado dentro de su carpeta ya aprobada. No se propone
cambio de backend, DB, rutas, permisos, datos ni categorías activas. Si el análisis descubre
que hacen falta otros archivos, detener esa ampliación y documentarlo antes de editar.

## Verificación y riesgo

Primero, preflight contracts y prueba que reproduzca el rechazo actual. Después, comprobar
que exportaciones de otra categoría con campos nulos se aceptan y que Inundaciones con campos
obligatorios nulos se siguen rechazando. Preservar pruebas actuales. Ejecutar contracts build,
regeneración estable de OpenAPI, suites/tipos de consumidores y prueba de descarga del panel
con archivo multitemático sintético, sin activar categorías en una base real. Único ejecutor
pesado y único escritor de contracts, antes de retomar las ediciones del panel.

Riesgo: ampliar inadvertidamente la validación de exportaciones de Inundaciones o alterar tipos
consumidos. Las ramas/casos por categoría y las pruebas de consumidores deben impedirlo. La
corrección no cambia los datos que el servidor exporta. M5 puede avanzar en los demás criterios
mientras se resuelve la autorización; CA5 completo no se declara aprobado con este rechazo.

La autorización específica deriva de AGENTS.md §5.2: «Para tocarlo hace falta autorización
explícita con archivo, motivo y riesgo». La aprobación general de M5 delimitó P2 y excluyó
cambios de contracts sin ampliación.
