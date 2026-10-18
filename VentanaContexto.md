# VentanaContexto — continuidad de Mi Curichi

Actualizado: **2026-10-18**. Punto de entrada para retomar en GPT Astra/Codex.
Este archivo responde al pedido explícito de continuidad del usuario. Sustituye los estados
temporales obsoletos, pero conserva los documentos y snapshots históricos como evidencia.

## A. Estado general del proyecto

**Objetivo.** Plataforma municipal de reportes ciudadanos georreferenciados para Santa Cruz
de la Sierra: Inundaciones, Baches, Áreas verdes y Basura, con un núcleo común. Es un inventario
de percepción ciudadana, no una medición ni un modelo hidráulico o de inversión.

**Estado confirmado por archivos y pruebas locales:** Inundaciones es la única definición real
registrada en `packages/contracts/src/categorias/`. La migración 0020 siembra las otras tres
categorías inactivas. Las comprobaciones de ejecución se limitaron a `curichi_e2e`; no se
consultó la activación de las bases habituales.
M0–M5 tienen cierre local documentado. El usuario aprobó M5 el 2026-10-15;
implementación, revisiones y F4 terminaron con 132/132 E2E, sin regresiones abiertas.
Cierre documental consolidado el 2026-10-17; ver informe M5 y controles finales.
M6–M10 siguen pendientes.
No se ha comprobado un despliegue público.

| Parte | Directorios | Responsabilidad y funcionamiento existente |
|---|---|---|
| 1 | `apps/web-ciudadano/` | Next.js, mapa público, detalle, cuenta, formulario de cuatro pasos, cámara, borrador y PWA. M4 incorpora categoría, preferencia y formulario adaptable. |
| 2 | `apps/panel-admin/` | Bandeja y mapa, validación/rechazo/fusión/reclasificación, exportación CSV/GeoJSON, indicadores, ejecutivo, usuarios y capas. La interfaz multitemática corresponde a M5. |
| 3 | `services/api-core/` | Fastify, único escritor de reportes; sesión/roles, validación, severidad, cupos, publicación diferida, fotos, idempotencia y auditoría. |
| Transversal | `packages/contracts/` | Zod, tipos, dominio, registro de categorías y OpenAPI. Versión real **0.22.0**, ampliación de exportación M5.0 aceptada localmente. |
| 4 | `packages/db/`, `services/geo-service/` | Migraciones/Drizzle, PostGIS, PIP, capas/teselas, agregados y puntos críticos por categoría. Geo-service es de lectura. Última migración en el repositorio: **0021**. |
| 5 | `pipelines/geodata-etl/`, `infra/`, `e2e/`, `scripts/`, `.github/`, `docs/` | ETL de shapefiles, Compose/Caddy, operación, pruebas y CI. Los datos originales no se modifican. |

**Flujo funcional.** El mapa público no exige cuenta. Para reportar se inicia sesión, se pide
ubicación dentro del flujo, se elige el punto y se completan los datos; la foto de cámara es
opcional. El servidor comprueba ubicación y cupo, calcula severidad y distrito/UV por PIP.
Tras la demora se publica como «NO SE HA VERIFICADO»; luego el técnico valida, rechaza,
fusiona o reclasifica. La ubicación pública se degrada cuando corresponde y no incluye al autor.
El ejecutivo consulta indicadores y mapa sin moderar ni exportar.

**Tecnologías verificadas en manifiestos/instalación local** (no son una recomendación de
versiones ni una comprobación de servicios desplegados): Node 24.15.0, pnpm 12.4.1,
Turborepo 2.10.12, TypeScript 5.9.3, Next.js 16.3.6, React 19.3.0,
MapLibre 6.9.0, TanStack Query 5.102.8, React Hook Form 7.88.0,
Tailwind 4.3.3, Lucide 1.45.0, Fastify 5.12.4, Zod 4.6.4,
Drizzle 0.45.2, Sharp 0.35.4, mapshaper 0.7.61 y Turf 7.4.0.
Compose declara PostgreSQL 18/PostGIS 3.6. Pruebas: Vitest 4.1.11,
Playwright 1.63.0 y Biome 2.5.13. Fotos en disco o almacenamiento S3 compatible.

**Git.** Respaldo solicitado por el usuario, ya creado y subido:

