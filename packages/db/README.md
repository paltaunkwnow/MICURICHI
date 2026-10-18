# db — Parte 4 (datos, base de datos y arquitectura geoespacial)

Esquema, migraciones SQL, cliente tipado (Drizzle + `pg`), seeds sintéticos y **PostGIS local sin Docker**.

## Modo local sin Docker (ADR 0002)

```bash
pnpm db:local           # PGlite + postgis por socket en 127.0.0.1:5433, aplica migraciones pendientes
pnpm db:seed:samples    # capas y reportes SINTÉTICOS de data/samples/geo + usuarios locales
```

`DATABASE_URL` por defecto: `postgresql://curichi:curichi@127.0.0.1:5433/curichi` (sin SSL). Con Docker: `docker compose up -d` y `DATABASE_URL` al puerto 5432; los comandos son los mismos.

Datos persistentes en `infra/.pglite/` (ignorado por git). `PGLITE_MEMORIA=1 pnpm db:local` usa memoria.

Con una base persistida que tenga reportes en `nuevo` de antes de la 0015, el arranque aborta por
el freno de esa migración (ver «Migrar en producción»). En local suelen ser datos de ejemplo: para
publicarlos a sabiendas y arrancar, `PGLITE_PUBLICAR_NUEVOS_EXISTENTES=1 pnpm db:local` (solo `1`
lo activa). Llamando al script directo también vale la bandera: `pnpm --filter db local --
--publicar-nuevos-existentes`.

## Usuarios locales creados por el seed (SOLO desarrollo)

| Email | Rol | Contraseña por defecto | Variable para cambiarla |
|---|---|---|---|
| `admin@curichi.local` | admin | `admin` | `SEED_ADMIN_PASSWORD` |
| `tecnico@curichi.local` | técnico | `tecnico` | `SEED_TECNICO_PASSWORD` |
| `vecina@curichi.local` | ciudadano | `vecina` | `SEED_VECINA_PASSWORD` |
| `ejecutivo@curichi.local` | ejecutivo | `ejecutivo` | `SEED_EJECUTIVO_PASSWORD` |

La cuenta ciudadana existe porque desde la migración 0009 **crear un reporte exige sesión**. Ver
el mapa no: eso sigue siendo público. Estas contraseñas están escritas en el repositorio a
propósito: son de desarrollo y no deben existir en ninguna instalación real.

