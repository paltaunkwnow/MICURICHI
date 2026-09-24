# ADR 0003 — PGlite se queda, pero solo en desarrollo y pruebas

- **Estado:** aceptada
- **Fecha:** 2026-09-15
- **Decide:** Parte 4, a raíz de la auditoría de Fase 2

## Contexto

El ADR 0002 eligió PGlite (PostgreSQL compilado a WebAssembly) más `@electric-sql/pglite-postgis`
para poder trabajar sin Docker. Sus propios autores marcan la extensión PostGIS como
**experimental**. La pregunta de esta auditoría era si eso es un riesgo real para el proyecto y si
hay que sustituirla.

### Qué depende de PGlite, exactamente

Solo tres archivos de `packages/db` lo importan, y ninguno corre en producción:

| Archivo | Para qué | ¿Producción? |
|---|---|---|
| `src/local/servidor.ts` | `pnpm db:local`: levanta la base de desarrollo | No |
| `src/test-utils.ts` | Base efímera de los tests de `db`, `geo-service` y `api-core` | No |
| `src/ejecutor.ts` | Adaptador; menciona PGlite en un comentario y en `ejecutorPglite` | No |

`api-core` y `geo-service` **no lo conocen**: se conectan con el driver `pg` a una `DATABASE_URL`.
Cambiar a PostgreSQL real es cambiar esa variable, sin tocar código.

### Qué SQL se apoya en PostGIS o en funciones de PostgreSQL

`ST_Contains`, `ST_Intersects`, `ST_DWithin`, `ST_Distance`, `ST_Expand`, `ST_MakeEnvelope`,
`ST_MakePoint`, `ST_SetSRID`, `ST_X`/`ST_Y`, `ST_AsGeoJSON`, `ST_GeomFromGeoJSON`, `ST_Multi`,
`ST_SimplifyPreserveTopology`, `ST_GeneratePoints`, `ST_Dump`, `ST_ClusterDBSCAN`, índices GIST,
casts a `geography`, `ON CONFLICT`, `unnest` y `pg_advisory_xact_lock`.

Todo eso funciona hoy sobre PGlite: lo ejercitan los 153 tests del repositorio.

### Diferencias observadas y comprobadas

1. **Una sola conexión real.** `PGLiteSocketServer` multiplexa todas las conexiones sobre un
   único backend. Consecuencias medidas durante la auditoría:
   - Una transacción abierta bloquea a las demás conexiones. Un test que abría una transacción
     en una conexión y escribía por otra se quedó colgado; hubo que escribirlo con dobles.
   - No reproduce el bug de emitir `BEGIN` sobre un `Pool`, que **sí** rompe contra PostgreSQL
     real. Por eso `packages/db/test/ejecutor.test.ts` usa un `Pool` falso.
   - Con `maxConnections` bajo, los reinicios de servicios agotaban el cupo y todo caía con
     `read ECONNRESET`. Subido a 40 y configurable con `PGLITE_MAX_CONEXIONES`.
2. **`ST_ClusterDBSCAN` puede no estar** en la build. `construirPuntosCriticos` lo intenta y, si
   falla, cae a un DBSCAN equivalente en Node. En esta máquina sí está (`motor: 'postgis'`).
3. **Rendimiento no comparable.** Las cifras del banco de puntos críticos son de PGlite; contra
   PostgreSQL real serán otras. Sirven para comparar *entre sí* dos implementaciones, no como
   promesa de latencia en producción.

## Decisión

1. **PGlite se queda para desarrollo y pruebas.** Da un PostGIS que arranca en segundos, sin
   Docker ni permisos de administrador, y ha sido suficiente para ejercitar todo el SQL del
   proyecto. Quitarlo hoy costaría el entorno de desarrollo y no compraría nada.
2. **PGlite NO va a producción.** La Fase 2 corre sobre `postgis/postgis:18-3.6` (o el PostgreSQL
   gestionado del hosting). Queda escrito aquí para que nadie lo dude.
3. **La suite tiene que correr también contra PostgreSQL real antes de la puerta de Fase 2.**
   `levantarBaseEfimera()` acepta ya una `DATABASE_URL` externa vía `PGLITE_*`; el paso pendiente
   es un trabajo de CI que levante el contenedor de PostGIS y ejecute los mismos tests. No se
   añade ahora porque no se puede probar sin demonio de Docker, y un trabajo de CI que nunca
   corrió es una suposición.
4. **Lo que PGlite no puede probar se prueba con dobles.** Concretamente todo lo que dependa de
   varias conexiones concurrentes reales: transacciones sobre `Pool`, locks entre sesiones,
   `SELECT ... FOR UPDATE` con contención.

## Consecuencias

**A favor**

- El entorno de desarrollo sigue siendo `pnpm db:local` y nada más.
- Los tests corren en CI sin servicios externos: rápidos y sin infraestructura que mantener.
- Migrar a PostgreSQL real no toca código de aplicación.

**En contra / riesgos asumidos**

- Hay una clase de fallos —los de concurrencia real entre conexiones— que la suite **no** puede
  detectar hoy. Es el riesgo principal y está anotado como pendiente de la Fase 2.
- Una diferencia de comportamiento entre PGlite y PostgreSQL aparecería al desplegar, no antes.
  Mitigación: el punto 3.
- La extensión es experimental: una actualización puede romper el entorno de desarrollo. Las
  versiones están fijadas exactas en `packages/db/package.json`.

## Revisión

Al abrir la Fase 2, cuando exista Docker o un PostgreSQL gestionado: ejecutar la suite completa
contra él y anotar aquí cualquier diferencia encontrada.
