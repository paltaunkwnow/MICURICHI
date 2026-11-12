# db — Parte 4 (datos, base de datos y arquitectura geoespacial)

Esquema, migraciones SQL, cliente tipado (Drizzle + `pg`), seeds sintéticos y **PostGIS local sin Docker**.

## Almacenamiento vigente del release:0022 compatible (ADR0026)

Este código usa `public.reporte` con `detalle` JSONB como fuente única de dominio y
`detalle_version=1`. Conserva los contratos0.24.0, ambos POST, alias planos/CSV, severidad,
identidad, geometrías, publicación y cupos vigentes. Retirar almacenamiento no retira HTTP.
La instalación demo sigue en21 hasta una actualización coordinada autorizada; estas
instrucciones describen el release, no una migración ya ejecutada sobre instalaciones.

La0022 retira la vista `reporte_inundacion`, su trigger/funciones, seis columnas de dominio,
cinco ENUM SQL y la cuota pública. Mantiene `detalle_es_objeto`, `detalle_tope` (8192bytes),
FK/catálogos y garantías equivalentes de tipos/dominios flood. Los CHECK validados
`m10_0022_detalle_version_v1` y `m10_0022_inundacion_detalle_v1` identifican el esquema;
el primero lleva el comentario `mi_curichi:esquema=0022;almacenamiento=json;detalle_version=1`.
Se pueden comprobar en catálogos sin conceder SELECT sobre `_migraciones` a la API.

`public.estado_esquema_m10()` devuelve solo `(version integer, integro boolean)`: lee el
historial cualificado y comprueba columnas críticas, archivo/PK y los objetos de la contracción.
Un registro futuro0023/9999 o un estado parcial devuelve integridadfalse; la API acepta
únicamente22 íntegro. Es SQL STABLE SECURITY DEFINER con `search_path=pg_catalog,pg_temp`,
sin argumentos, sin EXECUTE aPUBLIC/geo y con EXECUTE específico aAPI. No concede SELECT
del historial. La reversa retira esta interfaz22. Catálogos y función tienen objetivos distintos:
el marcador estructural por sí solo no identifica un registro de migración futuro.

Inundación conserva exactamente la representación0020: tres claves obligatorias y
opcionales NULL omitidas, con booleanfalse conservado. No hay normalización destructiva
de otros detalles ni imposición del contrato literal de una categoría a fixtures sintéticos.

**Consentimiento explícito:** la invocación general del runner/CLI y el arranque local
rechazan0022 pendiente antes de mutar si falta `--autorizar-contraccion-compatible`.
La opción interna es `autorizarContraccionCompatible?: boolean`, false por defecto.
No existe variable de entorno que la autorice. La bandera0015 es independiente.
La señal `curichi.autorizar_contraccion_compatible='si'` y el marcador
`curichi.autorizar_contraccion_compatible_tx=txid_current()::text` son locales a la
transacción0022; SQL directo sin señal coherente falla. Un no-op ya aplicado no exige
volver a autorizar. La bandera no acredita parada de escritores ni autoriza operaciones reales.

`resguardo_m10.cuota_reporte_diaria` conserva los cinco valores completos, PK y UUID,
sinFK que elimine la copia. Es exclusivo del dueño, sinPUBLIC/API/geo, limpieza o caducidad.
Archivo existente solo se reutiliza con estructura/propietario/ACL compatibles e igualdad
exacta en ambos sentidos; divergencia aborta, sin sobrescribir ni mezclar archivos.

La reversa propia `migraciones/reversas/0022_contraccion_compatible_reversa.sql` recupera21
con cuatro categorías y datos aceptados en22, restaurando cuota, planos/ENUM/trigger/vista
y ACL. Aborta si faltan usuarios requeridos o existen versiones no reversibles. Conserva
el archivo y borra solo el registro0022. Una recontracción tras cambiar legítimamente la
cuota restaurada puede quedar bloqueada por divergencia: se conserva la copia anterior.
La recuperación operacional también debe reponer código compatible21 y verificar cada
etapa con escritores/mantenimiento pausados; esta reversa SQL no demuestra esa operación.

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

