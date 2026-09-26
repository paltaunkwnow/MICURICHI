# panel-admin — Parte 2 — Frontend administrativo / plataforma técnica

Panel del técnico municipal: bandeja de triaje, ficha del reporte con moderación, indicadores,
capas y el plano oficial de referencia. Especificación en `CLAUDE.md` §4.4; el estado y los
pendientes están en [`docs/TRASPASO.md`](../../docs/TRASPASO.md).

```bash
pnpm --filter panel-admin dev        # 3100; necesita api-core (3001) y geo-service (3002)
pnpm --filter panel-admin test       # Vitest
pnpm --filter panel-admin build      # imagen de producción: .next/standalone (ver abajo)
```

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
| `/reportes/:id` | M-03 | Ficha completa: lo declarado, de dónde salió el puntaje, moderación y auditoría |
| `/indicadores` | M-09 | Conteos por severidad, distrito y unidad vecinal |
| `/capas` | A-02 | Versiones cargadas por el ETL y activación de la vigente |
| `/plano` | A-06 | Plano oficial de zonificación como referencia, con su advertencia. Solo en la instalación de Santa Cruz de la Sierra (ver arriba) |
| `/ejecutivo` | — | Panel ejecutivo (roles ejecutivo, técnico y admin): inundaciones activas (en revisión + verificadas), pestañas Crítica (crítica + alta) / Media / Baja / Todas, coropleta por distrito encuadrada en la capa vigente y dos gráficas; los distritos de una capa anterior van aparte. Se refresca cada 60 s. El rol ejecutivo solo ve esta ruta |

El texto de estado usa las palabras del técnico («Validado», «Duplicado»), no las del vecino: acá
se trabaja con la máquina de estados de `CLAUDE.md` §7.3.

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

El refresco automático del panel ejecutivo sale con la cabecera `x-curichi-sondeo: 1`
(`CABECERA_SONDEO` en `src/lib/api.ts`) y api-core no renueva la inactividad con él: una pantalla
con el panel abierto no mantiene viva la sesión para siempre. Abrir el panel, cambiar de período o
reintentar sí la renuevan.

## Exportación

«Exportar GeoJSON» pide el archivo con `fetch`, lo valida con `ExportacionGeoJsonSchema` de
contracts y recién entonces lo guarda. Si la selección no cupo en el tope de api-core
(`truncado`), avisa «Se exportaron N de M reportes; afiná los filtros»; si la respuesta no cumple
el contrato, no descarga nada. «Exportar CSV» sigue siendo un enlace directo.

## Pruebas end-to-end

Esta app no tiene una suite Playwright propia: el recorrido que la atraviesa (ciudadano reporta →
técnico valida → aparece en el mapa público → sale en la exportación), la accesibilidad de sus
pantallas y los contratos de la API se cubren desde la suite transversal de `e2e/`.

```bash
pnpm db:local          # terminal 1
pnpm db:seed:samples
pnpm --filter e2e test:e2e
```

La Definition of Done de `CLAUDE.md` §4.3 y §4.4 pide además una suite propia por app; queda
pendiente de decidir si aporta algo sobre la transversal o si se consolida allí.
