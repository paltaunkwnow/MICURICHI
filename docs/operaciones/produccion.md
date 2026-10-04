# Lista de comprobación para producción

Lo que hay que tener resuelto **antes** de abrir el sistema al público. Lo marcado como
`PENDIENTE` depende de infraestructura que todavía no existe; no se ha inventado configuración
para ello.

## Antes de producción

La lista corta, en orden. Sale de los «Recordatorios antes de producción» del
[plan de la VPS](../revision/2026-09-26-plan-produccion-vps.md); el detalle de cada punto está en
la sección que se enlaza.

### Bloquean la apertura

Mientras falte cualquiera de estos, el sistema **no** se abre al público.

- [ ] **Número de emergencias.** Hoy el 911 está escrito en el código de la app pública
      (`ComoFunciona.tsx` y `Portada.tsx`, «Si hay riesgo para la vida, llamá al 911»):
      confirmarlo con el municipio o hacerlo configurable por ciudad (backlog de `CLAUDE.md` §15).
- [ ] **Mapa base propio** (Protomaps autohospedado, OpenFreeMap u otro proveedor) en lugar de
      `tile.openstreetmap.org`, con la CSP de las dos apps ajustada. Ver «El mapa base».
- [ ] **Respaldo de la base y de las fotos fuera de la VPS**: perfil `respaldos` en marcha contra un
      bucket de otra cuenta, con `RESPALDO_URL_LATIDO` en un vigilante externo; las fotos del disco
      (`fotos-data`), que el respaldo de la base **no** incluye, copiadas fuera de la máquina; la
      clave de cifrado (`RESPALDO_CLAVE_CIFRADO`) y las credenciales del bucket guardadas también
      **fuera** del servidor; y una restauración de prueba hecha de verdad y cronometrada. Ver
      «Respaldo y recuperación».
- [ ] **Dominio y certificados**: `DOMINIO_PUBLICO` y `DOMINIO_PANEL` (distintos) con su DNS,
      `PROXY_TLS=acme` y `ACME_EMAIL`, y 80 y 443 abiertos. Sin HTTPS el navegador no da cámara ni
      ubicación, y nadie puede reportar. Los certificados reales todavía no se probaron contra un
      dominio público. Ver «Primer despliegue» y «HTTP y red».
- [ ] **Secretos generados**, ninguno de ejemplo: `POSTGRES_PASSWORD`, `API_DB_PASSWORD` y
      `GEO_DB_PASSWORD` (antes de crear el volumen), `IP_HASH_SAL`, `JITTER_SAL`,
      `GEO_TOKEN_INTERNO` y `METRICAS_TOKEN` (32 caracteres o más), la credencial del respaldo y
      `ALERTAS_WEBHOOK_URL`. Con `COOKIE_SEGURA=1`, `TRUST_PROXY=1` (los fija el Compose) y
      `EXPONER_DOCS=0`, y **sin** `REPORTE_DEMORA_*`, que son solo para pruebas. Ver «Secretos y
      configuración».
- [ ] **Primer admin real** creado con el CLI de cuentas (paso 5 de «Primer despliegue») y
      comprobado entrando al panel; las cuentas de desarrollo (`admin@curichi.local`,
      `tecnico@curichi.local`, `ejecutivo@curichi.local`, `vecina@curichi.local`) **no** existen en
      la base. Los seeds ya se niegan a correr con `NODE_ENV=production`.
- [ ] **Plazos de recuperación acordados con el municipio**: RPO y RTO. Con un respaldo diario, el
      RPO es de hasta 24 h; bajarlo exige archivado continuo de WAL, que no está montado.
- [ ] **Plazo de revisión de la bandeja acordado con el municipio**, y quién atiende la alerta
      `BandejaSinVerificarAtrasada` (hoy 24 h, provisional). Sin moderación previa, un reporte
      falso se ve con «NO SE HA VERIFICADO» hasta que alguien lo retira.

### Bloquean un despliegue concreto

- [ ] **Antes de desplegar T4 (migración 0015), moderar la bandeja.** La 0015 aborta si quedan
      reportes en `nuevo`, salvo que se migre con `--publicar-nuevos-existentes` a sabiendas. Ver
      «Migración 0015». En una base nueva no hay nada que moderar.
- [ ] **La migración 0016 de contracción va en un release posterior** al de T3 y T4, nunca en el
      mismo: el api-core anterior sigue insertando sin `publicar_en` mientras corre el job.

### Lo demás, antes de abrir o en la primera semana

- [ ] Cargar y **activar** la versión de capas del municipio desde el panel (Capas → Activar). No
      hay que borrar nada a mano en los navegadores: ver «Cachés HTTP».
- [ ] Probar cámara y ubicación en teléfonos reales: iPhone con Safari, Android con Chrome y los
      navegadores internos de WhatsApp, Facebook e Instagram. Anotar la resolución real de la foto.
- [ ] Validar con el municipio los parámetros (`CLAUDE.md` §16, punto 3): radio de 60 m, precisión de
      50 m, 10 min de antigüedad de la posición, demoras de 1 y 4 min, 3 reportes y 12 fotos por
      día, 10 altas por IP y por día, WebP de calidad 80, matriz de severidad, radio de recurrencia
      de 25 m, jitter de 30 m y rate limit de 10 reportes por hora e IP.
- [ ] Disco de la VPS: tamaño, `FOTOS_MIN_LIBRE_BYTES` según ese tamaño, alertas `DiscoDeFotos*`
      y el peso real de las fotos (`SELECT count(*), avg(bytes) FROM reporte_foto;`). Ver «Fotos en
      producción».
- [ ] Retención acordada con el municipio de `ip_hash`, de los datos personales y de las fotos de
      reportes rechazados (`CLAUDE.md` §16, punto 4). Ver «Datos personales».
- [ ] `ALERTAS_WEBHOOK_URL` con una alerta de prueba recibida de verdad, un vigilante **externo**
      contra los dos dominios y el envío de logs a un almacén con retención. Ver «Observabilidad».
- [ ] La suite completa contra el PostgreSQL de producción antes de abrir, y `pnpm privilegios` en
      verde. Ver «Base de datos».

## Topología

Todo en una máquina por ciudad, con el `docker-compose.yml` del repositorio y las imágenes del CI:

```
navegador
   │ HTTPS · 80 y 443: lo ÚNICO que se publica hacia fuera
   ▼
proxy (Caddy) ─┬─ DOMINIO_PUBLICO ─▶ web-ciudadano :3000 ─┐   réplicas por DNS de Docker
               └─ DOMINIO_PANEL ───▶ panel-admin   :3100 ─┤
                                                          ├─ /api/* ─▶ api-core :3001 ─▶ geo-service :3002 (resolver)
                                                          └─ /geo/* ────────────────────▶ geo-service :3002
                                                                          │                   │
                                                                          └─▶ postgis :5432 ◀─┘
                                                                              (en la máquina, solo 127.0.0.1)
```

| Contenedor | Imagen | Publica | Quién le habla | Endurecimiento |
|---|---|---|---|---|
| `proxy` | `infra/docker/proxy.Dockerfile` (Caddy 2.11.4, configuración horneada) | **80 y 443** | Internet | Usuario `caddy` (10001), solo lectura, sin capabilities, certificados en el volumen `proxy-datos` |
| `web-ciudadano` | `infra/docker/app.Dockerfile` (`APP=web-ciudadano`) | nada | solo el proxy | Usuario `node`, solo lectura, sin capabilities, `tini` |
| `panel-admin` | `infra/docker/app.Dockerfile` (`APP=panel-admin`) | nada | solo el proxy | Ídem |
| `api-core` | `infra/docker/servicio.Dockerfile` | puerto efímero en 127.0.0.1 (diagnóstico) | las apps, Prometheus | Ídem |
| `geo-service` | Ídem | Ídem | las apps, api-core, Prometheus | Ídem, rol de base de solo lectura |
| `migraciones` | la de api-core | nada | — (job: migra y termina) | Ídem, rol dueño |
| `postgis` | `postgis/postgis:18-3.6` | 127.0.0.1:5432 | los servicios, el job, los respaldos | — |

Qué hace el proxy (`infra/proxy/Caddyfile`, comprobado ejecutando el 2026-09-26):