`cuota_reporte_diaria` es la cuota histórica: una fila por cuenta y por día calendario de la
ciudad con `reportes_n` y `fotos_n`. Desde M3b api-core reserva en `cupo_contador` (ver abajo).
M10.4 conservó su tabla/mantenimiento/ACL. Desde0022 está archivada, sin uso operativo ni
limpieza. `ejecutarMantenimiento` conserva `cuotasDiariasBorradas` como obsoleto siempre0,
separado de `cupoContadorBorrado`, que continúa limpiando ventanas según el día local.
`dia` no tiene DEFAULT: con `current_date` en UTC, en La Paz el día cambiaría a las 20:00.

## Historia de la expansión multicategoría (0020–0021)

Las tablas de vista/planos/trigger siguientes describen el estado histórico21 y las
pruebas acotadas a0020/0021. En latest0022 esos objetos se retiran como se describe arriba.

La 0020 deja la base lista para varias categorías sobre un mismo núcleo
([ADR 0009](../../docs/decisiones/0009-nucleo-y-registro-de-categorias.md),
[0010](../../docs/decisiones/0010-modelo-de-datos-hibrido-del-reporte.md),
[0011](../../docs/decisiones/0011-migracion-de-inundaciones.md),
[0017](../../docs/decisiones/0017-cupo-por-categoria-configurable.md)), conservando el contrato HTTP
y una vista de compatibilidad. API y geo-service ya usan `reporte`; en M10.4 también pasan a esa
tabla el seed, el helper y el banco TS de este paquete, con categoría explícita. Los scripts de
raíz tienen su bloque propio de adaptación. Sigue el patrón expandir → convivir → contraer:
las columnas planas de inundación conviven con el `detalle` hasta la contracción física posterior.

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

El espejo actual Drizzle declara `esquema.reporte` sin planos ni espejo de la vista retirada,
y `cuotaReporteDiariaArchivada` en el esquema restringido, sinFK. La comparación del mirror
es estricta en nombres, tipos, nulabilidad y DEFAULT, también para el archivo.
La FK tipada `reporteFoto.reporteId` apunta a `reporte.id` con `ON DELETE CASCADE`, igual que
el catálogo después del renombre 0020. Corregir este espejo no aplica ni genera DDL.

### Consumidores internos de DB (M10.4)

El seed y el helper escriben en `reporte` con `categoria = 'inundacion'` explícita. Desde0022
escriben JSON/version1 preservando los mismos valores y orden de sorteos del RNG. Los dos
DELETE del seed y su conteo mantienen también el filtro
de Inundaciones. El seed conserva su RNG y su comportamiento global: recrea las cuatro cuentas
locales, completa geometrías públicas pendientes y recalcula puntos críticos de todas las categorías.

`test/m10-consumidores-internos.test.ts` usa datos ficticios en PGlite `memory://`: comprueba
defaults, IDs, fechas, geometrías, opcionales ausentes/false, RNG, asociación y cascade selectivo
de fotos en cuatro categorías. Los negativos de siembra usan autores ajenos a las cuentas
recreadas; comprueban reportes y fotos conservados y membresía recalculada, sin exigir los mismos
UUID de puntos críticos reconstruidos. El archivo se conserva mientras las cinco claves vigentes
se prueban en el límite del día local, con dos pasadas de mantenimiento independientes.

El banco `banco-puntos-criticos.ts` se puede importar sin abrir conexiones. La fixture ejecuta
el SQL de su builder y su selección filtrada, conservando rejilla y distribución. No ejecuta el
banco manual de rendimiento ni acredita sus tiempos, PostgreSQL real o el SQL HTTP actual.
Sus volúmenes predeterminados y sus cinco muestras de comparación completo/incremental siguen
siendo los del banco histórico. Los bancos de `scripts/` corresponden a Parte 5.

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
| `categoria` | `SELECT` | `SELECT` |
| `cupo_contador` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | ninguno |
| `resguardo_m10.cuota_reporte_diaria` (archivo) | ninguno | ninguno |

