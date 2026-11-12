# M10.4 — Consumidores internos compatibles

**Aprobado por el usuario el2026-10-28:** «Aprobar y ejecutar M10.4 (Recomendado)».
La aprobación incluye los21archivos, la corrección preexistente de limpieza y los ajustes
de estado acotados de AGENTS.md/CLAUDE.md. M10.3 terminó sus dos ensayos reales
con verificación independiente. Este plan prepara
consumidores internos para la contracción posterior, conservando HTTP y datos existentes.

Base estática: `.turbo/m10-4-planificacion/inventario-consumidores-internos.md`, elaborado
por Popper sin ejecutar código. No se presenta esa lectura como pruebas aprobadas.

## Resultado y decisiones propuestas

1. Seed, helpers y bancos enumerados usarán la tabla física `reporte`. Toda operación que
   antes equivalía a la vista tendrá **filtro explícito de Inundaciones**, incluidos ambos
   lados de vecinos y el `ON` del LEFT JOIN. No reemplazo global de nombres.
2. La FK tipada Drizzle de fotos apuntará a `reporte.id`, conservando cascade. PostgreSQL
   ya conserva esa FK por el renombre0020: esto corrige el espejo, no aplica DDL.
3. Se conserva escritura dual coherente, vista, columnas planas, trigger, enums y ambas
   formas/respuestas HTTP. No se modifica contracts, API, web, panel o geo en su código.
4. **Cuota antigua:** conservar por ahora tabla, datos, limpieza y ACL. El contador vigente
   sigue siendo `cupo_contador`. No retirar permisos ni reciclar campos de resumen sin
   la decisión/migración posterior. Este bloque no declara desacoplamiento total de cuota.
5. Los bancos conservan distribuciones, RNG, fechas, estados, límites y geometrías; no
   se convierten en medición del SQL HTTP actual ni se reutilizan sus tiempos anteriores.
   El tamaño de la tabla física abarca todas las categorías y debe etiquetarse como tal.

## Corrección preexistente que se solicita aprobar expresamente

`scripts/banco-datos.mjs:209–210` comprueba miembros de puntos críticos solo mediante
la vista de Inundaciones. Puede borrar puntos de otras categorías que sí tienen miembros,
dejando sus referencias en NULL. Es un defecto previo, no una regresión de este plan.

Cambio acotado propuesto: limitar el DELETE exterior a puntos de Inundaciones y buscar
miembros en `reporte`. Probar que sobreviven puntos y reportes de las otras tres categorías,
también con la misma marca sintética. Riesgo: ampliar un DELETE al cambiar vista por tabla;
se evita con predicados y negativos sobre filas/IDs/fotos concretos. No se ejecutará ese
CLI en ninguna base real durante esta tarea.

## Inventario cerrado propuesto: Parte4

Un trabajador raíz, carpeta `packages/db/`, primero; sin override de modelo.

| Archivo | Meta verificable / alcance |
|---|---|
| `packages/db/src/esquema/index.ts` | FK tipada foto→reporte, cascade y comentarios actuales; conservar espejo de vista y tabla de cuota |
| `packages/db/src/seeds/samples.ts` | INSERT directo con categoría; dos DELETE y conteo filtrados; mismos valores/RNG/publicación; JSON coherente por mecanismo vigente |
| `packages/db/src/test-utils.ts` | Rama flood directa a tabla, misma firma/defaults/IDs; otras categorías y causa NULL conservadas |
| `packages/db/banco-puntos-criticos.ts` | Inserción y selección de inundación directas; conservar rejilla/volumen/comparativa; importación comprobable sin ejecutar banco real |
| `packages/db/test/esquema-drizzle.test.ts` | Comprobar destino/acción de FK y catálogo, manteniendo comparación estricta de tabla y excepción de vista |
| `packages/db/test/db.test.ts` | Integración actual contra tabla con filtros; conservar retención/fotos/agrupación y casos no vacíos |
| `packages/db/test/migracion-0010-quitar-campos.test.ts` | Solo bloques modernos de mirror/seed; conservar transición histórica y sus nombres/versiones |
| `packages/db/test/migracion-0013-distancia-dispositivo.test.ts` | Solo referencia al mirror actual; SQL histórico acotado permanece intacto |
| `packages/db/test/migracion-0014-cuota-diaria.test.ts` | Separar aserción histórica y mantenimiento actual latest; conservar limpieza antigua y verificar contador vigente sin cambiar significados |
| `packages/db/test/migracion-0015-publicacion.test.ts` | Solo integración actual de seed/mirror; mantener publicación, fechas y casos históricos0015 |
| `packages/db/test/servidor-local.test.ts` | Lectura posterior a migrar desde tabla filtrada; inserción histórica0014 intacta |
| `packages/db/test/m10-consumidores-internos.test.ts` (nuevo) | Positivos y negativos multitemáticos de seed/helper/FK; ejecutar SQL de bancos en fixture controlada; cuota actual/antigua diferenciadas |
| `packages/db/README.md` | Espejos, estado real de cuotas, escritura dual y alcance de fixtures/bancos |

No se exige editar un archivo enumerado si la comprobación demuestra que no necesita delta;
se registra el resultado y no se hace una refactorización para llenar el inventario.

El seed ya recrea cuatro cuentas y recalcula puntos globalmente. Se conserva ese comportamiento:
los negativos usarán autores ajenos a esas cuentas y distinguirán recálculo de IDs de borrado
de reportes/fotos. No prometer igualdad de todos los campos después de una siembra global.

## Inventario cerrado propuesto: Parte5