La cuenta ejecutiva (rol `ejecutivo`, migración 0011) solo ve el resumen ejecutivo: no modera ni
exporta. El alta pública (`/auth/registro`) nunca crea este rol.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm db:migrate [--hasta NNNN] [--publicar-nuevos-existentes]` | Aplica migraciones pendientes (`migraciones/NNNN_*.sql`, registro en `_migraciones`), con tsx |
| `node dist/cli/migrar.js [--hasta NNNN] [--publicar-nuevos-existentes]` | Lo mismo, compilado y sin tsx: es lo que ejecuta el despliegue (`pnpm --filter db migrate:prod`) |
| `pnpm db:generate <nombre>` | Crea un archivo de migración nuevo |
| `pnpm --filter db puntos-criticos:recalcular` | Recalcula puntos críticos (§9.2) |
| `pnpm --filter db cuentas -- crear\|desactivar\|reactivar ...` | Alta, baja y reactivación de cuentas técnicas, ejecutivas y de administrador (ver más abajo), con tsx |
| `node dist/cli/cuentas.js crear\|desactivar\|reactivar ...` | Lo mismo, compilado y sin tsx: lo que se corre en producción (`pnpm --filter db cuentas:prod`) |
| `pnpm --filter db test` | Vitest sobre un PostGIS efímero en memoria: migraciones, PIP, DBSCAN, conexiones concurrentes |

## Migrar en producción

`node dist/cli/migrar.js` lee `DATABASE_URL` (obligatoria con `NODE_ENV=production`), escribe una
línea JSON por evento (forma de pino) y sale con 0 solo si todo quedó aplicado. Desde la imagen de
api-core, donde `db` viaja en `node_modules` con `dist/` y `migraciones/` (campo `files`), es
`node node_modules/db/dist/cli/migrar.js`. Tiene que correr como paso aparte y ANTES de arrancar los
servicios; el advisory lock hace que varias ejecuciones simultáneas sean seguras.

- Cada migración corre con `statement_timeout = 0` (0010 y 0011 reescriben la tabla de reportes y a
  un millón de filas pasan de los 30 s del pool) y con `lock_timeout = MIGRAR_LOCK_TIMEOUT_MS`
  (10 000 ms por defecto) para no quedar en cola detrás del tráfico. Si vence, la migración se
  deshace entera y el error lleva `code: "55P03"`: es reintentable.
- `--hasta NNNN` aplica hasta esa migración inclusive y se niega si la base ya va por delante. Sirve
  para restaurar un respaldo de una versión anterior: base vacía → `--hasta <versión del respaldo>`
  → `pg_restore --data-only` → migrar el resto, que es lo que convierte los datos viejos.
- `--publicar-nuevos-existentes` (migración 0015, publicación sin moderación previa): los reportes
  en `nuevo` recibidos antes se enviaron con la promesa de que un técnico los revisaba antes de
  publicarlos, y la 0015 los haría públicos al instante. Por eso aborta, sin cambiar nada, si queda
  alguno. Lo normal es moderar la bandeja antes de desplegar; la bandera los publica a sabiendas
  (`SET LOCAL curichi.publicar_nuevos_existentes = 'si'`, solo en esa transacción) y queda en el
  log. Con pnpm: `pnpm --filter db migrate -- --publicar-nuevos-existentes`.
- La 0015 toma un bloqueo exclusivo sobre `reporte_inundacion` (desde la 0020, `reporte`) mientras rellena `publicar_en` y
  reconstruye los dos índices públicos: lecturas y escrituras de reportes esperan hasta que termina.
  Con decenas de miles de reportes son segundos; con muchos más, medirlo antes en una copia.
- La 0016 (contracción) va en un despliegue **posterior** al de T3 y T4, cuando ya no queda ningún
  api-core anterior atendiendo: revoca y borra `usuario.ultimo_reporte_en` (la espera de 60 min,
  reemplazada por el cupo diario de la 0014) y le quita el DEFAULT now() a `publicar_en`. Desde
  ahí, un INSERT en `reporte_inundacion` que no fije `publicar_en` falla con NOT NULL (23502) en
  lugar de publicar el reporte al instante: pruebas, seeds y restauraciones tienen que fijarlo.
  Solo toca el catálogo (no reescribe tablas) y los valores de `ultimo_reporte_en` se pierden.
- La 0020 (base multicategoría, ver más abajo) renombra `reporte_inundacion` a `reporte`, agrega
  columnas y rellena el `detalle` de cada reporte existente: el `RENAME` y los `ALTER` toman un
  bloqueo exclusivo sobre la tabla un instante y el relleno reescribe cada fila una vez. Con muchos
  reportes, medirlo antes en una copia. Si falla, se deshace entera (una sola transacción) y el
  error lleva el motivo; la guarda inicial aborta, sin cambiar nada, si algún reporte tiene
  `profundidad_estimada`, `frecuencia` o `causa_presunta` en `NULL`.

## Cupo diario (migración 0014)

`cuota_reporte_diaria` guarda una fila por cuenta y por día calendario de la ciudad con
`reportes_n` y `fotos_n`. api-core la incrementa con `INSERT … ON CONFLICT DO UPDATE … WHERE n <
máximo`, y `dia` lo calcula quien escribe en `ZONA_HORARIA` (no hay DEFAULT: con `current_date` en
UTC, en La Paz el día cambiaría a las 20:00). `ejecutarMantenimiento` borra los días anteriores al
de hoy en la misma zona (`ZONA_HORARIA`, o la del contrato si no está definida).

## Base multicategoría (migración 0020)

La 0020 deja la base lista para varias categorías sobre un mismo núcleo
([ADR 0009](../../docs/decisiones/0009-nucleo-y-registro-de-categorias.md),
[0010](../../docs/decisiones/0010-modelo-de-datos-hibrido-del-reporte.md),
[0011](../../docs/decisiones/0011-migracion-de-inundaciones.md),
[0017](../../docs/decisiones/0017-cupo-por-categoria-configurable.md)) **sin cambiar lo que hace hoy**:
no cambia el contrato HTTP, y api-core, geo-service, los scripts y los seeds siguen diciendo
`reporte_inundacion`, ahora a través de una vista. Mientras solo esté activa la categoría
`inundacion`, nada cambia hacia afuera. Sigue el patrón expandir → convivir → contraer: las columnas
planas de inundación conviven con el `detalle` hasta la contracción (M10).

### Qué cambia

| Objeto | Desde la 0020 |
|---|---|
| `categoria` (tabla nueva) | Catálogo: `slug` (clave, en `snake_case`), `activa`, `orden`, `activada_en`, `activada_por`. Cuatro filas en el orden de `SLUGS_CATEGORIA` de `contracts`: `inundacion` (activa), `bache`, `area_verde` y `basura` (inactivas). |
| `reporte` (la ex `reporte_inundacion`, renombrada) | Es la tabla real de todas las categorías. El `RENAME` conserva el `id`, las claves foráneas (fotos, idempotencia, `fusionado_en_id`), los índices, los CHECK y los privilegios. |
| Columnas nuevas de `reporte` | `categoria` (FK a `categoria`, `NOT NULL DEFAULT 'inundacion'`), `subtipo`, `detalle` (`jsonb NOT NULL DEFAULT '{}'`) y `detalle_version` (`DEFAULT 1`). |
| Seis columnas de inundación | `profundidad_estimada`, `frecuencia` y `causa_presunta` pasan a admitir `NULL` (las tres del sumidero ya lo admitían). Para inundación su contenido se duplica en `detalle`. |
| CHECK nuevos | `detalle_es_objeto`, `detalle_tope` (el texto del `detalle` no pasa de 8192 bytes), `inundacion_campos_presentes` (una inundación trae profundidad, frecuencia y causa) y `no_inundacion_sin_campos` (otra categoría no trae ninguno de los seis campos). |
| Disparador `reporte_sincronizar_detalle` | En cada `INSERT` o `UPDATE` de una inundación arma el `detalle` con la función `detalle_inundacion(...)`, la misma que rellenó los reportes existentes. Omite las claves en `NULL` (las preguntas del sumidero sin responder). Se retira en M10. |
| Vista `reporte_inundacion` | Los reportes de `reporte` con `categoria = 'inundacion'` (ver abajo). |
| Índice `reporte_agregado_uv` | Recreado con `categoria` en el `INCLUDE`: a través de la vista la consulta suma `categoria = 'inundacion'` y, sin la columna en el índice, el agregado por UV de geo-service dejaría de ser un `Index Only Scan`. No hay índices nuevos por categoría. |
| `punto_critico.categoria` | Columna nueva (`NOT NULL DEFAULT 'inundacion'`, FK a `categoria`); los puntos críticos existentes son de inundación. |
| `cupo_contador` (tabla nueva) | Contador genérico de cupo (ver abajo). |

El espejo Drizzle sigue los dos nombres: `esquema.reporte` es la tabla y `esquema.reporteInundacion`
espeja la vista. Las vistas no tienen `DEFAULT` ni `NOT NULL`, así que `esquema-drizzle.test.ts`
compara el espejo de la vista solo por nombre y tipo de columna.

### Qué se puede y qué no se puede hacer por la vista

`reporte_inundacion` se creó con `security_invoker = true` (los privilegios se comprueban con el rol que
consulta, no con el dueño) y `WITH CASCADED CHECK OPTION`. Es una vista actualizable:

| Operación por `reporte_inundacion` | Resultado |
|---|---|
| `SELECT` y `SELECT … FOR UPDATE` | Funcionan; solo devuelven inundación. |
| `INSERT … RETURNING` | Funciona: `categoria` toma `'inundacion'` por `DEFAULT` y el disparador arma el `detalle` y su versión. |
| `UPDATE` y `UPDATE … FROM` | Funcionan. |
| `DELETE` | Funciona para quien tenga el privilegio (el dueño). Los roles de aplicación no lo tienen, ni sobre la vista ni sobre `reporte`. |
| `INSERT` de otra categoría (`categoria = 'bache'`, por ejemplo) | Falla por el `CHECK OPTION` (SQLSTATE `44000`). Lo mismo vale para un `UPDATE` que deje la fila fuera de inundación. Las otras categorías se escriben en `reporte`. |
| Índices y constraints | La vista no tiene ninguno propio: se miran en `reporte`. Conservan los nombres de antes (por ejemplo `reporte_inundacion_pkey`). |
| Columnas nuevas de `reporte` | **No aparecen.** La lista de columnas de una vista se fija al crearla (aquí es el `SELECT *` de ese momento): una migración que agregue una columna a `reporte` tiene que recrear la vista en la misma migración. `CREATE OR REPLACE VIEW` conserva los privilegios; un `DROP VIEW` los pierde, y hay que volver a darlos. |

Cuidado al insertar una categoría distinta de inundación: `causa_presunta` conserva su
`DEFAULT 'desconocida'`, que se aplica si el `INSERT` no la nombra y dispara el CHECK
`no_inundacion_sin_campos` (SQLSTATE `23514`). Ponela en `NULL` de forma explícita:

```sql
INSERT INTO reporte (geom, …, categoria, causa_presunta)
VALUES (…, 'bache', NULL);   -- sin «causa_presunta» en la lista, falla con 23514
```

Una inundación que omite `causa_presunta`, por la vista o por la tabla, sigue tomando `'desconocida'`
como hasta ahora.

### Privilegios

Los de `reporte` son los que tenía `reporte_inundacion` (se heredan del `RENAME`). La matriz completa
está en `src/cli/matriz-privilegios.mjs`.

| Objeto | `curichi_api` | `curichi_geo` |
|---|---|---|
| `reporte` | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |
| `reporte_inundacion` (vista) | `SELECT`, `INSERT`, `UPDATE` | `SELECT` |
| `categoria` | `SELECT` | `SELECT` |
| `cupo_contador` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | ninguno |

`pnpm --filter db privilegios` recorre las tablas base, así que la vista no figura en su matriz: lo que
decide es el privilegio sobre `reporte`.

### `cupo_contador`

Contador genérico de cupo por regla ([ADR 0017](../../docs/decisiones/0017-cupo-por-categoria-configurable.md)).
Su clave primaria es `(usuario_id, clave, ventana_inicio)`, con `n >= 0` y `clave` de 1 a 120 caracteres.
Se incrementa con un *upsert* atómico que no pasa el límite:

```sql
INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n) VALUES ($1, $2, $3, 1)
ON CONFLICT (usuario_id, clave, ventana_inicio)
DO UPDATE SET n = cupo_contador.n + 1, actualizado_en = now() WHERE cupo_contador.n < $4
RETURNING n;
```

Si ya se llegó al límite no devuelve fila. Las claves previstas para M3 son, por ejemplo,
`reportes:inundacion` (un cupo por categoría) y `fotos:cuenta` (global). **Nadie lo escribe todavía**:
api-core sigue usando `cuota_reporte_diaria` hasta M3 y esta se retira en M10. `ejecutarMantenimiento`
ya borra las ventanas cuyo día en la ciudad (`ZONA_HORARIA`) pasó y lo informa en `cupoContadorBorrado`.

### Reversa

`migraciones/reversas/0020_base_multicategoria_reversa.sql` deja el esquema como en la 0019. **El
migrador no la aplica** (`listarMigraciones` solo mira los `NNNN_*.sql` de `migraciones/`, no sus
subcarpetas): es una herramienta de operación que se corre a mano, con la URL del rol dueño, en su
propia transacción:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/migraciones/reversas/0020_base_multicategoria_reversa.sql
```

