# Ventana de Contexto — Sesión 2

> Snapshot del **2026-10-07** al cerrar la **FASE 3**: planificación de la plataforma multitemática.
>
> Continúa a [VentanaContextoSesion1.md](VentanaContextoSesion1.md), que cerró la FASE 2. Lo que
> sigue igual **no se repite**: se enlaza.
>
> Conclusiones permanentes en
> [`docs/arquitectura/13-planificacion-plataforma-multitematica.md`](../docs/arquitectura/13-planificacion-plataforma-multitematica.md)
> y sus anexos 13.1, 13.2 y 13.3.

## 1. Objetivo actual de la sesión

**FASE 3: planificar sin implementar** la evolución de Mi Curichi (solo inundaciones) a una
plataforma multitemática con 4 categorías: Inundaciones, Baches, Áreas verdes y Basura.

Tiene que ser un núcleo común más módulos, usando como referencia visual el prototipo
`C:\Users\HP\Downloads\Mi Curichi · Prototipo (compartible) (23).html`.

**Regla absoluta:** NO IMPLEMENTAR. Solo documentación de planificación.

## 2. Estado actual del proyecto

Igual que en la Sesión 1 §2: Fase 1 local, tarea 9 pendiente. Sin cambios de código.

## 3. Repositorio Git analizado

Igual que en la Sesión 1 §3.

## 4. Branch actual

`main`.

## 5. Commit exacto

`3121a0f`, sin cambios. Nadie commiteó entre la FASE 2 y la FASE 3.

## 6. Branches investigadas

Sin cambios respecto de la Sesión 1 §6. No se volvió a investigar: no hacía falta para la FASE 3.

## 7. PRs investigadas

Sin cambios respecto de la Sesión 1 §7.

## 8. Cambios recientes relevantes

Ninguno nuevo en el repositorio.

## 9. Estado de sincronización

| Cambio | Detalle |
|---|---|
| Archivos nuevos sin seguimiento | `docs/arquitectura/13*.md` y `ContextosySkills/VentanaContextoSesion2.md` |
| `docs/arquitectura/README.md` | Filas 13–13.3 |
| `docs/arquitectura/12-…` | **Corrección fechada** sobre los privilegios por columna |
| `apps/*/next-env.d.ts` | Siguen modificados (los reescribió `next dev`, Sesión 1) |

## 10. Arquitectura comprendida

Sin cambios respecto de la Sesión 1 §10. Novedades de esta fase:

- **Ya es genérico** [CONFIRMADO POR CÓDIGO]:
  - rutas neutras (`/api/v1/reportes`);
  - auditoría con `entidad = 'reporte'`;
  - el mapa público (`Mapa.tsx`, `VistaMapa.tsx`) no nombra campos de inundación;
  - del formulario, solo el paso 2 es de dominio.
- **Clusters de MapLibre:** se calculan en la **fuente**, antes del filtro de capa. Por eso el cambio
  de categoría tiene que cambiar los datos (`setData`), no un filtro de capa.

## 11. Estructura comprendida

Sin cambios. Propuesta de esta fase:

- **no** crear `packages/core`;
- crear `packages/contracts/src/categorias/<slug>/`;
- y `apps/*/src/categorias/`.

## 12. Componentes importantes

**Además de los de la Sesión 1 §12:**

| Archivo | Por qué importa |
|---|---|
| `apps/web-ciudadano/src/componentes/Mapa.tsx` | Una fuente `reportes` con `cluster`, `clusterProperties` por severidad, `RADIO_CLUSTER = 44`, `ZOOM_MAX_CLUSTER = 15` |
| `VistaMapa.tsx` | `queryKey ['reportes', filtros]` |
| `LeyendaMapa.tsx` | Leyenda actual |
| `lib/verificacion.ts` | `ESTILO_ESTADO`, `COLOR_UV_SIN_VERIFICAR = #8C9AA5` |
| `app/globals.css` | *Tokens* `verde-*`, `agua-*`, `tinta-*`, `sev-*` |

