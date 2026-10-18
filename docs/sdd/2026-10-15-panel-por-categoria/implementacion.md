# M5 — Registro de implementación

**Registro de implementación terminado; el cierre y las limitaciones están en informe.md.**
Los estados «pendiente» de cada vuelta conservan su fecha histórica y se resuelven en los
apartados posteriores. Alcance y criterios aprobados en
[plan.md](plan.md), ampliación P3 en [ampliacion-exportacion.md](ampliacion-exportacion.md)
y resultados previos en [linea-base.md](linea-base.md).

## Recuperación de M5.0

Galileo ejecutó el preflight de contracts: **303 pruebas / 20 archivos**, exit 0,
12,349 s de proceso. Evidencia ignorada: `.turbo/m5-2026-10-15/m5-0-pre-contracts.log`
y `m5-0-resultados.jsonl`. Dejó la prueba nueva `contrato-0-22.test.ts`; al recuperar
el trabajo, `admin.ts` conservaba el esquema anterior y la versión seguía en 0.21.0.
El corte por límite de uso no se presenta como implementación completada.

Ampere retoma como único escritor de los seis archivos P3 aprobados y ejecutor pesado.
Euclid revisa de forma independiente, solo mediante lectura. Las incidencias de
CIM/sandbox y memoria previas al rojo se conservan en `m5-0-incidencias-retoma.json`;
esos intentos no ejecutaron pruebas. No se redujo el mínimo de RAM ni se cerraron
procesos ajenos.

**Rojo reproducido por Ampere antes de modificar la fuente:** `contrato-0-22.test.ts`,
60 casos, 13 fallidos, exit 1 (2,861 s). La suite completa posterior a escribir las
pruebas confirmó **20 archivos anteriores aprobados + el nuevo fallido**, 350 pruebas
aprobadas y los mismos 13 fallos nuevos, exit 1 (13,558 s). Evidencia:
`m5-0-rojo-contrato.log`, `m5-0-antes-contracts.log` y `m5-0-resultados.jsonl`.
Los fallos observados incluyen los nulos de otras categorías y la representación
condicional de OpenAPI.

**Verdes comprobados hasta ahora:** los 60 casos nuevos (exit 0, 20,173 s) y la suite
completa de contracts, **363 pruebas / 21 archivos** (exit 0, 13,237 s). Primer build
de contracts aprobado (4,574 s), SHA-256 de OpenAPI generado
`7b50c9251903450377c29197e4797d9bd97f4d3f3b924659e7b142510da2fa94`.
Evidencia: `m5-0-verde-contrato.log`, `m5-0-post-contracts.log`, `m5-0-build-1.log`.
Segundo build aprobado (4,247 s), con el mismo SHA. Tipos de consumidores con grafo normal
aprobados (42,604 s), exportación API **10 pruebas aprobadas** (18,083 s).
Biome inicial detectó dos archivos por formato; corregidos exclusivamente esos dos archivos.
Tras el formato: **363/21** otra vez (13,347 s), tipos del grafo normal aprobados (30,391 s)
y Biome final exit 0 (2,050 s). Salidas adicionales: `m5-0-build-2.log`,
`m5-0-tipos-consumidores.log`, `m5-0-api-exportacion.log`, `m5-0-post-formato-contracts.log`,
`m5-0-tipos-finales.log` y `m5-0-biome-final.log`.

El principal acepta **M5.0**, con revisión independiente [conforme](revision.md).
Se concede a Ampere M5.1 en P2. Esto no cierra M5 ni sustituye su verificación final.
El cambio de versión requirió desactivar la comprobación previa de dependencias
solo en la invocación de pnpm (`--config.verify-deps-before-run=false`); no se ejecutó
instalación ni se editó la configuración persistente o el lockfile.

## Bloques pendientes

| Bloque | Estado confirmado | Condición para continuar |
|---|---|---|
| M5.0, exportación | Aceptada tras corrección, pruebas y revisión independiente | Cumplida; conservar evidencia en F4 |
| M5.1, configuración/URL/consultas | Aceptada, 497/42, tipos y Biome verdes | Confirmación final CA10 en E2E pendiente |
| M5.2, selector y bandeja | En curso | Base común aceptada |
| M5.3, detalle/ficha/fusión | Pendiente | Bandeja aceptada |
| M5.4, indicadores/ejecutivo | Pendiente | Adaptadores y ámbitos aceptados |
| M5.5, README y revisión final | Pendiente | Implementación y verificación independiente |

