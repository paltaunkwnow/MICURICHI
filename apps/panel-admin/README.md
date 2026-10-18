# panel-admin — Parte 2 — Frontend administrativo / plataforma técnica

Panel del técnico municipal: bandeja de triaje, ficha del reporte con moderación, indicadores,
capas y el plano oficial de referencia. Especificación en `CLAUDE.md` §4.4; el estado y los
pendientes están en [`docs/TRASPASO.md`](../../docs/TRASPASO.md).

```bash
pnpm --filter panel-admin dev        # 3100; necesita api-core (3001) y geo-service (3002)
pnpm --filter panel-admin test       # Vitest
pnpm --filter panel-admin build      # imagen de producción: .next/standalone (ver abajo)
```

## Panel por categoría (M5)

La disponibilidad es la intersección ordenada de `categorias_activas` de la configuración y el
registro de `contracts`. Inundaciones sigue siendo la única definición real registrada; las
definiciones sintéticas se inyectan únicamente en pruebas y no activan categorías.

- Con una categoría se oculta el selector. Con varias ofrece «Todas» y las disponibles; empieza
  en Inundaciones salvo una selección válida en la URL. El panel no usa la preferencia del mapa
  público. «Todas» incluye el historial de categorías inactivas que devuelve la API autorizada.
- La selección viaja en `?categoria=` entre bandeja, detalle, indicadores y ejecutivo. Cambiar
  categoría conserva zona/estado/fechas y vista del mapa; reinicia severidad, página y selección
  del reporte. También se aplica antes de la primera consulta si cambia la disponibilidad.
  En ejecutivo, A→B→A reinicia siempre la pestaña de severidad. El mapa conserva centro/zoom
  durante caché→respuesta fresca; una nueva selección de UV o activar el ajuste a puntos sí
  permite encuadrar explícitamente.
- Sin categoría efectiva no se consumen filas, puntos ni KPI de la caché: se muestra estado sin
  selección y «—». Exportación y reintento de datos quedan deshabilitados. Un fallo de configuración
  conserva el último valor validado con aviso, sin inferir actividad de categorías.
- Los conteos del selector no dependen de filtros de trabajo: bandeja usa `total` de publicados
  en todos los estados; indicadores, `total` vigente; ejecutivo, `activas.total` de todo el
  historial. Carga/error muestra «—» y una cota no exacta se muestra con «≥». Con selector oculto
  no se abren consultas extra para estos conteos.
- «Todas» usa columnas comunes y la categoría de cada reporte. Inundaciones conserva sus columnas
  de profundidad/frecuencia. CSV y GeoJSON usan la categoría y filtros efectivos sin la paginación
  de tabla; el GeoJSON conserva validación de `contracts` y aviso de truncamiento.

El detalle por ID se presenta con **la categoría recibida**, aunque se llegue desde «Todas».
El adaptador de Inundaciones conserva su presentación; otras definiciones usan esquema, preguntas,
opciones, subtipo y nota. Un detalle incompatible (incluido `null` explícito) o una definición
ausente muestra comunes y aviso, sin volcar JSON en HTML ni aplicar factores de agua. El fallback
plano antiguo solo se usa cuando `detalle` está ausente (`undefined`). La ficha imprimible, TXT
y GeoJSON conservan categoría, respuestas y trazabilidad técnica. La versión mostrada es la de la
**definición disponible**; la API no devuelve la versión histórica de detalle/severidad del reporte.
El panel no recalcula la severidad enviada por el servidor.

En indicadores, categoría se conserva en cifras, tortas, capa anterior y enlace UV→bandeja.
El ejecutivo conserva «Crítica = alta + crítica», `ventana=todo`, las dos gráficas y «Otros», sin
período, exportación ni moderación. Inundaciones conserva sus textos/modelo; otras categorías y
«Todas» usan bandas comunes sin inventar rangos o combinar puntajes de modelos distintos.

En el ejecutivo, «Todas» pide el resumen histórico al endpoint autorizado. Mapa y UV usan solo
categorías disponibles, una consulta pública por categoría, nunca `categoria=todas`, con máximo
300 puntos y coordenadas públicas por consulta. El límite de puntos y la diferencia de universo
con el historial inactivo se explican en pantalla. Un mapa parcial identifica categorías faltantes;
las UV se suman solo con respuestas completas e identidad territorial compatible, se ordenan por
total combinado y no reciben una severidad conjunta inventada. No se usan endpoints técnicos
para obtener esos datos del ejecutivo.

