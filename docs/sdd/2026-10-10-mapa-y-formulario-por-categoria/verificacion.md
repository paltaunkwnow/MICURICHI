# Verificación M4 — PREPARACIÓN en curso

> **Cierre del 2026-10-15:** este documento conserva la preparación histórica del verificador
> interrumpido. Los resultados actuales están en [verificacion-ejecucion.md](verificacion-ejecucion.md)
> y el dictamen de cierre en [informe.md](informe.md). Las celdas pendientes de abajo son de
> aquella preparación y no reemplazan los resultados posteriores.

**2026-10-14 · No es un cierre de F4a.** Este verificador no ha ejecutado suites,
typecheck, builds, migraciones, consultas SQL ni arranques de servicios. El implementador
conserva el único turno pesado. Se espera la señal explícita del principal antes de ejecutar.
Modelo heredado de Codex; no se invocan alias de modelos de Claude.

- **Rama:** `codex/cierre-m4`.
- **Parte de esta tarea:** P5, documentación de verificación. Única escritura propia:
  este archivo. No se modifica `preparacion-verificacion-codex.md`, escrito por el principal.
- **Banderas:** `base`, `ui`, `contrato`, `privacidad`, `api` como consumidor.
- **Alcance final:** `...contracts`: contracts, db, api-core, geo-service,
  web-ciudadano, panel-admin y geodata-etl; E2E G1, G2, G3, G5 y recorrido-completo.
- **Foto original:** `refs/sdd/mapa-y-formulario-por-categoria` =
  `48b1e408ea57ef924e94625f1d720bb98c6ae6cf`.
- **Integridad de la continuación:** `.turbo/cierre-m4-2026-10-14/arbol-antes.json`,
  818 archivos según el principal; existencia comprobada por este verificador. No sustituye
  la foto original ni permite atribuir al implementador los cambios documentales previos.
- **OpenAPI antes de correcciones/build:**
  `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac`.
  Coincide con el hash leído por este verificador y con el comunicado por el principal.

## Fuentes y evidencia de preparación

Leídos `AGENTS.md` completo, `VentanaContexto.md`, plan, línea base, implementación,
auditoría recuperada, skill SDD, matriz de riesgo, plantilla de verificación,
`.codex/agents/sdd-verificador.toml`, runner local, configuración/global-setup de Playwright,
manifiestos, scripts y configuraciones necesarios para preparar los comandos.

| Hecho | Procedencia y límite |
|---|---|
| PostGIS y MinIO `healthy`, puertos publicados solo en loopback | `docker ps` de este verificador, fuera del sandbox; sin `exec` ni acceso a DB |
| Puertos 3000/3001/3002/3100 sin listeners en la muestra | `netstat` de este verificador; el principal confirmó posteriormente bind temporal libre |
| RAM libre 2003 MB, de 16025 MB | Muestra propia previa; insuficiente para E2E. El principal comunicó después 2622 MB. Repetir al recibir turno y antes de cada grupo |
| Sin procesos chrome/msedge/cloudflared en la consulta propia | No demuestra ausencia futura; había procesos node, sin atribuirlos por su nombre a suites ajenas |
| Node 24.15.0; contratos 0.21.0; herramientas `.cmd` locales presentes | Node ejecutado solo con `--version`; manifiestos y rutas leídos |
| pnpm 12.4.1 funciona fuera del sandbox mediante `bin/pnpm.mjs` | Comprobado por el principal. El binario nativo probado aquí dentro del sandbox falló al canonicalizar cwd (`os error 5`) |
| `curichi_e2e` existe, última migración 0021, ambos roles restringidos conectan | Evidencia del principal en [preparacion-verificacion-codex.md](preparacion-verificacion-codex.md); este verificador no abrió ninguna conexión |
| `.env`: POSTGRES_DB es curichi; URL dueña local a curichi; faltan API/GEO_DATABASE_URL; passwords de ambos roles presentes | Lectura propia que imprimió solo presencia y predicados, nunca valores. S3_ENDPOINT vacío, STORAGE_DIR ausente |
| Variables de proceso DATABASE_URL, API/GEO_DATABASE_URL, DATABASE_URL_PG_REAL y S3_SECRET_KEY no definidas | Muestra propia, no garantía para otro proceso futuro |
| Chromium completo 1243 / 153.0.8010.12 presente | `chrome-win64/chrome.exe` y manifiesto instalado de Playwright coinciden. No se lanzó el navegador |
| Caché normal de Playwright ausente; caché de Claude presente | Solo metadatos. También existen headless shell 1243, ffmpeg 1011 y winldd 1007 |
| dist de contracts/db y `.next` de ambas apps ya existen | Metadatos del 11/10; existencia no acredita build del árbol corregido. No borrar cachés |

