# 06 · `apps/panel-admin` — panel técnico, administrativo y ejecutivo

> Parte **2**. Next.js 16 + MapLibre 6.9, puerto **3100**. Leyenda: **[C]** confirmado en código · **[I]**
> inferido · **[Doc]** según documentación.

## 1. Para qué existe

Convertir reportes crudos en un **inventario validado** [C]:

- **Técnico**: bandeja (tabla + mapa), moderación, exportación, indicadores.
- **Admin**: lo mismo, más retirar validados, reabrir rechazados y activar versiones de capas.
- **Ejecutivo**: una sola pantalla (`/ejecutivo`) con cifras, gráficas y mapa. No modera ni exporta.

El panel **no decide permisos**: muestra u oculta. El permiso real lo aplica api-core (401/403).

## 2. Estructura

```text
src/
├── proxy.ts                 igual que la app pública: reenvío, CSP con nonce, XFF, HSTS
├── app/
│   ├── page.tsx (/)         redirige según el rol (ejecutivo → /ejecutivo, staff → /reportes) o a /login
│   ├── login/               FormularioLogin (?caducada=1)
│   └── (panel)/             layout con <Protegido> + BarraLateral
│       ├── reportes/        bandeja · reportes/[id] detalle y moderación
│       ├── indicadores/     tarjetas, pestañas por severidad, tortas por distrito y por UV
│       ├── ejecutivo/       PanelEjecutivo
│       ├── capas/           versiones de capa y activación (admin)
│       └── plano/           plano de zonificación de Santa Cruz (solo si la ciudad coincide)
├── componentes/             Mapa, TablaReportes, FiltrosReportes, Paginacion, PanelAcciones,
│                            CandidatosFusion, DatosUbicacion, FactoresSeveridad, ReporteUnitarioModal,
│                            CapaAnterior, SinAccesoPanel, VisibilidadPublica, ejecutivo/*, indicadores/*
└── lib/                     api, consultas (sondeo), sesion, roles, filtros, moderacion, fusion-cercana,
                             indicadores-*, ejecutivo, capas-mapa, mapa-seleccion, formato, severidad…
```

## 3. Acceso y roles en la interfaz [C]

`lib/sesion.tsx` → `<Protegido>`:

1. `GET /api/v1/auth/yo`. Si responde 401, redirige a `/login`.
2. Rol `ciudadano` → `SinAccesoPanel` (puede cerrar sesión para entrar con otra cuenta).
3. Ejecutivo fuera de `/ejecutivo` → lo redirige allí con el aviso «Tu cuenta es de perfil ejecutivo…».
4. Cualquier 401 posterior dispara `curichi:sesion-caducada`: limpia la caché y lleva a
   `/login?caducada=1`.

`lib/roles.ts`:

- `puedeVerRuta`: el staff ve todo; el ejecutivo, solo `/ejecutivo`.
- `enlacesPara`: decide qué enlaces muestra la barra lateral.
  - «Capas» aparece **solo para el admin y solo si hay una versión cargada sin activar**.
  - «Plano oficial» aparece solo si la ciudad es Santa Cruz (`lib/plano.ts`).

## 4. Datos y refresco (`lib/consultas.ts`, `lib/api.ts`) [C]

| Consulta | Endpoint | Ritmo |
|---|---|---|
| `consultaReportes` | `GET /api/v1/tecnico/reportes` | **Cada 10 s**, solo con la pestaña visible |
| `consultaReporte(id)` | `GET /api/v1/tecnico/reportes/:id` | Cada 10 s |
| `consultaIndicadores` | `GET /api/v1/indicadores?severidad&distrito_id` | Cada 10 s |
| `consultaResumenEjecutivo` | `GET /api/v1/ejecutivo/resumen?ventana=todo` | Cada 10 s |
| `consultaReportesPublicos` | `GET /api/v1/reportes` (mapa del ejecutivo) | Cada 10 s |
| `consultaAgregadosUv` | `GET /geo/v1/agregados/unidades-vecinales` | Cada 10 s (sin marca de sondeo) |
| `consultaCandidatosFusion` | `GET /api/v1/tecnico/reportes?bbox=…&estado=validado` | Al abrir el formulario de fusión |
| `consultaCapasMapa` | `GET /geo/v1/capas` | Vence a los 60 s |
| Distritos y UV | GeoJSON con huella | Una vez (`staleTime: ∞`) |

- **Sondeo**: los refrescos automáticos llevan `x-curichi-sondeo: 1` (`esSondeo`) para **no renovar
  la inactividad** de la sesión. Un panel olvidado en una pantalla caduca igual.
- Plazos: 20 s normal y **180 s** para la exportación (`proxyTimeout` de Next de 180 000).

## 5. Pantallas

### 5.1 Bandeja (`/reportes`)

- Filtros en la URL (`lib/filtros.ts`): estado, severidad, distrito, UV, `bbox`, desde, hasta y
  página (50 por página). Los valores inválidos se descartan al leerlos.