El defecto previo de pestaña oculta de CA10 se conserva en la línea base; debe
corregirse sin cambiar las pruebas E2E. No hay autorización para modificar backend,
activar categorías ni desplegar. Se mantienen los cambios anteriores de M4/CSP.
No se han creado commits ni realizado nuevos push.

## M5.1 — Base común del panel, en curso

Preflight con contracts 0.22.0 antes de editar P2: **458 pruebas / 40 archivos**, exit 0
(28,003 s), y typecheck del panel exit 0 (3,931 s). Salidas ignoradas:
`m5-1-pre-panel.log`, `m5-1-pre-tipos.log`, registro `m5-1-resultados.jsonl`.

Pruebas nuevas `src/lib/m5-categorias.test.ts` y `src/lib/sondeo-mapa.test.ts`.
Rojo focal exit 1 (4,324 s); suite posterior a las pruebas: **40 archivos anteriores
aprobados**, dos nuevos fallidos; **459 aprobadas / 23 fallidas nuevas** (28,916 s).
Los 24 casos añadidos incluyen una comprobación que ya pasa; no se presenta como
defecto nuevo. Salidas: `m5-1-rojo.log` y `m5-1-suite-roja.log`.

La cobertura añadida comprueba lector completo con última configuración válida y aviso,
ausencia de categorías sin inferir actividad, selección/alias/URL, cambio de filtros,
claves por categoría, transporte público y composiciones ejecutivas. CA10 usa observadores
reales de TanStack Query y temporizadores controlados para claves nuevas ocultas, mapa
que termina oculto, debounce pendiente y reanudación marcada sin duplicación por foco.
La implementación y su verde todavía están pendientes; la E2E final debe confirmar la
integración real y no se ha ejecutado otra vez.

### Continuación del 2026-10-16

La implementación de M5.1 tiene un focal posterior aprobado: **103 pruebas / 6 archivos**,
exit 0 (10,159 s), `m5-1-focal-1792122286606.log`. Incluye recuperación de URL sin
configuración, alias `area-verde`, traspaso SSR con fallo de renovación, primera clave
autocorregida sin filtros específicos heredados y respuesta tardía de otra categoría.
La revisión independiente acotada confirmó los dos bordes resueltos por lectura.

Tipos del panel pasaron antes de las últimas correcciones (5,140 s); el formato de los
archivos propios pasó (2,496 s). **No son aún la verificación final de M5.1.** La suite
completa posterior dio **495 aprobadas + 2 fallidas / 42 archivos**, exit 1 (37,377 s),
`m5-1-post-panel.log`. Los dos fallos son las aserciones anteriores de CapaAnterior: al
añadir el contexto de categorías, su arnés antiguo solo monta el de ciudad y recibe el
fallback de Suspense. Se requiere añadir proveedor/configuración sintética al arnés,
sin eliminar ni debilitar las comprobaciones de tabla, códigos, conteos y ausencia.

Ampere se interrumpió por límite de uso; Epicurus retoma como único escritor P2 y ejecutor
para cerrar ese punto y repetir suite, tipos y Biome. El principal conserva documentación;
M5.2–5.5 y F4 permanecen pendientes. No se reinicia la línea base ni se atribuyen esos dos
fallos al estado previo a M5.

**Cierre local de M5.1 confirmado en la continuación:** preflight del nuevo escritor reprodujo
los dos fallos; añadió exclusivamente el proveedor sintético al arnés de CapaAnterior.
Focal **2/2**, exit 0 (5,191 s), suite **497/42**, exit 0 (22,351 s). Typecheck detectó
TS2339 sobre `bbox` en la inferencia de parámetros combinados; se añadió la anotación
`ParametrosConsulta`, sin cambiar comportamiento. Tras ella: focal **103/6**, exit 0
(5,274 s), suite **497/42**, exit 0 (25,100 s), tipos exit 0 (4,120 s) y Biome exit 0
(2,121 s). `git diff --check` también verde. Logs finales:
`m5-1-post-panel-1792147870481.log`, `m5-1-post-tipos-1792147943987.log`,
`m5-1-biome-1792147955315.log`; entrega
`m5-1-retoma-entrega-1792147987734.md`, todo bajo el directorio ignorado de M5.