**Del prototipo** (desempaquetado en el scratchpad de la sesión: `scratchpad/html/app.js`,
`estilos.css`, `template.html`):

- `MOD` (línea ~433);
- el manejador `data-modulo` (~2035);
- `mC01` (mapa del celular);
- `mC08M` (paso 2 de los módulos);
- `sevNoAgua`;
- `pinIcon`;
- `aplicarTema`.

## 13. Flujos importantes

El flujo propuesto (datos, mapa y creación) está en 13.2 §7 y en 13 §12–§14.

## 14. Hallazgos

### Prototipo

[CONFIRMADO POR HTML]

- Leaflet 1.9.4, ~182 KB de JavaScript, sin backend.
- 4 módulos en `MOD`, con iconos Lucide (`waves`, `trees`, `traffic-cone`, `trash-2`).
- Selector `tablist` arriba.
- Al cambiar de módulo: conserva la vista, reinicia severidad y tipo, cierra los filtros y
  **re-tiñe toda la app**.
- La categoría se hereda del mapa.
- La severidad de los módulos nuevos es la gravedad declarada con empuje por tamaño, en la escala
  común de 4 bandas.

Diferencias con el sistema real:

- muestra **solo verificados**;
- la severidad del agua usa duración y afectación, que **0010 quitó**;
- tiene gamificación;
- no agrupa puntos;
- los avisos no tienen `aria-live`;
- el detalle de escritorio tiene campos de agua fijos;
- los indicadores mezclan escalas;
- incluye «Persona en situación de calle».

### Colores

[MEDIDO]

- Baches ≈ severidad «alta»: ΔE 9,2.
- Áreas verdes contra Baches con protanopía: **ΔE 2**.
- El `c5` de verde y de baches no llega a AA con blanco.
- Propuesta: `#0A4A69` / `#7A4E1E` / `#0F6E5C` / `#6B3FA0`, con ≥ 6,17:1 con blanco y un peor par de
  ΔE 22 con daltonismo.
- Ninguna de 1 344 combinaciones supera ≈ 22 en el par azul–violeta con deuteranopía → el **icono es
  obligatorio**.

### Acoplamiento

[CONFIRMADO POR CÓDIGO]

**44 archivos fuente y 23 de prueba** nombran campos o la tabla de inundación (lista en 13.3 §7.1).

### Base de datos

[CONFIRMADO POR CÓDIGO]

- FK a `reporte_inundacion(id)`: `reporte_foto`, `idempotencia` y `fusionado_en_id`.
- `GRANT` por tabla (0008).
- Privilegios por columna solo en `usuario`.

### Alcance

[CONFIRMADO POR CÓDIGO]

**CLAUDE.md §3 cierra el alcance** de la Misión 1: implementar multi-categoría exige la aprobación
del usuario (regla de oro 11).

## 15. Problemas encontrados

1. El **informe 12 decía «privilegios por columna»** para `curichi_api`. Corregido con una nota
   fechada.
2. En el prototipo, los defectos de §14.

## 16. Problemas que NO deben corregirse todavía

Todo; la fase es solo de planificación. La lista de lo que no se toca hasta M0 está en 13.3 §9.

## 17. Decisiones tomadas

Son recomendaciones, pendientes de que el usuario las apruebe.

1. **Una plataforma + módulos**, con inundación como módulo 1 sin cambiar su comportamiento.
2. **Modelo D, híbrido**: `reporte` tipado + `categoria`, `subtipo`, `detalle jsonb` y
   `detalle_version`.
3. **Migración** por renombre + **vista de compatibilidad** `reporte_inundacion` filtrada + expandir
   y contraer.
4. **API aditiva en v1**: sin `categoria` = `inundacion`.
5. **Un solo mapa**, con datos por categoría y `?categoria=` en la URL.
6. **Colores solo en acentos**: la severidad sigue pintando los puntos; icono obligatorio.
7. **Geometría**: G1 (`Point`) ya; G2 (`area_ref` por PIP) cuando exista la capa.
8. **Roadmap M0–M11**, con Baches como piloto.