- **Cuándo vale.** Solo mientras todos los reportes sean de inundación. Si existe uno de otra
  categoría, aborta antes de cambiar nada con el mensaje «categoría distinta de inundación», porque
  perdería esos reportes: archivalos primero.
- **Qué hace.** Quita la vista, el disparador, las funciones, el índice nuevo, los CHECK y las columnas
  de la 0020, restablece el `NOT NULL` de las tres columnas de dominio, borra `categoria`,
  `cupo_contador` y `punto_critico.categoria`, devuelve a `reporte` su nombre de `reporte_inundacion`
  y **borra la fila de la 0020 en `_migraciones`**, todo en una sola transacción. Así la base queda
  como en la 0019 también para el migrador: una nueva corrida de `migrar` vuelve a aplicar la 0020.
  Los reportes de inundación se conservan: sus columnas planas son la fuente. Se pierden el `detalle`,
  el `subtipo`, el catálogo `categoria` y el contenido de `cupo_contador`.
- **Cómo se sabe que quedó igual.** `test/migracion-0020-base-multicategoria.test.ts` compara tablas,
  columnas, CHECK, índices y privilegios de una base revertida con los de una base migrada hasta la
  0019; comprueba que `_migraciones` queda con 0001–0019 y que una nueva corrida reaplica la 0020 (y
  el catálogo vuelve a ser el de la 0020); y comprueba que la reversa aborta si hay otra categoría. Las
  columnas quitadas dejan su hueco en el catálogo interno de PostgreSQL (`pg_attribute.attisdropped`);
  no se ve ni cambia ninguna consulta.