Son **27 fuentes P2** acumuladas. De las 40 pruebas anteriores, 39 archivos mantienen su hash;
el bloque de casos/aserciones de CapaAnterior conserva SHA
`8d3fae26b86d21fee7cfb9edaced9a2ae00c21dbc5fb4219c62468a2ca7c38d7`.
`.env.example` apareció inicialmente como candidato por la exclusión del manifiesto,
pero **no cambió**: copia inicial y actual tienen el mismo SHA y Git no muestra diferencias.
No se incorpora como archivo propio ni se imprimieron sus valores.

El principal acepta M5.1 y concede secuencialmente M5.2–5.5 a Epicurus, único escritor P2.
F4 global/build/E2E todavía no se ejecutaron: este cierre de bloque no cierra M5 ni demuestra
por sí solo la corrección del fallo real de pestaña oculta en Chromium.

## M5.2 — Selector y bandeja, en curso

El primer focal falló por módulo nuevo inexistente y ejecutó cero casos; se conserva como
incidencia de preparación, **no como evidencia de aserciones por CA**. Tras crear solo el
cascarón, `m5-1-m5-2-rojo-1792148315169.log` reprodujo **7 fallos de 9 casos**, exit 1
(2,727 s): cero disponible, metadatos/controles/región vacía, conteos, anuncio, tabla común
y navegación. Dos invariantes anteriores ya pasaban y no se atribuyen como defecto nuevo.

El primer verde focal pasó esos nueve casos (5,197 s), `m5-1-m5-2-focal.log`.
Después se ampliaron los casos de retorno interno y exportación sin categoría: una nueva
aserción quedó roja, registrada en `m5-1-m5-2-rojo-1792148490858.log` (19 casos, 18 verdes,
uno rojo). La integración completa y el verde final de bloque siguen pendientes de entrega.

**Checkpoint recuperado el 16/10:** suite completa **518 pruebas / 44 archivos**, exit 0
(26,38 s de Vitest; 27,434 s de proceso), `m5-1-m5-2-panel-1792148778483.log`;
tipos exit 0 (3,912 s), `m5-1-m5-2-tipos-1792148809656.log`; Biome exit 0
(134 archivos, 0,986 s de proceso), `m5-1-m5-2-biome.log`. Son salidas recuperadas,
no una nueva ejecución del principal. El ejecutor quedó entre comandos.

Epicurus y Bohr ya no están disponibles y no se recibió el dictamen de Bohr. Godel retoma
como único escritor P2/ejecutor para M5.3–5.5; Newton revisa independientemente M5.2.
La revisión incluye el montaje estable de la región viva al cambiar disponibilidad, conteos
accesibles y no exactos, aislamiento de consultas y navegación interna. No se han activado
categorías sintéticas. M5.2 queda implementada con revisión pendiente; no cierra M5.


## M5.3 — Detalle, ficha y fusión, en curso

Godel ejecutó preflight del paquete **518/44**, exit 0 (26,254 s de proceso),
`m5-1-pre-panel-1792160492237.log`. Pruebas nuevas `src/lib/m5-3.test.ts`:
**10 fallidas y una aprobada**, exit 1 (3,543 s de proceso), `m5-1-m5-3-rojo.log`.
Cubren presentación por categoría real, datos incompatibles, ficha y candidatos de fusión.
El caso ya aprobado se conserva como invariante; no se atribuye a una corrección nueva.
Implementación y verde todavía pendientes de entrega. No es una vuelta de F4.

**Checkpoint de recuperación posterior:** la primera suite M5.3 pasó **529/45**, exit 0
(`m5-1-m5-3-panel.log`, 27,525 s de proceso), y el primer typecheck pasó. Después se
añadieron dos casos de transición por los hallazgos tempranos de Newton: rojo y focal 2/2
verde (`m5-1-m5-2-revision-focal.log`). El caso adicional de detalle explícito `null` de
M5.3 reprodujo rojo y tiene focal verde posterior (`m5-1-m5-3-focal-1792161039775.log`).
Formato final de ambos grupos verde. **El último typecheck está rojo**, TS2345 por faltar
`pagina`/`limite` en la colección sintética del nuevo test de caché
(`m5-1-m5-3-tipos-1792161118600.log`). Pendiente de corrección/repetición y entrega; no
se declara aceptada M5.3 con la evidencia anterior. El siguiente corte de uso de los agentes
no perdió estas fuentes/logs. M5.4/5.5 y F4 todavía no se ejecutaron.