El sandbox denegó el pipe Docker y CIM. La repetición autorizada fuera del sandbox funcionó.
Son obstáculos de acceso, no regresiones de producto. Los errores anteriores de tipos/caché
del 13/10 se conservan como antecedentes; no se instalarán dependencias para sortearlos.

## Matriz final pendiente y comparación prevista

Todas las celdas «ahora» están **PENDIENTES, no ejecutadas por este verificador**.
Los resultados del implementador y del 13/10 no se presentan como nuestra verificación final.
Comparar por archivo y nombre de prueba, diagnósticos Biome y TS, omisiones y reintentos;
un total mayor no demuestra que las aserciones antiguas se hayan conservado.

Para abreviar los comandos de esta sección, desde la raíz del repo en PowerShell:

```powershell
$NodoM4 = 'C:\Program Files\nodejs\node.exe'
$PnpmM4 = 'C:\Users\HP\AppData\Local\npm-cache\_npx\90fd45f2ce56cc10\node_modules\pnpm\bin\pnpm.mjs'
```

Estas asignaciones se usarán solo en la llamada de ejecución. El wrapper fue verificado por
el principal. `COREPACK_ENABLE_NETWORK=0` en ese proceso impide que el wrapper descargue un
binario si deja de encontrar el instalado. No usar `npx -y`, install, corepack prepare,
`playwright install`, ni persistir variables de usuario/sistema. Los `.cmd` locales son
alternativa directa si pnpm vuelve a fallar, dejando constancia del cambio de invocador.

| Orden | Comando / trabajo pendiente | Línea base M4 | Ahora |
|---|---|---|---|
| 0 | Turno explícito, fin de edición, estado Git, diff por `archivos.txt`, hashes y RAM; no next dev ni otra suite | Foto original + arbol-inicial | PENDIENTE |
| 1 | `./node_modules/.bin/biome.cmd check . --reporter=summary` | 1 error de formato y 6 avisos ajenos | PENDIENTE |
| 2 | `& $NodoM4 scripts/buscar-secretos.mjs --todos`, con salida capturada y redactada antes de compartir; revisar también nuevos archivos de corrida | Sin hallazgos; escáner no cubre untracked por sí solo | PENDIENTE |
| 3 | `& $NodoM4 $PnpmM4 --filter contracts build`, luego `--filter db build` | Ambos verdes; consumidores importan dist | PENDIENTE |
| 4 | Segunda regeneración contracts; comparar bytes y SHA256 OpenAPI con copia previa en temporal y con hash de cabecera; diff CHANGELOG contra foto | OpenAPI idéntico; CHANGELOG cambiado | PENDIENTE |
| 5 | `& $NodoM4 $PnpmM4 exec turbo run typecheck --filter=...contracts --concurrency=1` | 9/9 tareas | PENDIENTE |
| 6 | `& $NodoM4 $PnpmM4 exec turbo run test --filter=...contracts --concurrency=1` | contracts 292; db 294; API 436 + 12 omitidas; web 486; panel 458; geo 71; ETL 21 | PENDIENTE |
| 7 | Privacidad: seis archivos API + jitter de contracts, comandos debajo | Cubiertos por suites globales de baseline; fila dedicada complementaria | PENDIENTE |
| 8 | `& $NodoM4 $PnpmM4 exec turbo run build --filter=...contracts --concurrency=1` | 7/7; apps compilan | PENDIENTE |
| 9 | En e2e: `./node_modules/.bin/tsc.cmd --noEmit -p .` y `./node_modules/.bin/playwright.cmd test --list` | tsc verde en implementación; registrar inventario final | PENDIENTE |
| 10 | `& $NodoM4 $PnpmM4 audit --audit-level high` si está disponible la consulta al registro, sin instalar/actualizar | Rojo histórico: 3 high, source-map-js/sharp/next | PENDIENTE; requiere red, no inferir vigencia del resultado histórico |
| 11 | Privilegios con DATABASE_URL efímera exclusivamente a curichi_e2e: `node packages/db/src/cli/verificar-privilegios.mjs` | Verde contra curichi_e2e | PENDIENTE, solo al recibir turno E2E |
| 12 | E2E manual aislada, G1 → G2 → G3 → G5 → recorrido-completo | 159 aprobadas, 1 omitida, 0 flaky | PENDIENTE |
| 13 | Revisión CA/invariantes, cierre de procesos propios, comparación integridad y estado Docker | Pila restaurada; sin regresiones | PENDIENTE |

