# Matriz de riesgo del proceso /sdd

Única fuente de qué verifica cada cambio. F0 activa banderas por **rutas** que se van a tocar y
por **palabras** de la descripción; en la duda, la bandera se activa. `base` va siempre.

- En esta máquina, `pnpm` es `npx -y pnpm@12.4.1` (los comandos se escriben con `pnpm` para que
  valgan igual en CI). Los alias raíz que relanzan `pnpm` por dentro se corren por su paquete:
  `pnpm privilegios` → `pnpm --filter db privilegios`; `pnpm auditoria` → `npx -y pnpm@12.4.1 audit --audit-level high`.
  `$SCRATCH` es el scratchpad de la sesión.
- `<paquete>` es cada paquete de la carpeta designada: `--filter=...<a> --filter=...<b>` (el
  paquete y los que dependen de él).
- **La línea base (FB) corre exactamente esta lista, con el mismo alcance y las mismas opciones
  que F4.** Si en F4 cambia algo, el verificador explica por qué en la cabecera.
- Cuando aparece un defecto que ninguna bandera habría atrapado, se edita esta tabla: se añade la
  ruta o la palabra que lo habría activado, y el comando que lo habría visto. Cuando una tanda o
  una corrida agrega una suite, se agrega acá.

| Bandera | Rutas | Palabras | Agentes extra | Comandos obligatorios (en este orden) |
|---|---|---|---|---|
| `base` | siempre | siempre | revisor, verificador | `pnpm lint` · `pnpm exec turbo run typecheck --filter=...<paquete>` · `pnpm exec turbo run test --filter=...<paquete> --concurrency=1` · `pnpm exec turbo run build --filter=...<paquete> --concurrency=1` (nunca con un `next dev` en marcha; el build de una app puede ser su imagen Docker al día, ver «En vivo») · `pnpm secretos` · archivos sin seguimiento de la corrida: `git ls-files --others --exclude-standard -z \| xargs -0 -r grep -nIiE "(password\|contrase\|secret\|token\|BEGIN [A-Z ]*PRIVATE KEY)" --` (el auditor revisa cada coincidencia) · si toca `e2e/`: `pnpm --filter e2e exec tsc --noEmit -p .` y `pnpm --filter e2e exec playwright test --list` (corren sin pila) |
| `contrato` | `packages/contracts/` | payload, esquema, enum, endpoint nuevo, campo nuevo, campo que se quita, OpenAPI | revisor comprueba consumidores | `pnpm --filter contracts --filter db build` (los consumidores importan `dist/`: sin esto, sus tests usan el contrato viejo) · `cp packages/contracts/openapi/openapi.yaml "$SCRATCH/openapi.antes.yaml" && pnpm --filter contracts build && cmp -s "$SCRATCH/openapi.antes.yaml" packages/contracts/openapi/openapi.yaml` (verde = regenerar no cambia nada; si difiere es rojo y se vuelve a copiar el de antes para no dejar el árbol cambiado) · `git diff --name-only refs/sdd/<slug> -- packages/contracts/CHANGELOG.md` (tiene que salir si la corrida tocó contracts) · `pnpm exec turbo run typecheck test --filter=...contracts --concurrency=1` (cubre los consumidores) · ventana E2E: G1 |
| `privacidad` | `services/api-core/src/{privacidad,vistas,consultas,ubicacion-dispositivo}.ts`, `services/api-core/src/rutas/{reportes,fotos,moderacion,ejecutivo}.ts`, `packages/contracts/src/dominio/geo.ts`, `geom_publico`, `puntos-criticos` | ubicación, coordenada, jitter, público, exportación, autor, dispositivo, GPS, radio, `publicar_en`, «NO SE HA VERIFICADO», visibilidad, `condicionPublico`, manzana | auditor | `pnpm --filter api-core exec vitest run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts test/publicacion-diferida.test.ts test/exportacion.test.ts test/ubicacion-dispositivo.test.ts` · `pnpm --filter contracts exec vitest run test/jitter.test.ts` · ventana E2E: G1 + `ubicacion-obligatoria.spec.ts` |
| `seguridad` | `services/api-core/src/{auth,registro,cuota,proxy,guarda-disco,almacen,almacen-s3,config}.ts`, `services/api-core/src/rutas/{auth,fotos,admin}.ts`, `packages/contracts/src/esquemas/auth.ts`, `packages/db/src/seeds/`, `apps/*/src/proxy.ts`, `apps/*/next.config.ts`, `infra/proxy/` | login, sesión, rol, foto, EXIF, WebP, límite, cuota, cupo, disco, cámara, CSP, nonce, CORS, token, contraseña, registro, cookie | auditor (checklist completo) | `pnpm --filter api-core exec vitest run test/seguridad.test.ts test/autenticacion.test.ts test/fotos.test.ts test/fotos-abuso.test.ts test/cuentas-y-cuota.test.ts test/cupo-diario.test.ts test/fotos-cuota.test.ts test/fotos-webp.test.ts test/guarda-disco.test.ts` · con `curichi-minio` healthy y `S3_SECRET_KEY` en el entorno: `test/almacen-s3.test.ts` · `pnpm auditoria` · ventana E2E: G1 + `csp.spec.ts` y `camara-foto.spec.ts` |
| `datos` | `packages/db/migraciones/`, `packages/db/src/esquema`, `packages/db/src/seeds`, `verificar-privilegios`, `scripts/*.sql` | migración, tabla, columna, índice, seed, privilegio, GRANT | auditor si toca privilegios | `pnpm --filter db test` · `git diff --name-only --diff-filter=MDR refs/sdd/<slug> -- packages/db/migraciones` vacío (ninguna migración existente cambia) · cada migración nueva (`git ls-files -o --exclude-standard -- packages/db/migraciones` menos las ajenas de `linea-base.md`) lleva un número mayor que todas las que hay en disco y su `packages/db/test/migracion-<NNNN>-*.test.ts` · PostgreSQL real, **nunca en `curichi`**: `export DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)"; DATABASE_URL_PG_REAL="${DATABASE_URL%/*}/postgres" pnpm --filter api-core exec vitest run test/cuota-concurrencia-pg.test.ts test/fotos-cuota-concurrencia-pg.test.ts` (crean y borran su base) · privilegios en una base efímera: `docker compose exec -T postgis createdb -U curichi curichi_sdd_<slug>`, `DATABASE_URL="${DATABASE_URL%/*}/curichi_sdd_<slug>" pnpm db:migrate` (dos veces: la segunda no aplica nada) y `… pnpm privilegios`, y `dropdb` al final (si el clasificador lo bloquea, va al informe para que la borre el usuario) · nada escribe reportes por SQL fuera de `api-core` y los seeds de `packages/db` |
| `geo` | `services/geo-service/`, `pipelines/geodata-etl/`, `puntos-criticos*`, `packages/db/src/puntos-criticos*` | PIP, resolver, capa, tesela, ETL, punto crítico, UV, unidad vecinal, distrito, manzana, shapefile | verificador | `pnpm exec turbo run test --filter=...geo-service --concurrency=1` · `pnpm --filter geodata-etl test` · `pnpm --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts` · ventana E2E: `datos-reales.spec.ts` · opcional, con el sí del usuario y en una base aparte: `node scripts/banco-consultas.mjs` (hoy mide un filtro público viejo: no vale como evidencia hasta que la Parte 5 lo actualice) |
| `concurrencia` | `idempotencia`, `pool`, `transaccion`, `advisory` | idempotente, simultáneo, réplica, lock, pool, transacción, carrera | verificador | `pnpm --filter api-core exec vitest run test/idempotencia.test.ts test/pool-conexiones.test.ts test/cupo-diario.test.ts` · PostgreSQL real como en `datos` (`cuota-concurrencia-pg`, `fotos-cuota-concurrencia-pg`) · `scripts/banco-concurrencia.mjs` **no**: manda reportes sin sesión ni `dispositivo` y no pasa con el contrato actual (tarea aparte de la Parte 5) |
| `api` | `services/api-core/src/rutas/`, `services/api-core/src/app.ts`, `services/geo-service/src/` | endpoint, ruta, respuesta, código de estado, cabecera, caché, filtro, paginación | verificador (en vivo) | `pnpm exec turbo run test --filter=...api-core --concurrency=1` (o `geo-service`) · ventana E2E: G1 · en vivo: `curl -sk -i https://localhost/api/v1/<ruta tocada>` en la línea base y después, comparando código, cabeceras de caché y forma del cuerpo |
| `ui` | `apps/web-ciudadano/`, `apps/panel-admin/` | pantalla, mapa, formulario, botón, panel, campo, tarjeta, hoja, accesible, móvil, texto | verificador con navegador | `pnpm exec turbo run test --filter=<app> --concurrency=1` · ventana E2E: los grupos de las pantallas tocadas (tabla «Pantalla → specs») más G5 · en vivo: imagen reconstruida, humo por `https://localhost`, navegador en `http://localhost:3000\|3100/<pantalla>` (misma imagen que sirve Caddy, con la CSP de producción) con consola sin errores de CSP ni `Failed to load`, en escritorio y en móvil, capturas antes y después |
| `infra` | `docker-compose.yml`, `infra/`, `.github/`, `turbo.json`, `.env.example`, `biome.json`, `e2e/*.mjs` | Docker, CI, variable de entorno, compose, healthcheck, workflow, puerto | verificador; auditor si cambia algún `ports:` o `infra/proxy/` | `docker compose --profile servicios --profile minio config --quiet` (solo el código de salida: la salida imprime el `.env` con secretos y no se pega nunca) · ningún servicio salvo `proxy` publica fuera de loopback: `docker compose --profile servicios config --format json \| node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8'));let m=0;for(const[n,s]of Object.entries(c.services))for(const p of s.ports\|\|[])if(n!=='proxy'&&p.host_ip!=='127.0.0.1'){console.log(n,p.published);m=1}process.exit(m)"` · variable de app o servicio → `turbo.json` `globalEnv` y `.env.example` con etiqueta; variable solo del Compose → `.env.example` con etiqueta · `e2e/*.mjs`: `pnpm exec biome check e2e` y ninguna ruta absoluta de usuario ni contraseña literal |
| `compartir` | `scripts/lanzador/`, `infra/proxy/`, `apps/*/src/proxy.ts`, `PANEL_ADMIN_URL*`, `CORS_ORIGENES*`, `COOKIE_SEGURA`, `TRUST_PROXY`, `PUBLIC_BASE_URL`, `packages/db/src/seeds` | amigos, compartir, túnel, cloudflare, dominio, enlace, redirección, cookie, URL absoluta | auditor | sección «Modo túnel» (con el permiso de la puerta 1) · límite conocido que va al informe: todos los amigos llegan con la IP de `cloudflared`, así que comparten el rate limit por IP, `ALTAS_POR_DIA_POR_IP` y el freno de login |
| `lanzadores` | `scripts/lanzador/`, `*.ps1`, `*.bat`, `*.exe`, `*.cs` | lanzador, iniciar, ejecutable, bat, PowerShell | auditor (qué expone: puertos, túneles, archivo hosts, elevación, credenciales impresas) | cada `.ps1` parsea sin errores: `powershell -NoProfile -c "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path '<archivo>'),[ref]$null,[ref]$e);$e.Count"` → `0` · ningún `.exe` versionado (`Mi-Curichi.exe` se genera con `scripts/lanzador/compilar.ps1` y está en `.gitignore`; un binario versionado es BLOQUEANTE) · `powershell -ExecutionPolicy Bypass -File scripts/lanzador/compilar.ps1` compila sin errores y `./Mi-Curichi.exe --ayuda` y `--estado` responden · ningún proceso de fondo (`cloudflared`, `docker compose logs -f`) que quede vivo al cerrar la ventana · ninguna contraseña impresa ni ofrecida para usar desde afuera |

