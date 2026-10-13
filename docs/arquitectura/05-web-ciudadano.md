# 05 · `apps/web-ciudadano` — app pública

> Parte **1**. Next.js 16 (App Router) + MapLibre 6.9, puerto **3000**. Leyenda: **[C]** confirmado
> en código · **[I]** inferido · **[Doc]** según documentación.

## 1. Para qué existe

Que cualquier vecino, **desde el celular**:

- vea el mapa sin cuenta;
- y, con cuenta, **reporte un punto en menos de 2 minutos**: ubicación del dispositivo, foto con la
  cámara, cuatro pasos y cuenta regresiva hasta que se publica.

No calcula nada de negocio (severidad, UV, demora, radio): lo **muestra**, y para la vista previa usa
las mismas funciones puras de `contracts`.

## 2. Estructura

```text
src/
├── proxy.ts               reenvío /api y /geo + CSP con nonce + saneamiento de XFF + HSTS (por petición)
├── app/                   rutas (App Router)
│   ├── layout.tsx         lee la ciudad en el SERVIDOR antes del primer HTML; BarraSuperior; AvisoPuntoResuelto
│   ├── proveedores.tsx    QueryClient (sin tráfico automático) · ProveedorCiudad · Toast · registro del SW
│   ├── page.tsx (/)       VistaMapa
│   ├── inicio/            Portada (escritorio) / Bienvenida (móvil)
│   ├── reportar/          FormularioReporte (4 pasos)
│   ├── reporte/[id]/      detalle con enlace propio
│   ├── mis-reportes/ [id] MisReportes / SeguimientoReporte
│   ├── ingresar/ crear-cuenta/ cuenta/ como-funciona/
│   └── error.tsx · global-error.tsx · not-found.tsx
├── componentes/           28 componentes (ver §4)
├── lib/                   lógica pura y probada (ver §5)
public/                    sw.js · manifest · logo · glifos/ · maplibre/ (worker copiado en predev/prebuild)
```

## 3. Cómo llega una pantalla al navegador [C]

1. **Navegador → Next**. `src/proxy.ts` corre en **cada** petición:
   - `/api/*` y `/geo/*` → `NextResponse.rewrite` a `API_CORE_URL` y `GEO_SERVICE_URL`;
     **borra** `X-Forwarded-For`, `X-Real-IP`, `Forwarded` y `X-Client-IP` salvo que
     `PROXY_DE_CONFIANZA=1`, y pone una CSP `default-src 'none'`;
   - páginas → genera un **nonce** de 128 bits, pone la CSP (`script-src 'self' 'nonce-…'
     'strict-dynamic'`) en la petición y en la respuesta, y pasa `x-nonce` a React.
2. **Layout** (servidor): `obtenerCiudad()` llama a `connection()`, así que la página se genera por
   petición, y después a `GET {API_CORE_URL}/api/v1/configuracion`, con caché de 5 min y respaldo
   `CIUDAD_POR_DEFECTO`.
3. **Cliente**: hidrata. TanStack Query pide los datos con `fetch` relativo (`/api/...`).
   - Las lecturas públicas van **sin cookie** (`credentials: 'omit'`).
   - Login, reportar, fotos, mis reportes y `/auth/yo` van con cookie (`same-origin`).

## 4. Componentes principales

| Componente | Qué hace |
|---|---|
| `VistaMapa` | Estado de la pantalla del mapa: bbox, filtros (severidad, UV, distrito, punto crítico), búsqueda local y seleccionado. Consultas `['reportes', filtros]` (300 como máximo, `keepPreviousData`), `['capas']` y `['agregados']`. El detalle abierto vive en **su propia** consulta por id |
| `Mapa` (1311 líneas) | MapLibre: base raster de OSM, distritos, UV y manzanas desde `CapaInfo.url` (GeoJSON o MVT con huella; ante un 410 vuelve a pedir la lista), fuente `reportes` con `cluster: true` (agrupaciones con cantidad y gravedad), pastillas, selección y círculo de 60 m en el formulario |
| `MapaDiferido` | `next/dynamic` para no cargar MapLibre en el primer pintado |
| `HojaDetalle`, `TarjetaReporte`, `ChipSeveridad`, `IconoSinVerificar`, `LeyendaMapa` | Detalle y tarjetas: severidad con color + texto + barras; «NO SE HA VERIFICADO» con texto, icono y color |
| `FormularioReporte` (1859 líneas) | Orquesta todo el reporte (§6) |
| `PedirUbicacion` | Estados de la ubicación: compartir, buscando, imprecisa (→ «ubicación aproximada»), denegada, error, y el botón **«Usar ubicación de prueba»** |
| `CamaraReporte` | Diálogo de cámara con `getUserMedia`: captura a `File`, foco atrapado, detiene las pistas al cerrar |
| `CuentaRegresiva`, `CupoAgotado`, `AccesoRequerido`, `AvisosDelReporte` | Estados del flujo |
| `MisReportes`, `SeguimientoReporte`, `AvisoPuntoResuelto` | Seguimiento de los reportes propios |
| `FormularioAcceso`, `PanelCuenta` | Login y alta (`?volver=` validado contra redirección abierta); botón al panel para el staff |
| `BarraSuperior` (escritorio), `BarraInferior` (móvil), `Toast`, `Aviso`, `ErrorDeCarga` | Armazón |

