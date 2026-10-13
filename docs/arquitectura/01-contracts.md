# 01 · `packages/contracts` — el contrato compartido

> Parte: **transversal** (custodia de la Parte 3). Versión analizada: **0.18.0**. Leyenda: **[C]**
> confirmado en código · **[I]** inferido · **[Doc]** según documentación.

## 1. Para qué existe

Es la **única fuente de verdad** de todo lo que viaja entre partes [C]:

- valores del dominio (enums y etiquetas en español);
- reglas puras: severidad, máquina de estados, distancia y radio, jitter;
- constantes de negocio (`CONFIG_DOMINIO`);
- forma de cada petición y respuesta (Zod);
- especificación OpenAPI 3.1, **generada** a partir de Zod.

Si una regla cambia aquí, el `typecheck` de cada consumidor se rompe. Así un cambio de contrato
se detecta al compilar y no en producción.

```text
                    packages/contracts (Zod + TS puro, sin red ni base)
       ┌──────────────┬──────────────┬───────────────┬──────────────┬──────────────┐
       ▼              ▼              ▼               ▼              ▼              ▼
   api-core      geo-service       db (seeds,     web-ciudadano   panel-admin   geodata-etl
 (valida y aplica) (respuestas)   puntos crít.)   (tipos, vista   (tipos,        (TIPOS_CAPA,
                                                   previa)         moderación)    config)
```

## 2. Estructura

| Archivo | Contenido |
|---|---|
| `src/index.ts` | Reexporta todo |
| `src/dominio/enums.ts` | `PROFUNDIDADES`, `FRECUENCIAS`, `CAUSAS_PRESUNTAS`, `SEVERIDADES`, `ESTADOS_REPORTE`, **`ESTADOS_PUBLICOS`**, `ESTADOS_VERIFICADOS`, `ESTADOS_RETIRADOS`, `ROLES`, `ROLES_DEL_PANEL`, `UBICACION_METODOS`, `UBICACION_TIPOS`, `SUMIDERO_*`, `TIPOS_CAPA`, `ETIQUETAS` (textos de UI) y `COLORES_SEVERIDAD` |
| `src/dominio/severidad.ts` | `calcularSeveridad`, `PUNTOS`, `PESOS`, `BANDAS`, `SEVERIDAD_VERSION = 2` y los comparadores |
| `src/dominio/config.ts` | `CONFIG_DOMINIO` (radios, cupos, demoras, fotos, contraseñas, exportación, ciudad por defecto) y `NOTA_METODOLOGICA` |
| `src/dominio/geo.ts` | `distanciaMetros` (haversine), `dentroDelRadio` y `CODIGOS_UBICACION_DISPOSITIVO` |
| `src/geo/jitter.ts` | `coordenadaPublica`, `aplicarJitter`, `redondearCoordenada` y `distanciaAproximadaM` |
| `src/esquemas/comunes.ts` | `LatSchema`, `LonSchema`, `BboxSchema`, `ErrorApiSchema`, `PaginacionSchema` y `listaDesdeQuery` |
| `src/esquemas/reporte.ts` | Crear (`ReporteCrearSchema` + `DispositivoSchema`), filtros, vistas pública, técnica y del autor, máquina de estados (`TRANSICIONES`, `transicionPermitida`, `transicionExiste`), moderación y fotos |
| `src/esquemas/auth.ts` | `LoginSchema` (usuario → `@curichi.local`), `RegistroSchema` (sin rol), `UsuarioSchema` y `SesionActualSchema` (cupo + `panel_url` solo para el staff) |
| `src/esquemas/admin.ts` | Capas, exportación, indicadores y `ReadyApiCoreSchema` |
| `src/esquemas/geo.ts` | Resolver, capas con **huella**, `AgregadoUv`, `PuntoCritico` (sin medidas exactas) y rutas con huella |
| `src/esquemas/ejecutivo.ts` | Resumen ejecutivo con refinamientos de cuadre (activas = verificadas + en revisión) |
| `src/esquemas/configuracion.ts` | `CiudadSchema` (valida la zona IANA y el locale BCP 47 contra `Intl`) |
| `src/openapi.ts` + `scripts/generar.ts` | Generan `openapi/openapi.yaml` (5012 líneas) y `dist/dominio.json` |
| `test/` | 17 archivos: severidad, esquemas, jitter, nota y **una prueba por versión de contrato** (`contrato-0-5` … `0-18`) |
| `CHANGELOG.md` | 880 líneas, de 0.1.0 a 0.18.0, con «consumidores» por versión |