Un cambio en `apps/*/src/proxy.ts`, `infra/proxy/`, cookies, sesión, CORS, CSP, cabeceras,
redirecciones, `PANEL_ADMIN_URL`, `PUBLIC_BASE_URL`, `CORS_ORIGENES` o `TRUST_PROXY` activa
`compartir` además de su bandera propia.

## Pantalla → specs E2E

| Pantalla | Specs |
|---|---|
| web `/` | mapa-publico, mapa-seleccion, trafico-publico, ubicacion-obligatoria |
| web `/reportar` | formulario-reporte, formulario-sumidero-y-fotos, camara-foto, ubicacion-obligatoria, quitar-campos-web, resiliencia-interfaz |
| web `/reporte/[id]`, `/mis-reportes` | publicacion-diferida, navegacion, quitar-campos-web |
| web `/cuenta`, `/ingresar`, `/crear-cuenta` | cuenta-ciudadana, acceso-panel |
| panel `/login` | acceso-panel, panel-tecnico |
| panel `/reportes`, `/reportes/[id]` | panel-tecnico, panel-al-dia, quitar-campos-panel, recorrido-completo |
| panel `/ejecutivo` | panel-ejecutivo, panel-al-dia |
| panel `/capas`, `/indicadores`, `/plano` | solo accesibilidad: avisar en el informe que no tienen spec propio |