- **Lo que no hace.** No baja el código de este paquete: `ejecutarMantenimiento`, `rellenarGeometriaPublica`
  y el esquema Drizzle ya esperan la 0020 (consultan `reporte` y `cupo_contador`). Si de verdad vas a
  quedarte en la 0019, corré además la versión anterior de `db`.

## Primer administrador en producción

Los seeds sintéticos (`db:seed:samples`) se niegan con `NODE_ENV=production` porque crean cuentas
con contraseñas conocidas, y el alta pública (`POST /api/v1/auth/registro`) solo puede crear el rol
`ciudadano`: los privilegios por columna de la migración 0009 le retiran a propósito el permiso de
escribir `usuario.rol` al rol de aplicación (`curichi_api`). Resultado: una instalación nueva no
tiene, por sí sola, ninguna cuenta que pueda activar capas ni moderar reportes.

`node dist/cli/cuentas.js` es el CLI de administración de cuentas (compilado, sin `tsx`, mismo
contrato que `migrar.js`: `DATABASE_URL`, logs JSON, código de salida 0/1):

```bash
# Crear (o, con --actualizar, modificar rol/nombre/contraseña de) una cuenta.
node dist/cli/cuentas.js crear --email admin@municipio.gob.bo --nombre "Admin municipal" --rol admin [--actualizar]

# Desactivar una cuenta: activo = false y cierra (borra) todas sus sesiones.
node dist/cli/cuentas.js desactivar --email admin@municipio.gob.bo

# Reactivar una cuenta desactivada: activo = true. No toca contraseña ni rol.
node dist/cli/cuentas.js reactivar --email admin@municipio.gob.bo
```

