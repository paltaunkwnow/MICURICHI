# 11 · Escalado y uso como base de un ecosistema

> Pensado para la prueba de escalado y para decidir si Mi Curichi sirve de base a otros sistemas.
> Separa los **hechos** (medidos o leídos en el código) de las **recomendaciones**. Las
> recomendaciones **no están implementadas**: según CLAUDE.md, cualquier cambio de código necesita
> un plan aprobado.
>
> Leyenda: **[C]** confirmado en código · **[M]** medido (Fase 4, `docs/TRASPASO.md` §9 y
> `docs/operaciones/produccion.md`) · **[I]** inferido · **[R]** recomendación.

---

## Parte A — Escalar este sistema

### A.1 Qué ya escala horizontalmente [C/M]

| Mecanismo | Con N réplicas | Por qué |
|---|---|---|
| Sesiones | ✔ | Tabla `sesion` |
| Cupo diario por cuenta, tope de altas por IP, freno de login | ✔ | Tablas `cuota_reporte_diaria` e `intento_login` (upsert atómico) |
| Idempotencia de creación | ✔ | Tabla `idempotencia` + `FOR UPDATE` (12 envíos con la misma clave → 1 reporte [M]) |
| Publicación diferida | ✔ | Es un filtro sobre `publicar_en`; no hay ningún proceso que publique |
| Migraciones | ✔ | Job aparte + advisory lock 4022 (8 réplicas a la vez, 24/24 rondas sin fallo [M]) |
| Puntos críticos | ✔ | Advisory lock 4021 compartido entre el recálculo completo y el incremental |
| Mantenimiento | ✔ | `pg_try_advisory_lock(4023)`: lo hace una sola réplica |
| Proxy → apps | ✔ | Caddy reparte por DNS de Docker (`dynamic a`, `round_robin`) |
| Métricas | ✔ | Prometheus descubre las réplicas por DNS y suma |
| **Rate limit por IP** | ✘ ×N | Está en la memoria de cada proceso: con 3 réplicas, 10/h pasan a ser 30/h |
| Caché de capas y cifras de geo-service | ≈ | Cada réplica tiene la suya: más memoria y consultas, sin inconsistencia; la invalidación llega a una y las demás se ponen al día en 10 s o menos |
| **Fotos en disco** | ≈ | Las comparten las réplicas **de una misma máquina** (volumen). Entre máquinas hace falta `S3_ENDPOINT` (`AlmacenS3` ya existe y está probado contra MinIO) |

### A.2 Dónde está el cuello de botella [M]

**La CPU de PostgreSQL.** Listado por bbox con 1 000 000 de reportes:

| CPU de `postgis` | 10 concurrentes | 100 concurrentes |
|---|---|---|
| 2 | 21 rps, p95 613 ms | 20 rps, p95 5,9 s, **433 respuestas 503** |
| 6 | **142 rps**, p95 84 ms | **117 rps**, p95 1,7 s, 0 respuestas 503 |

- Mientras tanto api-core y geo-service estaban al **0,03 % de CPU**, y el **83 %** de cada petición
  era espera a la base.
- **Agrandar el pool no ayuda sin CPU en la base**: de 8 a 24 conexiones empeoró de 106 a 433
  respuestas 503.
- Regla documentada: **total de conexiones (réplicas × `DB_POOL_MAX`) ≈ 2 a 4 por núcleo de la base**.
- Corolario: **más réplicas de API no suben el techo**. Lo suben la CPU de la base y, después,
  réplicas de lectura [M + R].

