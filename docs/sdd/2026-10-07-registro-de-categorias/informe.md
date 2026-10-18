# Informe — Registro de categorías y políticas en `contracts` (M1)

- **Corrida:** `docs/sdd/2026-10-07-registro-de-categorias/` · **Rama:** `feat/contracts/registro-de-categorias` · **Parte:** P3 (custodia de `contracts`) · **Carpeta:** `packages/contracts/`
- **Banderas:** `base`, `contrato`, `privacidad`, `seguridad` · **Cambio de contrato:** sí, anunciado y **aditivo** (0.18.0 → 0.19.0), sin cambios de API ni de OpenAPI
- **Proceso:** CLAUDE.md §12.4 (no es un `/sdd` completo): `plan.md`, aprobado por el usuario el 2026-10-07, hace de spec
- **Vueltas implementador ↔ verificación:** 0 (F4a sin regresiones ni hallazgos bloqueantes o importantes). Hubo un ajuste antes de F4a: M1.4 dejó en rojo `contrato-0-16` (versión fijada) por un límite del prompt; se amplió su alcance a esas dos líneas
- **Foto:** `refs/sdd/registro-de-categorias` = `4f84ab5` · **Cambios ajenos:** los de `arbol-inicial.txt` (M0: ADR 0008–0022, `docs/arquitectura/`, `CLAUDE.md`, `docs/decisiones/README.md`, `ContextosySkills/`, etc.), que **no van en el commit de esta corrida** · **Línea base:** `linea-base.md` (rojos que ya estaban: 2, `lint` y `auditoria`, más 1 intermitente; decisión: seguir como conocidos)

## Qué cambia

`packages/contracts` gana el **registro de categorías** de la plataforma multitemática (ADR 0009): tipos
(`DefinicionCategoria`, `Pregunta`, `FiltroDef` con alcance, `ReglaCupo`), slugs canónicos y de URL con
alias, la función pura que elige la categoría inicial (URL → guardada → Inundaciones → primera activa,
ADR 0014/0015) y **Inundaciones descrita como datos** (textos, icono, colores, detalle derivado de
`ReporteCrearSchema`, severidad v2 reexportada, radio y cupo leídos de `CONFIG_DOMINIO`). Nadie lo
consume todavía (M2–M4). Versión 0.19.0 con su CHANGELOG y su sección en el README.

## Regresión contra la línea base

**Ninguna.** Detalle test por test en `verificacion.md`.

| Comando | Línea base | Después | Clasificación |
|---|---|---|---|
| `lint` | rojo: 1 error + 6 avisos, ajenos (`ContextosySkills/hooks/contexto.mjs`, un `.html` de `docs/dominio/`) | igual; 0 diagnósticos en `packages/contracts` | igual |
| `turbo typecheck --filter=...contracts --concurrency=1` | verde 9/9 | verde 9/9 | igual |
| `turbo test --filter=...contracts --concurrency=1` | exit 1 solo por el intermitente | exit 1 solo por el mismo intermitente; aislado 10/10 | igual (intermitente) |
| `turbo build --filter=...contracts --concurrency=1` | verde 7/7 | verde 7/7 | igual |
| `secretos` | verde | verde | igual |
| OpenAPI regenerado (`cmp`) | idéntico | idéntico al regenerar **y** a la foto (179 349 bytes) | igual |
| `turbo typecheck test` (contrato) | verde 16/16 | verde 16/16 (api-core 405, geo-service 61, geodata-etl 21) | igual |
| privacidad (6 archivos de api-core + `jitter`) | verde 90 + 4 | verde 90 + 4 | igual |
| seguridad (9 archivos de api-core) | verde 152 | verde 152 | igual |
| `auditoria` | rojo: 3 high (`source-map-js`, `sharp`, `next`) | igual | igual |
| suite de `contracts` | 17 archivos / 237 | **18 / 265** (+28 de `contrato-0-19`) | nuevo, verde |