- `--rol` acepta `admin`, `tecnico` o `ejecutivo`. `ciudadano` se rechaza: esas cuentas se
  registran solas.
- La contraseña **nunca se pasa por argumento** (quedaría en el historial de la shell y visible con
  `ps`): se lee de la variable `CUENTA_PASSWORD` o, si no está, de la entrada estándar.
- `DATABASE_URL` tiene que ser la del rol **DUEÑO** de la base, no la que usa el contenedor de
  `api-core` en tiempo de ejecución (`curichi_api`): ese rol no tiene permiso para escribir
  `usuario.rol`, a propósito, así que crear o cambiar un rol con él falla con un error de permisos
  de PostgreSQL.
- `crear --actualizar` **nunca reactiva** una cuenta desactivada (decisión deliberada: un cambio de
  contraseña no debe devolver el acceso por accidente). Para eso existe `reactivar`, que además no
  es idempotente a propósito: falla (código distinto de 0) si la cuenta no existe o si ya está
  activa, porque eso casi siempre significa que el email es el equivocado.
- Cada alta, actualización, desactivación o reactivación queda en `auditoria` (`crear_cuenta`,
  `actualizar_cuenta`, `desactivar_cuenta`, `reactivar_cuenta`; `actor_id` nulo porque no hay sesión
  de por medio).