## 3. Reglas que viven aquí [C]

### 3.1 Severidad v2

```text
puntaje = 2·P + F      P: tobillo 1 · rodilla 2 · muslo 3 · >70 cm 4
                       F: primera_vez 1 · ocasional 2 · cada_lluvia_fuerte 3 · permanente 4 · agua_estancada 5
bandas: 3–4 baja · 5–7 media · 8–10 alta · 11–13 crítica
E1: P = 4 → crítica       E3: F ≥ 4 → mínimo media (guarda, no se dispara con estas bandas)
```

- La calcula api-core al crear el reporte y guarda `severidad_calculada`, `severidad_puntaje` y
  `severidad_version`.
- Los frontends la usan solo para la vista previa.
- La severidad efectiva es `COALESCE(severidad_manual, severidad_calculada)`.

### 3.2 Máquina de estados

```text
TRANSICIONES = {
  nuevo:     { validado: [tecnico, admin], rechazado: [tecnico, admin], duplicado: [tecnico, admin] },
  validado:  { resuelto: [tecnico, admin], duplicado: [tecnico, admin], rechazado: [admin] },
  rechazado: { nuevo: [admin] },
  duplicado: {}, resuelto: {}
}
```

- `transicionExiste` distingue «no existe» (409) de «no es tu rol» (403).
- Exigen motivo: `nuevo` (reabrir), `rechazado`, `resuelto` y `duplicado`.

### 3.3 Visibilidad

| Lista | Valores | Qué define |
|---|---|---|
| `ESTADOS_PUBLICOS` | `nuevo`, `validado`, `resuelto` | Lo que puede ver el público (siempre junto con `publicar_en <= now()`, que aplica api-core) |
| `ESTADOS_VERIFICADOS` | `validado`, `resuelto` | Lo que arma puntos críticos y el color público por UV |
| `ESTADOS_RETIRADOS` | `rechazado`, `duplicado` | Lo que sale del mapa |

### 3.4 Constantes de negocio (`CONFIG_DOMINIO`)

- **Recurrencia**: radio de 25 m y advertencia de diámetro a los 100 m.
- **Ubicación pública**: jitter de 30 m, 5 decimales, hueco de 20 m, CRS métrico 32720.
- **Dispositivo**: radio de 60 m (+0,5 m de tolerancia), precisión de 50 m, antigüedad de 600 s.
- **Fotos**: 8 MB, 3 por reporte; entran JPEG, PNG y WebP; salen en WebP con calidad 80 y 1600 px
  por lado.
- **Cupos**:
  - 10 reportes por hora y por IP;
  - 3 reportes y 12 fotos por día y por cuenta;
  - 10 altas por día y por IP;
  - demoras de publicación de 60 y 240 s.
- **Formularios**:
  - contraseña de 10 a 200 caracteres;
  - descripción de 10 a 1000;
  - el evento puede ser de hasta 10 min en el futuro y 365 días atrás.
- **Exportación**: 50 000 filas.
- **Ciudad por defecto**: Santa Cruz.

### 3.5 Privacidad geográfica

- `coordenadaPublica` aplica jitter determinista (FNV-1a sobre `id|sal`) **solo** a
  `vivienda_o_predio` y redondea **siempre** a 5 decimales.
- Es la **única** definición de la regla. api-core la calcula una vez y la guarda en `geom_publico`.

### 3.6 Radio del dispositivo

- `dentroDelRadio` mide al milímetro con haversine. Es la misma cuenta en el formulario y en el
  servidor, para que un punto que la interfaz deja en el borde no vuelva rechazado.

## 4. Cómo se consume