**Reanudación posterior confirmada:** se completó el fixture con `pagina`/`limite`.
Suite **532/47**, exit 0 (31,053 s de proceso),
`m5-1-m5-3-panel-1792167373688.log`; tipos exit 0 (2,944 s),
`m5-1-m5-3-tipos-1792167418902.log`; Biome exit 0 (139 archivos),
`m5-1-m5-3-biome.log`. Estos resultados sustituyen el rojo de tipos anterior para ese
checkpoint. Newton acepta el cambio implícito y confirma que ya se retiran filas/puntos/KPI
cuando no hay ámbito; queda un resto de su primer hallazgo: cabecera/estado central todavía
dicen cero/ningún reporte sin haber consultado un ámbito. Godel lo corrige antes del cierre.
Recheck en `.turbo/revision-m5-2-retoma.md`. No se declara M5.2 conforme todavía.

**Cierre posterior de M5.2:** el resto de cabecera/tabla se corrigió y la prueba exige
indisponibilidad sin cifra de reportes ni mensaje de inventario vacío. Suite 532/47
(`m5-1-m5-2-panel-1792167506331.log`), tipos y Biome verdes; Newton confirmó ambos P2
y su residual resueltos. M5.2 aceptada por el principal. M5.3 conserva su suite/tipos/Biome
verdes y queda pendiente de revisión final con el resto de pantallas. M5 no está cerrada.

## M5.4 — Indicadores y ejecutivo, en curso

Preflight válido del bloque anterior: suite 532/47, tipos y Biome verdes. Nuevas pruebas
`src/lib/m5-4.test.ts`: **6 fallidas y una aprobada**, exit 1 (2,845 s de proceso),
`m5-1-m5-4-rojo.log`. La aprobada es una comprobación conservada, no una corrección nueva.
El primer focal posterior sigue rojo (`m5-1-m5-4-focal.log`); implementación en curso.
Sin aceptación ni ejecución F4 atribuida todavía.

**Entrega posterior M5.4 recibida:** `m5-4-entrega.md`. Focal final **7/7**
(`m5-1-m5-4-focal-1792169203002.log`); suite **539/48**
(`m5-1-m5-4-panel.log`, 26,583 s de proceso); tipos y Biome exit 0
(`m5-1-m5-4-tipos-1792169278737.log`, `m5-1-m5-4-biome.log`).
El focal intermedio tenía dos expectativas incorrectas (testid inexistente y exclusión del
nombre legítimo de una opción del selector); se sustituyeron por nombre accesible y ausencia
de textos/modelo de agua en el contenido seleccionado. No se retiraron aserciones históricas.
El typecheck intermedio detectó un fixture técnico usado como público: se proyectó mediante
`ReporteFeatureSchema.parse`, sin cast ni ampliar contratos. La suite posterior incorpora
estos cambios. M5.4 implementada, sin dictamen final de F4; M5.5 prepara README/entrega.

## M5.5 — Documentación y entrega, en curso

README actualizado con categorías, conteos/universos, ficha, mapas parciales y verificación;
se retiró la descripción obsoleta de ejecutivo «sin mapa». Nuevas pruebas
`src/lib/m5-5.test.ts` y `m5-5-reintentar.test.ts`; el hallazgo A-M5-01 reprodujo un fallo
de comportamiento antes de la guarda. Focal final **8/8**
(`m5-1-m5-5-focal-1792169616733.log`), suite completa **547/50**, exit 0
(`m5-1-m5-5-panel.log`, 29,342 s de proceso). La auditoría acotada del reintento es conforme.
Tipos/Biome finales de este bloque, inventario y liberación del turno aún pendientes de entrega.
Sin ejecución independiente F4 ni cierre de M5 atribuido a estos resultados.