Rojos que ya estaban y siguen igual (decisión: seguir como conocidos): `lint` y `auditoria`, ambos fuera
de `packages/contracts`. · Intermitentes: `api-core > test/exportacion.test.ts > … el límite por
defecto es EXPORTAR_MAX_FILAS …` (timeout de 5 s bajo contención; pasa aislado, en FB y en F4a).

## Criterios

| CA | Prueba | Antes | Después |
|---|---|---|---|
| CA1 · tipos | `typecheck` + usos en `test/contrato-0-19.test.ts` (:148-153, :179-184, :218-228) | no existía | verde |
| CA2 · slugs y URL | `test/contrato-0-19.test.ts:20-69` | no existía | verde |
| CA3 · categoría inicial | `test/contrato-0-19.test.ts:71-143` | no existía | verde |
| CA4 · Inundación como definición | `test/contrato-0-19.test.ts:145-189` (+ equivalencia :253-300, WCAG :230-251) | no existía | verde |
| CA5 · registro y fábrica | `test/contrato-0-19.test.ts:303-328` | no existía | verde |
| CA6 · invariantes | `test/contrato-0-19.test.ts:191-301` | no existía | verde |
| CA7 · sin cambio de comportamiento | `cmp` del OpenAPI + `typecheck`/`test` de los consumidores | verde | verde |
| CA8 · versión y documentación | `test/contrato-0-16.test.ts:100-109` (`package.json` = última entrada del CHANGELOG) | verde (0.18.0) | verde (0.19.0) |

## En vivo y túnel

No aplica: sin bandera `ui`, `api` ni `infra`. La pila no se reconstruyó. Docker Desktop estaba apagado
durante F4a (en FB, `postgis` y `minio` estaban sanos); no afecta: las suites usan PGlite efímero.

## Hallazgos del revisor y del auditor

Ni BLOQUEANTE ni IMPORTANTE. Los ocho CA se cumplen (revisor) y el diff no abre nada sensible (auditor).

| Severidad | Hallazgo | Resolución |
|---|---|---|
| MENOR (auditor) | `normalizarSlugCategoria` no acota el largo de la entrada; el coste es lineal (5 MB ≈ 11 ms, sin ReDoS) | Sin cambio ahora. Para **M4**: recortar la entrada si puede venir de un origen sin límite |
| NOTA (revisor y auditor) | `resolverCategoriaInicial` no mira `v` de `{v:1, slug}` (ADR 0014) | Aceptado: la función acepta objeto o cadena a propósito. **M4** descarta o migra un `v ≠ 1` al leer `localStorage` |
| NOTA (auditor) | `AmbitoCupo` admite cualquier cadena (`(string & {})`) | Para **M2/M3**: el contador debe **fallar cerrado** ante un ámbito desconocido, nunca leerlo como «sin cupo» |
| NOTA (revisor) | La regla del sumidero está reescrita en `DetalleInundacionSchema` | Idéntica a la de `ReporteCrearSchema` (condición, paths y mensajes) y atada por la prueba de equivalencia. Evitarla exigía tocar `ReporteCrearSchema`. Posible extracción a un helper compartido más adelante |
| NOTA (revisor) | `contrato-0-16` cambió su aserción a 0.19.0 | Convención de cada subida (3121a0f, 7369132); no la debilita |