`pnpm --filter db privilegios` recorre public/geo/resguardo_m10 y comprueba propietario,
ACL de tabla/esquema y ausencia de USAGE/CREATE sobre el archivo para los servicios, incluido
PUBLIC. El módulo es importable sin leer DATABASE_URL/conectar; sus pruebas usan pool inyectado.
No se ejecuta ese CLI contra una instalación real como parte de la verificación aislada.

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

Si ya se llegó al límite no devuelve fila. Desde M3b es el contador vigente: las claves
`reportes:inundacion`, `reportes:bache`, `reportes:basura` y `reportes:area_verde` reservan por
categoría; `fotos:cuenta` es global. `ejecutarMantenimiento` borra las ventanas cuyo día en la ciudad
(`ZONA_HORARIA`) pasó y lo informa en `cupoContadorBorrado`. No suma ni recicla los datos o el
campo de resumen de la cuota antigua. Su retiro/archivo se hace en0022 por ADR0026.
Las fixtures prueban permisos efectivos dentro de PGlite; no certifican PostgreSQL real.

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

## Recurrencia por categoría (M6)

`recalcularPuntosCriticos` y `recalcularEntornoDeReporte` usan el radio de la definición
registrada de cada categoría. Solo agrupan `validado` y `resuelto`; `nuevo`, `rechazado`
y `duplicado` no forman ni unen puntos críticos. El catálogo `categoria.activa` no gobierna
ese cálculo: desactivar una categoría conserva su historial verificado y su agrupamiento
mientras exista su definición. Sin definición y sin radio explícito, se omite su agrupación;
el recálculo completo informa `categoriasSinDefinicion`.

| Definición real | Radio de recurrencia | Umbral aprobado de aviso de diámetro |
|---|---:|---:|
| Baches | 10 m | > 40 m |
| Inundaciones | 25 m | > 100 m |

La regla del aviso es `diámetro > radioGrupo ×
(CONFIG_DOMINIO.RECURRENCIA_DIAMETRO_ADVERTENCIA_M / CONFIG_DOMINIO.RECURRENCIA_RADIO_M)`:
el factor vigente es 100/25 = 4. El ajuste M6.3 conserva el umbral de Inundaciones en
100 m y aplica 40 m a Baches. La métrica de agrupación sigue
siendo metros en `ST_Transform(geom, CRS_METRICO_EPSG)`; el diámetro conserva su cálculo
aproximado existente, sin redondearlo antes de decidir la advertencia.

[puntos-criticos-bache.test.ts](test/puntos-criticos-bache.test.ts) comprueba la matriz real
9,9/10,1 m en ambos ejes, 20 m, superposición, encadenamiento y retirada del puente,
historial inactivo y exclusión de no verificados. Compara miembros de los grupos entre
incremental, PostGIS y alternativa Node, sin depender de UUID de puntos críticos. Solo
`42883` habilita esa alternativa; los otros errores deben propagarse.
[puntos-criticos-categoria.test.ts](test/puntos-criticos-categoria.test.ts) conserva la
abstracción sintética de radio 30 m y los negativos de ausencia mediante registro inyectado
de solo Inundaciones. Las pruebas M6.3 se verifican sobre PGlite efímero; no conectan
las bases habituales ni activan categorías en ellas.

Registrar una definición no activa una instalación habitual. La actividad pública exige
además catálogo activo, comprobado por API/geo; el piloto local tiene su ventana aislada.

## Pruebas históricas y comportamiento vigente (M10.5)

Las pruebas de una transición histórica fijan su versión en cada aplicación y reejecución
del migrador. Verifican el catálogo y filas reales de esa versión; no sustituyen las pruebas
del esquema vigente.