**Checkpoint posterior con todos los hallazgos conocidos:** R1/R2 reprodujeron tres fallos
en estado persistente (11 casos, dos ya existentes archivos verdes); corregidos, recheck
de Newton conforme. La actualización pública de configuración ahora omite credenciales;
reproducción roja/focal **12/12** y recheck A-M5-02 de Aquinas conforme. Suite completa
actual **551/52**, exit 0 (`m5-1-m5-5-panel-1792170282796.log`, 29,375 s de proceso).
Estos resultados reemplazan 547/50 para la fuente actual. Inventario intermedio: 53 P2 y
seis P3, sin duplicados en la lista; aún faltan entrega/liberación y controles finales del
writer antes de F4. Los hallazgos y rojos intermedios permanecen en revisión/logs.

**Entrega final del escritor recibida y turno liberado:** `m5-5-entrega-final.md`, inventario
`m5-5-inventario-final-1792170440552.json`, 53 archivos P2. Fuente congelada con suite
551/52, tipos exit 0 (`m5-1-m5-5-tipos-1792170400833.log`) y Biome exit 0
(`m5-1-m5-5-biome-1792170409070.log`). Control final sin procesos pesados. Se conservan
aserciones históricas, roles/sesión/proxy/CSP/lockfile y el archivo M4 de instrumentation.
El principal concede a Gauss la ejecución independiente F4; Newton y Aquinas terminan
dictámenes de fuente. La entrega de implementación no cierra M5 ni certifica runtime.

## Entrega final M5.0 — Ampere


Implementación y comprobaciones acotadas terminadas. Entrega al principal para integración/revisión; no cierra M5 ni acredita descarga en navegador. P3, únicamente los seis archivos autorizados en [ampliacion-exportacion.md](ampliacion-exportacion.md). Continuación del implementador anterior, con preflight y logs contrastados, sin atribuir sus ejecuciones a esta retoma.

### Cambio y compatibilidad

Unión de la rama técnica anterior intacta con un feature derivado: categoría explícita no vacía distinta del literal inundacion y los tres enums planos nullable. No usa safeExtend ni depende de superRefine. Conserva los payloads antes válidos, también otras categorías con enums no nulos, geometría, propiedades técnicas, metadatos y truncamiento. Los esquemas generales públicos/técnicos no cambian. El fixture nuevo usa Record<string, unknown> para la eliminación dinámica; los tipos finales comprueban el resultado, sin retirar aserciones.

### Archivos entregados

- `packages/contracts/src/esquemas/admin.ts`
- `packages/contracts/test/contrato-0-22.test.ts`
- `packages/contracts/package.json`
- `packages/contracts/CHANGELOG.md`
- `packages/contracts/README.md`
- `packages/contracts/openapi/openapi.yaml`

El test 0.22 ya existía al retomar y no tenía seguimiento; se conserva con ajuste de tipos y formato. Ninguna de las 20 pruebas/archivos anteriores de contracts cambió. Fuentes ajenas (incluidos M4/CSP, P2, API, DB y ETL) y lockfile conservan sus hashes de retoma. Evidencia adicional: este documento y harness/logs ignorados.

### Antes y después

Preflight histórico comprobado: **303/303, 20 archivos, exit 0** (m5-0-pre-contracts.log; 12.349 s). Antes de implementar: **13 fallidas + 47 aprobadas, 60 nuevas**; suite completa **13 fallidas + 350 aprobadas, 21 archivos**. Todos los fallos están en contrato-0-22.test.ts, y las 303 históricas siguen verdes. Los casos de compatibilidad/invariantes ya verdes se preservan; los 13 rojos reproducen la ampliación pendiente.

Después: **60/60 nuevas** y **363/363, 21 archivos** en suite completa; repetida tras formato con el mismo resultado. **API exportación 10/10**, PGlite efímero, sin conectar a bases habituales. **Tipos: 7 paquetes + builds contracts/db, 9/9 tareas**, grafo normal sin --only y hashes de dependencias; repetidos tras formato. **Biome final exit 0**. Su primer intento detectó solo formato en admin.ts/test nuevo, resuelto exclusivamente en esos archivos. No se corrieron suite completa de consumidores, suite DB ni migraciones de la pila; F4 del principal incorporará P2.