- Rama local y remota: `respaldo-claude`.
- Rama actual: `interfaz-prueba`, creada el 18/10 desde `codex/panel-por-categoria` para
  la publicación solicitada. Las ramas de M4/M5 y el respaldo se conservan.
- Commit de respaldo/base anterior a esta publicación: `09930a381c41d918d263c2b11a573f838835dcc0`.
  El commit actual de la rama se consulta con `git log -1`; no confundirlo con esa base.
- Remoto: `https://github.com/paltaunkwnow/MICURICHI.git`.
- El SHA remoto se comprobó tras el push; el respaldo contiene 818 archivos versionados.
- El respaldo no incluye `.env`, dependencias, datos ignorados ni bases de datos.
- **Autorización nueva y puntual del 18/10:** el usuario pidió subir todos los archivos
  cambiados/modificados a una rama nueva y crear PR. «interfaz prueba» se normaliza a
  `interfaz-prueba` porque Git no admite espacios. Autoriza commit/push de este estado y PR
  hacia `main`, sin merge ni despliegue. Se mantienen excluidos secretos/datos/dependencias
  y artefactos ignorados. La confirmación remota y el enlace del PR se entregan en la respuesta.
- El árbol estaba limpio al iniciar la auditoría del 13/10; sus cambios fueron documentación.
  La continuación de M4 se detalla en C. Los cambios posteriores a `09930a3` son precisamente
  los que se consolidan en la publicación autorizada del 18/10; comprobar la rama remota/PR.

**Tarea activa del 18/10:** publicación del estado local en `interfaz-prueba` y apertura de PR.
La preparación M6 del 17/10 fue solo lectura de roadmap, prototipo y contratos; sus dos
subagentes de diagnóstico terminaron por límite de uso, sin informes entregados ni cambios
funcionales. No existe aún un plan M6 aprobado ni definición real de Baches. Tras publicar,
retomar esa preparación y sus decisiones; no presentar M6 como implementada.

## B. Trabajo completado y evidencia

### Desarrollo anterior, contrastado con el árbol

| Hito | Trabajo que ya existe | Evidencia principal |
|---|---|---|
| M0 | Ampliación de misión, arquitectura y decisiones aprobadas | ADR 0008–0023; `docs/arquitectura/14-decisiones-m0-y-plan-m1.md` |
| M1 | Registro de categorías, slugs, política y resolución inicial | `docs/sdd/2026-10-07-registro-de-categorias/informe.md` |
| M2 | Modelo híbrido, catálogo, tabla `reporte`, vista de compatibilidad y reversas | `docs/sdd/2026-10-08-base-multicategoria/informe.md` |
| M3a | Lecturas y puntos críticos por categoría; índice 0021 | `docs/sdd/2026-10-08-nucleo-por-categoria/informe.md` |
| M3b | Escrituras, cupo atómico por categoría, fotos globales, fusión y auditoría | `docs/sdd/2026-10-09-cupo-por-categoria/informe.md` |
| M4 | Contrato 0.21, mapa/preferencia/URL, adaptadores de formulario, borrador 3, dos ajustes E2E y README | `docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/informe.md`; **cerrada localmente 2026-10-15** |
| M5 | Contrato 0.22, panel por categoría, exportación/detalle/ficha/indicadores/ejecutivo y corrección E2E de enlace autorizada | `docs/sdd/2026-10-15-panel-por-categoria/informe.md`; 551/52 panel y 132/132 E2E, cierre documental 2026-10-17 |

M2 ya midió **1.000.000 de reportes en total, 250.000 por categoría**, en una base efímera.
La medición motivó el índice parcial `(categoria, creado_en DESC)` de la 0021. No repetir el
experimento como si nunca hubiera ocurrido: consultar `medicion.md` de M2.

M3b registra históricamente contracts 292, db 294, api-core 436 + 12 omitidas, geo-service 71,
web 486, panel 458 y ETL 21 pruebas; también PostgreSQL real y E2E 87/87.
Son resultados de esa corrida, **no una ejecución nueva del árbol completo**.
La línea base de M4 registra E2E **159 aprobadas y una omitida**, combinando evidencia previa
y su continuación. No demuestra que la implementación posterior de M4 haya pasado E2E.

### Auditoría de continuidad del 2026-10-13