Privacidad, con directorio de trabajo `services/api-core`:

```powershell
./node_modules/.bin/vitest.cmd run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts test/publicacion-diferida.test.ts test/exportacion.test.ts test/ubicacion-dispositivo.test.ts test/ubicacion-aproximada.test.ts --maxWorkers=1
```

Con directorio `packages/contracts`:

```powershell
./node_modules/.bin/vitest.cmd run test/jitter.test.ts --maxWorkers=1
```

Para documentar las invariantes reescritas, la suite completa de web se complementará, solo
si la salida global no proporciona el detalle necesario, con los 12 archivos W1 de la línea
base y las pruebas M4 (`categoria`, `categoria-mapa`, `api-categoria`, `VistaMapa`, selectores,
adaptadores, presentadores y cupo-categoria), usando `--reporter=verbose --maxWorkers=1`.
No sustituir la revisión independiente de `formulario-reporte.test.ts` por el conteo 625.

**Cambios respecto de la invocación histórica:** binarios instalados en vez de npx con
descarga; PowerShell; preparación contracts/db explícitamente secuencial; máximo un worker
en las filas dedicadas. Mantener alcance `...contracts`, concurrencia 1 y mismos proyectos,
workers 1 y retries 1 de Playwright. No repetir suites globales por cada bandera si esa misma
salida ya cubre los archivos; justificar cualquier fila complementaria.

Antes de cada pesado: RAM >=1500 MB para estáticos/suites/builds y >=2500 MB para E2E,
sin otro ejecutor; no `--forzar`. Guardar comando, cwd, duración, exit code y salida útil.
No exportar DATABASE_URL_PG_REAL ni S3_SECRET_KEY a las suites: así no se activan las pruebas
opcionales de PostgreSQL real/MinIO por accidente. Comparar las 12 omisiones históricas.
No hay bandera datos ni motivo para repetir el experimento de un millón de reportes.

Los rojos conocidos de lint son el formato de `ContextosySkills/hooks/contexto.mjs`, cinco
`noUndeclaredEnvVars` del mismo archivo y un `noDescendingSpecificity` de
`docs/dominio/infografia-plataformas-riesgo.html`. Cualquier diagnóstico distinto se registra.
Una prueba antes verde que falle, desaparezca o se omita sin justificación bloquea el cierre.

## Runner existente: aislamiento y límites comprobados por lectura

No se ejecutará el runner para esta alternativa, ni con `--solo-preparar`.

1. `urlsDeBasePrueba()` (runner:301) lee **archivo** `.env`, no process.env; requiere las tres
   URLs. Deriva `${POSTGRES_DB || 'curichi'}_e2e`, valida base original y sufijo de destino.
   Con el archivo actual el destino sería curichi_e2e, pero faltan API/GEO_DATABASE_URL.
   Exportarlas al proceso no corrige esa lectura. No se edita `.env`.