Con `ui` van siempre accesibilidad, responsive y csp (G5).

## Grupos E2E (de a uno, nunca la suite entera)

- **G1** (siempre que haya ventana): api-contratos, separacion-publica-tecnica, cuenta-ciudadana,
  acceso-panel, publicacion-diferida.
- **G2**: mapa-publico, mapa-seleccion, trafico-publico, datos-reales, navegacion.
- **G3**: formulario-reporte, formulario-sumidero-y-fotos, ubicacion-obligatoria, camara-foto,
  resiliencia-interfaz, quitar-campos-web.
- **G4**: recorrido-completo, panel-tecnico, panel-al-dia, panel-ejecutivo, quitar-campos-panel.
- **G5**: accesibilidad, responsive, csp.

`--project=chromium` siempre; `--project=movil` solo para mapa-publico, mapa-seleccion,
camara-foto y ubicacion-obligatoria.

## Orden y memoria en esta máquina

1. `lint`, `typecheck`, `test` y `build` con `--concurrency=1` y antes de levantar cualquier
   `next dev`. Antes de un `build` de apps,
   `netstat -ano | grep LISTENING | grep -E ':(3000|3100) '` no puede mostrar un `next dev` local.
2. Antes de cada comando pesado, memoria libre y procesos ajenos:
   `powershell.exe -NoProfile -Command '[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)'`
   (1500 MB o más `<umbral inicial, ajustar midiendo>`; 2500 MB antes de cada grupo E2E) y ningún
   `vitest`, `playwright`, `next` o `tsc` de otra sesión. Si no alcanza, se espera o se avisa;
   nunca se lanza igual.