Se inventariaron los 818 archivos versionados, incluidos 161 Markdown antes de este cambio.
Se leyeron los manuales y documentos de continuidad, decisiones, planes e informes relevantes,
configuraciones y código de los flujos afectados. No se afirma haber leído cada archivo del
repositorio íntegramente. Se contrastaron especialmente registro, visibilidad, cupo, formulario,
mapa, panel ejecutivo, migraciones y operación.

| Comprobación ejecutada hoy | Comando y directorio | Resultado |
|---|---|---|
| Contracts | `./node_modules/.bin/vitest.cmd run --maxWorkers=1`, en `packages/contracts` | **20 archivos / 303 pruebas**, exit 0 |
| Web | `./node_modules/.bin/vitest.cmd run --maxWorkers=1`, en `apps/web-ciudadano` | **45 archivos / 625 pruebas**, exit 0 |
| Tipos de contracts | `./node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`, en contracts | Exit 0 |
| Tipos de web | `./node_modules/.bin/tsc.cmd --noEmit --incremental false`, en web | Exit 0 fuera del sandbox |
| Lint global | `./node_modules/.bin/biome.cmd check . --reporter=summary`, en raíz | Exit 1: un error de formato y seis advertencias preexistentes, detallados en G |

Incidencias del entorno: el primer Vitest de contracts dentro del sandbox terminó con `EPERM`
al renombrar su caché, sin ejecutar pruebas. El typecheck de web dentro del sandbox dio errores
de resolución de tipos de dependencias. Repetidos fuera del sandbox, con aprobación, pasaron
sin modificar código ni instalar nada. No se ha aislado la causa interna del sandbox.
Vitest de web avisa además sobre sintaxis ESM en `vitest.config.ts`; no impidió las pruebas.

No se repitieron hoy builds, OpenAPI, pruebas de backend/DB, E2E ni auditoría de dependencias.
Las comprobaciones anteriores no sustituyen F4a ni certifican producción.

Al terminar los documentos: `git diff --check` sin errores; enlaces Markdown locales de los
cinco documentos modificados/creados comprobados, sin destinos ausentes; secciones A–G presentes.
El escáner del repositorio dio **sin hallazgos**, incluyendo los nuevos archivos sin seguimiento
mediante una adaptación solo en memoria de la selección de archivos y con salida de valores
redactada. No se modificó el script. El estado Git confirma cambios únicamente en Markdown.

**Documentos creados:** este archivo y el resumen de auditoría M4 recuperada del transcript,
`docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/auditoria-recuperada.md`.
**Documentos actualizados:** `README.md`, `docs/README.md`, `ContextosySkills/README.md`.
Se corrigen descripción/estado/cupos y se enlaza el nuevo punto de continuidad.
No se editaron funcionalidades, contratos, migraciones, configuración ni manuales protegidos;
no se eliminaron archivos.

## C. Último punto confirmado — M5 cerrada en local, consolidación 2026-10-17

**Implementación M5.0–5.5, revisiones independientes y verificación funcional terminadas.**
El control final de secretos/diff pasó el 17/10 y se registra en `verificacion.md`:
sin hallazgos, 20 candidatos revisados (19 documentales y un fixture), diff exit 0;
cotejo actual 150 P2/6 P3/34 E2E idénticos al estado probado.
No repetir implementación, línea base ni grupos E2E ya completos.

Plan aprobado: `docs/sdd/2026-10-15-panel-por-categoria/plan.md`.
Informe y comandos: `informe.md`, `verificacion.md`; decisiones/correcciones en
`implementacion.md` y `revision.md` de esa corrida. Rama `codex/panel-por-categoria`,
HEAD `09930a3`; sin nuevos commits/push. Los cambios de M4/CSP se preservan.

**Resultado funcional.** Disponibilidad y selector compartidos; una categoría oculta el
selector y cero explícito impide consultas/datos residuales. URL y retorno conservan categoría
más zona/filtros comunes; cambios reinician filtros propios, página, selección y pestaña
sin mover centro/zoom. Bandeja, mapas, conteos, exportación, detalle/ficha, indicadores y
fusión respetan el ámbito. «Todas» incluye historial técnico inactivo; el mapa ejecutivo
compone solo ubicaciones públicas de categorías disponibles y declara muestra/parcialidad.
No se comparan puntajes de modelos diferentes ni se cambia la severidad de negocio.