2. `baseExiste()` (runner:430) hace SELECT de catálogo conectado a `urls.baseReal`.
   Con el archivo actual se conectaría a **curichi**. Aunque sea SELECT, contradice la orden
   actual de no conectarse jamás. El cambio solicitado a postgres sigue pendiente y no es
   necesario para la alternativa manual.
3. `prepararBase()` (runner:483) hace build y migra siempre; crea/carga/siembra si es nueva
   o si se pasa `--resembrar`. `--solo-preparar` tiene esas escrituras; no es un dry-run.
4. Las migraciones/ETL/seed usan `entornoDueno()` con DATABASE_URL derivada, y los servicios
   reciben sus URLs derivadas antes del env-file. Ese es el mecanismo que evita migrar la
   base original. No es una prohibición absoluta codificada contra curichi_revision: depende
   de POSTGRES_DB. En esta corrida se exige una allowlist fija **curichi_e2e**.
5. El runner invoca `npx -y pnpm@12.4.1`, no garantiza cero descargas; tampoco aísla STORAGE_DIR
   por sí mismo. `/ready` se espera por estado 200, sin comprobar el cuerpo degradado.
6. Playwright original trae `webServer.command='pnpm dev'` y solo detecta API:3001.
   Si no encuentra API puede arrancar contra `.env`; global-setup además **crea una cuenta**
   antes de validar demoras/cupo. No usarlo como prueba inocua de conectividad.

## Alternativa manual segura, propuesta para ejecutar después de la señal

**Precondición aportada por el principal:** curichi_e2e ya está en 0021 y los roles funcionan.
No se necesita migrar, crear base, sembrar, activar categorías ni ETL. El estado de capas,
cuentas semilla y recursos aún debe comprobarse en la ventana, exclusivamente sobre E2E.
Si falta algo, detener esa etapa y reportarlo; no reparar automáticamente una base.

### A. Entorno privado en memoria

Usar un coordinador Node de la llamada de ejecución, sin escribir URLs en comandos, archivos
o logs. Leer `.env` con `util.parseEnv`, guardar los valores solo en memoria y construir tres
URLs con `URL`. Este fragmento define las guardas propuestas; **no se ejecutó**:

```javascript
const e = parseEnv(readFileSync(join(raiz, '.env'), 'utf8'));
const origen = new URL(e.DATABASE_URL);
if (!['postgres:', 'postgresql:'].includes(origen.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(origen.hostname) ||
    origen.search || origen.hash) throw new Error('Origen PG local no válido');
const dueno = new URL(origen);
dueno.pathname = '/curichi_e2e';
const api = new URL(dueno);
api.username = 'curichi_api';
if (!e.API_DB_PASSWORD || !e.GEO_DB_PASSWORD) throw new Error('Faltan claves de roles');
api.password = e.API_DB_PASSWORD;
const geo = new URL(dueno);
geo.username = 'curichi_geo';
geo.password = e.GEO_DB_PASSWORD;
for (const u of [dueno, api, geo]) {
  if (u.pathname !== '/curichi_e2e' || u.search || u.hash ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new Error('Destino fuera de la allowlist E2E');
  }
}
```

No usar `origen` para conectarse. URL dueña solo para la lectura de privilegios en E2E;
no se suministra a servicios. API recibe API_DATABASE_URL y DATABASE_URL = api; geo recibe
GEO_DATABASE_URL y DATABASE_URL = geo. Así sus fallbacks siguen usando el rol restringido
y curichi_e2e. Si se repite SELECT de identidad al comenzar, aceptar solo current_database
= curichi_e2e y current_user = rol esperado, sin imprimir cadenas de conexión.

Construir el entorno de los hijos con las claves necesarias de configuración local y los
siguientes overrides finales. No pasar indiscriminadamente variables PG de otro trabajo.
No usar `--env-file` al lanzar servicios: la lectura ya se hizo en memoria. Retirar
DATABASE_URL_PG_REAL y los valores S3 heredados; fijar S3_ENDPOINT vacío.