| Consumidor | Qué usa |
|---|---|
| api-core | Todos los esquemas para `safeParse` de entrada; `calcularSeveridad`, `coordenadaPublica`, `TRANSICIONES`, `ESTADOS_*`, `CONFIG_DOMINIO` y `NOTA_METODOLOGICA`; también valida **sus propias respuestas** (`SesionActualSchema`, `ResumenEjecutivoSchema`, `ConfiguracionPublicaSchema`) antes de enviarlas |
| geo-service | `ResolverEntradaSchema`, `BboxSchema`, `HuellaCapaSchema`, `TIPOS_CAPA`, `ESTADOS_PUBLICOS` y `ESTADOS_VERIFICADOS` (para armar SQL literal) y las rutas con huella |
| db | `CONFIG_DOMINIO` (radio, CRS), `coordenadaPublica`, `calcularSeveridad` (seeds), `distanciaAproximadaM` y `ROLES_DEL_PANEL` (CLI de cuentas) |
| web-ciudadano | Tipos de respuesta, `ReporteCrearSchema` (vía resolver de RHF), `CONFIG_DOMINIO`, `ETIQUETAS`, `calcularSeveridad` (vista previa), `distanciaMetros` y `dentroDelRadio` |
| panel-admin | Tipos, `ReporteCambiarEstadoSchema`, `transicionPermitida` (qué botones mostrar), `BboxSchema`, `ETIQUETAS` y `distanciaMetros` (fusión cercana) |
| geodata-etl | `TIPOS_CAPA` y los tipos |

Se compila a `dist/` (ESM + `.d.ts`). Los consumidores lo enlazan con `workspace:*`. Turborepo
compila `contracts` antes que todo (`dependsOn: ["^build"]`) [C].

## 5. Proceso para cambiar un contrato [C/Doc]

1. Anunciar el cambio en el plan de la tarea (CLAUDE.md §4.8). La Parte 3 lo revisa.
2. Editar el esquema o la constante y **subir la versión** en `package.json`.
3. Escribir la entrada en `CHANGELOG.md` con los «consumidores» afectados.
4. Agregar `test/contrato-0-N.test.ts` con el comportamiento nuevo.
5. `pnpm --filter contracts build` regenera el OpenAPI. El CI falla si el YAML versionado no coincide
   con el regenerado.
6. Cada consumidor se adapta en su propia tarea.

Si el cambio toca la base (un enum nuevo, una columna), hace falta además una **migración** en
`packages/db` y actualizar el espejo Drizzle. Hay una prueba que compara el espejo con la base.

## 6. Puntos de extensión (para reutilizar en otro sistema)

| Para… | Tocar |
|---|---|
| Otro dominio (no inundaciones) | `enums.ts` (profundidad, frecuencia, causas, sumidero), `severidad.ts`, `ETIQUETAS`, `NOTA_METODOLOGICA` y `ReporteCrearSchema` |
| Otra ciudad | Nada: `CIUDAD_POR_DEFECTO` es solo el valor por defecto; cada instalación lo sobrescribe en api-core con `CIUDAD_*` |
| Otros cupos o radios | `CONFIG_DOMINIO` (y las variables de entorno de api-core que los sobrescriben) |
| Otros roles | `ROLES`, `ROLES_DEL_PANEL`, `TRANSICIONES` y el enum `rol` en la base (migración) |
| Otro flujo de estados | `ESTADOS_REPORTE`, `TRANSICIONES` y `ESTADOS_PUBLICOS/VERIFICADOS/RETIRADOS` (y el enum de la base) |

## 7. Observaciones (pendientes, no corregidas)

| # | Observación | Dónde |
|---|---|---|
| C-1 | **D3**: `agua_estancada` (F = 5) amplió el puntaje a 13 sin subir `SEVERIDAD_VERSION`. Las etiquetas de `permanente` («Cada lluvia») y `cada_lluvia_fuerte` cambiaron sin migrar datos | `severidad.ts`, `enums.ts` |
| C-2 | `ReporteCambiarEstadoSchema.fusionado_en_id` es `z.uuid()`, así que `PATCH /estado` no acepta un ID corto (solo `POST /fusionar` lo acepta). CLAUDE.md §7.3 dice «UUID o ID corto» | `esquemas/reporte.ts` |
| C-3 | El README del paquete habla de «256 combinaciones» de severidad; la v2 tiene 20 | `README.md` |
| C-4 | El formulario público redeclara listas de enums en lugar de importarlas (riesgo de deriva) | `apps/web-ciudadano/src/componentes/FormularioReporte.tsx:124` |
| C-5 | `LoginSchema` fija el dominio `@curichi.local` para el login corto: está atado al nombre del producto | `esquemas/auth.ts` |