**Alcance propio:** 53 rutas P2 en `apps/panel-admin/`, seis P3 de contracts 0.22.0
aprobadas en `ampliacion-exportacion.md` y un archivo P5 autorizado por separado:
`e2e/tests/panel-mapa-reactivo.spec.ts`. Lista completa, incluidos documentos, en
`archivos.txt`. No hay permisos para otras fuentes, nuevas specs E2E, backend/infra,
activaciones, despliegue, instalaciones o manuales protegidos. El principal coordinó/documentó;
los subagentes implementaron y verificaron. La excepción de programación directa fue solo M4.

| Control final | Resultado confirmado |
|---|---|
| Panel | 551 pruebas / 52 archivos; escritor y caché válida del grafo independiente |
| Consumidores sin suite completa DB | 2087 aprobadas + 12 omitidas conocidas; 8/8 tareas, cinco de caché |
| DB geoespacial dirigido | 20/3, ejecución nueva; no se repitieron todas las migraciones |
| Tipos de consumidores | 9/9 tareas, ocho de caché; grafo normal con dependencias |
| OpenAPI/builds | 0.22.0 regenerado idéntico; panel/web aprobados |
| Biome P2/E2E | Sin diagnósticos; E2E tipos y Biome antes/después del ajuste |
| CA11 DOM real | 12/12, escritorio/móvil, Chromium; lector auditivo no verificado |
| E2E producción aislada | G1 47, G4 43, G5 18 y fronteras 24: **132/132**, sin retries usados/flaky/skips en resultados vigentes |
| Comparación E2E | Mismos 132 nombres/proyecto que FB; ningún caso perdido; CA10 oculto pasó primer intento |
| Integridad | 150 P2 y seis P3 congelados iguales; entre 34 E2E solo delta autorizado |
| Limpieza | Cero residuos propios/pesados; puertos 3000/3001/3002/3100 libres; PostGIS/MinIO healthy |

**Rojo de enlace resuelto con autorización.** G4 original dio 42/43: el popup abría, pero
la expectativa antigua rechazaba los parámetros `categoria`/`volver` requeridos por CA2.
El usuario aprobó «Sí, ajustar y verificar esa expectativa», con archivo/motivo/riesgo en
`ampliacion-e2e-mapa.md`. Sagan reprodujo el rojo, cambió únicamente ese bloque por
validaciones exactas de origen/ID/categoría/retorno/UV y pasó focal 1/1 y tipos/Biome.
Tarjeta visible, fila resaltada, UV y demás casos permanecen intactos. Cicero revisó el patch
conforme y repitió **G4 completo 43/43**, conservando los intentos rojos, sin rebuild de producto.
Fuente final E2E SHA: `90390a7e5217dda2171d03425232fa9ce3dd54d01da45699dc6c128b7a8b7da1`.

**Evidencia ignorada preservada:** `.turbo/m5-2026-10-15/arbol-antes.json` guarda los
842 hashes originales y `inicial/` sus copias. Fuente congelada:
`m5-5-inventario-final-1792170440552.json` (150 entradas P2, 53 propias).
Revisión Newton `revision-final-m5.md` y auditoría Feynman `auditoria-final-cierre.md`:
CONFORMES. F4 Cicero en `f4/verificacion-retoma.md`; comparación definitiva
`f4/e2e-comparacion-post-expectativa.json`, hashes `integridad-150p2-6p3-post-g4-final.json`,
limpieza `g4-post-limpieza-final.json` y `g4-post-docker-final.log`.
Entrega del escritor P5 en `f4/correccion-enlace/entrega.md`, con logs antes/después.
DOM en `.turbo/f4/ca11/ejecuciones/2026-10-17T01-00-37-182Z-ddc47492/`.
El grafo inicial interrumpido por timeout del arnés y el fallo de resolución ESM del arnés
DOM se preservan como intentos incompletos; sus continuaciones pasaron sin cambiar producto.

**Rojo ajeno y límites.** Lint conserva un error/seis avisos; audit conserva tres high,
diez moderate/una low, ninguna crítica. Doce omisiones PG real/S3 no son PASS. No se
certifican dos categorías reales ni lectura auditiva ni imágenes habituales Docker/Caddy.
`contracts` 0.22.0 amplía exportación; los esquemas generales público/técnico siguen con
validación anterior y deben reevaluarse al planear datos reales de Baches. Solo Inundaciones
está registrada realmente; no activar otra por haber terminado el panel.