## 18. Suposiciones

- El prototipo es una maqueta de diseño, no una especificación técnica.
- Los hex propuestos son punto de partida para diseño.
- La relación con los clientes PWA viejos se resuelve con el valor por defecto `inundacion`.

## 19. Información pendiente de confirmar

Las 17 preguntas de producto de 13 §27. Las clave son:

| N.º | Pregunta |
|---|---|
| 1 | Ampliar el alcance |
| 3 | Categoría por defecto al entrar |
| 4 | ¿Reiniciar el filtro de severidad? |
| 5 | Cupo global o por categoría |
| 6 | Persona en situación de calle |
| 9 | Capa de áreas verdes |

## 20. Skills / técnicas aprendidas

### Skill: Desempaquetar y analizar un prototipo HTML «bundler»

- **Qué aprendimos.**
  - El archivo trae `<script type="__bundler/manifest">` con JSON `{uuid: {mime, compressed, data}}`
    en base64 + gzip.
  - También trae `<script type="__bundler/template">` con el HTML como cadena JSON.
- **Cómo se aplicó.** `scratchpad/desempacar.cjs`:
  - lee las líneas del bloque;
  - hace `JSON.parse`;
  - descomprime con `zlib.gunzipSync`;
  - escribe los recursos sueltos.

  Después se extrajeron `app.js` y `estilos.css` del *template* y se analizaron con `grep` y `sed`.
- **Precauciones.** No modificar el original. Las bibliotecas vienen como `.bin` (`window.IMG` con
  imágenes en *data URI*).

### Skill: Verificación de paleta (contraste WCAG + daltonismo)

- **Qué aprendimos.**
  - Contraste WCAG 2.x por luminancia relativa.
  - ΔE CIE76 en Lab.
  - Simulación de protanopía y deuteranopía con las matrices de Viénot (1999) sobre RGB lineal.
  - Una búsqueda exhaustiva sobre candidatos semánticos (inundación azul, verde, tierra, violeta)
    muestra un techo de ΔE ≈ 22 en daltonismo.
- **Cómo se aplicó.** Scripts `node -e` (reproducibles; el código está en el transcript de la
  sesión) → 13.1 §4 y §6.
- **Precauciones.**
  - CIE76 es una aproximación; para diseño fino, CIEDE2000.
  - Los umbrales usados: 4,5:1 texto, 3:1 componentes gráficos, ΔE < ~10 confundible.

### Skill: Medir el acoplamiento de dominio por archivos

- **Qué aprendimos.** `grep -rlE` de términos del dominio separando fuente de pruebas da una medida
  simple y repetible del costo de sumar una categoría (44 + 23).
- **Cómo se aplicó.** 13.2 §2 y 13.3 §7.1.
- **Precauciones.** Archivos genéricos que igual necesitan el parámetro (por ejemplo `Mapa.tsx`) no
  aparecen en el `grep`: se agregaron a mano.

### Skill: Verificar en el código lo que dice la documentación

- **Qué aprendimos.** Una afirmación del informe propio (privilegios por columna) era falsa en
  parte.
- **Cómo se aplicó.** `grep` de `GRANT` y `REVOKE` en las migraciones, más una corrección fechada sin
  borrar el texto anterior.

(Las skills de la Sesión 1 siguen vigentes.)

## 21. Herramientas utilizadas

- Bash y Node para desempaquetar y para los cálculos de color.
- `grep` y `sed` sobre el repo y el prototipo.
- `require('lucide-react')` para comprobar los iconos disponibles.
- `mark_chapter`.
- Write y Edit (solo documentación).

## 22. Archivos importantes

- **Documentos de esta fase:** `docs/arquitectura/13*.md`.
- **Prototipo desempaquetado:** scratchpad `html/`.
- **Código citado:**
  - `Mapa.tsx:525-640`;
  - `VistaMapa.tsx:93-130`;
  - `contracts/src/esquemas/reporte.ts:87-157` (`ReporteCrearSchema`);
  - `packages/db/src/esquema/index.ts:189-242`;
  - `migraciones/0001:163,180`;
  - `0004:14`;
  - `0008:40,84`;
  - `0010:73-81`.