PNPM significa Node + C:/Users/HP/AppData/Local/npm-cache/_npx/90fd45f2ce56cc10/node_modules/pnpm/bin/pnpm.mjs. Reproducción y argumentos exactos en m5-0-ejecutar.mjs y m5-0-resultados.jsonl; Vitest --maxWorkers=1, Turbo --concurrency=1. Tipos: exec turbo run typecheck --filter=...contracts --concurrency=1. API: --filter api-core exec vitest run test/exportacion.test.ts --maxWorkers=1. Entorno hijo sin URLs DATABASE_URL heredadas ni S3/credenciales de seeds. Un ejecutor, sin forzar caché.

| Tarea | Exit | Segundos | Salida |
|---|---:|---:|---|
| pre-contracts | 0 | 12.349 | [m5-0-pre-contracts.log](../../../.turbo/m5-2026-10-15/m5-0-pre-contracts.log) |
| rojo-contrato | 1 | 2.861 | [m5-0-rojo-contrato.log](../../../.turbo/m5-2026-10-15/m5-0-rojo-contrato.log) |
| antes-contracts | 1 | 13.558 | [m5-0-antes-contracts.log](../../../.turbo/m5-2026-10-15/m5-0-antes-contracts.log) |
| verde-contrato | 0 | 20.173 | [m5-0-verde-contrato.log](../../../.turbo/m5-2026-10-15/m5-0-verde-contrato.log) |
| post-contracts | 0 | 13.237 | [m5-0-post-contracts.log](../../../.turbo/m5-2026-10-15/m5-0-post-contracts.log) |
| build-1 | 0 | 4.574 | [m5-0-build-1.log](../../../.turbo/m5-2026-10-15/m5-0-build-1.log) |
| build-2 | 0 | 4.247 | [m5-0-build-2.log](../../../.turbo/m5-2026-10-15/m5-0-build-2.log) |
| tipos-consumidores | 0 | 42.604 | [m5-0-tipos-consumidores.log](../../../.turbo/m5-2026-10-15/m5-0-tipos-consumidores.log) |
| api-exportacion | 0 | 18.083 | [m5-0-api-exportacion.log](../../../.turbo/m5-2026-10-15/m5-0-api-exportacion.log) |
| biome | 1 | 2.26 | [m5-0-biome.log](../../../.turbo/m5-2026-10-15/m5-0-biome.log) |
| formato | 0 | 1.863 | [m5-0-formato.log](../../../.turbo/m5-2026-10-15/m5-0-formato.log) |
| post-formato-contracts | 0 | 13.347 | [m5-0-post-formato-contracts.log](../../../.turbo/m5-2026-10-15/m5-0-post-formato-contracts.log) |
| tipos-finales | 0 | 30.391 | [m5-0-tipos-finales.log](../../../.turbo/m5-2026-10-15/m5-0-tipos-finales.log) |
| biome-final | 0 | 2.05 | [m5-0-biome-final.log](../../../.turbo/m5-2026-10-15/m5-0-biome-final.log) |

### Artefactos y hashes

OpenAPI anterior: `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`.
Los dos builds directos y el YAML final: `7b50c9251903450377c29197e4797d9bd97f4d3f3b924659e7b142510da2fa94`, idénticos por bytes. El YAML parseado equivale al OpenAPI del dist actualizado; primera rama igual a ReporteTecnicoFeature anterior/actual y único componente modificado ExportacionGeoJson. Categoría requerida con minLength/pattern y nulos comprobados también sobre YAML, además del test del serializador. [Evidencia de artefactos](../../../.turbo/m5-2026-10-15/m5-0-artefactos-evidencia.json).

Los **22 casos originales del auditor**, sin cambiar entradas ni expectativas, cumplen con la implementación compilada. Se conserva evidencia original y [repro final](../../../.turbo/m5-2026-10-15/m5-0-repro-evidencia.json). [Hashes antes/después de seis archivos](../../../.turbo/m5-2026-10-15/m5-0-seis-archivos-final.json).