**Operación.** E2E solo `curichi_e2e` existente, migración 0021 comprobada en lectura,
sin migraciones/seeds, roles restringidos y fotos sintéticas de
`.turbo/cierre-m4-2026-10-14/fotos-e2e`. Chromium físico existente con `channel: chromium`
y variable únicamente de proceso. No se tocó `curichi`/`curichi_revision`, `.env`, imágenes
habituales, volúmenes ni túneles. RAM medida: 1500 MiB estáticos/2500 MiB navegador;
un pesado y un worker. Limpieza por identidad/fecha de procesos propios, sin matar Node ajenos;
`HPMediaNetwork.exe` anterior se excluyó como ajeno. La incidencia de sincronización automática
pnpm al principio de M5.0 se declara en implementación; el lockfile quedó intacto y las
corridas posteriores usaron `--config.verify-deps-before-run=false`.

**Responsables al cerrar:** Cicero `01a14755-65a7-7c91-8f44-bbe834a708ed` completó el
G4 posterior y sus comprobaciones físicas, pero ya no existe tras el corte. Boole
`01a149be-a1e8-7312-9d9d-55fb0d52b057` completó secretos/candidatos/diff y cotejo actual,
sin repetir suites/E2E; entrega en `f4/cierre-documental-2026-10-17/entrega.md`.
Su dictamen es **CONFORME** en ese alcance y liberó el turno; no quedan tareas de M5
pendientes de un agente. El scanner conserva sus límites; ver `verificacion.md`.
Sagan y Feynman finalizaron y se cerraron. Godel liberó su fuente P2 al entregar.
No asumir agentes activos después de un corte:
consultar los archivos físicos. El siguiente trabajo es preparar M6; no iniciar código sin plan
aprobado ni reabrir Q1–Q3 de M5.

### Antecedente terminado: cierre de M4

**M4 cerrada y verificada en local.** Leer primero el informe de
`docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/informe.md` y
`verificacion-ejecucion.md`. Al cerrar M4 Git estaba en `codex/cierre-m4`, HEAD `09930a3`;
no se hicieron nuevos commits/push. La foto anterior a M4 y los hashes iniciales se conservan.

El usuario autorizó que el principal implementara/probara tras los límites de los agentes.
También autorizó runner (consulta desde postgres), textos de ayudas E2E y expectativa HTTP
separada de cuenta-ciudadana. Se corrigieron H1–H7 en dos vueltas y se documentó H8:
validación completa del detalle en pruebas, registro especial por identificador, subtipos/lugar
por defecto, fixture coherente, carrera de etiquetas incluida su integración real, cupo sin
máximo supuesto y región viva estable. No se activaron categorías nuevas.

**Resultados confirmados:**

- Web **645 pruebas / 49 archivos**. Panel **458 / 40**. Suites combinadas de consumidores
  **2228 aprobadas + 12 omitidas conocidas**, identificando caché de Turbo donde corresponde.
- Tipos consumidores 9/9 y builds 7/7; web/panel repetidos tras los cambios finales.
- OpenAPI regenerado idéntico; Biome web/E2E sin diagnósticos. Global conserva un error y
  seis avisos ajenos. Escáner incluidos archivos nuevos sin hallazgos.
- E2E G1 47, G2 31, G3 57 estables + una aprobada tras retry y una omitida, G5 18 y recorrido 5:
  **159 culminan aprobadas + 1 omitida**. Cámara móvil intermitente en primer intento;
  aislada después, sin retries, 2/2. No afirmar cero intermitentes en toda la corrida.
- R3 DOM PASS en Chromium con componente real: mismo nodo vacío→aviso→cambio→limpieza;
  al montar con aviso previo también comienza vacío. Lector de pantalla real no verificado.