## 5. Bibliotecas (`src/lib`, casi todas con pruebas)

| Módulo | Para qué |
|---|---|
| `api.ts` | `fetch` con plazos (lectura 15 s, escritura 30 s, subida 180 s), `ErrorApi` y una función por endpoint |
| `consultas.ts` | `QueryClient` **sin tráfico automático**: sin refetch por foco, red ni intervalo; `staleTime: ∞` para los datos públicos |
| `sesion.tsx` | `useSesion` (consulta `['yo']`, 5 min; un 401 = sin cuenta), cupo y demora, cierre de sesión |
| `ubicacion-dispositivo.ts` | `ControladorUbicacion`, el **único** archivo que toca `navigator.geolocation`. Estados de la ubicación; `simular()`; `aproximar()`; `releer()` al enviar; `decidirEnvio` (vencida, movido, ok); `DispositivoCongelado` (los reintentos repiten el mismo dispositivo) |
| `radio.ts` | Mover y recortar el punto dentro de 60 m, coordenadas escritas, encuadre del paso 1 |
| `ubicacion-aproximada.ts` | Cuándo ofrecer el camino ADR 0007 |
| `camara.ts` | `ControladorCamara`: restricciones, captura (`ImageCapture` o canvas), mensajes de error |
| `foto.ts` | Validación local de la foto y miniaturas (`blob:`) |
| `borrador.ts` | Borrador en **sessionStorage** (12 h; fotos de hasta 23 h), traduce valores viejos |
| `formulario-reporte.ts` | Pasos, resolver Zod + RHF, sumidero coherente, fecha del evento en la zona de la ciudad, `armarEnvio` |
| `errores.ts` | Traduce los códigos de la API (422 de ubicación, 429 de cuota, 401, 503, plazo) a mensajes en español |
| `capas-con-huella.ts` | Manejo del 410 `CAPA_CAMBIO` |
| `mapa-datos.ts` | Tamaño y texto de las agrupaciones, resumen «N puntos en esta vista», truncado |
| `publicacion.ts`, `cupo.ts`, `verificacion.ts` | Textos de demora, cupo y estado público |
| `panel.ts` | Destino del botón «Panel técnico/ejecutivo» desde `panel_url` |
| `servicios.ts`, `configuracion.ts`, `ciudad*.ts` | URLs de los servicios (en tiempo de ejecución) y ciudad |
| `misReportes.ts`, `correo-para-entrar.ts`, `useUbicacionUsuario.ts`, `accesibilidad-mapa.ts` | Varios |

## 6. El flujo de reporte, paso a paso [C]

```text
Abrir /reportar
  └─ refrescarSesion() → /auth/yo   (sin sesión: AccesoRequerido · cupo 0: CupoAgotado)
Paso 1 «¿Dónde se junta el agua?»
  ├─ «Compartir mi ubicación» → watchPosition hasta precisión ≤ 50 m (30 s; si no, «imprecisa»)
  │     → mapa con círculo de 60 m; punto: arrastrar · flechas · «mover 5 m» · coordenadas
  ├─ imprecisa → «Reportar con ubicación aproximada»: punto libre en la ciudad, sin círculo
  └─ «Usar ubicación de prueba (Santa Cruz)» → posición simulada a 5 m (⚠ también en producción)
  Vista previa: POST /geo/v1/resolver 600 ms después de quedarse quieto (abortable) → UV o «fuera»
Paso 2–3: profundidad (tarjetas), frecuencia, sumidero (sí/no → ¿tapado? → ¿brota?), causa,
          tipo de ubicación, descripción, fecha del evento; fotos (hasta 3):
          CamaraReporte → validación local → POST /api/v1/fotos → objeto_key
Paso 4: revisión → «Enviar reporte»
  ├─ releer la posición (10 s) → decidirEnvio: vencida → volver al paso 1 · movido > 60 m → ajustar
  ├─ DispositivoCongelado.tomar() (los reintentos usan la misma lectura)
  └─ POST /api/v1/reportes  con Idempotency-Key fija y `ubicacion_aproximada` si corresponde
        201 → Confirmación + CuentaRegresiva (segundos_para_publicar del servidor)
              invalida ['yo'], ['mis-reportes'], ['reportes'], ['agregados']; olvida el borrador
        401 → «se cerró tu sesión» (el borrador sobrevive) · 422 de ubicación → paso 1
        429 → mensaje de cupo · 4xx → el próximo intento relee · red o 5xx → se conserva para reintentar
```