## Una imagen, cualquier ciudad: variables de tiempo de ejecución

Mi Curichi se instala una vez por ciudad con la **misma imagen**. El panel no tiene ninguna
variable de compilación que dependa del despliegue: todas se leen en el servidor, en cada
petición, y cambiarlas no exige volver a construir. Ver `.env.example`.

| Variable | Cuándo se lee | Para qué |
|---|---|---|
| `API_CORE_URL` | En cada petición (`src/proxy.ts`, `src/lib/ciudad-servidor.ts`) | Destino de `/api/*` y origen de la ciudad. Sin valor, `http://127.0.0.1:3001` |
| `GEO_SERVICE_URL` | En cada petición (`src/proxy.ts`) | Destino de `/geo/*`. Sin valor, `http://127.0.0.1:3002` |
| `PROXY_DE_CONFIANZA` | En cada petición (`src/proxy.ts`) | `1` solo con un proxy propio delante que reescriba `X-Forwarded-For` |
| `HSTS` | En cada petición (`src/proxy.ts`) | `1` añade `Strict-Transport-Security` a páginas y respuestas reenviadas. Solo detrás de HTTPS |
| `PORT`, `HOSTNAME` | Al arrancar `server.js` | Puerto e interfaz del servidor de la imagen (`3100`, `0.0.0.0`) |
| `NODE_ENV` | Al compilar (`next.config.ts`) | Distingue `next dev` de la imagen (`'unsafe-eval'` y `upgrade-insecure-requests` en la CSP). No cambia entre despliegues |

Una URL de servicio mal escrita (sin `http(s)://`, con usuario y contraseña) no se adivina: el
reenvío falla con un error que nombra la variable (`src/lib/servicios.ts`).

Lo que **ya no** se configura en el panel es **la ciudad** (nombre, centro y zoom del mapa,
locale, zona horaria): la sirve api-core en `GET /api/v1/configuracion` (contracts 0.7.0) a partir
de sus variables `CIUDAD_*`. Igual que en `web-ciudadano`:

- El layout raíz la lee **en el servidor, antes del primer HTML** (`src/lib/ciudad-servidor.ts`)
  y la reparte por contexto (`useCiudad()`, `useFormato()` en `src/lib/ciudad-contexto.tsx`): el
  mapa no abre en otra ciudad ni las fechas cambian de zona al hidratar.
- Se guarda 5 minutos en memoria y se renueva por detrás (`src/lib/configuracion.ts`); si una
  renovación falla, sigue la última buena. Si api-core no responde y nunca respondió, se usa
  `CONFIG_DOMINIO.CIUDAD_POR_DEFECTO` (Santa Cruz), se registra en el log del servidor y **no** se
  guarda: la petición siguiente vuelve a preguntar. Una respuesta que no cumple
  `ConfiguracionPublicaSchema` cuenta como sin respuesta: un locale `es_BO` tiraría `Intl`.
- Por eso todas las páginas se generan al pedirlas (`connection()`), nunca al compilar: si no,
  `next build` dejaría escrita en el HTML la ciudad del momento de construir.

Qué cambia con la ciudad:

- **Fechas y cifras**: zona horaria y locale de la ciudad. No hay formateadores con una ciudad
  por defecto: en componentes, `useFormato()`; en la lógica pura, un `Formato` como parámetro
  (`crearFormato` en `src/lib/formato.ts`).
- **Mapa**: abre en el centro de la ciudad con su `zoom_inicial` menos un nivel
  (`vistaInicialDelPanel` en `src/lib/encuadre.ts`): la bandeja comparte pantalla con la tabla y
  necesita ver más ciudad que el mapa público (Santa Cruz: 13 en la app pública, 12 aquí).
- **Plano oficial** (`/plano`): es contenido de la instalación de Santa Cruz de la Sierra (el
  plano de su municipio). Solo se muestra, y solo aparece en la barra lateral, si api-core declara
  esa ciudad —nombre completo sin importar mayúsculas ni tildes, y país `BO`
  (`hayPlanoDeReferencia` en `src/lib/plano.ts`)—; en otra ciudad `/plano` dice que la
  instalación no tiene plano de referencia.