**Corrección adicional Zod/CSP aprobada y terminada:**
`docs/sdd/2026-10-15-csp-zod/`. Los builds de producción detectaron cinco eventos eval de la
sonda capturada de Zod, también en el panel intacto. Se crearon solamente
`apps/{web-ciudadano,panel-admin}/src/instrumentation-client.ts`, con
`z.config({ jitless: true })`, sin bajar CSP. Implementador distinto corrió preflight/post
suites, tipos y builds; revisión independiente sin bloqueantes. Después el principal repitió
**G5 producción 18/18 y recorrido producción 5/5**, ambos sin reintentos. G1–G3 anteceden a este
ajuste; no se afirma una segunda ejecución de todos los grupos. Riesgo de rendimiento de
validación cliente sin benchmark específico; backend intacto.

Las E2E usaron exclusivamente `curichi_e2e`, roles restringidos y fotos sintéticas temporales.
No se migró ni resembró, no hubo conexiones a `curichi`/`curichi_revision`, no se editaron
secretos/.env. Se cerraron todos los procesos propios; puertos 3000/3001/3002/3100 libres;
PostGIS/MinIO siguen healthy. Imágenes habituales y túneles no se modificaron.

**Sin ejecutores pesados activos ni aprobaciones de M4 pendientes.** Los límites previos,
intentos por sandbox, RAM y configuración temporal constan en las evidencias; no rehacer M4.
Logs/JSON/harness en `.turbo/cierre-m4-2026-10-14/` (ignorados). Arbol inicial de 818 archivos
allí, no sobrescribirlo. Listas de archivos de M4 y CSP en sus corridas. Las revisiones recuperadas
son históricas; para el dictamen final usar informes más recientes.

## D. Trabajo pendiente, en orden

1. **Preparar M6, Baches:** concretar campos, severidad, radio y compatibilidad de respuestas
   generales antes de activar datos reales; presentar plan verificable para aprobación.
   M5 está terminada: no repetir implementación, línea base ni E2E sin motivo nuevo.
   La prueba de cambio real entre categorías y cualquier ampliación fuera del paquete
   se incluyen explícitamente en ese plan. Un escritor y un pesado a la vez.
2. Mantener los rojos ajenos visibles: error/seis avisos Biome y las mismas tres high de
   source-map-js/sharp/next (auditoría actual sin críticas). No arreglar dependencias fuera
   de alcance. AGENTS/CLAUDE conservan versión 0.20; código 0.22, edición aún restringida.
3. M6 Baches, M7 Basura, M8 Áreas verdes: definir campos, severidad, radio y demás decisiones
   de doc 14 §8 antes de activar. Cambio real entre categorías en navegador diferido a M6.
   Privacidad de persona en situación de calle es puerta de producción, ADR 0018.
4. M9 rendimiento con cuatro definiciones reales; M10 contracción de compatibilidad.
5. Producción: decisiones municipales, hosting/mapas/respaldos y restauración, privacidad,
   lectores de pantalla reales e imagen de despliegue. Fase aparte sin autorización para desplegar.

La spec nueva E2E de cambio real y los manuales protegidos siguen sin autorización de edición.
El usuario autorizó ahora la publicación puntual del estado existente en `interfaz-prueba`
y su PR; esta autorización no aprueba todavía el plan ni los campos/reglas de M6.

## E. Decisiones técnicas y restricciones

- Núcleo único y definiciones por categoría (ADR 0009); modelo híbrido D (0010),
  `reporte` + catálogo + subtipo + `detalle` JSONB versionado. Mantener expand/contract (0011).
- Una categoría está disponible si la habilita el catálogo **y** existe su definición.
  Sin `categoria`, API = inundación; `todas` solo en rutas del panel (0012).
- Un mapa, cambiando datos de la fuente para evitar clusters mezclados (0013).
- Preferencia local del dispositivo: `micurichi.mapa.categoria = {v:1, slug}`.
  URL válida/activa → guardada → inundación → primera activa (0014/0015).
  Aclaración aprobada de M4: `?categoria=` se conserva solo con dos o más categorías activas.
  El formulario no escribe la preferencia del mapa.
- Al cambiar categoría se conservan centro, zoom y zona; se reinician filtros específicos
  y selección (0016). No pedir cámara/GPS al cargar la página.
- Cupo configurable de reportes por cuenta/categoría/día (valor inicial 3),
  fotos globales por cuenta/día (12), contador atómico y demora por categoría (0017).
- «Persona en situación de calle» se mantiene según lo aprobado; la privacidad de su
  publicación exige resolver la puerta específica antes de producción (0018).