3. En F4a el auditor solo corre Vitest de a un archivo y `curl`. Nunca E2E ni `build`, y espera
   mientras el verificador corre E2E.
4. Los timeouts largos (600000 ms) son por grupo o por comando, no por suite.

## Ventana E2E (solo con el permiso de la puerta 1)

La E2E necesita api-core, geo-service y las dos apps en 3001, 3002, 3000 y 3100 con el entorno de
`e2e/playwright.config.ts` (`global-setup.ts` corta si no lo tiene), y la pila Docker ocupa 3000 y
3100. Además, contra `curichi` dejaría a la vista cuentas y reportes de prueba y gastaría el tope
diario de altas.

1. **Base aparte**, una sola vez: `docker compose exec -T postgis createdb -U curichi curichi_e2e`;
   con `DATABASE_URL` hacia ella, `pnpm db:migrate`, `pnpm etl:load -- --version DM_UV_MZ_2025`
   (o las capas sintéticas del seed si no está la entrega) y `pnpm db:seed:samples` con
   `SEED_*_PASSWORD` iguales a las credenciales por defecto de `e2e/tests/ayudas.ts`.
   `<a confirmar en la primera corrida>`: que `curichi_api` y `curichi_geo` tengan los permisos en
   esa base (`DATABASE_URL=…/curichi_e2e pnpm privilegios`). Si no se puede, se pregunta antes de
   correr la E2E contra `curichi`. Nunca `db:seed:samples`, `DELETE` ni `TRUNCATE` contra
   `curichi` sin el sí del usuario.