### Imagen de producción (`output: 'standalone'`)

`next build` deja en `.next/standalone` un servidor mínimo con solo las dependencias que usa. La
raíz del trazado es la del monorepo (`outputFileTracingRoot` en `next.config.ts`), así que el
servidor queda en `.next/standalone/apps/panel-admin/server.js`. Como indica Next, `public/` y
`.next/static` no se copian solos:

```bash
cp -r public .next/standalone/apps/panel-admin/
cp -r .next/static .next/standalone/apps/panel-admin/.next/
PORT=3100 HOSTNAME=0.0.0.0 API_CORE_URL=http://api-core:3001 GEO_SERVICE_URL=http://geo-service:3002 \
  node .next/standalone/apps/panel-admin/server.js
```

`pnpm --filter panel-admin start` (`next start`) sigue sirviendo el build, con un aviso de Next
por el modo standalone.

### El reenvío de `/api` y `/geo` (`src/proxy.ts`)

El navegador solo habla con el propio origen: la cookie de sesión viaja sola y la CSP no nombra
api-core ni geo-service (`src/lib/next-config.test.ts` falla si aparece un origen nuevo).
`src/proxy.ts` (Next 16: runtime de Node, en cada petición) reenvía `/api/*` a api-core y `/geo/*`
a geo-service con `NextResponse.rewrite` a un origen externo: Next hace de proxy HTTP con la
petición entera —método, cuerpo, cabeceras y cookies— y devuelve la respuesta con sus
`Set-Cookie` y el `Content-Disposition` de la exportación. Comprobado contra api-core: el login
deja la cookie, `/auth/yo` responde con ella, y las exportaciones CSV y GeoJSON llegan completas.
Antes de reenviar borra las cabeceras con que el navegador declara su IP, salvo con
`PROXY_DE_CONFIANZA=1` (el porqué, en el propio archivo).

- **Plazo**: Next corta el reenvío tras `experimental.proxyTimeout` ms sin actividad (30 s por
  defecto). Está en 180 s, igual que `PLAZOS_MS.exportacion`: una exportación grande que api-core
  tarda en empezar a mandar no llega como «Internal Server Error».
- **Cuerpo**: con proxy, Next guarda en memoria hasta 10 MB del cuerpo de la petición. El panel
  solo manda JSON pequeño.
- **`x-middleware-rewrite`**: Next añade esa cabecera a la respuesta con la URL de destino, es
  decir, la dirección interna de api-core o geo-service. No es un secreto, pero si no se quiere
  publicar, el proxy TLS de delante debe quitarla.

## Pantallas

La interfaz reproduce el prototipo funcional que entregó el usuario
(«Mi Curichi · Prototipo (compartible).html»), que es la fuente de verdad visual:

| Ruta | Pantalla del prototipo | Qué hace |
|---|---|---|
| `/reportes` | M-02 | Bandeja: filtros, tabla y mapa sincronizados, exportación, indicadores de carga |
| `/reportes/:id` | M-03 | Ficha completa: lo declarado, de dónde salió el puntaje, moderación y auditoría. «Reporte unitario» abre la ficha para imprimir o descargar (.txt y GeoJSON): lleva la nota metodológica (CLAUDE.md §9.4), el encabezado `Mi Curichi · {ciudad de la configuración}` y firmas en blanco, sin oficinas ni cargos. Es un diálogo modal: el foco entra, Tab no sale, Escape cierra y el foco vuelve al botón (`src/lib/dialogo.ts`) |
| `/indicadores` | M-09 | Conteos por severidad, distrito y unidad vecinal, y la tabla «De una capa anterior» (distritos que ya no están en la capa vigente). «Por severidad» son botones («Todo» y las cuatro severidades, cada uno con su número): una severidad deja el filtro en solo esa y «Todo» lo quita. Comparten la URL (`?severidad=`) con la fila «Filtrar por severidad» —con dos elegidas arriba quedan presionadas las dos— y sus números salen de los indicadores sin filtro de severidad, así que no cambian al filtrar (`src/lib/indicadores-pestanas.ts`) |
| `/capas` | A-02 | Versiones cargadas por el ETL y activación de la vigente |
| `/plano` | A-06 | Plano oficial de zonificación como referencia, con su advertencia. Solo en la instalación de Santa Cruz de la Sierra (ver arriba) |
| `/ejecutivo` | — | Panel ejecutivo (roles ejecutivo, técnico y admin), siempre sobre el histórico: cifra de reportes activos con verificados y en revisión, pestañas Crítica (crítica + alta) / Media / Baja / Todas, activas por distrito (con «Otros») y «Cómo va el trabajo». Incluye mapa de distritos/UV y selección de UV. Sin período, moderación ni exportación. La fórmula y rangos de Inundaciones se muestran solo en esa categoría; las demás usan su modelo disponible y bandas comunes. El rol ejecutivo solo ve esta ruta |