- Áreas verdes: Point, sin dependencia de capa municipal (0019/0020).
- Formulario común + declarativo/componentes registrados (0021), icono y acento por categoría
  (0022); inundación conserva severidad v2 extendida (0023).

**Restricciones operativas vigentes:**

- No tocar `curichi` ni `curichi_revision`. No migrar la pila habitual para comprobar M4.
  `curichi_e2e` solo en la ventana E2E autorizada; PostgreSQL de pruebas en bases efímeras
  `curichi_sdd_*`. Los estados históricos 0009/0021 no se han reconsultado hoy.
- Nunca `docker compose down`, `rm` o `-v` sobre la pila; no reset/clean/stash/checkout
  destructivo. `data/raw/` inmutable. No imprimir `.env` ni valores de secretos.
- No descargas/instalaciones ni variables persistentes de usuario/sistema sin autorización.
- Un escritor por carpeta; no editar fuera del alcance aprobado. AGENTS/CLAUDE requieren
  autorización específica. El principal coordina desarrollo; no sustituye a los implementadores.
- Publicación puntual autorizada el 18/10 en `interfaz-prueba` con PR hacia `main`.
  No autoriza merge, despliegue ni publicaciones posteriores ajenas a esta entrega.

## F. Cómo recuperar y mantener el contexto

**Orden de lectura:** este archivo → `AGENTS.md` y `CLAUDE.md` → informe/verificación M5,
su plan y ampliaciones → roadmap 14 §8 y ADR → evidencia `.turbo/m5-2026-10-15/` →
informe final de M4 como antecedente → código/diff real. No atribuir el cierre M4 a M5.
`docs/TRASPASO.md` y snapshots 1–5 son antecedentes; sus ramas/tareas pueden estar superadas.

Comandos iniciales de lectura, desde la raíz:

```powershell
git status --short
git log -1 --oneline
git show-ref --heads
git for-each-ref refs/sdd --format="%(refname) %(objectname)"
Get-Content docs/sdd/2026-10-15-panel-por-categoria/informe.md
Get-Content docs/sdd/2026-10-15-panel-por-categoria/verificacion.md
Get-Content docs/sdd/2026-10-15-panel-por-categoria/archivos.txt
```

Foto local de M4: `refs/sdd/mapa-y-formulario-por-categoria` =
`48b1e408ea57ef924e94625f1d720bb98c6ae6cf`. Las fotos antiguas no incluían todos los archivos
entonces sin seguimiento; combinar diff con hashes de `arbol-inicial.txt` y `archivos.txt`.
El commit de respaldo consolidó el árbol completo y no sustituye esa línea base. No hacer reset
a una foto SDD. Las refs SDD locales no se consideran respaldadas por el push de una sola rama.

Para repetir las pruebas acotadas, usar los comandos de B en sus directorios. No instalar
dependencias como respuesta automática a un fallo del sandbox. Para la verificación completa,
seguir los comandos de la corrida y `--concurrency=1`, midiendo memoria antes.

**Chromium histórico:** la instalación de Claude virtualiza AppData; el diagnóstico previo
identificó error SxS 14001/`spawn UNKNOWN`. El usuario autorizó únicamente, en comandos de
verificación, `PLAYWRIGHT_BROWSERS_PATH` apuntando a
`C:\Users\HP\AppData\Local\Packages\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`.
Verificar que sigue existiendo antes de E2E; establecerla solo en el proceso y restaurar su
valor al terminar. No quitar `channel: 'chromium'`: la cámara simulada depende de ese navegador.
Ese diagnóstico es antecedente; el 15/10 Chromium arrancó desde Codex y G1 aprobó sus 47 casos.

**Política actual de continuidad (pedido del usuario del 2026-10-13):**

- Actualizar físicamente este archivo después de hitos, decisiones, antes de cambiar de fase,
  antes de terminar una sesión extensa y ante compactación anticipable.
- Guardar controles preventivos periódicos si no existe un indicador fiable de contexto.
  No inventar porcentajes ni afirmar control sobre compactaciones automáticas.
- Separar hechos ejecutados, resultados históricos, hipótesis y pendientes; enlazar evidencia.
- Usar una escritura completa y segura; no dejar una plantilla vacía como único contexto.
- Mantener Markdown afectado con cada cambio; preservar snapshots/ADR históricos.