Segundo trabajador raíz, después de la entrega Parte4. Un solo escritor en scripts/CI.

| Archivo | Meta verificable / alcance |
|---|---|
| `scripts/banco-datos.mjs` | Tabla física, filtros flood, tamaño etiquetado, ANALYZE/VACUUM correctos y corrección de puntos críticos descrita arriba |
| `scripts/banco-consultas.mjs` | Tabla/filtros por cada camino; seis alias desde detalle preservando tipos/NULL; LEFT JOIN/vecinos sin contaminar; benchmark sigue etiquetado histórico |
| `scripts/sembrar-30-puntos.sql` | Mismas30tuplas/transacción, categoría explícita y detalle coherente; no se siembra una base real |
| `scripts/bancos-internos.test.mjs` (nuevo) | Arnés hermético de bancos/importación/CLI con operadores bloqueados; semántica de aislamiento/errores y SQL complementada en PGlite |
| `.github/workflows/ci.yml` | Solo tres lecturas del humo filtradas a flood y ejecución del nuevo arnés en el bloque de pruebas aisladas; sin alterar otros jobs/respaldos |

Los builders necesarios para probar se extraen dentro de esos mismos archivos, sin módulos
de producto adicionales. Importar no abre conexiones. No cuenta como éxito un banco que
imprima ERROR y siga; la comparación debe detectar ese resultado, sin ampliar de pasada
su manejo histórico de códigos de salida.

## Documentación transversal solicitada

| Archivo | Motivo y límite |
|---|---|
| `AGENTS.md` | Solo estado/fecha y notas de avance de §1,§4.8,§16.7: cuatro categorías locales,M9/M10.1–3 y M10.4 verificada al terminar; no cambia reglas, modelos, permisos o puertas |
| `CLAUDE.md` | Mismos ajustes de estado acotados; no reescritura del manual ni de decisiones abiertas |
| `services/api-core/README.md` | Solo precisar que la cuota antigua no reserva cupos pero sigue en mantenimiento; no afirmar «nada la lee» mientras ese uso exista |

Parte5 mantiene documentación de esta corrida (plan, inventario/F0, baseline, implementación,
verificaciones e informe), índices docs/sdd/README y docs/README, roadmap14§5, actualización
fechada del inventario M10 existente y `VentanaContexto.md`. Riesgo documental: confundir
entrega local con producción; se conservan expresamente sus límites y decisiones pendientes.

## Criterios, reparto y comprobaciones

1. F0 propio antes de editar, sin stash/commits ni usar HEAD como única base. Declarar ajenos
   y proteger la cápsula M10.3 ya conservada. No volver a operar sus bancos/diarios completados.
2. Cada implementador ejecuta antes las suites/tipos de su ámbito y guarda stdout/exit/RAM.
   Nueva cobertura en rojo antes del fix. Mantener nombres/aserciones anteriores; una regresión
   bloquea. No fijar todas las pruebas a0021 para ocultar problemas futuros.
3. Parte4 demuestra equivalencia de flood (IDs/defaults/fechas/severidad/detalle y opcionales
   ausentes/false), fotos de cuatro categorías y no borrado de otras categorías. La prueba de
   FK debe comprobar asociación/cascade y filas positivas, no solo una cadena de configuración.
4. Parte5 demuestra que no se mezclan categorías ni se pierden UV sin reportes; los dos lados
   de vecinos y su semilla están acotados. El humo falla con cero flood aunque existan otras
   categorías. La limpieza conserva filas y puntos ajenos con miembros, sin llamar al CLI real.
5. Ejecutar suite db, nuevo arnés Node, tipos/build db y typecheck de consumidores en serie
   (`--concurrency=1`), Biome del delta y YAML. Suite API con fixtures después del cambio de
   helpers para comparar con baseline; sin cambios de fuente/API ni nuevas omisiones.
6. Verificación independiente y revisión funcional/seguridad del delta por agentes nativos;
   salida literal, comparación caso por caso y SHA. Herramientas ausentes se declaran, no
   se instalan. No repetir controles intactos sin dependencia o preocupación justificada.
7. Cierre con datos de pruebas reales ejecutadas, limitaciones, archivos exactos y documentación.
   No cierre de M10 completo, Fase1 o producción por completar este bloque.

Todas las pruebas serán herméticas/PGlite con datos ficticios, sin conectar PostgreSQL real,
Docker, S3, HTTP o ejecutar bancos/seed/SQLmanual en instalaciones reales. No se crearán ni
migrarán bases. Demo se mantiene abierta y separada; RAM>=1500MiB para controles, único
heavy global. Dependencias instaladas, pnpm local, sin descargas/instalaciones, sistema/env
persistente, roles/contraseñas, data/raw o limpieza de cachés/logs. Sin Git/publicación.

## Qué sigue fuera de este plan

No editar migraciones históricas ni añadir0022. No retirar cuota/ACL, vista, columnas, trigger,
enums o HTTP. No cambiar API/contracts/apps/geo en código. No retirar el mirror de vista ni
convertirlo en alias sin filtro. Escritura solo JSON, retención de cuotas antiguas, revocación
de permisos, reversa multitemática y ventana de clientes/PWA mantienen decisiones y planes.
La clasificación restante de pruebas históricas del inventario de Popper se conserva para
la fase de DDL; este bloque no afirma eliminar todas las referencias de compatibilidad.

AGENTS§0.9 y§5.2 se satisfacen con la aprobación explícita anterior. No se amplían sus
límites: contracción física/HTTP y operaciones reales mantienen sus planes y puertas.