2. **Estado y túneles:** `docker compose ps --format '{{.Service}} {{.State}} {{.Health}}' > docs/sdd/<corrida>/pila-antes.txt`.
   Si hay `cloudflared` corriendo, alguien está usando la pila: se avisa antes de seguir.
3. **Puertos, de forma reversible:** `docker compose --profile servicios --profile minio stop web-ciudadano panel-admin`
   (solo esos dos; mientras tanto Caddy responde 502). Nunca `down`, `rm` ni `-v`.
   `netstat -ano | grep LISTENING | grep -E ':(3000|3001|3002|3100) '` tiene que salir vacío; si
   un PID reaparece a los 2 s es un bucle de otra sesión: se pregunta antes de matarlo.
4. **Servicios:** `pnpm --filter contracts --filter db build`. Exportar `DATABASE_URL`,
   `API_DATABASE_URL` y `GEO_DATABASE_URL` hacia `curichi_e2e`, derivadas del `.env` en la misma
   llamada (`sed -n 's/^API_DATABASE_URL=//p' .env | sed 's#/curichi$#/curichi_e2e#'`), nunca
   escritas en un archivo versionado, más las variables de `webServer.env` de
   `e2e/playwright.config.ts` (`--env-file-if-exists` no pisa lo exportado). Levantar en segundo
   plano `--filter api-core dev`, `--filter geo-service dev`,
   `--filter web-ciudadano exec next dev -p 3000 --webpack` y
   `--filter panel-admin exec next dev -p 3100 --webpack`, y anotar los PID.
5. **Antes de correr:** `curl -s 127.0.0.1:3001/ready` sin `degradado`, y el login del técnico con
   las credenciales de `e2e/tests/ayudas.ts` da 200.
6. **Correr** solo los grupos que piden las banderas, de a uno:
   `pnpm --filter e2e exec playwright test <specs del grupo> --project=chromium`.
7. **Cerrar siempre**, también si algo falló: matar esos PID (`taskkill //PID <pid> //T //F`),
   confirmar los puertos libres, `docker compose --profile servicios --profile minio start web-ciudadano panel-admin`,
   esperar `healthy` (180 s como máximo), guardar `pila-despues.txt`, compararla con
   `pila-antes.txt` y `curl -sk -o /dev/null -w '%{http_code}' https://localhost/` → 200. Si la
   pila no vuelve igual, es lo primero que se informa.
8. Con la ventana abierta, ni `next build` local ni `docker compose build` de las apps.

## En vivo (`ui`, `api`, `infra`; solo con el permiso de la puerta 1)

Lo que el usuario usa es la pila Docker construida desde el árbol de trabajo. Orden fijo, de a un
servicio por vez y sin otro comando pesado en marcha:

1. **Qué reconstruir:** `apps/web-ciudadano` → `web-ciudadano`; `apps/panel-admin` → `panel-admin`;
   `services/api-core` o `packages/db` → `api-core` (su imagen también corre el job `migraciones`);
   `services/geo-service` → `geo-service`; `infra/proxy/` → `proxy`; `packages/contracts` → los
   cuatro de la aplicación (avisá el tiempo en la puerta 1).
2. **Guardar la imagen actual:** `docker tag mi-curichi-<svc>:local mi-curichi-<svc>:antes-<slug>`.
3. **Reconstruir:** `docker compose --profile servicios --profile minio build <svc>`. Un build en
   rojo es rojo de la corrida.
4. **Solo con migración autorizada**, en este orden: imagen de api-core reconstruida;
   `docker compose exec -T postgis pg_dump -U curichi -Fc curichi > "$SCRATCH/curichi-antes-<slug>.dump"`
   (fuera del repo: tiene datos personales); `docker compose --profile servicios run --rm migraciones`.
   Si la migración no tiene vuelta atrás (p. ej. `ALTER TYPE … ADD VALUE`), se avisó en la puerta 1.
5. **Reemplazar:** `docker compose --profile servicios --profile minio up -d --no-deps <svc>`.
   Nunca `down`, nunca `postgis`, nunca `--force-recreate` de lo que no tocaste.