- **Mapa reactivo**:
  - clic en una zona → filtro con el id real de la capa;
  - clic en un punto → resalta la fila y abre una tarjeta «Ver detalle»;
  - interruptor «Filtrar por el área del mapa» (escribe el `bbox` en la URL 400 ms después de quedarse quieto).
- Aviso `AVISO_BANDEJA_PUBLICOS`: un `nuevo` ya se ve en el mapa público, así que rechazarlo lo retira.
- **Exportar**: GeoJSON por `fetch` + Blob (con aviso si viene truncado) y CSV por URL.

### 5.2 Detalle (`/reportes/[id]`) y moderación

- `PanelAcciones` decide los botones con `accionesModeracion(estado, rol)`, que a su vez usa
  `transicionPermitida` de contracts:
  - **validar**;
  - **rechazar**: un `nuevo`, con motivo;
  - **retirar**: rechazar un verificado, solo admin;
  - **resolver**: con motivo;
  - **reabrir**: un rechazado, solo admin;
  - **fusionar**.
- Los cuerpos se validan en el cliente con `ReporteCambiarEstadoSchema`, el mismo que usa api-core.
- **Fusión** (`CandidatosFusion` + `lib/fusion-cercana.ts`):
  - solo ofrece **validados** a 100 m (ampliable a 300 m y 1 km), ordenados por distancia exacta
    (`distanciaMetros` de contracts);
  - la caja `bbox` se alinea a una cuadrícula de 0,0005° para no dejar la coordenada exacta en los logs;
  - **no se puede pegar un ID**;
  - llama a `POST /reportes/:id/fusionar`.
- Datos mostrados:
  - `DatosUbicacion`: cómo se ubicó el punto (GPS, manual o **aproximada — sin comprobar con el
    dispositivo**), la precisión y la distancia;
  - `FactoresSeveridad`: puntaje y reglas;
  - `ReporteUnitarioModal`: ficha imprimible con la nota metodológica.

### 5.3 Indicadores (`/indicadores`)

- Tarjetas y «Por severidad» como pestañas («Todo» + cada severidad).
- «Por estado».
- Dos tortas (`TortaReportes`, SVG propio):
  - por distrito y por UV;
  - las 8 mayores y «Otros»;
  - porcentajes enteros que suman 100;
  - leyenda en tabla.
- Clic en un distrito → torta de sus UV. Clic en una UV → bandeja filtrada.
- El estado vive en la URL.
- `CapaAnterior`: tabla de reportes de una versión de capa anterior.

### 5.4 Ejecutivo (`/ejecutivo`)

- Cifra grande de **inundación activa** (`nuevo` + `validado`): «N verificadas · M en revisión».
- `PestanasSeveridad`.
- `Graficas`: inundaciones activas por distrito (con «Otros») y «Cómo va el trabajo» (barras apiladas).
- `CriteriosSeveridad`: tomados de contracts.
- Nota metodológica.
- Mapa de distritos y UV con los reportes **públicos**: jitter, sin autor.
- Sin exportación ni coropleta.

### 5.5 Capas (`/capas`, admin)

- Lista `GET /api/v1/admin/capas` y activa una versión con `POST /admin/capas/:id/activar`.
- Después `invalidarTrasActivarCapa` refresca versiones, indicadores y toda la geometría (`['geo']`).

## 6. Configuración

Igual que la app pública: `API_CORE_URL`, `GEO_SERVICE_URL`, `PROXY_DE_CONFIANZA` y `HSTS`, en
tiempo de ejecución. La ciudad llega de `/api/v1/configuracion`.

## 7. Pruebas

- **Vitest**: unas 25 pruebas de lógica (moderación, fusión, filtros, tortas, pestañas, ejecutivo,
  roles, capas-mapa, proxy, configuración) y de componentes con `renderToStaticMarkup`.
- **Playwright**: login → filtrar → validar → exportar; ejecutivo; tortas; mapa reactivo; panel al
  día; acceso por rol.

## 8. Observaciones (pendientes)

| # | Observación | Dónde |
|---|---|---|
| P-1 | `obtenerReportesPublicos` está tipada como `ReporteTecnicoFeatureCollection`, pero la ruta pública devuelve la vista **pública** | `lib/api.ts:224` |
| P-2 | `obtenerYo` está tipada como `Usuario` (no `SesionActual`): no usa los campos de cupo, pero el tipo no refleja la respuesta | `lib/api.ts:192` |
| P-3 | El plano de zonificación de Santa Cruz es contenido de una instalación concreta, condicionado por el nombre de la ciudad | `lib/plano.ts` |
| P-4 | Posible doble manejador de clic en el mapa (reportado el 2026-10-03, **no verificado**) | `componentes/Mapa.tsx` |
| P-5 | El sondeo de 10 s multiplica la carga por cada panel abierto (barato por la deduplicación en vuelo, pero sin caché en el servidor) | `lib/consultas.ts` |