| Archivo bajo packages/contracts/ | SHA-256 final |
|---|---|
| src/esquemas/admin.ts | `14e47cd76607ad42c68c0252dded4fe5e53a9c49eccf88b4e158668c0a1872d4` |
| test/contrato-0-22.test.ts | `ee61ec959573e35d153897d13bdaafff0601a94af2c4e3c60ea13a47a04f2d13` |
| package.json | `659c7b2b21fd0fc7c5360ca7865926abf2954d1f73a684d80356288897ea486a` |
| CHANGELOG.md | `953f3db31b9ee3735f96eb520d14715a53462bf975f800cee6626edf11e0a27c` |
| README.md | `f80c65decf581d9e351c98de2961d6037bc9e71a40ed5927da107eec403b6170` |
| openapi/openapi.yaml | `7b50c9251903450377c29197e4797d9bd97f4d3f3b924659e7b142510da2fa94` |

### Incidencias, límites y entrega

- CIM del sandbox falló antes de pruebas; se repitió el mismo comando con require_escalated. RAM insuficiente detuvo intentos antes de ejecutar, sin reducir 1500 MiB ni matar procesos. Incidencias y cada guard se conservan en m5-0-incidencias-retoma.json y m5-0-preflights-retoma.jsonl. El intento tipos-antes no llegó a ejecutarse; no se presenta como fallo TS ni como PASS.
- **Sincronización automática no solicitada:** en el primer verde pnpm exec verificó/sincronizó dependencias tras el cambio de versión, con postinstall de esbuild y prepare husky. No se emitió un comando install. Se informó al principal; lockfile sin cambios por hash. Para los siguientes comandos se desactivó verify-deps-before-run por flag/entorno solo de proceso, con red de Corepack deshabilitada y modo offline. No se repitió la sincronización en sus logs. Se declara esta incidencia, no ausencia absoluta de instalación.
- Aviso pg de consulta concurrente ya conocido, sin fallo en las 10 pruebas. Rojos globales de FB (lint/auditoría/G4) fuera del alcance; no se arreglaron aquí. No hubo edición de .env, Docker, bases habituales, activación de categorías, commits ni push.
- Euclid: el principal comunicó dictamen independiente CONFORME de fuente/33 componentes y primera rama idéntica; no se le atribuye ejecución de estas suites. La revisión/integración del principal sigue siendo suya. La descarga real multitemática y la verificación global de M5 siguen para sus fases autorizadas.
- M5.0 queda listo para aceptación. Control/liberación de turno en m5-0-cierre-ejecutor.json. La concesión posterior del principal permite continuar M5.1 tras esta entrega, con P2 exclusivo y sin volver a editar contracts.

## Ajuste E2E de enlace autorizado — 16/10

G4 abrió correctamente la tarjeta del mapa, pero su expectativa histórica solo aceptaba
`/reportes/<id>`. El producto ya conservaba `categoria` y `volver` conforme a CA2.
El usuario aprobó «Sí, ajustar y verificar esa expectativa», con archivo, motivo y riesgo
en [ampliacion-e2e-mapa.md](ampliacion-e2e-mapa.md). No se cambió producto para satisfacer
la expectativa anterior ni se relajaron timeouts, fixtures o las otras aserciones.

Sagan, único escritor P5 tras liberar el verificador, ejecutó tipos E2E y Biome antes,
reprodujo el rojo focal en ambos intentos y reemplazó únicamente el bloque aprobado por
comprobaciones exactas de origen, ruta/ID, categoría y retorno/origen/UV. Se conservan tarjeta
visible, fila resaltada y UV de la página sin alterar. El mismo caso pasó 1/1 después;
tipos y Biome posteriores exit 0. Artefactos separados en
`.turbo/m5-2026-10-15/f4/correccion-enlace/antes/` y `despues/`.

SHA-256 inicial del archivo: `bfdaf13851b6c729befcd9a401011a71c1d63cd06e9ba9d4a88ac10a4e348ed3`.
SHA-256 posterior: `90390a7e5217dda2171d03425232fa9ce3dd54d01da45699dc6c128b7a8b7da1`.
Cicero revisó conforme y repitió G4 completo independiente: **43/43**, sin retry;
la comparación conjunta dio 132/132 E2E. El focal del escritor no se suma a ese total.
La fuente P2/contratos permanece congelada. Cierre documental consolidado el 2026-10-17;
las notas de ejecución anteriores que decían «pendiente» son históricas.