## 23. Documentación generada

| Archivo | Qué es |
|---|---|
| `docs/arquitectura/13-planificacion-plataforma-multitematica.md` | Informe principal: las 28 secciones pedidas |
| `docs/arquitectura/13.1-analisis-html-y-ux.md` | Prototipo, UX, iconos y colores |
| `docs/arquitectura/13.2-modelo-core-y-categorias.md` | Núcleo, categorías, modelo de datos, flujos, API, estructura |
| `docs/arquitectura/13.3-plan-migracion.md` | Roadmap, migración, pruebas, criterios, riesgos, ADR, archivos |
| `docs/arquitectura/README.md` | Filas nuevas |
| `docs/arquitectura/12-…` | Corrección fechada |
| `ContextosySkills/VentanaContextoSesion2.md` | Este snapshot |
| `ContextosySkills/README.md` | Fila en el índice de snapshots |

## 24. Trabajo completado

FASE 3 completa:

- contexto y código releídos;
- HTML analizado;
- iconos y paleta medidos;
- núcleo y categorías clasificados;
- opciones de modelo comparadas;
- flujos;
- API y compatibilidad;
- estructura;
- migración;
- roadmap;
- riesgos;
- pruebas;
- criterios;
- ADR listados;
- archivos a tocar y a crear.

Sin cambios de código, base, contratos ni git.

## 25. Trabajo pendiente

Nada de la FASE 3. Lo siguiente depende de las respuestas del usuario (13 §27).

## 26. Próximo paso exacto

**Esperar** las respuestas del usuario a 13 §27, como mínimo las preguntas 1, 3, 4, 5, 6 y 9.

Con ellas:

1. escribir los **ADR 0008–0016** en `docs/decisiones/`;
2. escribir el **plan de M1** con las metas de §12.4 del manual, para su aprobación.

**No programar** hasta esa aprobación y la de **ampliar el alcance** (CLAUDE.md §3).

## 27. Instrucciones importantes para continuar después de /compact

1. Leer este snapshot, la Sesión 1 y `ContextosySkills/README.md`.
2. Verificar git: `git log -1` debería seguir siendo `3121a0f`.
3. Para el detalle técnico, leer `docs/arquitectura/13*.md`. **No** releer el HTML entero: lo
   necesario está en 13.1.
4. Si el usuario aprueba implementar:
   - primero el plan de M1 (raíz, Opus 4.8 según §12.4) y su aprobación;
   - después el reparto;
   - `CLAUDE.md` solo con autorización explícita.
5. Mantener la regla: el código manda sobre la documentación. Corregir con una nota fechada.
6. El próximo snapshot es **`VentanaContextoSesion3.md`**.

## 28. Resumen ejecutivo de continuidad

Se planificó, sin implementar, la plataforma multitemática: Inundaciones, Baches, Áreas verdes y
Basura.

**Recomendación:**

- una plataforma con núcleo común (ya existe en la mitad del código) e **inundación como módulo 1**;
- modelo de datos **híbrido**: `reporte` + `categoria`, `subtipo` y `detalle jsonb`;
- migración por **renombre + vista de compatibilidad + expandir y contraer**, conservando ID, fotos,
  auditoría e índices;
- **API aditiva en v1**, por defecto `inundacion`;
- **un solo mapa** con un selector arriba, Inundaciones por defecto y datos (no filtro de capa) por
  categoría;
- iconos Lucide `Waves`, `TrafficCone`, `Trees`, `Trash2`, con colores de acento medidos;
- `Point` ya, área por PIP después;
- roadmap M0–M11, con Baches como piloto.

**Del prototipo:** sirve como referencia de experiencia. No copiar Leaflet, la visibilidad «solo
verificados», la gamificación, el re-teñido ni «persona en situación de calle».

**Bloqueo:** CLAUDE.md §3 (alcance cerrado). Hace falta la aprobación del usuario y sus respuestas a
13 §27.
