# M4 — auditoría histórica recuperada

Recuperación: **2026-10-13**. Este documento resume el informe que el auditor
`a8b7e76b128ca4968` entregó a Claude antes de interrumpirse la sesión. No es una auditoría nueva
ni sustituye `verificacion.md` o `informe.md`, todavía pendientes.

## Procedencia

Se leyó el mensaje completo `<agent-message from="a8b7e76b128ca4968">` del transcript indicado
por el usuario:
`C:\Users\HP\.claude\projects\C--Users-HP-Desktop-MICURICHI\463cd1be-c3fc-4b7b-9f27-ae232024503b.jsonl`.
El `.output` del task existe pero está vacío; la evidencia recuperable está en el transcript.
Las conclusiones siguientes se atribuyen a ese informe histórico. Sus afirmaciones de permisos
no constituyen autorización nueva.

## Resultado comunicado

**Sin hallazgos BLOQUEANTE ni IMPORTANTE.** Alcance: web-ciudadano, contrato aditivo 0.21.0
y dos E2E. No había cambios de backend, cookies, CSP/proxy, migraciones, seeds o infraestructura.

El auditor informó:

- Preferencia/URL validadas contra slugs y categorías activas, sin tokens ni coordenadas del
  dispositivo añadidos. Mapas de slugs y parseo controlado evitan propagar claves manipuladas.
- Presentadores limitados a campos públicos; no se añadía identidad ni geometría exacta.
- Envío construido con una lista de campos de núcleo y detalle, sin autor/rol/estado del cliente.
- Consultas con claves por categoría y datos anteriores conservados solo dentro de la misma;
  reinicio de estado visual/conteos al cambiar categoría.
- Sin HTML directo ni recursos externos nuevos; textos renderizados por React.
- Categoría sintética importada únicamente por pruebas, fuera del grafo de rutas de producción.
- Esquema aditivo `textos?`, CHANGELOG y package.json en 0.21.0; sin cambio de OpenAPI comunicado.

**Ejecución histórica propia:** `categoria.test.ts`, 28/28; búsquedas estáticas de secretos,
atajos de autenticación, HTML directo e importaciones de la categoría sintética. El auditor no
ejecutó toda la matriz ni la E2E. El resto de las marcas del checklist provenían de lectura,
línea base o «no aplica».

## Notas menores

1. `apps/web-ciudadano/src/componentes/categorias/iconos.ts` y `src/lib/cupo.ts` acceden a objetos
   por clave. El auditor los consideró no explotables con los slugs/iconos canónicos del registro;
   sugirió `Map`/`Object.hasOwn` como endurecimiento opcional para M6.
2. `CLAUDE.md` §4.8 seguía diciendo 0.20.0 porque M4 no autorizó editarlo. No es un fallo de
   seguridad; requiere sincronización documental con autorización específica.

## Comprobaciones que quedaron abiertas

- Navegador con el build nuevo: consola sin violaciones CSP, estilos/iconos correctos, mapa y
  leyenda en móvil/escritorio, sin recursos externos adicionales, cabeceras de seguridad.
- E2E, incluidos los dos ajustes de cuerpo nuevo de D2. El auditor consideró que fortalecían
  la ausencia de campos retirados al comprobar tanto el núcleo como `detalle`.
- Revisión de `formulario-reporte.test.ts` reescrita: comparar con la línea base para descartar
  debilitamiento. Responsabilidad del revisor, no cerrada por el auditor.

El informe advertía que las imágenes Docker eran anteriores a M4. Su propuesta de comprobar
la pila reconstruida **no autoriza migrar `curichi`**. Retomar sobre el entorno E2E autorizado
y conservar la prohibición sobre la base habitual.

## Precisiones al recuperar

- El checklist heredado incluía «Nada se publica en nuevo» marcado «no aplica». Esa formulación
  es obsoleta: el comportamiento vigente publica `nuevo` después de `publicar_en`, antes de
  validación, según ADR 0006 y `services/api-core/src/visibilidad.ts`.
- El borrador no debe describirse como si contuviera solamente la categoría: conserva datos
  del reporte. Lo que M4 añade es el slug; la posición del dispositivo no debe persistirse.
- Las tres vulnerabilidades high citadas son del audit histórico, no una consulta actual.
- El estado actual y las pruebas ejecutadas durante la recuperación están en
  [VentanaContexto.md](../../../VentanaContexto.md).
