# Informe M4 — mapa y formulario por categoría

**CERRADA Y VERIFICADA EN LOCAL el 2026-10-15**, con los rojos ajenos conocidos y una
intermitencia de cámara registrados abajo. Puerta de commit omitida por instrucción expresa:
sin nuevos commits ni push. Este cierre no certifica un despliegue de producción.

- Corrida: `2026-10-10-mapa-y-formulario-por-categoria`; rama `codex/cierre-m4`.
- Partes: P1 web, P3 contrato aditivo 0.21 ya implementado, P5 E2E/documentación autorizadas.
- Banderas: base, UI, contrato, privacidad y API como consumidor.
- Foto histórica: `refs/sdd/mapa-y-formulario-por-categoria` = `48b1e40`.
- Respaldo del árbol importado: `09930a3`, conservado. No reemplaza la foto anterior a M4.
- Dos vueltas de corrección; principal autorizado a implementar/probar tras límites de agentes.
- Revisión independiente: `revision-cierre.md` y `revision-correcciones.md`.
- Verificación detallada: `verificacion-ejecucion.md`; rojo→verde: `correcciones-cierre.md`.

## Qué entrega

La web resuelve la categoría antes de pedir puntos, conserva la preferencia del dispositivo y
normaliza la URL. El mapa sustituye datos por categoría, reinicia filtros propios y limpia selección
conservando la zona; las etiquetas descartan respuestas tardías. El formulario mantiene cuatro
pasos y obtiene lo específico del registro especial o de las preguntas declarativas.

El formulario declarativo valida detalle/subtipo y usa el tipo de lugar definido; conserva la
elección explícita al cambiar. Reutilizar un componente especial valida la definición efectiva.
El borrador conserva categoría y compatibilidad anterior. El cupo visual muestra restantes del
servidor sin suponer el máximo. La región viva monta vacía antes del aviso. No se activan Baches,
Basura ni Áreas verdes; el cambio de dos categorías reales en navegador corresponde a M6.

## Regresión y evidencia

| Control | Antes | Después |
|---|---|---|
| Equivalencia semántica de formulario/borrador | Revisor encontró H1 de cobertura | H1 corregido añadiendo validación explícita del detalle, sin retirar aserciones |
| Suite web al retomar | 625 aprobadas | **645 aprobadas**, 49 archivos; 20 casos nuevos |
| Suites consumidores | Verdes, 12 omisiones conocidas | **2228 aprobadas + 12 omitidas**, combinando matriz y vuelta final web |
| Tipos consumidores | Verde | **9/9**, y web repetida tras vuelta 2 |
| Builds consumidores | Verde | **7/7**, y web reconstruida tras vuelta 2 |
| OpenAPI | Hash anterior guardado | Regenerado idéntico |
| Biome | 1 error + 6 avisos ajenos aceptados | Mismos diagnósticos; web/E2E sin diagnósticos |
| Secretos, incluidos nuevos | Sin hallazgos histórico | Sin hallazgos actual |
| Privilegios PostgreSQL real | Verde sobre E2E | Verde sobre `curichi_e2e`, ambos roles restringidos |
| E2E autorizada | 159 aprobadas + 1 omitida | **159 culminan aprobadas + 1 omitida**, una cámara móvil necesitó retry; aislada luego 2/2 sin retries |
| CSP adicional de producción | Cinco rojas por sonda Zod | **Cinco verdes** tras corrección aprobada; G5 producción **18/18**, recorrido posterior **5/5**, sin retries |
| Dependencias | Tres high históricas aceptadas | Mismas tres high, 0 críticas; sin actualizar dependencias |

Se distinguen tareas de caché de Turbo (paquetes sin cambios) de la ejecución nueva de web.
Los contadores no sustituyen la revisión de aserciones. No hay regresiones demostradas en los
controles comparables completados. La corrección adicional de CSP también quedó verificada.

## Criterios

| CA | Evidencia / estado |
|---|---|
| CA1 contrato aditivo | Contracts 303 pruebas; consumidores, build y OpenAPI idéntico |
| CA2 configuración/activas | Pruebas de lector/proveedor y filtro contra registro; API E2E G1 |
| CA3 preferencia y URL | Pruebas de resolver/almacenamiento/alias; sin preferencias de cuenta |
| CA4 mapa por categoría | Claves, filtros y datos aislados; integración real del llamador y promesas invertidas, R1 resuelto por revisión; G2 verde |
| CA5 formulario/borrador/cupo | Adaptadores, fixture coherente, validación completa, subtipos, tipo de lugar, borrador y expectativas UI/API; R2 revisado, G3 y DOM aprobados |
| CA6 navegador | G1/G2/G3/G5/recorrido completados; G5 y recorrido repetidos en producción tras corregir CSP; una intermitencia inicial registrada. Cambio entre dos reales diferido a M6 por D3 |
| CA7 documentación | README web y documentos de corrida actualizados; manuales protegidos se conservan |

## Hallazgos y alcance