Privacidad: la posición del dispositivo **no se guarda** en el borrador, y el servidor no la persiste.

## 7. PWA y caché del navegador

`public/sw.js` (v6), registrado solo en producción:

| Recurso | Estrategia |
|---|---|
| Navegación | Red primero; sin red, el shell de la caché |
| Capas y teselas **con huella** | Caché primero. Se borran las huellas que dejaron de ser vigentes (al activar el SW, al pedir `/geo/v1/capas` y ante un 410) |
| `/_next/static/…` y `?v=` | Caché primero |
| `/api/` | **Nunca** |

Topes: 400 entradas de capas y 120 de shell. `manifest.webmanifest` para instalar la app.

## 8. Configuración (tiempo de ejecución, la misma imagen para cualquier ciudad)

| Variable | Uso |
|---|---|
| `API_CORE_URL`, `GEO_SERVICE_URL` | Destino del reenvío y de la lectura de la ciudad |
| `PROXY_DE_CONFIANZA` | 1 solo detrás de un proxy que reescriba XFF (Caddy) |
| `HSTS` | 1 solo con HTTPS real (en Docker lo pone Caddy) |

La URL del panel **no** se configura aquí: llega en `/auth/yo` (`panel_url`) y solo para el staff.

## 9. Accesibilidad y diseño [C/Doc]

- `lang="es"`, enlace «Ir al contenido», `aria-live` en los errores, alternativas al arrastre en el
  mapa, diálogo de cámara con foco atrapado, severidad nunca solo con color.
- Fuentes locales (`@fontsource`): Sora y Source Sans 3. Paleta y UI kit de CLAUDE.md §14.4.
- Mobile-first: en el móvil, mapa a pantalla completa con hoja de detalle; en el escritorio, panel
  izquierdo y mapa a la derecha.

## 10. Pruebas

- **Vitest**: unas 30 pruebas de lógica en `src/lib/*.test.ts` y algunos componentes con
  `renderToStaticMarkup`. Cubren ubicación, radio, cámara, borrador, errores, proxy y CSP, SW,
  sesión, panel, configuración, consultas, verificación…
- **Playwright** (`e2e/`): formulario, ubicación obligatoria y aproximada, cámara, mapa, CSP,
  accesibilidad (axe) y responsive.

## 11. Observaciones (pendientes)

| # | Observación | Dónde |
|---|---|---|
| W-1 | **D2**: «Usar ubicación de prueba» se muestra siempre, también en producción, con coordenadas fijas de Santa Cruz | `FormularioReporte.tsx:1027`, `PedirUbicacion.tsx:194`, `ubicacion-dispositivo.ts:207` |
| W-2 | `onKeyDown` de Enter en todo el `<form>` (salvo `TEXTAREA`): Enter sobre un botón avanza de paso en lugar de activarlo [I] | `FormularioReporte.tsx:948` |
| W-3 | Listas de enums redeclaradas localmente (FRECUENCIAS, CAUSAS, UBICACION_TIPOS) | `FormularioReporte.tsx:124` |
| W-4 | «Si hay riesgo para la vida, llamá al 911» está fijo en el texto (backlog: número por país) | `ComoFunciona.tsx:63`, `Portada.tsx:158` |
| W-5 | `FormularioReporte.tsx` y `Mapa.tsx` son archivos muy grandes (1859 y 1311 líneas); la lógica está extraída a `lib/` y probada, pero la composición solo se prueba por E2E | — |
| W-6 | `next dev` expone la app en la red local; por IP de la red no hay contexto seguro (sin ubicación ni cámara) | Desarrollo |