| Variables | Valor de prueba |
|---|---|
| NODE_ENV | development |
| API_CORE_HOST / API_CORE_PORT | 127.0.0.1 / 3001 |
| GEO_SERVICE_HOST / GEO_SERVICE_PORT | 127.0.0.1 / 3002 |
| API_CORE_URL / GEO_SERVICE_URL | http://127.0.0.1:3001 / http://127.0.0.1:3002 |
| PANEL_ADMIN_URL / E2E_PUBLICA_URL | http://localhost:3100 / http://localhost:3000 |
| CORS_ORIGENES | http://localhost:3000,http://localhost:3100 |
| PUBLIC_BASE_URL | vacío, para evitar destinos externos heredados |
| COOKIE_SEGURA / TRUST_PROXY / HSTS | 0 / 0 / 0 |
| REPORTES_POR_DIA_POR_CUENTA | 3 |
| REPORTE_DEMORA_PRIMERO_S / REPORTE_DEMORA_SIGUIENTES_S | 2 / 4 |
| RATE_LIMIT_REPORTES_POR_HORA | 1000 |
| RATE_LIMIT_LECTURAS_POR_MINUTO | 100000 |
| GEO_RATE_LIMIT_POR_MINUTO / GEO_RATE_LIMIT_CONSULTAS_POR_MINUTO | 100000 / 100000 |
| LOGIN_PETICIONES_POR_VENTANA | 1000 |
| REGISTRO_PETICIONES_POR_VENTANA / REGISTRO_MAX_POR_IP | 1000 / 1000 |
| ALTAS_POR_DIA_POR_IP | 10000 |
| LOGIN_MAX_FALLOS_IP / LOGIN_MAX_FALLOS_EMAIL | 100000 / 100000 |
| STORAGE_DIR | subdirectorio fotos en temporal propio de la corrida, nunca infra/.storage/fotos |
| S3_ENDPOINT | vacío; fotos en disco aislado |
| PLAYWRIGHT_BROWSERS_PATH | caché física documentada debajo, solo hijo Playwright |

Preservar ciudad/zona horaria/CRS de la instalación y un GEO_TOKEN_INTERNO coherente en ambos
servicios, sin imprimirlos. No bajar la guarda de espacio de fotos para forzar `/ready` verde;
si no hay espacio, es bloqueo real. No facilitar credenciales de la base a Next ni Playwright.

### B. Arranque de procesos conocidos, sin pnpm dev ni runner

Después de los builds, repetir puertos y RAM, y guardar estado Docker. Para los procesos
usar `spawn(process.execPath, args, {cwd, env, shell:false, windowsHide:true})`; conservar
handles/PID/hora de creación. Logs privados en temporal, salida redactada antes de compartir.
Las rutas ejecutables siguientes se comprobaron en disco. No arrancan el job migraciones.

| Proceso | cwd desde raíz | Argumentos a node.exe |
|---|---|---|
| geo-service | services/geo-service | `node_modules/tsx/dist/cli.mjs watch src/servidor.ts` |
| api-core | services/api-core | `node_modules/tsx/dist/cli.mjs watch src/servidor.ts` |
| web | apps/web-ciudadano | `node_modules/next/dist/bin/next dev -p 3000 --hostname 127.0.0.1 --webpack` |
| panel | apps/panel-admin | `node_modules/next/dist/bin/next dev -p 3100 --hostname 127.0.0.1 --webpack` |

Antes de las apps, ejecutar secuencialmente `node scripts/copiar-worker-maplibre.mjs` en cada
app (normalmente ya lo hizo prebuild). Son recursos generados de MapLibre, no cambios de código.
No borrar `.next`. Next puede cambiar next-env.d.ts: capturar sus bytes/hash antes y, al cerrar,
restaurar solo una alteración generada identificada, sin pisar cambios del implementador.