El texto de estado usa las palabras del técnico («Validado», «Duplicado»), no las del vecino: acá
se trabaja con la máquina de estados de `CLAUDE.md` §7.3.

### Fusionar solo con reportes cercanos

«Fusionar» ofrece, para elegir el reporte canónico, solo los reportes **de la categoría del origen, validados a 100 m o menos
de la coordenada exacta** del reporte, sin el propio y del más cercano al más lejano. Cada opción
dice el ID corto, la UV, la distancia («a 35 m») y el comienzo de la descripción; no hay campo para
pegar un ID. Sin ninguno, el panel lo dice y ofrece buscar hasta 300 m y hasta 1 km (solo los
radios mayores al vigente). «Confirmar fusión» queda deshabilitado mientras no haya uno elegido.

La API exige la misma categoría y responde `409 FUSION_ENTRE_CATEGORIAS` ante una fusión cruzada;
el panel conserva ese rechazo sin buscar una alternativa. La búsqueda usa categoría en parámetro y
clave, y descarta candidatos ajenos aunque una respuesta los incluya. Usa el filtro `bbox`
de `GET /api/v1/tecnico/reportes` (hasta 100 validados, del más reciente al más antiguo) con una
caja que contiene el círculo del radio, y la distancia exacta se mide en el cliente con
`distanciaMetros` de `contracts`, la misma cuenta del radio de 60 m (`src/lib/fusion-cercana.ts`).
La caja se alinea hacia afuera a una cuadrícula de 0,0005° (unos 56 m): api-core registra la URL
con su cadena de consulta, y una caja centrada en el punto dejaría en el log la coordenada exacta
del reporte. Solo sale con el formulario abierto y su clave de caché lleva el radio. Si la caja
tiene más validados de los que trae la respuesta, la lista avisa que puede haber más cerca.

### Ubicación aproximada

Un reporte puede entrar desde un dispositivo sin GPS preciso (una computadora ubicada por Wi-Fi o
IP) por el camino de «ubicación aproximada» (ADR 0007, contracts 0.18.0): el punto lo puso la
persona a mano y api-core no lo comprobó contra el dispositivo. Llega con `ubicacion_metodo =
aproximada`, la precisión declarada en `precision_gps_m` (más de 50 m) y la distancia al
dispositivo en `null`. El panel nunca lo muestra como «manual», que diría que el punto se ajustó
cerca del teléfono: `etiquetaMetodo` (`src/lib/formato.ts`) devuelve «Ubicación aproximada — sin
comprobar con el dispositivo». Es un `switch` exhaustivo: un método nuevo en contracts rompe el
typecheck en vez de caer en el texto de otro.

- **Bandeja**: una insignia «Aproximada» (`data-testid="insignia-ubicacion-aproximada"`) junto a la
  unidad vecinal de la fila. Es texto con icono, no solo color; el tooltip y los lectores de
  pantalla traen la etiqueta completa.
- **Detalle** (`DatosUbicacion`): el método con una aclaración (el punto lo puso la persona y su
  dispositivo no tenía GPS preciso), la precisión declarada y, en «Distancia al dispositivo», que no
  aplica.
- **Ficha del reporte**: el mismo renglón «Método de Captura» en el .txt y en la vista imprimible;
  el GeoJSON trae el método tal como llegó.

No hay cola ni filtro aparte para estos reportes: se moderan como cualquier otro, y en el mapa
público siguen diciendo «NO SE HA VERIFICADO».

## El mapa

Mismo tratamiento que en la app pública: base raster desaturada y marcadores en pastilla con el
nombre de la severidad escrito. Pasar el puntero por una fila de la tabla resalta su pastilla.