> **Nota del 2026-10-07** (FASE 2): el corolario vale **con la base saturada**. Se midió de nuevo con
> 100 000 reportes y la base con 4 CPU.
>
> - El primer cuello fue **un proceso de `api-core`**: ~71–80 rps de mapa al 115 % de CPU.
> - Pasar a 3 instancias subió el techo a ~100–112 rps.
>
> Detalle y condiciones en
> [12 §20 y §22](12-evaluacion-arquitectonica-y-escalabilidad.md#20-escalamiento-horizontal). Lo de
> arriba se conserva como registro de la Fase 4.

### A.3 Qué se rompe primero al crecer en volumen [M]

| Reportes | Síntoma | Palanca |
|---|---|---|
| ~10 000 | Nada (todo por debajo de 6 ms) | — |
| ~100 000 | El agregado por UV tarda 47 ms | — |
| ~1 000 000 | El agregado por UV tarda 264 ms (mitigado con caché SWR); el `OFFSET` profundo, 24 ms | Vigilar |
| ~5 000 000 (proyectado) | El agregado pasa del segundo | **Vista materializada** refrescada en segundo plano [R] |
| ~10 000 000 (proyectado) | El recálculo **completo** de puntos críticos tarda minutos (41,9 s con 750 000); la tabla ronda los 5 GB | Recálculo por zonas y más memoria para la base [R] |

> **Nota del 2026-10-07**: con el SQL actual, el agregado por UV tardó **184 ms con 100 000**
> reportes, frente a los 47 ms de la tabla. Ordena 100 035 filas en disco con `work_mem` de 8 MB.
> Ver [12 §17](12-evaluacion-arquitectonica-y-escalabilidad.md#17-evaluación-de-postgresql).

Otros límites conocidos:

- **DBSCAN encadena**: con datos densos, un solo punto crítico se tragó 750 021 reportes [M]. El
  radio de 25 m es un parámetro de dominio pendiente.
- `CREATE INDEX` en una migración bloquea escrituras: 0,95 s con 750 000 filas [M].

### A.4 Presupuestos y lo medido (1 M de reportes, PostgreSQL real) [M]

| Qué | Presupuesto | Medido |
|---|---|---|
| `GET /reportes` p95, 10 concurrentes | < 300 ms | 110 ms |
| `GET /reportes?bbox` p95, 10 concurrentes | < 800 ms | 84 ms (6 CPU) |
| `POST /reportes` p95, 48 concurrentes | < 500 ms | 203 ms |
| PIP p95 | < 100 ms | 17,7 ms |
| Teselas desde caché p95 | < 100 ms | 5,4 ms |
| Bloqueo del bucle de eventos (20 logins) | < 50 ms | 11,6 ms |
| Arranque hasta `healthy` | < 60 s | ~25 s |
| Restauración por GB | < 60 s | 19,6 s |

> Estas cifras son de la Fase 4 (2026-09-15). Desde entonces cambiaron las cuentas, la publicación
> diferida, la ubicación del dispositivo y los índices (0015, 0018). **Hay que volver a medir.**

### A.5 Cómo correr la prueba de escalado (paso a paso)

**1. Elegir la base** (ver [00](00-puesta-en-marcha-y-prueba-manual.md) §5).

- Lo más simple es usar `curichi_revision`, que ya está migrada, con las capas reales y los seeds.
- Para la pila Docker completa hay que apuntar el job `migraciones` y los servicios a esa base:
  - el Compose arma las URL con `POSTGRES_DB`;
  - hay una variable `MIGRAR_BASE` para el job, y `API_DATABASE_URL_DOCKER` y
    `GEO_DATABASE_URL_DOCKER` para los servicios [C, `docker-compose.yml`].

**2. Completar el `.env` para la topología con proxy** (faltan en el `.env` local):

```text
DOMINIO_PUBLICO=curichi.localhost
DOMINIO_PANEL=panel.curichi.localhost
PROXY_TLS=interno
PROXY_PUERTO_HTTP=127.0.0.1:8080
PROXY_PUERTO_HTTPS=127.0.0.1:8443
PANEL_ADMIN_URL_DOCKER=https://panel.curichi.localhost:8443
```

Además hacen falta `IP_HASH_SAL`, `JITTER_SAL`, `GEO_TOKEN_INTERNO` y `METRICAS_TOKEN` de 32
caracteres o más: el `.env` local tiene esas claves, pero no se comprobó su longitud.

**3. Construir y levantar con réplicas.** Los contenedores viejos de `api-core` y `geo-service` son de
los mismos servicios: el Compose debería recrearlos con la configuración actual [I].

```bash
docker compose --profile servicios up -d --build --scale api-core=3 --scale geo-service=2 --scale web-ciudadano=2
docker compose ps
```

**4. Generar volumen** (rol dueño, contra la base elegida):

```bash
node scripts/banco-datos.mjs generar 100000     # después 1000000; «limpiar» los borra
node scripts/banco-consultas.mjs                # EXPLAIN: ¿índice o escaneo secuencial?
```

**5. Carga**:

```bash
API_CORE_URL=http://127.0.0.1:<puerto> node scripts/banco-carga.mjs 10,100,500
node scripts/banco-sostenido.mjs 30 8
```

- El puerto sale de `docker compose port api-core 3001`.
- Para medir el reparto entre réplicas, entrar **por el proxy** (`https://curichi.localhost:8443`, `-k`).

**6. Observar**:

- `--profile observabilidad`: Prometheus en `127.0.0.1:9090`.
- Métricas `curichi_db_pool_*`, `curichi_http_duracion_segundos` y `curichi_db_consulta_segundos`.
- `docker stats`, para comparar la CPU de `postgis` con la de los servicios.

**7. Variar en este orden**:

1. CPU de `postgis`;
2. `DB_POOL_MAX` respetando la regla 2–4 por núcleo;
3. réplicas.

**Advertencia** [C]: `scripts/banco-concurrencia.mjs` (2026-09-25) crea reportes **sin sesión y sin
`dispositivo`**, con el campo `ubicacion_metodo` que ya no existe. Contra el código actual va a
recibir 401 y 400: **está desactualizado** para el camino de escritura.

- La concurrencia de escritura vigente está en las pruebas `cuota-concurrencia-pg` y
  `fotos-cuota-concurrencia-pg` de api-core (`DATABASE_URL_PG_REAL`).
- Para medir la escritura con carga habría que adaptar el banco: login, `dispositivo` y cupo de 3
  por cuenta, o sea muchas cuentas [R].

### A.6 Palancas de escalado, por costo [R]

| # | Palanca | Esfuerzo | Notas |
|---|---|---|---|
| 1 | Más CPU y memoria para PostgreSQL | Configuración | Es la que más rinde según lo medido |
| 2 | Rate limit en el proxy (Caddy o el balanceador) | Configuración e infraestructura | Resuelve el ×N por réplica sin Redis |
| 3 | Capas y teselas detrás de una CDN | Infraestructura | Ya son `immutable` con huella: cacheables un año |
| 4 | `S3_ENDPOINT` a un S3 gestionado | Configuración | Hace falta con réplicas en **varias máquinas**; copiar antes las fotos ya guardadas |
| 5 | Vista materializada de agregados por UV | Migración + geo-service | Desde ~5 M de reportes |
| 6 | Réplica de lectura para `GET /reportes`, agregados y teselas | Código (dos pools) | geo-service es solo lectura: candidato natural |
| 7 | Recálculo de puntos críticos por zonas | Código (db) | Desde ~10 M |
| 8 | Invalidación de cachés entre réplicas (`LISTEN/NOTIFY`) | Código | Está en el backlog |
| 9 | `CREATE INDEX CONCURRENTLY` en migraciones grandes | Runner de migraciones | Hoy toda migración va en una transacción |

---

## Parte B — Usarlo como base de un ecosistema

Hay dos sentidos de «más sistemas como este»:

1. **El mismo producto en más ciudades.** Ya está previsto: ADR 0004, una instalación por ciudad.
2. **Otros productos** (otros problemas urbanos) **sobre la misma plataforma.** No está previsto en el
   código, pero gran parte es reutilizable.

### B.1 Mismo producto, otra ciudad (soportado hoy) [C]

| Qué cambiar | Dónde |
|---|---|
| Ciudad, país, locale, centro, zoom y zona horaria | `.env`: `CIUDAD_*` y `ZONA_HORARIA` (api-core las valida y las publica en `/configuracion`; las apps las leen en tiempo de ejecución) |
| CRS métrico para los puntos críticos | `CRS_METRICO_EPSG`: la zona UTM de la ciudad (api-core y db) |
| Capas administrativas | Nueva versión en `data/raw/<V>` + `config/capas.yaml` + `etl:run` y `etl:load` ([07](07-geodata-etl.md) §6) |
| Dominios, TLS e instalación | `DOMINIO_*`, `PROXY_TLS=acme`, `ACME_EMAIL` e `INSTALACION_NOMBRE` (etiqueta de alertas y prefijo de respaldos) |
| Secretos | Sales, tokens y contraseñas de rol **nuevos** por instalación |
| Primer admin | `node dist/cli/cuentas.js crear … --rol admin` (la contraseña por stdin) |

**Restos atados a Santa Cruz** que habría que resolver [C]:

- botón «Usar ubicación de prueba (Santa Cruz)» con coordenadas fijas (D2);
- texto «llamá al 911» en `ComoFunciona` y `Portada` (backlog: número por país);
- plano de zonificación del panel y lámina con la catedral (ya condicionados al nombre de la ciudad);
- `CIUDAD_POR_DEFECTO` (solo es el valor por defecto).

Las imágenes Docker son **las mismas** para todas las ciudades.

### B.2 Otros productos: qué es plataforma y qué es dominio

| Pieza | Clase | Comentario |
|---|---|---|
| Cuentas, login, sesiones, Argon2id en workers, freno de fuerza bruta, altas por IP | **Plataforma** | `db/password.ts`, `db/intentos-login.ts`, `api-core/auth.ts`, `rutas/auth.ts` |
| Roles y privilegios mínimos en PostgreSQL (por tabla y por columna) + verificación al arrancar | **Plataforma** | Patrón 0008/0009, `privilegios.ts`, `pnpm privilegios` |
| Cupo diario por cuenta, idempotencia, rate limit, honeypot | **Plataforma** | `cuota.ts`, `idempotencia.ts` |
| Publicación diferida + visibilidad única (pública, técnica, del autor) | **Plataforma** con parámetros | `visibilidad.ts`, `publicar_en`, `ESTADOS_PUBLICOS` |
| Ubicación del dispositivo (radio, precisión, aproximada) + privacidad (jitter, `geom_publico`) | **Plataforma geo** | Útil para cualquier reporte georreferenciado |
| PIP, capas versionadas con huella, MVT al vuelo, agregados por zona | **Plataforma geo** | geo-service completo + ETL |
| Fotos: magic bytes, WebP sin metadatos, cupo, guarda de disco, S3 SigV4, servido según visibilidad | **Plataforma** | `rutas/fotos.ts`, `almacen*.ts` |
| Moderación: máquina de estados, fusión de duplicados cercanos, auditoría | **Plataforma** con parámetros | `TRANSICIONES` en contracts |
| Puntos críticos (recurrencia DBSCAN) | **Plataforma geo** | Radio por dominio |
| Exportación CSV y GeoJSON segura (anti-fórmulas, truncado declarado) | **Plataforma** | Solo cambia la nota metodológica |
| Observabilidad, respaldos, proxy Caddy, Compose, CI, Dependabot, lanzador | **Plataforma** | Infraestructura completa |
| Enums (profundidad, frecuencia, causas, sumidero), severidad v2, `NOTA_METODOLOGICA` | **Dominio** | contracts |
| Formulario de reporte (pasos, preguntas, textos), detalle, leyenda | **Dominio** | web-ciudadano |
| Indicadores y pantalla ejecutiva | Mixto | La estructura sirve; las métricas son de inundación |
| Nombre, marca, paleta, logo, textos con voseo | **Dominio** | |

### B.3 Acoplamiento al nombre «curichi» (medido) [C]

- **77 archivos de código** (sin pruebas ni E2E) contienen «curichi».
- Identificadores técnicos con más usos:

| Identificador | Usos | Qué es |
|---|---|---|
| `curichi_sesion` | 90 | Cookie de sesión |
| `curichi.local` | 75 | Dominio del login corto y de las cuentas de desarrollo |
| `curichi_api` / `curichi_geo` | 67 / 39 | Roles de PostgreSQL |
| `curichi_*` | — | Métricas Prometheus |
| `curichi-sondeo` | — | Cabecera `x-curichi-sondeo` |
| `curichi-truncado` | — | Cabecera `X-Curichi-Truncado` |
| `curichi.publicar_nuevos_existentes` | — | GUC de la migración 0015 |
| `curichi-postgis`, `mi-curichi` | — | Contenedor y proyecto de Compose |
| `curichi-shell-v6` | — | Caché del service worker |
| `curichi:sesion-caducada` | — | Evento del panel |

- Las claves de advisory lock (4021/4022/4023) son números fijos: en una base compartida entre
  productos chocarían [I].

### B.4 Estrategias para un ecosistema [R]

| Estrategia | Ventaja | Riesgo |
|---|---|---|
| **1. Copiar el repo por producto** (fork o template) | Rápido; cada producto es independiente | Las correcciones de seguridad (y hubo muchas: ver `docs/seguridad/auditoria-2026-09.md`) hay que portarlas a mano a cada copia; deriva |
| **2. Monorepo de plataforma + paquetes de dominio** | Una corrección llega a todos; el contrato separa núcleo y dominio | Requiere refactorizar: extraer paquetes y parametrizar los nombres |
| **3. Un solo producto multi-dominio** (un «tipo de reporte» configurable) | Una sola instalación por ciudad para varios problemas | El más caro. Choca con el alcance cerrado (§3) y con el «multi-municipio» del backlog |

Camino sugerido si se elige la **2** (para planificar, no implementado):

1. **Parametrizar los nombres**: cookie, prefijo de cabeceras y de métricas, dominio del login corto,
   roles de base, nombres de caché y de proyecto. Por configuración o por constante de plataforma.
2. **Partir `contracts`** en `contracts-nucleo` (estados, roles, visibilidad, fotos, auth, geo,
   configuración) y `contracts-<dominio>` (enums, severidad, formulario, nota).
3. **Extraer la plataforma** en paquetes: `auth`, `cuotas` e `idempotencia`, `fotos`, `observabilidad`
   y `geo` (PIP + capas). Las rutas de dominio de api-core los componen.
4. **Plantilla de app**: el armazón de Next (`proxy.ts`, CSP, SW, sesión, mapa) como paquete o plantilla.
5. **Probar la plataforma una sola vez**: las pruebas de privacidad, visibilidad y concurrencia van
   en los paquetes extraídos.

Antes de reutilizar conviene **cerrar los pendientes** que se copiarían a cada sistema:

- D2: botón de ubicación de prueba en producción;
- D3: versión de la severidad;
- comentario de `TRUST_PROXY=2` en geo-service;
- Enter global en el formulario;
- tipos del panel;
- `banco-concurrencia.mjs` desactualizado;
- falta de checksum de migraciones.

### B.5 Checklist «sistema hermano» (estrategia 1, la más rápida) [R]

- [ ] Elegir nombre y reemplazar los identificadores de B.3 (cookie, roles, métricas, cabeceras,
      dominio de login, proyecto de Compose, caché del SW).
- [ ] Nuevos enums y nueva severidad en contracts. Reiniciar la versión del contrato y el
      CHANGELOG. Migración inicial con los enums nuevos (las migraciones de inundación son historia
      de este producto: conviene **consolidarlas** en una 0001 nueva) [R].
- [ ] Formulario y textos de la app pública. Nota metodológica.
- [ ] Indicadores y ejecutivo: decidir qué cifras tienen sentido.
- [ ] Capas: las mismas de la ciudad (reutilizables) u otras (otro `capas.yaml`).
- [ ] Secretos nuevos; **sin** las cuentas de desarrollo con contraseña corta en ningún entorno compartido.
- [ ] Correr toda la suite + E2E + `pnpm privilegios` + Trivy antes de la primera instalación.

---

## Parte C — Decisiones que conviene tomar antes de escalar

| # | Decisión | Por qué importa para escalar |
|---|---|---|
| 1 | Qué hacer con la base `curichi` (migración 0009, 5 `nuevo`) | Bloquea la pila Docker completa con el `.env` actual |
| 2 | D2: botón de ubicación de prueba en producción | Anula la ubicación obligatoria |
| 3 | Rate limit en el proxy o aceptar el ×N | Determina el antiabuso con réplicas |
| 4 | Fotos: disco (una máquina) o S3 gestionado (varias) | Determina si se puede escalar a más de una máquina |
| 5 | Mapa base de producción (OSM no sirve para producción) | Política de uso de OSM |
| 6 | Parámetros de dominio (radio 25 m, cupos, demoras) | El radio de 25 m provocó el «punto crítico gigante» con datos densos |
| 7 | Licencia del código y de los datos | Necesaria para replicar en otros municipios |