Para correrlo dentro del contenedor de `api-core` (donde `db` viaja en `node_modules` con `dist/` y
`migraciones/`, igual que `migrar.js`, ver más arriba), pasándole la URL del rol dueño en vez de la
del contenedor. Las dos se leen sin eco y se pasan con `-e VAR` sin valor, así no quedan en el
historial de la shell (como en `docs/operaciones/produccion.md`):

```bash
read -rs DATABASE_URL && export DATABASE_URL        # postgresql://curichi:<password-dueño>@postgis:5432/curichi
read -rs CUENTA_PASSWORD && export CUENTA_PASSWORD  # la de la cuenta nueva
docker compose exec -e DATABASE_URL -e CUENTA_PASSWORD api-core \
  node node_modules/db/dist/cli/cuentas.js crear \
  --email admin@municipio.gob.bo --nombre "Admin municipal" --rol admin
```

## Configuración por ciudad

| Variable | Por defecto | Qué es |
|---|---|---|
| `CRS_METRICO_EPSG` | `32720` (UTM 20S, Santa Cruz; `CONFIG_DOMINIO` de contracts) | CRS en metros del radio de los puntos críticos. Otra ciudad: su zona UTM |
| `MIGRAR_LOCK_TIMEOUT_MS` | `10000` | `lock_timeout` de cada migración (0 = sin límite, solo a propósito) |

Un valor mal escrito en cualquiera de las dos se rechaza con un error que nombra la variable.

## Qué exporta

- `crearPool`, `crearDrizzle`, `esperarBaseDeDatos`, `esquema` (tablas Drizzle, entre ellas `reporte`,
  `reporteInundacion` —el espejo de la vista—, `categoria` y `cupoContador`).
- `aplicarMigraciones(ex, opciones?)` con `{ directorio?, hasta?, lockTimeoutMs? }` (o la carpeta, como antes), `resolverHasta`, `ejecutorPg`, `ejecutorPglite`.
- `recalcularPuntosCriticos` y `recalcularEntornoDeReporte` (misma métrica: metros sobre `ST_Transform(geom, CRS_METRICO_EPSG)`; `ST_ClusterDBSCAN` o, si la build de PostGIS no lo tiene, DBSCAN equivalente en Node).
- `crsMetricoEpsg()` y `lockTimeoutMigracionMs()`: leen y validan la configuración de arriba.
- `crearOActualizarCuenta`, `desactivarCuenta`, `reactivarCuenta` y sus validaciones
  (`normalizarEmail`, `normalizarNombre`, `normalizarRol`, `validarPassword`): lógica del CLI de
  cuentas de arriba.
- `db/test-utils`: `levantarBaseEfimera()` para tests de otras partes.