Contrastes que el revisor hizo con el código actual (todos coinciden): textos de las preguntas con
`apps/web-ciudadano/src/componentes/FormularioReporte.tsx`; `camposPublicos` con `ReportePublicoSchema`
y `services/api-core/src/vistas.ts`; `camposExportacion` con las columnas del CSV de
`services/api-core/src/rutas/admin.ts:276-281`; colores con `--color-agua-100/500/700` de
`apps/web-ciudadano/src/app/globals.css`.

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|
| Ventana E2E G1 (+ `ubicacion-obligatoria`, `ubicacion-aproximada`, `csp`, `camara-foto`) | El usuario no autorizó la ventana E2E | Autorizarla. Para un cambio aditivo sin consumidor solo reconfirmaría lo que ya muestran el OpenAPI idéntico y las suites |
| `api-core > test/almacen-s3.test.ts` | Falta `S3_SECRET_KEY` en el entorno (y Docker apagado en F4a) | La variable y `minio` en marcha; el diff no toca almacenamiento |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `ContextosySkills/hooks/contexto.mjs` (formato; :42, :43, :45, :49) | 1 error de formato de Biome + 5 avisos `noUndeclaredEnvVars`: dejan `pnpm lint` en rojo | El CI y el pre-commit fallarían si este archivo se versiona tal cual. Arreglo de formato aparte, con autorización |
| Dependencias de `apps/*` y `services/api-core` | `pnpm audit` con 3 high: `next` < 16.3.8 (SSRF en optimización de imágenes), `sharp` (librsvg), `source-map-js` | Preexistente; subir `next` a 16.3.8 y revisar `sharp` en una tarea propia |

## Cómo volver atrás (si no se aprueba)

- Código: `git checkout refs/sdd/registro-de-categorias -- <archivo>` para `src/index.ts`, `package.json`,
  `CHANGELOG.md`, `README.md` y `test/contrato-0-16.test.ts` (todos en `packages/contracts/`), y borrar
  los nuevos: `packages/contracts/src/categorias/` y `packages/contracts/test/contrato-0-19.test.ts`.
  Lo ajeno no se toca.
- Pila y base: no se tocaron.

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada
- Parte: `P3` (custodia de `packages/contracts`)
- Carpeta designada: `packages/contracts/`

### Qué cambia
Registro de categorías y políticas de la plataforma multitemática (ADR 0009, 0014–0017, 0019, 0021,
0022), con Inundaciones como única definición. Aditivo: sin cambios de API ni de OpenAPI; ningún
consumidor lo usa todavía. contracts 0.19.0.

### Cómo verificarlo

```bash
npx -y pnpm@12.4.1 --filter contracts exec vitest run
npx -y pnpm@12.4.1 --filter contracts build
npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...contracts --concurrency=1
```

### Cambios de contrato (`packages/contracts`)
- [ ] No hay
- [x] Sí, anunciados en el plan y listados aquí: exportaciones nuevas de `src/categorias/`
  (`tipos`, `slugs`, `resolver`, `index`, `inundacion/{esquema,definicion}`); ninguna existente cambia;
  OpenAPI y `dist/dominio.json` idénticos.

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)
`ContextosySkills/hooks/contexto.mjs` (Biome) y las 3 vulnerabilidades high preexistentes; ver el informe.

### Definition of Done (CLAUDE.md §10)
- [x] Compila sin warnings nuevos
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` sin regresiones contra la línea base (`lint` rojo solo por un archivo ajeno; `test` con un intermitente conocido)
- [x] Al menos un test cubre el camino crítico de la parte (`contrato-0-19`: resolución de categoría, equivalencia del detalle, invariantes)
- [x] README propio con comandos y variables de entorno
- [x] `.env.example` sin valores reales (no cambia)
- [x] Sin datos ficticios presentados como reales (la categoría sintética vive solo en la prueba)
- [x] Sin cambios fuera de la carpeta designada
- [x] Checklist de seguridad revisado (auditor F4a; no toca api-core, fotos ni auth)

---

## Puerta 2 (2026-10-08)

**Commit postergado por el usuario:** «aún no hagas commit al GitHub repositorio, primero tengamos todo
terminado en local y te diré cuándo haremos el commit». La corrida queda **verificada y sin commitear**;
`refs/sdd/registro-de-categorias` se conserva para poder volver atrás hasta ese momento. Cuando el usuario
lo pida, el commit de esta corrida lleva solo `archivos.txt` y esta carpeta, añadidos archivo por archivo
(`feat(contracts): 0.19.0, registro de categorías y políticas (ADR 0009)`).
