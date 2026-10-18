# Correcciones de cierre M4 — 2026-10-14

Implementadas por el principal bajo la excepción explícita del usuario después de que el
implementador y el verificador alcanzaran su límite. No hay commits, cambios de contrato,
migraciones ni activación de categorías. Referencia del diff: `09930a3`.

## Preflight y pruebas

El implementador dejó ocho pruebas nuevas de registro. Antes de editar producción, el principal
ejecutó `vitest run --maxWorkers=1` en web: **625 anteriores verdes, ocho nuevas rojas**,
46 archivos, exit 1, 27,79 s. No había otro proceso de tests/dev del proyecto activo.

| Ejecución en web | Resultado | Log ignorado en `.turbo/cierre-m4-2026-10-14/` |
|---|---|---|
| Preflight | 625 passed, 8 failed nuevos | `preflight-principal.log` |
| Casos declarativos coherentes, antes de corregir | 38 passed, 3 failed nuevos | `rojo-declarativo.log` |
| Registro y carreras de mapa, antes de corregir | Registro y helper nuevo fallan; primer borrador de pruebas tuvo errores corregidos abajo | `rojo-correcciones.log` |
| Suite tras formulario/registro/mapa | 47 files, **640 passed**, exit 0, 31,14 s | `verde-formulario-mapa.log` |
| Cupo/anuncio antes de corregir | 4 failed + componente de anuncio aún ausente; 46 passed | `rojo-cupo-anuncio.log` |
| Suite tras cupo/anuncio | 48 files, **642 passed**, exit 0, 34,72 s | `web-final.log` |
| `tsc --noEmit --incremental false` | Exit 0, sin diagnósticos | `web-tipos.log` |

Salidas de cierre de suite:

```text
Test Files  47 passed (47)
     Tests  640 passed (640)
  Duration  31.14s

Test Files  48 passed (48)
     Tests  642 passed (642)
  Duration  34.72s
```

Las ejecuciones usaron los binarios instalados, fuera del sandbox con aprobación. El aviso
Vite sobre ESM en `vitest.config.ts` ya estaba en el preflight. No se instalaron dependencias.

**Corrección del propio test, sin tocar producción:** el primer borrador usó una firma inexistente
de `normalizarReporteCrear` y supuso que valida el detalle. La lectura de contracts demuestra
que normaliza y valida el sobre. Se reemplazó por validaciones explícitas de sobre y
`DetalleInundacionSchema`/esquema sintético. Esos errores del test no se presentan como defectos
del producto. El almacenamiento falso también se corrigió a `sessionStorage`, el que usa la app.

## Resolución propuesta de la revisión H1–H8

| Hallazgo | Cambio y evidencia local |
|---|---|
| H1, cobertura de envío | Los casos normal/congelado y aproximado validan además `DetalleInundacionSchema`; aproximado conserva precisión/antigüedad y rechaza detalle vacío |
| H2, etiquetas tardías | Token de operación por mapa y fuente en WeakMap; invalidación al reiniciar, comprobación de fuente/URL al aplicar y reintento tras fallo. Promesas controladas prueban orden inverso A→B y limpieza→B |
| H3, registro especial | Resolución por `componenteEspecialPaso2`; ausencia usa declarativo, desconocido falla explícito y no busca propiedades heredadas. Reutilización conserva el slug efectivo |
| H4, subtipo/lugar | Opciones de subtipo con validación, revisión, borrador/envío; lugar desde definición, preservando elección explícita al cambiar. Borrador previo conserva su valor |
| H5, fixture | Esquema/severidad sintéticos coherentes con preguntas; prueba atraviesa resolver, cuerpo, revisión y almacenamiento. Fixture sigue fuera del grafo productivo |
| H6, cupo | Sin denominador supuesto, incluidos textos informativos y respaldo 429. Mensaje HTTP del servidor permanece intacto y conserva expectativa separada en E2E |
| H7, anuncio | Componente estable que monta vacío y actualiza mediante efecto. SSR probado; ciclo DOM en navegador pendiente; lector de pantalla real no verificado |
| H8, borrador | Se conserva representación compatible: inundación plana dentro de valores, declarativo en valores.detalle, categoría en formato 3. README lo precisa; no se migra almacenamiento |

El cambio de ubicación por defecto no solicita geolocalización ni escribe la posición del
dispositivo. El contador real, demora, fotos y permisos siguen bajo los mismos controles.

## Parte 5 autorizada

- `e2e/scripts/correr-local.mjs`: la consulta de existencia conecta a `postgres`, no a la base
  de usuario. `node --check` verde antes de editar. La preparación manual sigue siendo necesaria
  porque el archivo `.env` carece de API/GEO_DATABASE_URL; no se modifica.
- `e2e/tests/ayudas.ts`: textos visuales sin máximo supuesto y constante HTTP preservada.
- `e2e/tests/cuenta-ciudadana.spec.ts`: referencia separada para el 429 exacto. Se mantienen
  tres creaciones, cuarta rechazada, Retry-After y conteo posterior.

## Pendiente para cierre

Revisión independiente del diff corregido, verificación de consumidores/build/OpenAPI y
E2E G1/G2/G3/G5/recorrido-completo. Estos resultados locales no sustituyen F4a. El verificador
actual es dueño del turno pesado. El cierre no se declara hasta resolver bloqueantes.

## Segunda vuelta — 2026-10-15

La revisión independiente detectó dos brechas de integración (R1/R2). Antes de corregirlas:

- `registro.test.ts`: **una roja nueva**, el resolver aceptaba una frecuencia que la definición
  efectiva restringía. Los ocho casos anteriores del registro seguían verdes.
- `Mapa-conteos.test.ts`: **dos rojas nuevas**, el llamador real no solicitaba una fusión cuando
  la URL de geometría era idéntica. Primer mock incompleto de MapLibre se corrigió antes de
  reproducir el defecto; no se presenta ese error del mock como fallo productivo.

Correcciones: `aplicarCapas` llama también al fusionador con fuente idéntica; el helper deduplica
la serie y elimina escrituras tardías. La reutilización de un adaptador con otro slug valida
además `def.esquemaDetalle` y localiza sus errores en controles planos o en detalle. La prueba
atraviesa resolver, envío y severidad efectiva. Se exportan las dos funciones de coordinación
del mapa para probar la integración con mapa falso, sin modificar el API HTTP.

Después: **49 archivos / 645 pruebas**, exit 0, 25,19 s; tipos y build de web exit 0. Logs:
`rojo-integracion-vuelta2.log`, `rojo-mapa-integracion.log`, `web-vuelta2.log`,
`web-tipos-vuelta2.log` y `web-build-vuelta2.log`. Biome de web/E2E sin diagnósticos.
No se repiten suites de servicios no modificados tras esta vuelta.

La revisión final focal de R1/R2 está en `revision-correcciones.md`. R3 exige comprobación DOM
del aviso en Chromium; su prueba SSR no se confunde con lector de pantalla real.