El mecanismo anterior `ContextosySkills/hooks/contexto.mjs` usa PostToolUse, PreCompact y
SessionStart de Claude, estima tokens con una ventana inferida y crea snapshots >70% una vez
por ciclo. **No hay evidencia de que esos hooks se ejecuten en Codex.** Se conserva como archivo
histórico, sin cambiarlo. La regla del 70% no restringe las actualizaciones de este documento.

**Próxima acción concreta:** preparar el plan M6 con las decisiones de Baches de doc 14 §8
y contrastar los esquemas generales, sin activar categorías ni programar hasta aprobarlo.
No repetir M4/M5 ni sus líneas base, ni reabrir Q1–Q3. Mantener restricciones de C/E y
distinguir la publicación puntual del 18/10 de las autorizaciones de desarrollo;
las pruebas de M5 no certifican dos categorías reales.

## G. Riesgos, contradicciones y límites de la auditoría

1. **M4 cerrada en local con salvedades explícitas:** una cámara móvil intermitente y omisiones conocidas; las imágenes habituales y lectores reales no están certificados.
2. **Lint global rojo preexistente:** `ContextosySkills/hooks/contexto.mjs` tiene un error de
   formato y cinco `noUndeclaredEnvVars`; `docs/dominio/infografia-plataformas-riesgo.html`
   tiene un `noDescendingSpecificity`. No se corrigieron fuera de alcance.
3. **Dependencias:** auditoría actual confirma las mismas tres high (Next, Sharp, source-map-js), cero críticas. No se actualizó el lockfile.
4. **Versiones y textos obsoletos:** AGENTS/CLAUDE aún dicen contracts 0.20.0; es 0.22.0.
   Se preservaron porque M4 no autorizó esas secciones. Roadmap 14 mezcla planificación inicial
   y notas de implementación posteriores. Snapshots 4/5 aún dicen «sin commits» y M3b pendiente;
   hoy existe el respaldo y M3b tiene informe de cierre.
5. **Otras contradicciones documentales:** README raíz decía moderación previa y fase local
   completa (corregido en la auditoría); README del panel ya documenta el mapa ejecutivo
   tras M5. ADR 0010 menciona un spike ya realizado en M2;
   el ejemplo de versiones de ADR 0012 no debe interpretarse como retirada ya hecha en 0.20.
6. **Instrucciones de herramientas heredadas:** `.agents/skills/sdd/` existe, pero hay referencias
   a `.Codex/skills/`, rutas de otra máquina y modelos/APIs de Claude en los archivos copiados.
   Adaptarlas con alcance aprobado; no asumir que un cambio de nombre las hizo ejecutables.
7. **Preparación de nuevas categorías:** M4 corrigió el registro de componentes especiales,
   la validación de la definición efectiva, el cupo sin máximo supuesto y los subtipos/tipo
   de lugar del formulario declarativo. Hay pruebas con categorías sintéticas; activar las
   definiciones reales de M6–M8 y comprobar el cambio entre ellas sigue pendiente. El anuncio
   `aria-live` pasó la prueba DOM en Chromium; no se verificó con un lector de pantalla real.
8. **Pendientes anteriores:** botón de ubicación de prueba aún presente en `PedirUbicacion.tsx`;
   casos de texto con carácter nulo reportados en API, configuración del túnel, retención y
   parámetros municipales. No reproducidos ni arreglados hoy; consultar informes y doc 14 §8.
9. **Datos/operación:** PostGIS y MinIO quedaron saludables, los procesos temporales cerrados
   y sus puertos libres. Se comprobó `curichi_e2e` en la migración 0021; no se migró ni se
   consultaron las bases habituales. No se reconstruyeron ni verificaron las imágenes para
   despliegue. El backup Git no respalda la DB ni las fotos. El arranque general de Compose
   puede ejecutar migraciones de la base habitual y no debe usarse como prueba inocua.
10. **Alcance de revisión:** tras los fallos iniciales de agentes, el principal ejecutó las
    correcciones y verificaciones con la excepción autorizada. Se recibieron revisiones
    independientes de M4 y de Zod/CSP, además de la implementación acotada de CSP por otro
    agente. Los revisores contrastaron código y evidencia; no se les atribuye la ejecución
    de toda la matriz. El cierre local no certifica seguridad ni despliegue de producción.