6. **Sano y al día:** `docker compose ps --format "{{.Service}} {{.Health}}"` hasta `healthy`
   (180 s `<ajustar>`), y `docker image inspect -f '{{.Created}}' mi-curichi-<svc>:local` posterior al
   último archivo editado.
7. **Humo por el proxy**, como lo usa el usuario: `curl -sk -o /dev/null -w "%{http_code}\n"` a
   `https://localhost/`, `https://localhost/api/v1/configuracion`,
   `--resolve panel.localhost:443:127.0.0.1 https://panel.localhost/login` y cada ruta que toca la
   spec; con `-skI`, las cabeceras (CSP con nonce y sin `unsafe-inline`, `nosniff`, sin
   `x-middleware-*`); `curl -s "http://$(docker compose port api-core 3001)/ready"` sin `degradado`.
   Más las «comprobaciones en vivo pendientes» del auditor.
8. **Navegador integrado** en las mismas pantallas fotografiadas en la línea base, en escritorio y
   en móvil (`resize_window`): consola sin errores, captura descrita en `verificacion.md`.
9. **Si algo queda rojo:** `docker tag mi-curichi-<svc>:antes-<slug> mi-curichi-<svc>:local && docker compose --profile servicios --profile minio up -d --no-deps --force-recreate <svc>`
   (el dump, si hubo migración, lo restaura el usuario), y transcribir. La pila del usuario no se
   deja rota.

## Modo túnel (`compartir`; después de «En vivo» y solo con el permiso de la puerta 1)

Lo que funciona en `https://localhost` se puede romper visto desde otro dominio: URLs absolutas a
`localhost` o `panel.localhost`, el `panel_url` de `/auth/yo`, cookies `Secure`, CSP,
redirecciones, `CORS_ORIGENES`, `TRUST_PROXY`.

1. Si el usuario ya tiene túneles abiertos (`Get-Process cloudflared`), no se abre otro: el agente
   principal le pide la URL. Si no hay, el verificador abre uno propio en segundo plano:
   `"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel --url https://localhost:443 --no-tls-verify --http-host-header localhost --logfile "$SCRATCH/tunel-web.log"`
   (y otro igual con `panel.localhost`). La URL `https://…trycloudflare.com` sale del log.
2. **Sin credenciales.** Por el túnel no se manda ninguna contraseña ni se crean cuentas, porque
   no es un host local:
   - `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $URL/` → 200 y ninguna redirección a
     `localhost`;
   - `curl -sI $URL/` → CSP con nonce y sin `x-middleware-*`; si hay `Set-Cookie`, con `Secure`;
   - `curl -s $URL/ | grep -oE 'https?://(localhost|127[.]0[.]0[.]1|panel[.]localhost)[^ <>"]*' | sort -u` → vacío;
   - `$URL/api/v1/configuracion` → 200; `$URL/api/v1/auth/yo` → 401 y no 5xx; `$URL_PANEL/login` → 200;
   - navegador integrado en `$URL/` y `$URL_PANEL/login`: consola sin errores de CSP ni
     `Failed to load`.
3. Lo que exige sesión (entrar, reportar, validar, el botón «Panel técnico») lo prueba el usuario
   desde su celular con la lista que le da el agente principal en la puerta 2. En el informe queda
   «verificado por el usuario» o «no verificado».
4. Se cierra solo el túnel propio (`Stop-Process` del PID que se abrió). Los del usuario no se tocan.

## Lo que no se puede ejecutar

Se marca **no verificado** con el motivo, nunca PASS. Casos conocidos: memoria insuficiente (con
los números); la puerta 1 no autorizó la ventana E2E, el en vivo, la migración de `curichi` o el
túnel; Docker Desktop apagado (lo «con PostgreSQL real», la ventana E2E y «En vivo»); shapefiles
reales ausentes en `data/raw/` (`datos-reales` corre sobre las capas sintéticas y lo dice); lo que
exige sesión por el túnel (lo prueba el usuario); navegador integrado sin service worker
(`docs/TRASPASO.md` §7.6).