`scripts/copiar-worker-maplibre.mjs` copia el worker de MapLibre a `public/maplibre/` antes de
`dev` y de `build`, y `src/lib/worker-maplibre.ts` se lo declara con `setWorkerUrl`. Sin eso
MapLibre busca su worker junto al chunk de Next, recibe la página 404 en HTML y el mapa se queda
sin nada vectorial —ni puntos, ni polígonos— sin un solo error visible. El detalle está en el
[README de `web-ciudadano`](../web-ciudadano/README.md#el-worker-de-maplibre-hay-que-servirlo-aparte).

## Cuando la sesión caduca

La sesión del técnico vence por inactividad (`SESION_IDLE_HORAS`, 12 h por defecto). Cualquier
respuesta 401 de api-core que no venga del propio login dispara `EVENTO_SESION_CADUCADA`; el
envoltorio `Protegido` lo escucha, tira la caché de TanStack Query —que puede tener reportes que
este usuario ya no debería ver— y lleva a `/login?caducada=1`, que lo explica en una frase.

Antes eso se descubría en mitad de una moderación: «Confirmar rechazo» devolvía un escueto
`ERROR (401)` dentro del formulario, sin decir qué había pasado ni cómo volver a entrar.

## Actualización sin recargar

La bandeja (con sus conteos), el detalle, los indicadores y el panel ejecutivo se vuelven a pedir
solos cada 10 s (`src/lib/consultas.ts`): `refetchInterval` de 10 s, `staleTime` 0 (api-core no
guarda esas cifras en caché) y nada con la pestaña oculta (`refetchIntervalInBackground: false`);
al volver a la pestaña se piden una vez. Los distritos y las unidades vecinales tienen `staleTime`
infinito y se piden una sola vez; los distritos reusan la lista de capas del mapa, así que
`/geo/v1/capas` sale una vez aunque la bandeja monte las dos consultas. Los agregados por UV
(«UV con mayor incidencia» del ejecutivo) también salen de geo-service, pero son cifras y no
geometría: siguen el mismo ritmo de 10 s con `staleTime` 0 (geo-service guarda las suyas hasta
2 min, CLAUDE.md §4.6) y sin la cabecera de sondeo, porque geo-service no tiene sesión.

Esos refrescos llevan `meta: { sondeo: true }` y salen con la cabecera `x-curichi-sondeo: 1`
(`CABECERA_SONDEO` en `src/lib/api.ts`). api-core no renueva la inactividad con ella: una pantalla
con el panel abierto no mantiene viva la sesión para siempre. La primera carga de cada consulta
(abrir una pantalla, cambiar un filtro o de página) no la lleva y sí renueva la sesión; los
refrescos la llevan aunque esa primera carga haya fallado. Si un refresco falla, se siguen viendo
los últimos datos con un aviso, y el formulario de moderación abierto no se pierde.

El lector completo de configuración pública usado por el proveedor de categorías envía
`credentials: 'omit'`, también al renovar cada cinco minutos o al volver a la pestaña. Esa
consulta pública no necesita la cookie y no renueva la inactividad de la sesión. El lector de
ciudad legado y las consultas manuales de datos conservan su comportamiento.

La lista de capas del mapa (`/geo/v1/capas`, liviana y `no-cache`) vence a los 60 s: al volver a la
pestaña o abrir otra pantalla con mapa se pide de nuevo. Cada capa se sirve en una URL con la
huella de su contenido; si un administrador activa otra versión con el mapa abierto, las teselas
viejas responden `410 CAPA_CAMBIO`, el mapa vuelve a pedir la lista una sola vez por ráfaga y
apunta sus fuentes a la URL nueva sin recargar (`src/lib/capas-mapa.ts`). Activar una versión en
`/capas` invalida además toda la geometría (`['geo']`).

## Exportación

«Exportar GeoJSON» pide el archivo con `fetch`, lo valida con `ExportacionGeoJsonSchema` de
contracts y recién entonces lo guarda. Si la selección no cupo en el tope de api-core
(`truncado`), avisa «Se exportaron N de M reportes; afiná los filtros»; si la respuesta no cumple
el contrato, no descarga nada. «Exportar CSV» sigue siendo un enlace directo.

## Pruebas end-to-end

Esta app no tiene una suite Playwright propia: el recorrido que la atraviesa (ciudadano reporta →
técnico valida → aparece en el mapa público → sale en la exportación), la accesibilidad de sus
pantallas y los contratos de la API se cubren desde la suite transversal de `e2e/`.

El runner transversal `e2e/scripts/correr-local.mjs` usa la base aislada `curichi_e2e` y comprueba
RAM/puertos antes de arrancar. La verificación de M5 se coordina en una ventana aparte, con un
solo ejecutor; no usar bases habituales ni sembrarlas para probar este panel. Build, navegador,
DOM, teclado, CSP y E2E final corresponden al verificador independiente. Las pruebas unitarias
con dos definiciones sintéticas no acreditan una instalación con dos categorías reales activas.

## Verificación del paquete y criterios de M5

```bash
pnpm --config.verify-deps-before-run=false --filter panel-admin exec vitest run --maxWorkers=1
pnpm --config.verify-deps-before-run=false --filter panel-admin typecheck
pnpm --config.verify-deps-before-run=false exec biome check apps/panel-admin --reporter=summary
```

Vitest del panel no necesita DB. Medir RAM antes (1500 MiB para estáticos; 2500 MiB para E2E),
ejecutar un pesado por vez y, al usar Turbo, `--concurrency=1`. No instalar herramientas para
repetir las pruebas: usar el pnpm/dependencias locales ya preparados. Salidas de esta corrida,
preflights y checkpoints quedan en `.turbo/m5-2026-10-15/`, sin secretos.

| Criterio | Pruebas del paquete (rutas bajo `src/`) |
|---|---|
| CA1 disponibilidad y cero | `lib/m5-categorias.test.ts`, `lib/m5-2-transicion-cache.test.ts`, `lib/m5-5-reintentar.test.ts` |
| CA2 URL, cambios y retorno | `lib/m5-categorias.test.ts`, `lib/m5-2-transicion-ambito.test.ts`, `lib/m5-2.test.ts`, `lib/m5-5.test.ts`, `lib/m5-5-pestana-transicion.test.ts`, `componentes/Mapa-transicion.test.ts` |
| CA3 claves, caché y parciales | `lib/m5-categorias.test.ts`, `lib/m5-2-transicion-cache.test.ts`, `lib/m5-4.test.ts`, `lib/consultas.test.ts` |
| CA4 conteos por universo | `lib/m5-2.test.ts`, `lib/m5-4.test.ts`, `componentes/indicadores/PestanasPorSeveridad.test.ts` |
| CA5 tabla, tarjetas y exportación | `lib/m5-2.test.ts`, `componentes/TablaReportes.test.ts`, `lib/api.test.ts`, `lib/exportacion.test.ts` |
| CA6 indicadores y modelos ejecutivos | `lib/m5-4.test.ts`, `lib/indicadores-torta.test.ts`, `componentes/CapaAnterior.test.ts`, `componentes/ejecutivo/PanelEjecutivo.test.ts` |
| CA7 públicos/geo e historial | `lib/m5-categorias.test.ts`, `lib/m5-4.test.ts`, `lib/m5-5.test.ts` |
| CA8 detalle y fichas | `lib/m5-3.test.ts`, `lib/m5-5.test.ts`, `componentes/ReporteUnitarioModal.test.ts`, `componentes/FactoresSeveridad.test.ts` |
| CA9 fusión | `lib/m5-3.test.ts`, `lib/m5-5.test.ts`, `lib/fusion-cercana.test.ts`, `componentes/PanelAcciones.test.ts` |
| CA10 roles, sondeo y fronteras | `lib/sondeo-mapa.test.ts`, `lib/consultas.test.ts`, `lib/roles.test.ts`, `lib/next-config.test.ts`, `proxy.test.ts` |
| CA11 selector y anuncio | `lib/m5-2.test.ts`, `componentes/SelectorCategoria.test.ts`; DOM/teclado/lector reales pendientes de verificación independiente |
| CA12 regresión, límites y README | suite P2 completa, typecheck, Biome e inventario de checkpoints; dictámenes/F4 independientes pendientes |

Esta tabla describe cobertura unitaria y de render/consultas controladas; no sustituye E2E,
revisión independiente, lector de pantalla real o verificación de la imagen desplegada.