- **TLS** con certificados automáticos (`PROXY_TLS=acme`: Let's Encrypt, y ZeroSSL de reserva) y
  redirección de HTTP a HTTPS. Caddy escucha en 8080/8443 sin root y el Compose publica 80 y 443;
  las redirecciones y los desafíos ACME funcionan igual.
- **La IP del cliente**: descarta el `X-Forwarded-For` (y `X-Real-IP`, `Forwarded`, `X-Client-IP`,
  `True-Client-IP`) que mande el cliente y escribe la IP real. Ver «La IP del cliente».
- **Quita de las respuestas** `x-middleware-rewrite` —el reenvío de Next publica ahí
  `http://api-core:3001/…` o `http://geo-service:3002/…`—, `X-Powered-By`, `Server` y `Via`. Las
  cabeceras de seguridad de las apps y de los servicios (CSP, `nosniff`, `X-Frame-Options`…) pasan
  intactas.
- **HSTS** (`max-age=31536000; includeSubDomains`) solo con `PROXY_TLS=acme`. Las apps van con
  `HSTS=0` en el Compose: quien sabe si hay certificados públicos es el proxy.
- **Tope de cuerpo**: 10 MiB en la app pública (fotos de hasta 8 MiB en multipart; 10 MiB es también
  lo que el reenvío de Next guarda en memoria, y por encima lo trunca) y 1 MiB en el panel. Por
  encima, 413 del propio proxy, sin llegar a la app.
- **Tiempos**: cabeceras de la respuesta hasta 35 s en la app pública (la app corta su reenvío a los
  30 s) y 185 s en el panel (la exportación espera hasta 180 s). Del lado del cliente: cabeceras en
  15 s, petición entera en 5 min (una foto de 8 MiB necesita ~28 KB/s) y respuesta en 10 min.
- **Reparto** entre réplicas por el DNS de Docker (`dynamic a`, cada 5 s), por turno, reintentando
  en otra réplica durante 5 s si una no acepta la conexión. **Sin chequeo pasivo**: ver «Escalar
  réplicas».
- Corta con 404 `/geo/v1/capas/invalidar` (ruta interna de geo-service) y `/_next/image` (ninguna
  app usa `next/image` y las imágenes ya no llevan sharp).
- Vigilado por el perfil `observabilidad`: `/` de cada réplica de las apps, cada sitio entrando
  por el proxy con TLS y, con `acme`, los días que le quedan al certificado
  ([observabilidad.md](observabilidad.md), alertas `AppCaida`, `AppSinReplicas`,
  `ProxyNoResponde` y `CertificadoPorVencer`).
- No escribe log de acceso: llevaría la IP del cliente en claro (§13). Las peticiones quedan en el
  log de cada servicio, con `ipHash`.

### Variables de la topología

| Variable | Valor en producción | Qué pasa si falta |
|---|---|---|
| `DOMINIO_PUBLICO` | `mapa.ciudad.gob.bo` (solo el nombre) | El proxy no arranca y lo dice |
| `DOMINIO_PANEL` | `panel.ciudad.gob.bo`, **distinto** del anterior | Ídem. Además api-core no arranca: su `PANEL_ADMIN_URL` sale de aquí |
| `PROXY_TLS` | `acme` (por defecto) | — (`interno`: CA propia de Caddy; `no`: HTTP, solo en la máquina) |
| `ACME_EMAIL` | correo de quien opera la instalación | El proxy no arranca con `acme` |
| `PROXY_PUERTO_HTTP`, `PROXY_PUERTO_HTTPS` | vacías (80 y 443) | — (`127.0.0.1:8080` para probar sin exponerse a la red) |
| `IMAGEN_API_CORE`, `IMAGEN_GEO_SERVICE`, `IMAGEN_WEB_CIUDADANO`, `IMAGEN_PANEL_ADMIN`, `IMAGEN_PROXY` | `ghcr.io/paltaunkwnow/micurichi/<imagen>:<sha>`, las cinco del **mismo** SHA | Se usan las construidas en la máquina (`…:local`) |

Lo que depende de la topología **no** se lee de las variables que usa `pnpm dev` (en una máquina de
desarrollo comparten el `.env` y ahí valen otra cosa); el Compose lo fija o lo deriva:

| En el contenedor | Valor en el Compose | Para cambiarlo |
|---|---|---|
| `PROXY_DE_CONFIANZA` (apps) | `1`, fijo | — Es seguro porque las apps no publican puertos: solo las alcanza el proxy |
| `HSTS` (apps) | `0`, fijo | — Lo pone el proxy |
| `COOKIE_SEGURA` (api-core) | `1`, fijo | — Con `NODE_ENV=production` api-core no arranca sin él |
| `TRUST_PROXY` (servicios) | `1` | `TRUST_PROXY_DOCKER` |
| `PANEL_ADMIN_URL` (api-core) | `https://${DOMINIO_PANEL}` | `PANEL_ADMIN_URL_DOCKER` (p. ej. con un puerto que no sea 443) |
| `CORS_ORIGENES` (servicios) | `https://${DOMINIO_PUBLICO},https://${DOMINIO_PANEL}` | `CORS_ORIGENES_DOCKER` |

### Primer despliegue

En el servidor de la ciudad, con Docker Engine y el plugin Compose:

1. **DNS**: `DOMINIO_PUBLICO` y `DOMINIO_PANEL` apuntando (A, y AAAA si hay IPv6; ver «La IP del
   cliente») a la máquina. **Cortafuegos**: 80 y 443 abiertos (80 hace falta para el desafío ACME y
   la redirección); nada más.
2. **`.env`** a partir de `.env.example`: bloque «Ciudad», secretos generados (`POSTGRES_PASSWORD`,
   `API_DB_PASSWORD`, `GEO_DB_PASSWORD`, `IP_HASH_SAL`, `JITTER_SAL`, `GEO_TOKEN_INTERNO`,
   `METRICAS_TOKEN`), bloque «Proxy de entrada y dominios» con `PROXY_TLS=acme` y los puertos
   vacíos, fotos en el disco de la VPS (`S3_ENDPOINT_DOCKER` vacío y `FOTOS_MIN_LIBRE_BYTES` según
   el tamaño del disco; ver «Fotos en producción») y las cinco `IMAGEN_*`. Las demoras de
   publicación (`REPORTE_DEMORA_*`) **no** se definen: son solo para pruebas. Las contraseñas de
   los roles tienen que estar **antes** de crear el volumen de PostgreSQL.
3. Imágenes y base:

   ```bash
   docker compose --profile servicios pull
   docker compose up -d postgis                                   # crea volumen, extensiones y roles
   docker compose --profile servicios run --rm migraciones         # esquema; sale con 0
   ```

4. **Capas del municipio**: `etl:load` desde una máquina con el repositorio y la entrega en
   `data/raw/` (README, «Datos geográficos»), contra esta base por un túnel SSH al 5432; o copiar
   `data/processed/` al servidor, junto al `docker-compose.yml` (geo-service lo monta en solo
   lectura).
5. **Primer usuario admin**, con el CLI de cuentas de `packages/db` que viaja en la imagen de
   api-core (los seeds se niegan a correr en producción, y con razón). Va con el rol **dueño** de
   la base, no con el del contenedor, y la contraseña se lee de `CUENTA_PASSWORD` o de la entrada
   estándar, nunca de un argumento:

   ```bash
   read -rs CUENTA_PASSWORD && export CUENTA_PASSWORD      # la de la cuenta nueva, sin eco
   export DATABASE_URL='postgresql://curichi:…@postgis:5432/curichi'   # rol dueño
   docker compose exec -e DATABASE_URL -e CUENTA_PASSWORD api-core \
     node node_modules/db/dist/cli/cuentas.js crear --email admin@municipio.gob.bo \
     --nombre "Admin municipal" --rol admin
   ```

   `desactivar` y `reactivar` funcionan igual; todo queda en `auditoria`. Detalle en
   `packages/db/README.md`.
6. Todo lo demás:

   ```bash
   docker compose --profile servicios up -d --no-build
   docker compose ps          # migraciones «Exited (0)»; el resto «healthy»
   docker compose logs proxy  # «certificate obtained successfully» para los dos nombres
   ```

   `up` respeta el orden: migraciones → geo-service → api-core → apps → proxy, cada uno cuando el
   anterior está sano. Si una migración falla, no arranca nada nuevo.
7. **Comprobaciones** desde fuera, contra los dominios: la app pública y el panel cargan con
   candado; `curl -sI https://<DOMINIO_PUBLICO>/api/v1/configuracion` devuelve 200 con
   `Strict-Transport-Security` y **sin** `x-middleware-rewrite`; un login de técnico en el panel
   funciona; y la prueba de la cabecera falsa de «La IP del cliente».
8. Perfiles `respaldos` y `observabilidad` (ver sus documentos).

**Volver atrás**: las cinco `IMAGEN_*` al SHA anterior y `up -d --no-build` (ver «Despliegue»).

### Probar la topología en una máquina de desarrollo

Con la CA interna de Caddy y los puertos en loopback (los valores del `.env.example`):

```bash
# .env: DOMINIO_PUBLICO=curichi.localhost  DOMINIO_PANEL=panel.curichi.localhost  PROXY_TLS=interno
#       PROXY_PUERTO_HTTP=127.0.0.1:8080   PROXY_PUERTO_HTTPS=127.0.0.1:8443
#       PANEL_ADMIN_URL_DOCKER=https://panel.curichi.localhost:8443
docker compose --profile servicios --profile minio up -d --build
curl -k https://curichi.localhost:8443/api/v1/configuracion
```

`*.localhost` resuelve a la propia máquina en los navegadores y en curl. El certificado lo firma la
CA interna del contenedor: el navegador avisa, o se confía en ella con
`docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./curichi-ca-local.crt`. La
redirección de HTTP a HTTPS apunta al 443 (no añade el 8443): en local se entra directo por HTTPS.

**En Docker Desktop con el repositorio en otra unidad que `C:`** (aquí, `A:`), los contenedores
nuevos no pueden montar carpetas del repositorio: geo-service no arranca por el montaje de
`data/processed`. Las imágenes sí se construyen. Para probar, un `docker-compose.override.yml` fuera
del repositorio que monte una copia en `C:` (`volumes: !override`); así se hizo la verificación del
2026-09-26.

## Secretos y configuración

Una instalación **por ciudad**: la misma imagen y el mismo `docker-compose.yml`; lo que cambia es
el `.env` (bloque «Ciudad», `INSTALACION_NOMBRE`, credenciales) y las capas que carga el ETL.

`api-core` **no arranca** con `NODE_ENV=production` si alguno de estos sigue con el valor de
ejemplo (`verificarProduccion` en `services/api-core/src/config.ts`):

| Variable | Qué pasa si falta |
|---|---|
| `IP_HASH_SAL` | El hash de IP del antispam sería adivinable: el espacio de IPv4 es pequeño. **Mínimo 32 caracteres** |
| `JITTER_SAL` | El desplazamiento de la vista pública se podría revertir y quedaría expuesta la vivienda. **Mínimo 32 caracteres**: el jitter siembra con un hash no criptográfico (FNV-1a), así que lo único que lo protege es que la sal no se pueda adivinar |
| `GEO_TOKEN_INTERNO` | **Obligatorio, 32 caracteres o más, el mismo valor en api-core y en geo-service** (ninguno de los dos arranca sin él). api-core lo manda en la cabecera `x-token-interno` en **cada** `POST /geo/v1/resolver` y al invalidar capas; con él, geo-service saca esas llamadas del cupo por IP del resolver. Sin token, todas las ubicaciones de reportes salen de la misma IP (la de api-core) y comparten un cupo de `GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO`: en una tormenta se agota y crear reportes responde 503 |
| `COOKIE_SEGURA=1` | La cookie de sesión viajaría por HTTP. **En el Compose va fija a `1`** |
| `CORS_ORIGENES` | No puede ser `*` con cookies de sesión, ni estar vacío. **En el Compose sale de `DOMINIO_PUBLICO` y `DOMINIO_PANEL`** |
| `PANEL_ADMIN_URL` | Obligatoria y `https`: sin ella el botón «Panel técnico» desaparece para técnico, admin y ejecutivo. **En el Compose, `https://${DOMINIO_PANEL}`** |
| `METRICAS_TOKEN` | `/metrics` enumera rutas, conteos de peticiones y de errores. Es obligatorio salvo que se vacíe `METRICAS_RUTA` |

Además, sin ser bloqueantes:

| Variable | Recomendación |
|---|---|
| `TRUST_PROXY` | **`1`** con la topología prevista, que es lo que pone el Compose (`TRUST_PROXY_DOCKER` para cambiarlo). Ver la sección siguiente: equivocarse deja el rate limit, el freno del login y el antispam sin efecto |
| `EXPONER_DOCS=0` | `/docs` (Swagger UI) queda apagado por defecto en producción |
| HSTS | Lo pone el proxy con `PROXY_TLS=acme`; las apps van con `HSTS=0` en el Compose. `HSTS=1` en las apps solo si el TLS lo termina OTRO proxy |
| `IMAGEN_*` (las cinco) | Las imágenes que publica el CI en GHCR, **por SHA** y todas del mismo (ver «Despliegue») |

> **Turborepo:** toda variable que se lea al arrancar o al construir tiene que estar en
> `globalEnv` de `turbo.json`. Turbo 2.x corre en `envMode: strict` y las que no estén ahí **no
> llegan** a la tarea, en silencio. Ya pasó una vez: los servicios ignoraban los límites por
> mucho que se exportaran.

## La IP del cliente, y por qué es un asunto de seguridad

De acertar la IP del cliente dependen tres controles de §13: el rate limit de `POST /reportes`,
el freno de fuerza bruta del login por IP y el `ip_hash` del antispam. Si la IP está mal, los tres
dejan de hacer su trabajo, y en silencio.

**Lo que se comprobó en la Fase 3** (servicio de eco detrás del *rewrite* de Next):

- El `rewrite` de Next **pasa el `X-Forwarded-For` del navegador tal cual**.
- Y **no añade ninguno propio**: si el cliente no manda la cabecera, al servicio no le llega nada.

Es decir, la app Next es un proxy más, y uno que no reescribe nada. Eso dejaba dos escenarios y
los dos malos: sin `TRUST_PROXY`, todos los vecinos comparten un único cubo de rate limit (el
límite de 10 reportes por hora pasa a ser de la ciudad entera); con `TRUST_PROXY` activado a la
antigua, el navegador elegía su propia IP y se saltaba los tres controles.

**La cadena, tal como queda en el Compose** (cada eslabón y por qué):

```
navegador ─▶ proxy (Caddy)     descarta el X-Forwarded-For del cliente (y X-Real-IP, Forwarded,
            │                  X-Client-IP, True-Client-IP) y escribe X-Forwarded-For = {client_ip},
            │                  la IP del socket: UNA sola entrada que el cliente no controla
            ▼
          app Next             PROXY_DE_CONFIANZA=1 (fijo): deja pasar la cabecera tal cual y no
            │                  añade entrada propia. Seguro porque la app NO publica puertos: la
            │                  única forma de llegarle es a través del proxy
            ▼
          api-core / geo-service   TRUST_PROXY=1: el socket (la app) es el salto 0, de confianza;
                                   la última entrada de X-Forwarded-For es la IP real
```

Son dos defensas que se cubren: aunque el proxy algún día AÑADIERA en vez de reemplazar (Caddy lo
hacía antes de la 2.5; aquí va explícito para no depender de un valor por defecto), con
`TRUST_PROXY=1` el servicio seguiría quedándose con la última entrada, la del proxy.

| Variable | Dónde | Valor correcto en producción |
|---|---|---|
| `PROXY_DE_CONFIANZA` | apps Next | `1` **solo** si hay un proxy propio delante que reescriba `X-Forwarded-For` (en el Compose, fijo). Con `0`, el `proxy.ts` de cada app borra las cabeceras de reenvío que mande el navegador |
| `TRUST_PROXY` | `api-core` y `geo-service` | **`1`** en esta topología (el Compose lo pone; `TRUST_PROXY_DOCKER` para cambiarlo), o la lista de IP/CIDR de las apps Next. Es un **número de saltos contados desde el servicio**, no un interruptor |

`TRUST_PROXY` admite `0` (no mirar la cabecera), un número de saltos, o una lista de IP/CIDR.
`true` y `*` **ya no se aceptan**: con ellos Fastify tomaba el valor más a la izquierda de
`X-Forwarded-For`, que es exactamente el que escribe el cliente.

**Por qué 1 y no 2** (corregido el 2026-09-26; antes esta guía decía 2). Fastify recorre la cadena
desde el servicio hacia fuera y se queda con la primera dirección en la que ya no confía:

```
socket del servicio        = la app Next                         → salto 0 (de confianza)
última entrada de la XFF   = la IP real, escrita por el proxy TLS → salto 1
penúltima entrada          = lo que haya mandado el CLIENTE       → salto 2
```

Next **no añade** su propia entrada a `X-Forwarded-For` (comprobado ejecutando: la reenvía tal cual
llega del proxy). Con `TRUST_PROXY=2` el servicio confiaba también en el salto 1 y se quedaba con
el 2, que escribe quien hace la petición: cualquiera podía elegirse la IP con una cabecera y saltarse
el rate limit, el freno de fuerza bruta del login y el antispam. Con `1` se queda con la IP que puso
el proxy TLS, y lo que escriba el cliente queda a la izquierda, donde no se mira.

La lista de direcciones (`TRUST_PROXY_DOCKER=172.18.0.0/16`, la subred de la red Docker donde
corren las apps, o sus IP concretas) no depende de contar saltos, así que añadir o quitar un proxy
por el camino no la rompe. Pero exige fijar la subred (Compose la elige al crear la red) y deja
dentro también al puente de Docker (`.1`), que es la IP con que llegan las conexiones de la propia
máquina a los puertos publicados. En esta topología `1` es suficiente.

**Si algún día hay un CDN o un balanceador delante del proxy**, el proxy vería a todos los vecinos
con la IP del CDN. Se arregla en el proxy, no en los servicios: declarar la red del CDN en
`trusted_proxies` del Caddyfile (bloque `servers`). `{client_ip}` pasa entonces a ser la IP que el
CDN dice, la cabecera sigue llevando una sola entrada y `TRUST_PROXY` sigue en `1`.

**IPv6 y el proxy de puertos de Docker.** Docker Engine publica los puertos con reglas de NAT que
conservan la IP de origen, salvo cuando no puede: una conexión IPv6 hacia una red de contenedores
solo IPv4 pasa por `docker-proxy`, y el proxy la ve llegar desde el puente (`172.x.0.1`). Resultado:
todos los vecinos que entren por IPv6 comparten un único cubo de rate limit. Si el servidor tiene
IPv6 y registro AAAA, o se activa IPv6 en la red del Compose, o se quita el AAAA. Lo detecta la
segunda comprobación de abajo (el celular con datos móviles suele ir por IPv6). En Docker Desktop
pasa siempre: toda conexión desde la máquina llega desde el puente, que es lo esperado en local.

- [x] El proxy **reescribe** `X-Forwarded-For` con la IP que ve (`header_up X-Forwarded-For
      {client_ip}` en `infra/proxy/Caddyfile`).
- [x] `PROXY_DE_CONFIANZA=1` en las dos apps y `TRUST_PROXY=1` en los dos servicios (el Compose).
- [x] Comprobado en local el 2026-09-26, por el proxy con la CA interna: cuatro peticiones desde la
      misma máquina —sin cabecera, con `X-Forwarded-For: 203.0.113.1`, con
      `X-Forwarded-For: 198.51.100.2, 10.0.0.7` y con `X-Real-IP`/`Forwarded`/`X-Client-IP`
      inventados— dieron el **mismo** `ipHash` en api-core y descontaron del **mismo** cupo de
      lecturas (239, 238, 237, 236); una desde otro contenedor de la red, con el mismo
      `X-Forwarded-For` falso, dio un `ipHash` **distinto** y un cupo nuevo.
- [ ] **Comprobación con una cabecera falsa en producción**, desde fuera y por el dominio público. Cada
      petición deja en el log de api-core su `reqId` (el `X-Request-Id` que se mande) y el `ipHash`
      de la IP que el servicio dio por buena:

      ```bash
      curl -s -o /dev/null -H 'X-Request-Id: prueba-xff-1' -H 'X-Forwarded-For: 203.0.113.1'  "https://<dominio>/api/v1/reportes?limite=1"
      curl -s -o /dev/null -H 'X-Request-Id: prueba-xff-2' -H 'X-Forwarded-For: 198.51.100.2' "https://<dominio>/api/v1/reportes?limite=1"
      docker compose logs api-core | grep -E '"reqId":"prueba-xff-[12]"' | grep -o '"ipHash":"[^"]*"'
      ```

      Los dos `ipHash` tienen que ser **iguales**: son la misma máquina, y la cabecera inventada
      no cuenta. Si salen distintos, el servicio está creyendo lo que escribe el cliente
      (`TRUST_PROXY` demasiado alto). Después, lo contrario: repetir la primera petición desde
      otra conexión (un celular con datos móviles) tiene que dar un `ipHash` **distinto**; si
      todas las conexiones comparten `ipHash`, el servicio ve la IP del proxy o de Next
      (`TRUST_PROXY` demasiado bajo) y el límite de 10 reportes por hora es de la ciudad entera.

## Base de datos

- [ ] PostgreSQL 18 + PostGIS 3.6 **real**, no PGlite (ver [ADR 0003](../decisiones/0003-pglite-solo-en-local-y-pruebas.md)).
- [ ] `shm_size` del contenedor `postgis` con holgura (por defecto 256m, variable
      `POSTGRES_SHM_SIZE`): Docker monta `/dev/shm` con 64 MB y PostgreSQL lo usa para la memoria
      compartida de las consultas en paralelo; con 64 MB fallan con «No space left on device».
- [ ] Migraciones aplicadas por el **job `migraciones`** (ver «Migraciones al desplegar»). Los
      servicios **no** migran solos al arrancar: si la base va por detrás, fallan.
- [ ] `PENDIENTE` Ejecutar la suite completa contra ese PostgreSQL antes de abrir.
- [ ] Conexiones cifradas si la base no está en la misma máquina, **con verificación del
      certificado** (ver «TLS con la base»).

### Migraciones al desplegar

El perfil `servicios` del Compose tiene un job `migraciones`: la **imagen de api-core** ejecutando
`node node_modules/db/dist/cli/migrar.js` con el rol **dueño** (`DATABASE_URL_DOCKER`, o la que arma
el Compose con `POSTGRES_*`). Aplica las pendientes y termina; `api-core` y `geo-service` dependen de
él con `condition: service_completed_successfully`, así que:

- Cada `docker compose --profile servicios up -d` migra primero y arranca después.
- Si una migración falla, **no** arranca nada nuevo: los contenedores viejos siguen sirviendo (la
  migración fallida se deshizo entera, cada una va en su transacción) y el despliegue se para.
- El CLI escribe una línea JSON por evento y sale con 0 o 1. Un fallo con SQLSTATE **55P03** es
  `lock_timeout` (`MIGRAR_LOCK_TIMEOUT_MS`, 10 s): la migración esperaba un lock que retenía el
  tráfico. No es un error del SQL: se reintenta el `up` (con menos tráfico, o subiendo el plazo).
- Es seguro con varias réplicas y en paralelo: un advisory lock serializa las migraciones.

```bash
docker compose --profile servicios run --rm migraciones                 # migrar sin desplegar
docker compose --profile servicios logs migraciones                     # qué aplicó
```

### Migración 0015: publicación sin moderación previa

La 0015 (despliegue de T4, ADR 0006) agrega `publicar_en` y hace públicos los reportes en `nuevo`
con «NO SE HA VERIFICADO». Los `nuevo` que ya existen se enviaron con el texto «un técnico lo
revisa antes de publicarlo»: por eso, **si queda alguno, la migración aborta sin cambiar nada** y
el log dice cuántos son. Es el comportamiento buscado, no un fallo.

- [ ] **Antes de desplegar T4, moderar la bandeja**: validar, rechazar o fusionar todo lo que esté
      en `nuevo`. Después, el despliegue normal migra solo.
- [ ] Solo si publicarlos tal como están es una decisión tomada a sabiendas (por ejemplo, una base
      con datos de prueba), migrar con la bandera, que vale solo para esa ejecución:

      ```bash
      docker compose --profile servicios run --rm migraciones \
        node node_modules/db/dist/cli/migrar.js --publicar-nuevos-existentes
      ```

      En desarrollo, `pnpm db:migrate -- --publicar-nuevos-existentes`. La bandera hace
      `SET LOCAL curichi.publicar_nuevos_existentes = 'si'` dentro de la transacción de la 0015 y
      nada más; no queda guardada en ningún lado.

**Bloqueo.** La 0015 va entera en una transacción con `ACCESS EXCLUSIVE` sobre
`reporte_inundacion`: mientras corre, lecturas y escrituras de reportes esperan (rellena
`publicar_en` en cada fila, comprueba el `NOT NULL` y el `CHECK` y reconstruye los dos índices
públicos). Con decenas de miles de reportes son segundos; con muchos más hay que medirlo antes en
una copia `<a medir>`. Conviene migrar en un horario de poco tráfico y, después, un
`VACUUM (ANALYZE) reporte_inundacion`.

La 0016 (contracción: quita `usuario.ultimo_reporte_en` y el `DEFAULT` de `publicar_en`) va en un
release **posterior** al de T3 y T4, nunca en el mismo: el api-core anterior sigue atendiendo
mientras corre el job de migraciones y todavía inserta sin nombrar `publicar_en`.

### Migración 0018: integridad de moderación

La 0018 graba en la base dos reglas de moderación que hasta ahora solo imponía api-core (CLAUDE.md
§7.1 y §7.3), sin cambio de contrato. Son dos `CHECK` sobre `reporte_inundacion`:

- `motivo_en_rechazo_y_duplicado`: un reporte `rechazado` o `duplicado` exige `estado_motivo` no
  vacío.
- `fusion_solo_en_duplicado`: `fusionado_en_id` solo puede estar puesto en un `duplicado`.

No se agrega «`duplicado` ⇒ canónico no nulo»: la FK `fusionado_en_id` es `ON DELETE SET NULL`, así
que al borrar un reporte canónico sus duplicados quedan con `fusionado_en_id = NULL` pero siguen en
`duplicado` —un estado legítimo que esa regla rechazaría—.

**No traba el despliegue por filas viejas.** Los dos `CHECK` se crean `NOT VALID` (toman un lock
breve y ya frenan toda escritura nueva) y, en la misma migración, se validan solo si ninguna fila
los viola. Si alguna los viola, la migración emite un `NOTICE` con el conteo, **no toca ningún
dato** y la restricción queda sin validar: las escrituras nuevas ya están protegidas. Para validarla
después de limpiar esas filas:

```sql
ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT motivo_en_rechazo_y_duplicado;
ALTER TABLE reporte_inundacion VALIDATE CONSTRAINT fusion_solo_en_duplicado;
```

La 0018 también quita el índice redundante `reporte_estado` (lo cubre `reporte_estado_creado`; ver
«Índices de la tabla de reportes y por qué está cada uno»).

### TLS con la base

Con el driver de los servicios (`pg` 8.23), `sslmode=require` **ya no significa** «cifrar sin
comprobar»: equivale a `verify-full`. Contra una base cuyo certificado firma una CA que Node no
trae (RDS, Azure, Cloud SQL, una CA propia), la conexión falla con `self-signed certificate in
certificate chain`. Se escribe explícito y con la CA:

```text
DATABASE_URL_DOCKER=postgresql://curichi:…@db.ejemplo:5432/curichi?sslmode=verify-full&sslrootcert=/certs/pg-ca.pem
API_DATABASE_URL_DOCKER=postgresql://curichi_api:…@db.ejemplo:5432/curichi?sslmode=verify-full&sslrootcert=/certs/pg-ca.pem
GEO_DATABASE_URL_DOCKER=postgresql://curichi_geo:…@db.ejemplo:5432/curichi?sslmode=verify-full&sslrootcert=/certs/pg-ca.pem
```

y la CA montada en `/certs` de `migraciones`, `api-core`, `geo-service` y `respaldo` con un
`docker-compose.override.yml` del servidor (no del repositorio; Compose lo lee solo y **suma**
estos montajes a los del archivo base, por ruta de destino):

```yaml
services:
  migraciones: { volumes: ["/etc/curichi/pg-ca.pem:/certs/pg-ca.pem:ro"] }
  api-core:    { volumes: ["/etc/curichi/pg-ca.pem:/certs/pg-ca.pem:ro"] }
  geo-service: { volumes: ["/etc/curichi/pg-ca.pem:/certs/pg-ca.pem:ro"] }
  respaldo:    { volumes: ["/etc/curichi/pg-ca.pem:/certs/pg-ca.pem:ro"] }
```

`pg_dump` (libpq) entiende los mismos parámetros. **Nunca** `sslmode=no-verify`: cifra, pero acepta
el certificado de cualquiera que se ponga en medio. Con la base en el contenedor `postgis` de la
misma máquina el tráfico no sale de la red Docker y no hace falta TLS.

Con la base gestionada, el contenedor `postgis` sobra: se despliega con `--no-deps` y en dos pasos,
para respetar el orden que en la pila local pone `depends_on`:

```bash
docker compose --profile servicios up -d --no-deps migraciones
docker compose --profile servicios up -d --no-deps api-core geo-service   # cuando migraciones salió con 0
```

### Roles de aplicación con privilegios mínimos

Hasta la auditoría de seguridad del 2026-09-19, api-core y geo-service se conectaban **los dos**
con el rol `curichi`, que era `SUPERUSER` con `CREATEROLE`, `CREATEDB` y `BYPASSRLS`. Con ese rol,
cualquier ejecución de SQL no prevista dejaba de ser «leer una tabla de más» y pasaba a ser control
del servidor: `COPY ... PROGRAM` ejecuta órdenes del sistema operativo. Y geo-service, que por
contrato (§4.6) solo lee, podía borrar la tabla de reportes.

Ahora hay tres roles y **ningún servicio usa el del esquema**:

| Rol | Lo usa | Privilegios |
|---|---|---|
| `curichi` | migraciones, seeds, ETL | dueño del esquema (DDL) |
| `curichi_api` | api-core | DML tabla por tabla, migración 0008 |
| `curichi_geo` | geo-service | `SELECT` sobre cinco tablas |

- [ ] `API_DB_PASSWORD` y `GEO_DB_PASSWORD` definidas **antes** de crear el volumen de PostgreSQL:
      las lee `infra/sql/01-roles.sh`, que solo se ejecuta al inicializar.
      Generalas con `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
- [ ] `DATABASE_URL` de cada servicio apunta a **su** rol, no a `curichi`. En el Compose ya es así;
      fuera de él, `API_DATABASE_URL` y `GEO_DATABASE_URL`.
- [ ] `pnpm privilegios` en verde contra la base real. Compara la matriz efectiva con la
      documentada y falla si sobra o falta un permiso.
- [ ] Ningún rol de aplicación es `SUPERUSER`, ni dueño de tablas, ni puede `CREATE` en un esquema.
      Los servicios lo comprueban al arrancar y **en producción se niegan a servir** si lo son.

**Sobre una base que ya existe** (el volumen no se vuelve a inicializar), el procedimiento manual
está en [`manual.md`](manual.md#roles-de-aplicación-en-una-base-que-ya-existe).

**Si añadís una tabla**, la migración tiene que conceder el permiso explícitamente: no hay
`ALTER DEFAULT PRIVILEGES` a propósito, para que una tabla nueva empiece cerrada y el fallo se vea
en la primera prueba en vez de quedar abierta sin que nadie lo decida.

## HTTP y red

- [x] TLS terminado en un proxy propio (servicio `proxy`, ver «Topología»); `TRUST_PROXY` y
      `PROXY_DE_CONFIANZA` según la sección anterior. Comprobado en local con la CA interna.
- [ ] `PENDIENTE` Certificados reales (`PROXY_TLS=acme`) contra un dominio público: no se ha podido
      probar sin dominio. La configuración se valida al construir la imagen en los tres modos.
- [x] `geo-service` **no** expuesto a internet: el proxy solo reenvía a las apps, y de geo-service
      solo llega lo que la app reenvía bajo `/geo/*` (menos `/geo/v1/capas/invalidar`, cortada).
- [x] Puertos de base de datos y almacenamiento sin publicar a la red (solo 127.0.0.1). Hacia
      fuera, solo 80 y 443 del proxy.
- [x] Cabeceras: las aplican las apps Next y los dos servicios (CSP, `nosniff`, `X-Frame-Options`,
      `Referrer-Policy`, `Permissions-Policy`). El proxy no las pisa (comprobado: la CSP de la app
      y la de api-core llegan intactas) y quita `x-middleware-rewrite`, `X-Powered-By`, `Server`
      y `Via`.
- [x] **El panel y la app pública, en nombres de dominio distintos** (el proxy se niega a arrancar
      con el mismo nombre en los dos). La cookie de sesión se emite
      sin atributo `Domain`, así que queda atada al host que la puso… pero las cookies **no
      distinguen puertos**: `panel.ejemplo:3100` y `ejemplo:3000` son el mismo host para el
      navegador. Servir las dos aplicaciones desde el mismo nombre (aunque sea en puertos o rutas
      distintas) hace que el navegador mande la sesión del técnico también a la app pública.
      No es un agujero abierto —la app pública manda `credentials: 'omit'` en todas sus
      peticiones, justamente por esto— pero es una capa menos.
- [ ] Al poner el `Domain` de la cookie, **no usar el dominio padre** (`.ejemplo.bo`): eso la
      repartiría a todos los subdominios, incluida la app pública.

## Cachés HTTP

La tabla del plan de la VPS (2026-09-26). Regla de fondo: **`immutable` solo sobre una URL que
cambia cuando cambia el contenido**; todo lo que puede cambiar bajo la misma URL (una capa que se
activa, un reporte que se retira) revalida con `no-cache`, que deja guardar pero obliga a preguntar
antes de reutilizar. La columna «Desde» dice en qué tanda llega cada fila; el avance está en
`docs/TRASPASO.md`.

| Recurso | `Cache-Control` | Detalle | Desde |
|---|---|---|---|
| Capa y teselas **con huella**: `/geo/v1/capas/{capa}/v/{huella}` y `/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt` | `public, max-age=31536000, immutable` | La huella es el sha del GeoJSON que sirve geo-service: otra capa, otra URL. Con una huella vieja, `410 CAPA_CAMBIO` con `no-store` | T6 |
| Alias **sin huella** (`/geo/v1/capas/{capa}`, `/geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt`), `/geo/v1/capas` y `/geo/v1/capas/vigentes` | `public, no-cache` | `ETag` y `304`. Nunca `immutable`: la URL es la misma antes y después de activar una capa | T6 |
| `/geo/v1/agregados/unidades-vecinales` y `/geo/v1/puntos-criticos` | `public, no-cache` | En memoria de geo-service: vida de 100 s (`GEO_CACHE_AGREGADOS_MS`) y edad máxima de 120 s (`GEO_CACHE_AGREGADOS_EDAD_MAX_MS`). Cifras públicas con 2 min de antigüedad como máximo | T6 |
| `GET /api/v1/reportes` y `/reportes/:id` | `public, no-cache` | Cambian al moderar y al vencer `publicar_en` | Antes del plan |
| Foto de un reporte publicado (`nuevo` ya visible, `validado`, `resuelto`) | `public, no-cache` | `ETag`; la visibilidad se comprueba **antes** de responder `304`. Sin moderación previa, retirar es el único control: con `max-age=3600` una caché compartida seguiría sirviendo una hora la foto retirada | T4 |
| Foto del autor en espera, rechazada o duplicada; foto todavía sin reporte, para quien la subió | `private, no-store` | Solo la ve su dueño | T1 y T4 |
| Cualquier otra foto | `404` con `no-store` | Técnicos incluidos, mientras el reporte espera su `publicar_en` | T4 |
| Vistas técnicas, exportación, `/auth/*`, `/mis-reportes`, `/ejecutivo/resumen` e `/indicadores` | `private, no-store` y `Vary: Cookie` | Es el valor por defecto de api-core. Ejecutivo e indicadores, además, **sin caché en el servidor**: el panel los pide cada 10 s | T5 (sin caché en el servidor) |
| `GET /api/v1/configuracion` | `public, max-age=300` | La ciudad solo cambia al redesplegar | Antes del plan |

En los navegadores:

- **Página pública**: no hace tráfico automático (sin sondeo, sin recargar al volver el foco);
  reportes, cifras y detalle se piden al cargar o al recargar. El service worker (v6) guarda capas y
  teselas con huella y sirve primero de su caché; al activarse borra las huellas viejas y, ante un
  `410`, vuelve a pedir `/geo/v1/capas`. El worker de MapLibre y los glifos llevan `?v=` y se
  sirven `immutable` (T6).
- **Panel técnico y ejecutivo**: sondeo cada 10 s con `x-curichi-sondeo: 1` (no renueva la
  inactividad), sin pedir con la pestaña oculta; la geometría de las capas no se vuelve a pedir (T5).

**Al activar una capa nueva**: `/geo/v1/capas` (con `no-cache`) devuelve las URL con la huella
nueva en la siguiente carga de la página, y una página ya abierta que pida una tesela con la huella
vieja recibe `410` y vuelve a leer las URL. Con varias réplicas de geo-service, las que no
recibieron la invalidación se enteran en 10 s o menos.

## Datos personales (§13)

- [x] `ip_hash` con sal y rotación diaria; borrado a los 30 días por el trabajo de mantenimiento.
- [x] Sesiones caducadas, fotos huérfanas, intentos de login y claves de idempotencia se limpian
      solos cada 6 h.
- [x] Ninguna IP en claro en los logs.
- [x] De un reporte marcado como *vivienda o predio*, la vista pública no publica ni la dirección
      aproximada ni `manzana_id`. La manzana se quitó al integrar las capas reales: es un polígono
      de unos 100 m de lado y el desplazamiento público llega a 30 m, así que publicar las dos
      cosas juntas dejaba la vivienda en la intersección de las dos, bastante más estrecha que el
      desplazamiento solo. En vía pública sí se publica: ahí el punto ya sale en su sitio.
- [ ] `PENDIENTE` Retención acordada con el municipio (§16, punto 4 de `CLAUDE.md`).
- [x] Respaldos cifrados (gpg, AES-256) antes de salir de la máquina: contienen correos de
      técnicos y coordenadas exactas. La clave (`RESPALDO_CLAVE_CIFRADO`) se guarda también fuera
      del servidor.
- [ ] Retención de logs acorde con la de `ip_hash` (30 días): ver [observabilidad.md](observabilidad.md#retención-de-logs).

## Respaldo y recuperación

Ver [respaldo-y-restauracion.md](respaldo-y-restauracion.md). Antes de abrir:

- [ ] Perfil `respaldos` en marcha (`docker compose --profile respaldos up -d respaldo`) con un
      bucket **fuera** de la máquina y credenciales propias; `curichi-respaldo verificar` en verde.
- [ ] `RESPALDO_URL_LATIDO` apuntando a un vigilante externo: es lo único que avisa si el
      contenedor de respaldos ni siquiera corre.
- [ ] Una restauración de prueba hecha de verdad y cronometrada (el simulacro mensual).
- [ ] `PENDIENTE` RPO y RTO acordados con el municipio. Con un respaldo diario, el RPO es de hasta
      24 h; bajarlo exige archivado continuo de WAL, que no está montado.
- [ ] `PENDIENTE` (Parte 5) **Fotos fuera de la VPS.** Con las fotos en el disco (modo oficial), el
      respaldo de la base **no las incluye**: hoy no hay copia de `fotos-data` fuera de la máquina,
      y perder el disco es perder todas las fotos. Bloquea la apertura junto con el respaldo de la
      base. Si se usa un S3 gestionado, en cambio: versionado (o replicación) en su bucket.

## Observabilidad

Ver [observabilidad.md](observabilidad.md).

- [x] `/health`, `/ready`, `/metrics`, `X-Request-Id` de punta a punta.
- [x] `/ready` de api-core informa de `db`, `geo` y `fotos`, y marca `degradado` cuando alguno
      falla sin que el fallo impida servir el mapa. Solo la base lo lleva a 503: es lo único que
      esta réplica no puede suplir. Con MinIO parado responde
      `{"ok":true,"db":"ok","geo":"ok","fotos":"error","degradado":true}`, que es lo que hay que
      vigilar para enterarse de que no se pueden subir ni ver fotos.
- [x] Prometheus leyendo `/metrics` de todas las réplicas y alertas de §5 en Alertmanager: perfil
      `observabilidad` del Compose.
- [x] Las apps y el proxy vigilados por el blackbox (`AppCaida`, `AppSinReplicas`,
      `ProxyNoResponde`, `CertificadoPorVencer`), probado con la pila levantada el 2026-09-26.
- [ ] Un vigilante **externo** contra los dos dominios: las sondas de dentro no ven el DNS público
      ni el cortafuegos.
- [ ] `ALERTAS_WEBHOOK_URL` definida y una alerta de prueba recibida de verdad (observabilidad.md,
      «Probar que las alertas llegan»).
- [ ] `PENDIENTE` Envío de logs a un almacén con retención (hoy, rotación local de 30 MB por
      contenedor).
- [ ] Disco de fotos vigilado: con el almacén en disco, `/ready` sale degradado con
      `"fotos":"poco_espacio"` por debajo de `FOTOS_MIN_LIBRE_BYTES`, y Prometheus avisa con
      `DiscoDeFotosPorLlenarse` (menos del doble del umbral) y `DiscoDeFotosBajoElUmbral` (ya se
      rechazan fotos con 507). Las reglas comparan contra `curichi_fotos_disco_min_libre_bytes`,
      que api-core publica desde `FOTOS_MIN_LIBRE_BYTES`: cambiar la variable no obliga a tocarlas
      (observabilidad.md §5).
- [ ] `BandejaSinVerificarAtrasada` con el plazo de revisión acordado con el municipio: hoy es
      24 h, provisional `<a confirmar con el municipio>`. **Bloquea la apertura** acordar el plazo
      y quién atiende la alerta.
- [x] `/ready` comprueba que el almacén en disco se pueda escribir: escribe y borra un archivo
      temporal, así que con el volumen de fotos de solo lectura o de otro dueño dice
      `"fotos":"error"` en vez de `"ok"`. Con S3, que el bucket responda.

## Arranque y parada

- [x] Los servicios esperan a la base al arrancar (`esperarBaseDeDatos`) y salen con código 1 si
      no aparece: el orquestador reintenta.
- [x] `SIGINT`/`SIGTERM` cierran el servidor HTTP y el pool antes de salir.
- [x] Dockerfiles de `api-core` y `geo-service` (`infra/docker/servicio.Dockerfile`, perfil
      `servicios` del Compose): construidos y ejecutados. La pila completa —PostGIS 18 + PostGIS
      3.6, MinIO, los dos servicios— corrió con los cuatro contenedores en `healthy` durante la
      integración de las capas reales, incluyendo el ETL, el respaldo y la prueba de dos réplicas.
- [x] Migraciones fuera de los servicios: job `migraciones`, que tiene que terminar bien antes de
      que arranquen (ver «Migraciones al desplegar»).
- [x] Imágenes de las dos apps (`infra/docker/app.Dockerfile`) y del proxy
      (`infra/docker/proxy.Dockerfile`): construidas y ejecutadas el 2026-09-26 con el Compose
      contra el PostgreSQL local — migraciones, geo-service, api-core, las dos apps y el proxy, los
      seis en `healthy` (el job, «Exited (0)»). Por el proxy, con la CA interna: la app pública carga
      con la ciudad de api-core, `/api/v1/configuracion` responde, un técnico inicia sesión en el
      panel (cookie `Secure`, `HttpOnly`, `SameSite=Lax`, que no viaja a la app pública), la
      exportación CSV sale completa, la IP no se falsifica (ver «La IP del cliente»), no sale
      `x-middleware-rewrite`, 11 MiB en la app pública y 2 MiB en el panel dan 413 y, con dos
      réplicas de la app pública, el tráfico se repartió a medias y parar una no dio ningún error.
      Memoria en reposo: 85 MB cada app, 11 MB el proxy.
- [ ] Varias réplicas: **cuidado**, hoy hay estado en memoria de proceso. Ver abajo.

### Despliegue

El CI publica en GHCR, solo desde `main` y solo si pasó todo (tests, PostgreSQL real, Trivy sin
HIGH/CRITICAL corregibles, y las apps y el proxy arrancando endurecidos hasta `healthy`), las cinco
imágenes del **mismo** commit, con SBOM y procedencia adjuntos:

```
ghcr.io/paltaunkwnow/micurichi/api-core:<sha>       ghcr.io/paltaunkwnow/micurichi/web-ciudadano:<sha>
ghcr.io/paltaunkwnow/micurichi/geo-service:<sha>    ghcr.io/paltaunkwnow/micurichi/panel-admin:<sha>
ghcr.io/paltaunkwnow/micurichi/proxy:<sha>
```

En el servidor de cada ciudad:

```bash
# .env: IMAGEN_API_CORE, IMAGEN_GEO_SERVICE, IMAGEN_WEB_CIUDADANO, IMAGEN_PANEL_ADMIN e
#       IMAGEN_PROXY con el MISMO <sha>
docker compose --profile servicios pull
docker compose --profile servicios up -d --no-build
```

Compose reemplaza cada contenedor de golpe: durante unos segundos por servicio, las peticiones a
una app que se está reemplazando esperan (el proxy reintenta 5 s) o fallan con 502. No hay
despliegue sin corte con una sola réplica; con dos, reemplazarlas de a una (`--scale` y
`docker compose up -d --no-deps --no-build <app>`) lo reduce, pero no está automatizado.

Volver atrás es poner el SHA anterior y repetir, **siempre que ninguna migración nueva haya
cambiado el esquema de forma incompatible** con el código viejo: las migraciones no se deshacen.
Si la hubo, la vuelta atrás es restaurar el respaldo previo al despliegue.

### Escalar réplicas

Ni los servicios ni las apps tienen `container_name` ni puerto fijo en la máquina, así que:

```bash
docker compose --profile servicios up -d --scale api-core=3 --scale geo-service=2 --scale web-ciudadano=2
docker compose port --index 2 api-core 3001      # puerto efímero (en 127.0.0.1) de la réplica 2
```

Dentro de la red, cada nombre de servicio resuelve a todas sus réplicas:

- **proxy → apps**: el proxy pregunta al DNS de Docker cada 5 s (`dynamic a`) y reparte por turno;
  si una réplica no acepta la conexión, el reintento va a la siguiente durante 5 s. Una réplica
  parada sale sola del DNS.
- **Sin chequeo pasivo, a propósito.** Caddy cuenta como fallo de la réplica cualquier error del
  reenvío, también el de un cuerpo que supera el tope: en la prueba del 2026-09-26, una subida de
  11 MiB (413, correcto) dejó la única réplica fuera 10 s y la petición siguiente recibió «no
  upstreams available». Es decir, cualquiera podía tumbar la app pública mandando una foto
  demasiado grande cada 10 s. Sin `fail_duration`, la subida de 9 MiB inmediatamente posterior
  llegó a api-core.
- **apps → servicios**: Node resuelve `api-core` y `geo-service` por DNS en cada conexión nueva, y
  las reutiliza (keep-alive): el reparto es por conexión, no por petición. Prometheus descubre las
  réplicas de los servicios por DNS.

Las fotos en disco (`fotos-data`, el modo de la VPS) las comparten las réplicas de **una misma
máquina**; entre máquinas, S3.

### Qué pasa con más de una réplica

| Estado en memoria | Consecuencia con N réplicas | Gravedad |
|---|---|---|
| Rate limit de `@fastify/rate-limit` | **Es por proceso**: cada réplica cuenta por su lado y el límite efectivo se multiplica por N (10 reportes/hora por IP pasan a ser 30 con 3 réplicas). El freno principal —el cupo diario por cuenta (3 reportes y 12 fotos) y el tope diario de altas por IP— está en la base y no cambia | Media. Hasta que haya un almacén compartido (el plugin admite Redis) o el límite en el proxy de entrada |
| Métricas del registro propio | Cada réplica expone las suyas; Prometheus las suma | Ninguna, es lo esperado |
| Caché de capas y de agregados de `geo-service` | Cada réplica tiene la suya; se invalidan por separado | Baja. `/capas/invalidar` habría que mandarlo a todas |
| Serialización del recálculo completo | Es por proceso, pero el incremental usa `pg_advisory_xact_lock`, que **sí** es global | Ninguna para el camino normal |

El freno de fuerza bruta del login **no** está en memoria: vive en la tabla `intento_login`, así
que funciona igual con N réplicas.

## El mapa base: lo único del mapa que no es nuestro

Las capas administrativas y los puntos salen del propio sistema. El fondo sobre el que se dibujan,
no: hoy son las teselas raster del servidor estándar de OpenStreetMap.

**Dónde está configurado.** En un solo sitio por aplicación, dentro del estilo de MapLibre:

| Archivo | Qué declara |
|---|---|
| `apps/web-ciudadano/src/componentes/Mapa.tsx` | `sources.base.tiles = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png']`, `maxzoom: 19` y la atribución |
| `apps/panel-admin/src/componentes/Mapa.tsx` | Lo mismo |
| `apps/*/next.config.ts` | `tile.openstreetmap.org` en `img-src` **y** en `connect-src` de la CSP: MapLibre 6 pide las teselas con `fetch`, así que con solo `img-src` el mapa base queda en negro |

**Atribución.** Está puesta y visible: el estilo declara
`© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors` y el control
de atribución de MapLibre la muestra en el mapa. Eso cubre el requisito de la licencia ODbL.

**Por qué no sirve para producción.** La *Tile Usage Policy* de la OSMF describe ese servidor como
un recurso costeado por donaciones para uso de desarrollo y de proyectos pequeños, y desaconseja
expresamente apoyar en él aplicaciones con tráfico. No es un límite técnico que se pueda subir
pagando: es que no es el sitio. Una aplicación municipal abierta a los vecinos de Santa Cruz no
entra en ese uso.

**Qué hace falta, y qué NO hay que inventar.** Ninguna de las opciones necesita cambiar el código
del mapa más allá de la URL del origen y la línea de atribución; lo que necesitan es una decisión
y, en dos de los tres casos, una cuenta que el municipio debe abrir. Aquí no se ha creado ninguna
ni se ha escrito ninguna credencial de ejemplo.

| Opción | Qué hay que conseguir | Qué cambia en el código |
|---|---|---|
| Extracto de Protomaps auto-hospedado | Un `.pmtiles` de Bolivia o de Santa Cruz y un sitio donde servirlo con *range requests* | El origen pasa de `raster` a `vector` con protocolo `pmtiles://`, y hay que elegir un estilo vectorial. `pmtiles` todavía no está en las dependencias: habría que agregarlo a las apps |
| OpenFreeMap | Nada que pagar; confirmar que su política admite este uso | Igual que arriba, con la URL de su estilo |
| Proveedor comercial (MapTiler, Stadia…) | Cuenta y clave de API del municipio | Solo la URL del origen y la clave, por variable de entorno. **No inventar la clave**: hoy no existe |

Mientras no se decida, el mapa sigue funcionando con OpenStreetMap, que es lo correcto para
desarrollo y para la demostración al municipio, y el cambio sigue siendo de una tarde.

## ¿Hacen falta PMTiles o un CDN para las capas?

**Todavía no.** La decisión razonada, con los números:

| Dato | Valor |
|---|---|
| Capa más pesada (manzanas, entrega real del municipio) | 27 527 features en PostGIS; 27 434 en el GeoJSON de render, **15,5 MB** |
| Cómo se sirve hoy | `geo-service` la carga una vez en memoria y corta teselas al vuelo con `geojson-vt` + `vt-pbf` |
| Memoria del proceso con las tres capas cargadas | 256 MB de los 1024 MB del contenedor |
| Construcción de las tres cachés en frío | 2,2 s (primera petición a `/geo/v1/capas`) |
| Coste medido de una tesela con los datos reales | z14 sobre el centro: 41 KB, p50 11,1 ms · z16: 3,6 KB, p50 7,0 ms |
| Cada cuánto cambia la capa | Cuando el municipio entrega una versión nueva: **una o dos veces al año** |
| Cacheabilidad | URL con la huella del contenido e `immutable` por un año; las rutas sin huella, `public, no-cache` con `ETag` (ver «Cachés HTTP») |

> El GeoJSON de render pasó de 26,9 MB a 15,5 MB al dejar en él solo los campos que el mapa
> dibuja (`id`, `codigo`, `nombre`, `tipo`, `version_capa`, `distrito_id`,
> `unidad_vecinal_id`). De los 26,9 MB originales, **16,2 MB eran propiedades y 8,9 MB
> geometría**: el resto era la cadena de `fuente` repetida 27 000 veces, las fechas de edición
> del origen y `SHAPE_STAr`, que no dibuja nadie y sin embargo viajaban dentro de cada feature de
> cada tesela. Los atributos originales siguen enteros en `<capa>.full.geojson`, que es lo que se
> carga a PostGIS.

Con esos números, precompilar PMTiles y poner un CDN delante **no compra nada** y sí añade: un
paso más al ETL, un artefacto binario que versionar o publicar, y un sitio más donde algo puede
quedar desactualizado cuando se activa una versión de capa.

Lo que sí conviene hacer, y es mucho más barato:

1. **Cachear las teselas por un año, pero solo con la huella en la URL** (hecho en T6). La URL
   sin huella, `/geo/v1/teselas/{capa}/{z}/{x}/{y}.mvt`, **no** lleva la versión: servirla con
   `immutable` haría que navegadores y CDN siguieran mostrando la capa vieja hasta un año después
   de activar la nueva, sin volver a preguntar. Por eso existen las rutas con la huella del
   contenido (`/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt` y
   `/geo/v1/capas/{capa}/v/{huella}`): solo esas van con `max-age=31536000, immutable`, y las de
   siempre quedan como alias con `public, no-cache` y `ETag`. Detalle en «Cachés HTTP».
2. **Caché delante** (un CDN) sobre las URL con huella: quita del servicio la mayor parte del
   tráfico sin tocar una línea de código, y no hay nada que purgar al cambiar de capa, porque cambia
   la URL. El proxy de entrada del Compose **no** cachea: Caddy necesitaría un módulo que no viene
   en la imagen oficial.

**Cuándo replantearlo.** Si aparece alguna de estas, PMTiles empieza a tener sentido:

- La capa de manzanas crece por encima de ~100 MB, o se añaden capas nuevas (red de drenaje,
  sumideros) y el conjunto no cabe cómodo en memoria del proceso.
- Se despliegan varias réplicas de `geo-service`: hoy cada una mantendría su propia copia de la
  capa en memoria, y ahí un artefacto estático compartido sí sale a cuenta.
- La latencia de tesela deja de estar en milisegundos en las mediciones reales de producción.

La arquitectura ya es compatible con el cambio: `geo-service` decide entre GeoJSON y teselas por
tamaño (`UMBRAL_TESELAS_BYTES`) y el frontend consume una URL de plantilla `{z}/{x}/{y}`, que es
la misma que serviría un CDN o un archivo PMTiles.

---

# Escalabilidad: lo que se midió y a partir de dónde duele (Fase 4)

Todo lo de esta sección son números tomados contra **PostgreSQL 18.6 + PostGIS 3.6.4 reales** en
Docker, con las imágenes del proyecto construidas y corriendo, no contra PGlite. Donde algo no se
pudo medir, se dice.

## Presupuestos internos de ingeniería

No son un SLA con nadie: son las líneas que, al cruzarse, obligan a mirar. Se eligieron a partir
de lo medido, con margen.

| Qué | Presupuesto | Medido hoy (1 000 000 de reportes) |
|---|---|---|
| `GET /api/v1/reportes` p95, 10 concurrentes | < 300 ms | 110 ms |
| `GET /api/v1/reportes?bbox=` p95, 10 concurrentes | < 800 ms | 84 ms (con 6 CPU en la base) |
| `POST /api/v1/reportes` p95, 48 concurrentes | < 500 ms | 203 ms |
| `POST /geo/v1/resolver` (point-in-polygon) p95 | < 100 ms | 17,7 ms a 10 concurrentes |
| Teselas desde caché p95 | < 100 ms | 5,4 ms a 10 concurrentes |
| Agregados por UV (consulta en frío) | < 1 s | 264 ms |
| Consulta más cara de la base, mediana | < 100 ms | 264 ms (agregados) — **fuera de presupuesto, ver abajo** |
| Bloqueo del bucle de eventos, peor caso | < 50 ms | 11,6 ms con 20 logins simultáneos |
| Arranque de un servicio hasta `healthy` | < 60 s | unos 25 s |
| Construcción de una imagen (caché caliente) | < 5 min | ~1 min |
| Recuperación desde respaldo, por GB | < 60 s | 19,6 s |

El agregado por unidad vecinal es el único que queda fuera de presupuesto, y es sabido: ver el
umbral de replanteo más abajo.

## Qué se rompe primero al crecer

Orden en que aparecen los problemas, según lo medido:

| Volumen | Qué empieza a doler | Qué hacer |
|---|---|---|
| ~10 000 | Nada. Todas las consultas por debajo de 6 ms. | — |
| ~100 000 | El agregado por UV llega a 47 ms. | Nada todavía. |
| ~1 000 000 | El agregado por UV llega a 264 ms (721 ms antes del índice de la migración 0007) y su ordenación se sale de `work_mem` a disco. El listado profundo (`OFFSET 5000`) sube a 24 ms. | Vigilar. La caché con revalidación en segundo plano hace que ningún usuario lo pague. |
| ~5 000 000 | El agregado pasaría del segundo y el `count(DISTINCT punto_critico_id)` escribe cada vez más temporales. | **Vista materializada** refrescada en segundo plano, no otro índice. |
| ~10 000 000 | El recálculo COMPLETO de puntos críticos (41,9 s con 750 000 publicables) pasaría de varios minutos. La tabla ronda los 5 GB y deja de caber en `shared_buffers`. | Recálculo por zonas en vez de global, y revisar el dimensionado de memoria de la base. |

## La base es el cuello de botella, y por bastante

Medido con el listado por bbox que pide el mapa, un millón de reportes:

| CPU del contenedor `postgis` | 10 concurrentes | 100 concurrentes |
|---|---|---|
| 2 CPU | 21 rps, p95 613 ms | 20 rps, p95 5 904 ms, **433 respuestas 503** |
| 6 CPU | **142 rps**, p95 84 ms | **117 rps**, p95 1 715 ms, **ningún 503** |

Mientras tanto `api-core` y `geo-service` estaban al **0,03 % de CPU**. Las métricas lo confirman
desde dentro: de los 21 143 s de tiempo HTTP acumulado en el listado, **21 244 s se fueron en
consultas**, o sea el 83 % de cada petición esperando a la base.

Consecuencias prácticas:

1. Al dimensionar, la CPU va a la base. Ahogar a `postgis` para "repartir" con servicios que están
   ociosos es tirar rendimiento.
2. **Agrandar el pool no ayuda si la base no tiene CPU.** Con 2 CPU, subir `DB_POOL_MAX` de 8 a 24
   empeoró las cosas (de 106 a 433 respuestas 503): más conexiones sobre los mismos núcleos es más
   contención, no más trabajo hecho. La regla útil es mantener el total de conexiones
   (`réplicas × DB_POOL_MAX`) en el entorno de 2 a 4 por núcleo de la base.
3. Añadir réplicas de API **no** sube el techo por sí solo. Lo que lo sube es CPU en la base y,
   después, réplicas de lectura.

## Varias réplicas: qué está resuelto y qué no

| Mecanismo | Aguanta N réplicas | Cómo |
|---|---|---|
| Migraciones en paralelo | **Sí** | Las aplica el job `migraciones`, no los servicios al arrancar; aun así, varias ejecuciones a la vez no se pisan: `pg_advisory_xact_lock`, y desde la Fase 4 también la creación de la tabla de control. Probado con 8 procesos simultáneos contra una base vacía, 3 rondas, 24 de 24 sin fallo (y en CI en cada PR). |
| Recálculo de puntos críticos | **Sí** | Advisory lock compartido (clave 4021) entre el camino incremental y el completo. |
| Trabajo de mantenimiento | **Sí** | `pg_try_advisory_lock` (clave 4023): la réplica que no lo consigue se salta la pasada. Además usa un pool propio para no competir con el tráfico. |
| Idempotencia de creación | **Sí** | `SELECT ... FOR UPDATE` más `INSERT ... ON CONFLICT`. Probado con 12 envíos simultáneos con la misma clave: un solo reporte. |
| Sesiones | **Sí** | Viven en la tabla `sesion`, no en memoria. |
| **Rate limiting** | **NO** | `@fastify/rate-limit` guarda los contadores **en memoria del proceso**. Con N réplicas el límite efectivo es N veces el configurado. Ver abajo. |
| Caché de capas de geo-service | **Sí, con matices** | Es por proceso, así que cada réplica reconstruye la suya: más memoria y más trabajo, pero sin inconsistencia. La invalidación explícita solo llega a una réplica; las demás se enteran solas en 10 s o menos por el TTL de `versionesVigentes`. |
| Caché de agregados | **Sí, con matices** | Igual: por proceso. Lo único que pasa es que N réplicas hacen N veces la consulta. |
| Métricas | **Sí** | Cada réplica expone las suyas y Prometheus las suma. |
| Fotos | **Sí en una máquina; entre máquinas, con `S3_ENDPOINT`** | En la VPS, `AlmacenDisco` sobre el volumen `fotos-data`, que comparten todas las réplicas de esa máquina (modo oficial, ADR 0006). Con réplicas en varias máquinas, `AlmacenS3` (Fase 5), que guarda en un servicio compatible con S3 y todas ven las mismas. Ver abajo. |

### Rate limiting con varias réplicas

Un atacante multiplica el límite por el número de réplicas: con 3 réplicas y 10 reportes por hora,
puede meter 30. **No se ha cambiado**, y la decisión es deliberada:

- Meter Redis solo para esto añade un servicio, un punto de fallo y una decisión incómoda (si
  Redis no responde, se abre o se cierra) a cambio de un factor 3 sobre un límite que ya es
  conservador.
- La alternativa sin dependencias nuevas es llevar los contadores a PostgreSQL, pero eso convierte
  cada petición limitada en una escritura contra el recurso que precisamente es escaso (ver arriba).
- El freno que de verdad importa, el de fuerza bruta del login, **ya está en la base**
  (`intento_login`), así que ese sí es global desde el primer día.

Lo razonable es poner el límite en el balanceador o el proxy de entrada, que ve todo el tráfico y
es donde ese trabajo cuesta menos. Si el municipio acaba necesitando límites finos por IP dentro
de la aplicación y ya hay un Redis en casa, entonces sí: `@fastify/rate-limit` acepta un almacén
Redis sin tocar el resto del código.

### Fotos: dos modos, y la elección es explícita

`api-core` decide al arrancar y lo dice en el log (`… · fotos en …`):

| `S3_ENDPOINT` | Implementación | Réplicas que aguanta |
|---|---|---|
| vacío | `AlmacenDisco` sobre `STORAGE_DIR` (en el Compose, el volumen `fotos-data`) | las de **una misma máquina**, que comparten el volumen; entre máquinas, una foto subida en la A no existe para la B. **Es el modo de la VPS** |
| definido | `AlmacenS3` | las que haga falta, en cualquier máquina |

`AlmacenS3` (`services/api-core/src/almacen-s3.ts`, Fase 5) habla S3 directamente con `fetch` y
firma SigV4 con `node:crypto`: **no añade ninguna dependencia**. Solo hace PUT, GET y DELETE de un
objeto, que es todo lo que el proyecto necesita; las fotos las sigue sirviendo `api-core`, que es
quien sabe si el reporte está publicado (§13), así que **el bucket debe ser privado**.

Comprobado en la Fase 5 contra el MinIO del Compose: subida por `POST /api/v1/fotos`, el objeto
aparece en el bucket (`mc ls`), `GET /api/v1/fotos/:key` lo devuelve con sus bytes intactos y el
volumen del contenedor queda vacío. Con una credencial equivocada, el servicio **se niega a
arrancar** en vez de aceptar reportes y perder sus fotos de una en una.

Variables (ver `.env.example`):

```text
S3_ENDPOINT     origen del servicio. Hay dos por una razón concreta: desde la máquina
S3_ENDPOINT_DOCKER   es http://localhost:9000 y desde dentro del Compose, http://minio:9000.
S3_BUCKET       bucket privado; el Compose lo crea con `minio-init`
S3_ACCESS_KEY / S3_SECRET_KEY
S3_REGION       us-east-1 sirve para MinIO
S3_ESTILO_RUTA  1 = endpoint/bucket/clave (MinIO); 0 = bucket.endpoint/clave (AWS)
```

**Al cambiar de modo, las fotos ya guardadas no se mueven solas.** Si se pasa de disco a S3 con
fotos existentes, hay que copiar el contenido de `STORAGE_DIR` al bucket antes (los nombres de
objeto son los mismos), o las viejas darán 404 mientras las nuevas funcionan.

### Fotos en producción: el disco de la VPS

Decisión del 2026-09-26 ([ADR 0006](../decisiones/0006-publicacion-sin-moderacion-y-vps.md)): en
la VPS las fotos van al **disco**, en el volumen `fotos-data` (`S3_ENDPOINT_DOCKER` vacío). Es el
modo oficial: una sola máquina, ningún servicio más que operar ni pagar, y las réplicas de api-core
de esa máquina comparten el volumen. Lo que exige:

- [ ] **Guarda de espacio.** Las fotos comparten disco con PostgreSQL: si el disco se llena, cae la
      base. Con menos de `FOTOS_MIN_LIBRE_BYTES` libres (2 GiB por defecto, `<a confirmar al
      dimensionar el disco>`), `POST /fotos` responde `507 SIN_ESPACIO` antes de procesar la imagen
      y sin gastar cupo, los reportes sin foto siguen entrando y `/ready` sale degradado con
      `"fotos":"poco_espacio"`.
- [ ] **Alertas** sobre `curichi_fotos_disco_libre_bytes`: `DiscoDeFotosPorLlenarse` (alta, menos
      del doble del umbral durante 30 min) y `DiscoDeFotosBajoElUmbral` (crítica, bajo el umbral
      durante 5 min). El umbral lo leen de `curichi_fotos_disco_min_libre_bytes`, que api-core
      publica desde `FOTOS_MIN_LIBRE_BYTES`; con `0` (guarda apagada) no avisan
      (observabilidad.md §5).
- [ ] **Dimensionar el disco** con el peso real de las fotos (WebP de 1600 px por lado como máximo):
      `SELECT count(*), avg(bytes) FROM reporte_foto;`. El techo lo pone el número de cuentas que
      reportan (cada una, hasta 12 fotos por día), no el cupo.
- [ ] `PENDIENTE` **Copia de las fotos fuera de la VPS**: el respaldo de la base no las incluye (ver
      «Respaldo y recuperación»).

### Si las fotos salen del disco: S3 gestionado, no MinIO

Con réplicas en más de una máquina, o si el disco de la VPS deja de alcanzar, las fotos van a un
S3 gestionado (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces…) o al almacenamiento S3
del propio municipio **si alguien lo mantiene con parches**; nunca al MinIO del Compose (perfil
`minio`), que es **para desarrollo**. Por qué:

- **MinIO dejó de publicar.** La edición comunitaria se archivó en abril de 2026: no hay más
  versiones, ni imágenes oficiales (`minio/minio` desapareció de Docker Hub y `quay.io/minio/minio`
  responde 401 desde el 24-09-2026). La versión que usaba el Compose, RELEASE.2025-04-22, tenía
  además **CVE-2025-62506** (escalada de privilegios con políticas de sesión), corregido en
  RELEASE.2025-10-15. El Compose usa ahora esa versión, compilada desde el código oficial y fijada
  por digest, pero el próximo CVE ya no tendrá parche.
- **Operar almacenamiento es un trabajo.** Durabilidad (réplicas, discos que fallan), cifrado en
  reposo, versionado, ciclo de vida y parches: un servicio gestionado los trae hechos; un MinIO en
  la misma máquina que la base, no, y además cae con ella.
- **La aplicación no cambia.** `AlmacenS3` habla S3 estándar (SigV4): es `S3_ENDPOINT_DOCKER`,
  `S3_REGION`, `S3_ESTILO_RUTA=0` para AWS y la credencial.

Lo que hay que configurar en el proveedor:

- [ ] Bucket **privado**, sin acceso público ni listado anónimo, con cifrado en reposo.
- [ ] Credencial propia de api-core con **solo** esto (política estilo AWS; el resto de
      proveedores tiene su equivalente):

      ```json
      {
        "Version": "2012-10-17",
        "Statement": [
          { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": ["arn:aws:s3:::<bucket>"] },
          { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            "Resource": ["arn:aws:s3:::<bucket>/*"] }
        ]
      }
      ```

      `ListBucket` hace falta aunque api-core no liste: sin él, S3 responde 403 (no 404) a una
      clave que no existe y la comprobación de arranque de api-core falla.
- [ ] Versionado del bucket activado (una foto borrada por error se recupera) y una regla de ciclo
      de vida que expire las versiones antiguas a los 30 días.
- [ ] El bucket de **respaldos** es otro, con otra credencial: la de api-core no debe poder leer ni
      borrar respaldos.

En local, `minio-init` reproduce lo mismo: bucket privado y un usuario (`S3_ACCESS_KEY`) con una
política limitada a ese bucket. Comprobado: puede leer, escribir y borrar en `fotos`, y no puede
crear buckets, escribir en otro ni administrar el servidor; el acceso anónimo recibe 403. Se niega a
arrancar si `S3_ACCESS_KEY` es el usuario root.

## Índices de la tabla de reportes y por qué está cada uno

Con un millón de reportes, `reporte_inundacion` tiene 14 índices (la migración 0018 quitó uno
redundante, ver abajo). No es gratis: cada `INSERT` los actualiza todos. El reparto:

| Índice | Para qué | Añadido en |
|---|---|---|
| `reporte_inundacion_pkey` | Clave primaria | 0001 |
| `reporte_geom_gist` | Consultas espaciales del técnico (coordenada exacta) | 0001 |
| `reporte_uv`, `reporte_distrito`, `reporte_creado`, `reporte_punto_critico` | Filtros del listado | 0001 |
| `reporte_estado_creado` | Listado público: filtro por estado más orden por fecha | 0002 |
| `reporte_con_ip_hash`, `reporte_foto_huerfanas` | Retención (§13); parciales y pequeños | 0002 |
| `reporte_geom_publico_gist` | Listado público por bbox sobre la geometría **publicable** | 0005 |
| `reporte_sin_geom_publico` | Encontrar lo pendiente de rellenar sin recorrer la tabla | 0005 |
| `reporte_fusionado_en`, `reporte_autor`, `reporte_validado_por` | **Claves foráneas sin índice**: sin ellos, borrar reportes o usuarios era inviable | 0006 |
| `reporte_agregado_uv` | Agregado por UV con index only scan | 0007 |

Sobre la 0006: con un millón de reportes, un `DELETE` masivo **no terminó en 14 minutos** y hubo
que cancelarlo, porque la autorreferencia `fusionado_en_id` obligaba a recorrer la tabla entera
por cada fila borrada. Con los índices puestos, el mismo borrado de 2 000 000 de filas tardó
**22,2 s**.

Sobre la 0018: quita `reporte_estado` (índice de una sola columna sobre `estado`). El compuesto
`reporte_estado_creado (estado, creado_en DESC)` ya cubre los filtros por `estado` —es su columna
principal—, así que el de una sola columna era redundante y solo sumaba trabajo a cada `INSERT`.

## Límites conocidos que NO se han resuelto

| Qué | Estado | Por qué |
|---|---|---|
| Un solo punto crítico gigante | **Abierto** | Con un millón de reportes densos, DBSCAN con `minpoints = 1` encadenó los 750 021 publicables en **un solo** punto crítico. Es la limitación documentada en CLAUDE.md §9.2 llevada al extremo. El radio de 25 m es un parámetro de dominio que §16 (punto 3) deja pendiente de validar con el técnico municipal: no es una decisión de ingeniería. Lo que sí se arregló es que eso ya no revienta el proceso ni bloquea una petición HTTP. |
| Rate limiting por proceso | **Abierto, deliberado** | Ver arriba. Con `--scale` el límite por IP se multiplica por el número de réplicas hasta que haya un almacén compartido o el límite se ponga en el proxy de entrada. |
| Fotos en disco | **Modo oficial en la VPS** (ADR 0006) | Correcto en una máquina: sus réplicas comparten el volumen, con guarda de espacio y alertas. Para varias máquinas, `AlmacenS3` existe, está probado contra MinIO y se activa con `S3_ENDPOINT`. Abiertos: la copia de las fotos fuera de la VPS y el traslado manual de las ya guardadas si se pasa a S3. |
| `CREATE INDEX` bloquea escrituras | **Aceptado** | Una migración que crea un índice toma un lock que impide escribir en la tabla. Medido: 0,95 s con 750 000 filas indexadas. A diez millones serían unos 10 s de escrituras bloqueadas. Si eso deja de ser tolerable, hace falta `CREATE INDEX CONCURRENTLY`, que no puede correr dentro de una transacción y obliga a cambiar el ejecutor de migraciones. |
