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
- La 0015 toma un bloqueo exclusivo sobre `reporte_inundacion` mientras rellena `publicar_en` y
  reconstruye los dos índices públicos: lecturas y escrituras de reportes esperan hasta que termina.
  Con decenas de miles de reportes son segundos; con muchos más, medirlo antes en una copia.
- La 0016 (contracción) va en un despliegue **posterior** al de T3 y T4, cuando ya no queda ningún
  api-core anterior atendiendo: revoca y borra `usuario.ultimo_reporte_en` (la espera de 60 min,
  reemplazada por el cupo diario de la 0014) y le quita el DEFAULT now() a `publicar_en`. Desde
  ahí, un INSERT en `reporte_inundacion` que no fije `publicar_en` falla con NOT NULL (23502) en
  lugar de publicar el reporte al instante: pruebas, seeds y restauraciones tienen que fijarlo.
  Solo toca el catálogo (no reescribe tablas) y los valores de `ultimo_reporte_en` se pierden.

## Cupo diario (migración 0014)

`cuota_reporte_diaria` guarda una fila por cuenta y por día calendario de la ciudad con
`reportes_n` y `fotos_n`. api-core la incrementa con `INSERT … ON CONFLICT DO UPDATE … WHERE n <
máximo`, y `dia` lo calcula quien escribe en `ZONA_HORARIA` (no hay DEFAULT: con `current_date` en
UTC, en La Paz el día cambiaría a las 20:00). `ejecutarMantenimiento` borra los días anteriores al
de hoy en la misma zona (`ZONA_HORARIA`, o la del contrato si no está definida).

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

- `crearPool`, `crearDrizzle`, `esperarBaseDeDatos`, `esquema` (tablas Drizzle).
- `aplicarMigraciones(ex, opciones?)` con `{ directorio?, hasta?, lockTimeoutMs? }` (o la carpeta, como antes), `resolverHasta`, `ejecutorPg`, `ejecutorPglite`.
- `recalcularPuntosCriticos` y `recalcularEntornoDeReporte` (misma métrica: metros sobre `ST_Transform(geom, CRS_METRICO_EPSG)`; `ST_ClusterDBSCAN` o, si la build de PostGIS no lo tiene, DBSCAN equivalente en Node).
- `crsMetricoEpsg()` y `lockTimeoutMigracionMs()`: leen y validan la configuración de arriba.
- `crearOActualizarCuenta`, `desactivarCuenta`, `reactivarCuenta` y sus validaciones
  (`normalizarEmail`, `normalizarNombre`, `normalizarRol`, `validarPassword`): lógica del CLI de
  cuentas de arriba.
- `db/test-utils`: `levantarBaseEfimera()` para tests de otras partes.