Arrancar geo y API primero, luego las apps en serie. Esperar geo `/health`, API `/ready`
con cuerpo db/geo/fotos ok y degradado false, web `/`, panel `/login`. Verificar que los
listeners pertenecen a los procesos propios, no solo que un HTTP responde. Login del técnico
con credenciales sintéticas de ayudas.ts, exclusivamente por localhost, sin volcar cookie.
Si un puerto estaba ocupado antes o cambia de dueño, no matar el proceso desconocido.

### C. Playwright sin posibilidad de autoarranque

No basta con comprobar 3001 y confiar en reuseExistingServer: el servicio puede caer entre
la comprobación y el inicio del grupo. Crear **solo en temporal** una configuración `.mjs`
que importe la configuración real por file URL y elimine webServer. No editar config/tests
del repositorio. Es la propuesta operativa; su carga aún no se ha probado.

```javascript
import base from 'file:///C:/Users/HP/Desktop/MICURICHI/e2e/playwright.config.ts';
export default {
  ...base,
  testDir: 'C:/Users/HP/Desktop/MICURICHI/e2e/tests',
  globalSetup: 'C:/Users/HP/Desktop/MICURICHI/e2e/global-setup.ts',
  webServer: [],
  outputDir: process.env.M4_ARTEFACTOS,
  reporter: [['list'], ['json', { outputFile: process.env.M4_RESULTADO_JSON }]],
};
```

Pasar M4_ARTEFACTOS/M4_RESULTADO_JSON con rutas absolutas diferentes por grupo en ese temporal.
Conservar use/channel, proyectos, workers=1, retries=1, fake device y global-setup originales.
Si no carga el import TypeScript, detener; no volver al config con arranque automático como
fallback. Primero validar esta configuración con `test --list`, en la ventana autorizada.

Binario: `e2e/node_modules/@playwright/test/cli.js`, invocado mediante node.exe con cwd e2e.
En los comandos siguientes `$ConfigTemporalM4` será la ruta absoluta del archivo temporal;
no hay ejecución implícita ni un archivo creado por esta preparación.

```powershell
# cwd: C:\Users\HP\Desktop\MICURICHI\e2e
& $NodoM4 ./node_modules/@playwright/test/cli.js test --config $ConfigTemporalM4 tests/api-contratos.spec.ts tests/separacion-publica-tecnica.spec.ts tests/cuenta-ciudadana.spec.ts tests/acceso-panel.spec.ts tests/publicacion-diferida.spec.ts --project=chromium
& $NodoM4 ./node_modules/@playwright/test/cli.js test --config $ConfigTemporalM4 tests/mapa-publico.spec.ts tests/mapa-seleccion.spec.ts tests/trafico-publico.spec.ts tests/datos-reales.spec.ts tests/navegacion.spec.ts --project=chromium --project=movil
& $NodoM4 ./node_modules/@playwright/test/cli.js test --config $ConfigTemporalM4 tests/formulario-reporte.spec.ts tests/formulario-sumidero-y-fotos.spec.ts tests/ubicacion-obligatoria.spec.ts tests/ubicacion-aproximada.spec.ts tests/camara-foto.spec.ts tests/resiliencia-interfaz.spec.ts tests/quitar-campos-web.spec.ts --project=chromium --project=movil
& $NodoM4 ./node_modules/@playwright/test/cli.js test --config $ConfigTemporalM4 tests/accesibilidad.spec.ts tests/responsive.spec.ts tests/csp.spec.ts --project=chromium
& $NodoM4 ./node_modules/@playwright/test/cli.js test --config $ConfigTemporalM4 tests/recorrido-completo.spec.ts --project=chromium
```

Son cinco llamadas separadas, con comprobación de RAM >=2500 MB antes de **cada** grupo.
No ejecutar el bloque seguido sin esas puertas. El filtro móvil original solo selecciona
mapa-publico, mapa-seleccion, camara-foto y ubicacion-obligatoria. No correr G4 completo.

