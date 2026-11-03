# Ampliación necesaria — entradas locales y verificador de permisos

**APROBADA el29/10/2026:** «Autorizar los cuatro ajustes», respuesta humana a
`call_f8747937ff1644a885382715293bcd8d`. Los cuatro archivos se incorporan a las92rutas
del plan aprobado (96en total). La inspección de Hume y el
contraste del principal detectaron dependencias concretas de la guarda general0022.
El código aprobado y los baselines pueden continuar en su ámbito mientras se decide.

## Cuatro archivos adicionales exactos

| Parte/archivo | Motivo y cambio acotado | Riesgo y verificación |
|---|---|---|
| P4 `packages/db/test/migracion-0012-foto-subido-por.test.ts` | En:52 se migra sin límite desde0011 hasta latest; debe transmitir el consentimiento explícito a0022 en esa fixture sintética. Mantener la prueba actual de todas las posteriores y las filas de foto/usuario. | No fijar a21 ni quitar aserciones para ocultar incompatibilidad. Conservar nombres/filas/matchers, probar todo el archivo y contraste de versiones. La negativa de versión anterior se mantiene. |
| P4 `packages/db/src/local/opciones.ts` | En:29 el arranque local llama al runner sin opción. Admitir la misma bandera CLI explícita de0022 y pasar `autorizarContraccionCompatible`; no activarla por defecto ni mediante variable persistente. | Confundir el consentimiento de0015 con el nuevo autorizaría una contracción sin intención. Probar independencia de ambas banderas en `servidor-local.test.ts` ya autorizado: sin la nueva rechaza antes de mutar; con ella, los negativos0015 siguen comprobándose. No se arranca la base local real. |
| P4 `packages/db/src/cli/verificar-privilegios.mjs` | El CLI solo recorre esquemas public/geo (:49,:56,:106) y no comprobaría el archivo restringido. Extender propietarios/tablas/permisos y CREATE/USAGE para `resguardo_m10`; mantener mínimos anteriores. Permitir comprobación inyectada sin conectar al importar, conservando el comportamiento CLI. | No aceptar privilegios sobrantes en el archivo ni elevar roles. Pruebas con pool simulado/fixtures dentro de `matriz-privilegios.test.ts` ya autorizado, negativos de owner/tabla/USAGE/CREATE y no conexión por importación. No ejecutar el CLI contra PostgreSQL real ni leer una URL real. |
| P3 `services/api-core/test/fotos-cuota-concurrencia-pg.test.ts` | En:66 se llama directamente al runner en su banco de pruebas; transmitir consentimiento explícito para su fixture. Mantener guardas/nombres y pruebas de concurrencia/cupo/fotos. | No autoriza PostgreSQL real ni crear bases, no convierte SKIP histórico en PASS y no debilita límites/concurrencia. Tipos/control estático y suite API hermética con las mismas omisiones; cualquier ejecución real requiere otro protocolo. |

El helper efímero común y los otros consumidores ya estaban en el inventario aprobado.
`scripts/medir-cuatro-categorias.mjs` histórico queda congelado como herramienta M9: no
se ejecuta ni se modifica para hacerlo compatible con una operación nueva. Sus bancos
y cápsulas conservan su significado y sus hashes. No se corrige una dependencia ajena
sin autorización ni se retiran guardas para evitar esta ampliación.

## Control de alcance y aceptación

Capturar las cuatro preimágenes y sus SHA antes de editar, como anexo al F0 existente;
no sobrescribir el manifiesto inicial. Baselines DB/API en curso cubren estos archivos.
Un escritor por carpeta, heavy en serie, revisión/verificación independientes y mismos
límites de aislamiento del [protocolo](protocolo-verificacion.md).

El plan pasa de92a96rutas por la aprobación explícita de este anexo. Los tests de soporte
mencionados ya están autorizados; si aparece necesidad de otro archivo, se informa con
motivo/riesgo antes de tocarlo. La aprobación no amplía permisos de bases/operaciones,
secretos, sistema, instalaciones, Git ni despliegue. Web prevista `micurichi.lat`,
preparación local para subir después.