H1–H6 resueltos por lectura y pruebas; H8 documenta el formato compatible del borrador (inundación
plana en valores, declarativo en valores.detalle). La revisión focal no detectó nuevos bloqueantes
en R1/R2. H7/R3 acreditado mediante prueba DOM sobre el componente real en Chromium; lector
de pantalla real no se atribuye a esa prueba.

Ampliaciones explícitamente autorizadas: runner consulta catálogo desde `postgres`; mensajes UI
en `ayudas.ts` y expectativa HTTP separada en `cuenta-ciudadana.spec.ts`. Se mantienen tres
envíos, cuarto 429 y concurrencia. No se edita `.env`, servicios, esquema, infra ni manuales protegidos.
Cambios documentales de auditoría previa se declaran ajenos a la implementación M4.

## Entorno, límites y cierre operativo

La ventana usa solo `curichi_e2e`, con roles restringidos, fotos sintéticas en temporal y URLs
derivadas en memoria. No accede a `curichi`/`curichi_revision`, no migra ni resiembra.
Next dev no dejó suficiente RAM; se usa Next start de los builds nuevos, con producción solo
en las apps y desarrollo de prueba en servicios. Config temporal sin autoarranque conserva
proyectos, workers 1, retries 1 y Chromium completo. Los intentos previos por RAM/config no
ejecutaron pruebas y están registrados en la verificación.

Los coordinadores cerraron todos sus árboles propios y comprobaron puertos libres. PostGIS y
MinIO siguen sanos; evidencia en `pila-cierre-2026-10-15.txt`.
No se reconstruyen imágenes habituales ni se prueba túnel. La imagen local previa no acredita
el código nuevo. Despliegue, lector de pantalla real y cambio entre categorías reales no verificados.

La comprobación adicional con producción detectó cinco eventos CSP por la sonda `Function("")`
de Zod, también en el panel sin cambios. El usuario aprobó únicamente dos entradas de arranque
cliente con `jitless:true`; no se relaja CSP ni se cambian expectativas. La corrida separada
`../2026-10-15-csp-zod/` conserva su plan, baseline, implementación, revisión y verificación.
Resultado final: **G5 18/18 y recorrido 5/5 en producción**, sin reintentos. G1–G3 preceden a ese
ajuste aislado de arranque; no se afirma haber repetido todos los grupos después del ajuste.

## Hallazgos ajenos conservados

Control de integridad final: 818 archivos iniciales contrastados, 27 modificados dentro del
alcance autorizado, ninguno ausente ni cambio fuera del alcance. Enlaces locales de los 22
Markdown modificados/nuevos comprobados, sin destinos ausentes; `git diff --check` sin errores.

Biome: `ContextosySkills/hooks/contexto.mjs` (formato y cinco avisos de variables) y
`docs/dominio/infografia-plataformas-riesgo.html` (especificidad CSS). Manuales AGENTS/CLAUDE
siguen indicando contracts 0.20 aunque el código es 0.21; su edición no está autorizada en M4.
El checklist de seguridad aún contiene «Nada se publica en nuevo», superado por ADR 0006;
se aplica publicación diferida con «NO SE HA VERIFICADO». No se modifica de pasada.

## Reversión y siguiente paso

No hubo migraciones ni reemplazo de imágenes. Para revertir código, conservar primero el diff
y los nuevos archivos, revisar `archivos.txt` y restaurar únicamente cambios de esta corrida
con autorización del usuario. No restaurar indiscriminadamente la foto incompleta ni usar reset,
clean o checkout destructivo. Se conserva el respaldo remoto solicitado.

Después de cerrar estas verificaciones: aprobar el plan de M5 para el panel por categoría.
Su implementación no forma parte de M4. Los campos/severidades de nuevas categorías y la
puerta de privacidad de Áreas verdes se mantienen en las decisiones futuras del roadmap.

## Plantilla de PR preparada — sin crear PR ni commit

- **Parte/carpeta:** P1 `apps/web-ciudadano/`, contrato aditivo previo P3 y ajustes P5 explícitos.
  El arreglo cliente P1/P2 de CSP se registra en su corrida separada.
- **Qué cambia:** resolución/cambio de categoría en mapa y formulario, validación y borrador,
  conteos sin respuestas antiguas, textos de cupo correctos y aviso accesible estable.
- **Cómo verificar:** comandos y resultados exactos en `verificacion-ejecucion.md`; para
  repetir, usar binarios instalados, turnos únicos y base E2E aislada. No reconstruir la pila
  habitual ni usar el runner con `.env` incompleto como si fuera un permiso de migración.
- **Contrato:** sí, 0.21.0 aditivo de la implementación anterior; OpenAPI idéntico al regenerar.
- **DoD:** tipos/builds/tests y camino crítico verificados; README actualizado, sin nuevas
  variables ni secretos; sintéticos fuera de producción; alcances autorizados y revisión
  independiente completada. Lint/audit globales conservan sus rojos ajenos aceptados.
- **Seguridad:** permisos, publicación diferida y privacidad preservados; checklist histórico
  sobre estado nuevo contradice ADR 0006 y se aplica la decisión vigente, registrada arriba.