| Suite | Versión y alcance |
|---|---|
| `migracion-0017-frecuencia-agua-estancada.test.ts` | 0016→0017, desde cero e idempotencia hasta 0017; orden del enum, frecuencias anteriores y filas de agua estancada. El nombre histórico sigue siendo la tabla `reporte_inundacion`. |
| `migracion-0019-ubicacion-aproximada.test.ts` | 0018→0019, desde cero e idempotencia hasta 0019; métodos anteriores y ubicación aproximada con precisión 178/distancia NULL, antes del renombre. |
| `migracion-0020-base-multicategoria.test.ts` | Transición 0019→0020, desde cero, idempotencia y funciones/ACL hasta 0020. Excepción explícita: reversa 0021→0019 y reaplicación de 0020+0021 hasta 0021, conservando datos, catálogo y rechazo de otras categorías. |
| `migracion-0021-indice-categoria-creado.test.ts` | Índice, idempotencia y EXPLAIN hasta 0021. Una copia temporal de las migraciones reales incorpora una centinela posterior ficticia, sólo para detectar aplicaciones sin límite; no añade ni reserva una migración de producto. |
| `puntos-criticos-entorno.test.ts`, `puntos-criticos-metrica.test.ts` | Comportamiento actual sobre latest, tabla física `reporte` y categoría explícita. Mantienen radios, CRS, pares métricos, volumen de 2000, concurrencia y equivalencia entre los caminos existentes. |

Las dos suites vigentes comprueban con filas de las otras tres categorías, superpuestas en
el mismo punto, que las lecturas y los dos lados de distancias siguen acotados a Inundaciones.
Su limpieza elimina sólo reportes y puntos críticos de Inundaciones; los negativos conservan
filas, estados y grupos ajenos y retiran únicamente sus propios IDs al terminar.

Las suites actuales de migraciones/espejos y las integraciones de seed/helper/FK de M10.4
continúan disponibles sobre latest. No se congela el conjunto del paquete en 0021. Estos
controles son fixtures PGlite sintéticas; EXPLAIN y recuentos de trabajo no certifican tiempos,
concurrencia de PostgreSQL real, comportamiento HTTP o una instalación de producción.

## Configuración por ciudad

| Variable | Por defecto | Qué es |
|---|---|---|
| `CRS_METRICO_EPSG` | `32720` (UTM 20S, Santa Cruz; `CONFIG_DOMINIO` de contracts) | CRS en metros del radio de los puntos críticos. Otra ciudad: su zona UTM |
| `MIGRAR_LOCK_TIMEOUT_MS` | `10000` | `lock_timeout` de cada migración (0 = sin límite, solo a propósito) |

Un valor mal escrito en cualquiera de las dos se rechaza con un error que nombra la variable.

## Qué exporta

- `crearPool`, `crearDrizzle`, `esperarBaseDeDatos`, `esquema` (tablas Drizzle, entre ellas `reporte`,
  `cuotaReporteDiariaArchivada`, `categoria` y `cupoContador`).
- `aplicarMigraciones(ex, opciones?)` con `{ directorio?, hasta?, lockTimeoutMs?, publicarNuevosExistentes?, autorizarContraccionCompatible? }` (o la carpeta, como antes), `resolverHasta`, `ejecutorPg`, `ejecutorPglite`.
- `recalcularPuntosCriticos` y `recalcularEntornoDeReporte` (misma métrica: metros sobre `ST_Transform(geom, CRS_METRICO_EPSG)`; `ST_ClusterDBSCAN` o, si la build de PostGIS no lo tiene, DBSCAN equivalente en Node).
- `crsMetricoEpsg()` y `lockTimeoutMigracionMs()`: leen y validan la configuración de arriba.
- `crearOActualizarCuenta`, `desactivarCuenta`, `reactivarCuenta` y sus validaciones
  (`normalizarEmail`, `normalizarNombre`, `normalizarRol`, `validarPassword`): lógica del CLI de
  cuentas de arriba.
- `db/test-utils`: `levantarBaseEfimera()` para tests de otras partes.
