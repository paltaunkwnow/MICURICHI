# M4 — preparación de verificación en Codex

Fecha: **2026-10-14**. Preparación por el agente principal mientras se reintenta el implementador.
No es el cierre de F4a ni acredita E2E ejecutada. No se han modificado bases ni levantado apps.

## Comprobaciones realizadas

| Comprobación | Resultado |
|---|---|
| Rama y estado | `codex/cierre-m4`; cambios solo de documentación al comenzar |
| Docker, `docker ps --format` | `curichi-postgis` y `curichi-minio` healthy; solo puertos loopback |
| RAM libre inicial del último intento | 2622 MB; volver a medir antes de cada ejecución pesada |
| Puertos 3000, 3001, 3002 y 3100 | Libres mediante bind temporal de Node; sockets cerrados al terminar |
| Existencia de `curichi_e2e` | Confirmada por SELECT de catálogo conectado a `postgres` |
| Última migración de `curichi_e2e` | `0021_indice_categoria_creado.sql` |
| Roles restringidos | `curichi_api` y `curichi_geo` conectan a `curichi_e2e`; SELECT de base/rol actual correcto |
| pnpm instalado | 12.4.1, comprobado con su `bin/pnpm.mjs`; no se descargó ni instaló nada |
| Chromium 1243 | Existe `chrome.exe` en la ruta física de LocalCache de Claude; arranque pendiente |
| OpenAPI antes de build | SHA256 `aaa8b71111479752058b2ca22f75bd5cc8eb674d85c992a8f81587e2de046bac` |

Las consultas PostgreSQL se limitaron a `postgres` y `curichi_e2e`. Las credenciales se leyeron
localmente sin imprimirlas; para probar los roles se derivaron URLs efímeras apuntando a la
base E2E, comprobando que el host fuera local. No se editó `.env`.

El sandbox denegó Docker y conexiones locales (`EACCES`) y pnpm no pudo resolver el directorio
(`os error 5`). Los mismos comandos, autorizados fuera del sandbox, pasaron. No clasificar esas
denegaciones como regresiones de la aplicación.

## Obstáculos del runner existente

1. `e2e/scripts/correr-local.mjs`, función `baseExiste`: su consulta de catálogo conecta a
   `urls.baseReal`, aunque solo necesita la base administrativa `postgres`. Se propuso al usuario
   cambiar únicamente ese argumento; autorización pendiente al escribir esta nota.
2. El `.env` actual tiene `DATABASE_URL`, `API_DB_PASSWORD` y `GEO_DB_PASSWORD`, pero no las
   claves `API_DATABASE_URL`/`GEO_DATABASE_URL` que exige `urlsDeBasePrueba()`. Se verificó la
   existencia de claves, nunca se volcaron valores. `leerEnv` lee archivo, no `process.env`,
   por lo que exportar esas dos variables no basta para ese runner sin más cambios.
3. La base E2E ya existe y está en 0021: no hace falta ejecutar migraciones en la base habitual,
   resembrar ni volver a cargar capas para esta preparación.

Alternativa operativa a valorar: usar la pila E2E ya preparada y lanzar los cuatro servicios
con variables efímeras, roles restringidos y las mismas opciones de prueba del runner; comprobar
que los cuatro responden antes de Playwright para evitar su arranque automático `pnpm dev`.
No usar directamente Playwright contra servicios desconocidos ni editar `.env` para sortearlo.

## Ejecución pendiente, en serie

1. Terminar correcciones y recibir el turno del implementador; revisar salidas de su preflight.
2. Lint y secretos; typecheck/test/build del grafo `...contracts` con `--concurrency=1`,
   comparar por prueba con `linea-base.md`; comprobar OpenAPI idéntico al regenerar.
3. Solo después de builds, E2E por grupos G1, G2, G3, G5 y `recorrido-completo`.
   RAM previa mínima 2500 MB. No ejecutar `next build` mientras haya `next dev` activo.
4. `PLAYWRIGHT_BROWSERS_PATH` solo en procesos de verificación, apuntando a
   `C:\Users\HP\AppData\Local\Packages\claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`.
   Conservar `channel: 'chromium'` para cámara simulada.
5. Ejecutables disponibles: pnpm en
   `C:\Users\HP\AppData\Local\npm-cache\_npx\90fd45f2ce56cc10\node_modules\pnpm\bin\pnpm.mjs`,
   además de los `.cmd` locales de cada paquete. Evitar suponer `pnpm.cjs`, que no existe.
   Evitar descargas; emplear modo offline si interviene npx.
6. Cerrar exclusivamente los procesos iniciados para pruebas, comprobar los puertos y Docker,
   y dejar evidencia en `verificacion.md`. No down/rm, volúmenes, túneles ni servicios habituales.

Las verificaciones de navegador/CSP de producción y la revisión independiente siguen pendientes.
Los rojos de lint/audit preexistentes deben compararse, no arreglarse de pasada.