| Grupo | Referencia pre-M4 para comparar | Estado propio |
|---|---|---|
| G1 | 47 aprobadas; baseline reutilizó M3b | PENDIENTE |
| G2 | 31 aprobadas, incluidos proyectos móvil | PENDIENTE |
| G3 | 58 aprobadas + 1 omitida legítima de API directa en móvil | PENDIENTE |
| G5 | 18 aprobadas | PENDIENTE |
| recorrido-completo | 5 aprobadas | PENDIENTE |

Caché autorizada:
`C:\Users\HP\AppData\Local\Packages\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`.
Su Chromium coincide con browsers.json, pero el arranque desde Codex sigue pendiente.
No quitar `channel: 'chromium'`: la cámara simulada requiere Chromium completo. No instalar
otro navegador si falla; registrar spawn UNKNOWN/SxS/permisos si aparecen y la ruta usada.
La variable va solo al proceso; no persistenv. El navegador integrado no reemplaza la E2E.

### D. Finalización garantizada

El coordinador debe cerrar sus árboles en finally y ante SIGINT/SIGTERM, comprobar los
cuatro puertos libres y comparar Docker con el estado previo. Solo PID propios aún vivos;
nunca matar todos los node ni terminar procesos por puerto sin atribución. No detener,
arrancar, recrear ni reconstruir los contenedores del usuario: actualmente basta conservar
PostGIS/MinIO. No borrar bases, volúmenes ni artefactos ajenos. Guardar evidencia privada de
errores; no pegar logs completos con posibles credenciales.

Comparar Git con la foto de continuidad y lista entregada por implementador; preservar
los cambios ajenos. No reset, clean, stash, checkout destructivo, commit ni push.

## Revisión de aceptación y límites

- **CA1:** textos aditivos 0.21.0, consumidores compilan, OpenAPI idéntico y CHANGELOG.
- **CA2–CA4:** configuración, prioridad URL/preferencia, almacenamiento bloqueado/corrupto,
  una activa sin selector, claves/datos por categoría, selección y filtros reiniciados por
  alcance, no tráfico automático, anuncio accesible y teclado. Dos categorías sintéticas
  solo en Vitest; no activar catálogo ni crear la spec de navegador aplazada a M6.
- **CA5:** registro por componente especial, genérico/subtipos/ubicación por defecto según
  las correcciones entregadas, payload núcleo+categoria+detalle, equivalencia normalizada,
  borrador 3/migración y ausencia de posición del dispositivo, cupo/demora por categoría.
- **CA6:** mismas E2E, con los dos cambios D2 autorizados, sin debilitamiento de aserciones.
- **CA7:** documentación pertinente y alcance autorizado. No editar AGENTS/CLAUDE.
- Preferencia local contiene solo v/slug; **el borrador** conserva datos del reporte, por lo
  que la revisión debe comprobar específicamente que no guarde GPS del dispositivo.

El humo/CSP con `next dev` no acredita CSP de una imagen de producción. «En vivo» y túnel
continúan fuera de alcance, sin reconstruir la pila ni conectar a curichi/curichi_revision.
Si queda pendiente la comprobación del build de producción en navegador, declararla; no
presentar una imagen antigua como validación del código corregido.

## Bloqueos y estado de entrega

1. **Turno pesado:** lo tiene el implementador; prohibido ejecutar hasta señal explícita.
2. **RAM:** la última medición del principal (2622 MB) supera por poco el umbral; la propia
   anterior (2003 MB) no. Es condición dinámica, no motivo para retener esta propuesta.
3. **Runner original:** consulta curichi, faltan dos URLs de archivo y puede usar npx.
   La ruta manual evita los tres obstáculos y no depende de aprobar cambios al runner.
4. **Acceso fuera del sandbox:** necesario para varios comandos en esta máquina. Solicitar
   la escalación concreta cuando corresponda; las comprobaciones previas no son PASS de suites.
5. **Pendiente ejecutar:** carga de configuración temporal, Chromium, privilegios/capas/cuentas
   E2E y todas las filas finales. No se declara todavía regresión, igualdad ni éxito.

**Propuesta lista para recibir el turno.** No se espera RAM ni se ejecutan comandos pesados
de fondo. La preparación del principal permanece intacta.
