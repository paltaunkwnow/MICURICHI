# 00 · Puesta en marcha y prueba manual

> Registro de cómo se levantó el proyecto el **2026-10-06** sobre el commit `3121a0f` de `main`, y
> guía para volver a levantarlo y probarlo a mano.
>
> Leyenda: **[C]** comprobado ejecutando o leyendo código · **[I]** inferido · **[Doc]** según otro documento.

---

> **Estado al 2026-10-07** (FASE 2):
>
> - La pila de `pnpm dev` de abajo **ya no está corriendo**.
> - Siguen arriba solo los contenedores `curichi-postgis` y `curichi-minio`.
> - `curichi_revision` quedó igual: 37 reportes y 22 puntos críticos.
>
> Allí se midió con 100 000 reportes sintéticos que después se borraron. Cómo se levantaron los
> servicios para medir: [12 §22](12-evaluacion-arquitectonica-y-escalabilidad.md#22-capacidad-actual-medida).
> La tabla de abajo es el registro del 2026-10-06.

## 1. Qué quedó corriendo

| Pieza | Dónde | Cómo se comprobó |
|---|---|---|
| PostgreSQL 18 + PostGIS 3.6 | Contenedor `curichi-postgis`, `127.0.0.1:5432` | `docker compose ps` → `healthy` [C] |
| Base de revisión | **`curichi_revision`** (nueva, en el mismo contenedor) | Migraciones 0001–0019 aplicadas [C] |
| api-core | `pnpm dev` (tsx watch) en `127.0.0.1:3001` | `/ready` → `{"ok":true,"db":"ok","geo":"ok","fotos":"ok","degradado":false}` [C] |
| geo-service | `pnpm dev` (tsx watch) en `127.0.0.1:3002` | `/ready` con las tres capas `DM_UV_MZ_2025` vigentes [C] |
| web-ciudadano | `next dev` en **http://localhost:3000** | Mapa público con **35 puntos** y capas de distritos y UV [C] |
| panel-admin | `next dev` en **http://localhost:3100** | Login como `admin` → bandeja `/reportes` con mapa [C] |

Datos de la base `curichi_revision` [C]:

- **Capas reales del municipio**: 16 distritos, 576 unidades vecinales y 27 527 manzanas, cargadas con
  `pnpm etl:load` desde `data/processed/DM_UV_MZ_2025` (generado el 2026-09-17). PostGIS reparó con
  `ST_MakeValid` 2 distritos, 1 UV y 17 manzanas.
- **Seeds sintéticos**: 4 cuentas de desarrollo y 37 reportes marcados `[muestra sintética]`
  (5 `nuevo`, 28 `validado`, 2 `rechazado`, 2 `resuelto`) y 22 puntos críticos.

Los 35 puntos del mapa público son `nuevo` + `validado` + `resuelto`. Los rechazados no se publican.

### Cuentas de desarrollo (solo local, las crea el seed)

| Usuario | Contraseña | Rol | Dónde entrar |
|---|---|---|---|
| `vecina` | `vecina` | ciudadano | http://localhost:3000/ingresar |
| `tecnico` | `tecnico` | técnico | http://localhost:3100 |
| `admin` | `admin` | admin | http://localhost:3100 |
| `ejecutivo` | `ejecutivo` | ejecutivo | http://localhost:3100/ejecutivo |

Se puede escribir solo el usuario: el sistema completa `@curichi.local`.

`localhost:3000` y `localhost:3100` **comparten la cookie** de sesión, porque el navegador no separa
cookies por puerto. Para tener a la vez un vecino y un técnico, usá una ventana de incógnito.

---

## 2. Qué se cambió en el entorno para levantarlo (y por qué)

| Acción | Motivo | Cómo deshacerla |
|---|---|---|
| `pnpm install --frozen-lockfile` | Los `node_modules` eran del 2026-09-23 y el lockfile cambió (Next 16.3.6, etc.) | — (es el estado correcto) |
| Se abrió **Docker Desktop** | El motor estaba apagado | Cerrar Docker Desktop |
| Se **detuvieron** (no se borraron) los contenedores `curichi-api-core` y `curichi-geo-service` | Eran de una imagen vieja (2026-09-27, `NODE_ENV=production`, código anterior) y ocupaban los puertos 3001/3002. Arrancaron solos con Docker (`restart: unless-stopped`) | `docker start curichi-api-core curichi-geo-service` |
| Se creó la base **`curichi_revision`** | La base original `curichi` está en la migración **0009** con 37 reportes y **5 en `nuevo`**. Migrarla al código actual borra columnas (0010) y **publica esos 5 `nuevo`** (0015), y eso es una decisión tuya, no técnica. Ver §5 | `docker exec curichi-postgis psql -U curichi -d postgres -c "DROP DATABASE curichi_revision"` |
| Se compilaron `contracts` y `db` | `tsx` de los seeds y del ETL importa `contracts/dist`, que estaba viejo | — |

**No se tocó**:

- `.env`;
- la base `curichi`;
- `data/raw` ni `data/processed`;
- ningún archivo de código.

Además, `.claude/launch.json` se editó solo un momento para arrancar la vista previa y **quedó como estaba**.

`contracts build` regeneró `openapi.yaml` y `dist/dominio.json` sin diferencias con lo versionado [C].

---

## 3. Cómo volver a levantarlo (mañana o después de reiniciar)

Requisitos: Docker Desktop abierto, Node 24 y pnpm 12.

**PowerShell**, en la raíz del repositorio:

```powershell
docker compose up -d postgis
$linea = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1)
$env:DATABASE_URL = ($linea -replace '^DATABASE_URL=', '') -replace '/curichi$', '/curichi_revision'
pnpm dev
```

**Git Bash**:

```bash
docker compose up -d postgis
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | sed 's#/curichi$#/curichi_revision#')"
pnpm dev
```

- `pnpm dev` levanta los cuatro procesos (api-core 3001, geo-service 3002, web 3000, panel 3100) y
  antes compila `contracts` y `db`.
- La variable `DATABASE_URL` del entorno **gana** sobre la del `.env`: los servicios cargan el `.env`
  con `--env-file-if-exists`, y Node da prioridad al entorno [C].
- Si los contenedores viejos vuelven a ocupar 3001/3002, detenelos con
  `docker stop curichi-api-core curichi-geo-service`.

Para parar: `Ctrl+C` en la terminal de `pnpm dev`. Para parar la base: `docker compose stop postgis`.
**Nunca** `docker compose down -v`, que borra el volumen con la base.

### Rehacer la base de revisión desde cero

```bash
docker exec curichi-postgis psql -U curichi -d postgres -c "DROP DATABASE IF EXISTS curichi_revision" -c "CREATE DATABASE curichi_revision OWNER curichi"
export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env | sed 's#/curichi$#/curichi_revision#')"
pnpm --filter contracts build && pnpm --filter db build
pnpm db:migrate
pnpm etl:load -- --version DM_UV_MZ_2025
pnpm db:seed:samples
```

---

## 4. Lista para la prueba manual

Abrí http://localhost:3000 en Chrome o Edge. `localhost` cuenta como contexto seguro, así que la
ubicación y la cámara funcionan sin HTTPS [I, regla de los navegadores].

### 4.1 App pública (sin cuenta)

- [ ] El mapa carga con puntos agrupados, distritos y UV. La barra dice «35 puntos en esta vista».
- [ ] Al tocar un punto se abre el detalle con distrito, UV, severidad (color + texto + barras) y
      estado («NO SE HA VERIFICADO», «Verificado» o «Resuelto»).
- [ ] Los filtros de severidad, la búsqueda por UV o distrito y el cambio de capa («Distritos y UV»,
      «Solo distritos», «Sin capa») funcionan.
- [ ] «Cómo funciona» explica la severidad, el PIP y los datos.
- [ ] La página **no se refresca sola**: es una decisión de diseño.

### 4.2 Reportar (cuenta `vecina`)

- [ ] «Reportar un punto» sin sesión → pide cuenta.
- [ ] Al entrar, el formulario pide **«Compartir mi ubicación»**: el permiso se pide recién ahí.
- [ ] En una **computadora** la precisión casi nunca llega a 50 m. Debería ofrecer «ubicación
      aproximada» (ADR 0007): el punto se pone a mano en cualquier lugar de la ciudad.
- [ ] Existe además el botón **«Usar ubicación de prueba (Santa Cruz)»**, que simula un GPS preciso.
      Es útil para probar, pero **es un pendiente abierto (D2)** porque también aparece en producción.
- [ ] Paso 1: el punto se mueve dentro del círculo de 60 m (arrastrar, flechas, «mover 5 m»,
      coordenadas) y se previsualiza la UV.
- [ ] Pasos 2–3: profundidad, frecuencia, sumidero, causa, tipo de ubicación, descripción
      (10 o más caracteres) y foto con la cámara (hace falta una webcam).
- [ ] Paso 4: al enviar aparece la **cuenta regresiva**: 60 s si es el primero del día y 240 s si es
      el 2.º o el 3.º.
- [ ] «Mis reportes» lo muestra mientras espera. El mapa público lo muestra **al vencer la demora y
      al recargar**.
- [ ] El 4.º reporte del día responde «Ya enviaste los 3 reportes de hoy» (`429 CUOTA_DE_REPORTES`).

### 4.3 Panel técnico (`tecnico` o `admin`)

- [ ] La bandeja muestra la tabla y el mapa sincronizados. El interruptor «Filtrar por el área del
      mapa» y el clic en una zona aplican su filtro.
- [ ] Detalle: validar un `nuevo`; rechazar con motivo; fusionar con un validado cercano (lista por
      distancia: 100 m, 300 m, 1 km); reclasificar la severidad con motivo.
- [ ] Solo `admin` puede **retirar** un validado y **reabrir** un rechazado. Al técnico le responde 403.
- [ ] Exportar CSV y GeoJSON (con la nota metodológica en el encabezado).
- [ ] Indicadores: pestañas por severidad, tortas por distrito y por UV, clic en un distrito → torta
      de sus UV.
- [ ] La bandeja se actualiza **cada 10 s** sola: lo que valides aparece «Verificado» en el mapa público.
- [ ] «Capas» **no aparece** porque no hay ninguna versión cargada sin activar. Es lo esperado.

### 4.4 Ejecutivo (`ejecutivo`)

- [ ] Solo ve `/ejecutivo`: cifra grande, pestañas por severidad, gráficas por distrito y mapa. No
      modera ni exporta (la API le responde 403).

### 4.5 Comprobaciones por consola

```bash
curl http://127.0.0.1:3001/ready
curl http://127.0.0.1:3002/ready
curl "http://127.0.0.1:3001/api/v1/reportes?limite=2"
curl http://127.0.0.1:3002/geo/v1/capas
```

OpenAPI interactivo: http://127.0.0.1:3001/docs (solo fuera de producción).

---

## 5. Lo que hay que saber antes de la prueba de escalado

1. **El `.env` local apunta a la base `curichi`, que está en la migración 0009.**
   - Quien arranque la pila Docker completa (`Mi-Curichi.exe` o
     `docker compose --profile servicios up -d --build`) correrá el job `migraciones` contra esa base.
   - La migración **0015 abortará** porque quedan 5 reportes en `nuevo` enviados con la regla
     anterior (el «freno»), y api-core no arrancará [I, por el código de 0015 y el `depends_on` del
     Compose].
   - Opciones:
     - (a) moderar esos 5 antes;
     - (b) migrar a sabiendas con `--publicar-nuevos-existentes`, con un respaldo antes;
     - (c) apuntar el `.env` a `curichi_revision`.
2. **El `.env` local es el de la «Fase 4»** y no trae `API_DATABASE_URL` ni `GEO_DATABASE_URL`.
   - Con `pnpm dev`, los servicios se conectan con el **rol dueño** (`curichi`). Fuera de producción
     solo avisan; en producción se negarían a arrancar [C].
   - Tampoco trae `DOMINIO_PUBLICO`, `DOMINIO_PANEL`, `PROXY_TLS` ni `PANEL_ADMIN_URL_DOCKER`, que la
     pila con proxy necesita para probar con HTTPS local.
3. **`COOKIE_SEGURA=1` en el `.env`.**
   - Los navegadores devuelven la cookie `Secure` en `http://localhost`.
   - `curl` y Playwright no, así que el login por consola o por E2E contra `pnpm dev` falla con esa
     variable [Doc: `.env.example`].
   - El runner de E2E (`e2e/scripts/correr-local.mjs`) arma su propio entorno.
4. **`next dev` escucha en todas las interfaces.**
   - Las apps también se ven en la red local (`http://192.168.0.15:3000` en esta máquina) [C, log de Next].
   - Por esa vía no hay contexto seguro, así que ubicación y cámara no funcionan.
   - No es un modo para compartir: para eso está el túnel del lanzador.
5. **Docker tiene 8 GB y 12 CPU asignados.** El host tenía 4,3 GB libres antes de arrancar [C].
   - Las mediciones de la Fase 4 dicen que el cuello de botella es la **CPU de PostgreSQL** [Doc].
   - Ver [11 · Escalado y ecosistema](11-escalado-y-ecosistema.md).
