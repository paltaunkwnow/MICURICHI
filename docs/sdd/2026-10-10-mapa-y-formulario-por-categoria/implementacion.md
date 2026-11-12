# Implementación — M4: mapa y formulario por categoría (web pública)

El agente principal transcribió los informes de los implementadores. Las salidas son las que pegaron ellos; la verificación independiente va en `verificacion.md`.

| Tarea | Agente | Criterio | Carpeta |
|---|---|---|---|
| M4.1 · `contracts` 0.21.0 (`textos?`) | `trabajador-raiz` | CA1 | `packages/contracts/` |
| M4.2 · núcleo de categoría en la app | `trabajador-raiz` | CA2, CA3 | `apps/web-ciudadano/src/lib`, `app/layout.tsx`, `app/proveedores.tsx` |
| M4.3 · mapa por categoría | `general-purpose` (Sonnet) | CA4 | `apps/web-ciudadano/` |
| M4.4 · formulario por categoría | `trabajador-raiz` (segundo intento: el primero se cortó por el límite de sesión antes de escribir; se comprobó que no había cambiado ningún archivo) | CA5 | `apps/web-ciudadano/` |
| M4.5 · ajuste de dos E2E (D2) | `general-purpose` (Sonnet) | CA6 (parte autorizada) | `e2e/tests/` |
| M4.6 · README de la web | `general-purpose` (Sonnet) | CA7 | `apps/web-ciudadano/README.md` |
| M4.6 · nota en la ADR 0015 (D1) y avance en el doc 14 | agente principal | CA7 | `docs/` |

La lista completa está en `archivos.txt`. Todos los cambios de código están en `apps/web-ciudadano/`, `packages/contracts/` y las dos E2E autorizadas. Después de cada tarea se comparó con los `sha256` de `arbol-inicial.txt`.

**Sin hacer, por no estar autorizado:** `CLAUDE.md` §4.3 y §4.8 (§4.8 sigue diciendo 0.20.0) y la spec E2E nueva `categoria-mapa.spec.ts`.

## Por tarea, según los implementadores

### M4.1 · `contracts` 0.21.0

- **Nuevo** `src/categorias/textos.ts`:
  - `TextosCategoria`, con todos los campos opcionales;
  - `TextosCategoriaResueltos`;
  - `textosDeCategoria(def)`, que rellena los faltantes a partir de `nombre`, `nombreCorto` y `descripcion`, o de textos neutros.
- **`DefinicionCategoria`** suma `textos?`.
- **Textos de inundación**, con los literales de hoy:

  | Campo | Valor |
  |---|---|
  | `puntosDelMapa` | «puntos de inundación» |
  | `puntoSingular` | «Punto de inundación» |
  | `listaVaciaCuerpo` | texto completo |
  | `tituloPaso2` | «¿Hasta dónde llegó y cada cuánto pasa?» |
  | `avisoPercepcion` | «la profundidad se estima por referencia corporal» |
  | `descripcionReportar` | texto completo |

  Son fragmentos que la web compone. No se duplicaron `verbo` ni `descripcion`, y los textos de marca no entran.
- **`contrato-0-21.test.ts`:** 11 pruebas. Composición exacta igual al literal de hoy y respaldo con una definición sintética.
- **`contrato-0-16`:** la versión fija pasa a un piso `≥ 0.21.0`. Se conserva la invariante `package.json` = cabecera del CHANGELOG.
- **Salidas:**

  | Comprobación | Resultado |
  |---|---|
  | `contracts` | 292 → **303** |
  | OpenAPI | `aaa8b711…6bac` antes y después |
  | `typecheck --filter=...contracts` | 9/9 |
  | api-core (definiciones sintéticas) | 37 verdes |
  | geo-service | 71 |
  | Biome | limpio |

### M4.2 · núcleo de categoría en la app

- **`configuracion.ts`:** `crearLectorDeConfiguracion` devuelve `{ ciudad, categoriasActivas }`. Las categorías salen normalizadas y en orden canónico. Si no hay servidor, el respaldo es `['inundacion']`.
- **`ciudad-servidor.ts`:** `obtenerConfiguracion`, `obtenerCiudad` y `obtenerCategoriasActivas`, con una sola lectura.
- **`categorias-contexto.tsx`:**
  - `ProveedorCategorias`, con un registro inyectable;
  - `useCategorias`, que filtra contra el registro y falla cerrado;
  - `useCategoriaEfectiva`: devuelve `null` durante la hidratación (regla 2), corrige la URL según D1 y guarda la «última usada».
- **`categoria.ts`** (funciones puras):
  - la preferencia en `micurichi.mapa.categoria` con `{v:1, slug}`, dentro de `try/catch`, usando el alias de almacén que pide `misReportes.test.ts:64-68`;
  - `resolverCategoriaDeUrl`;
  - `activasDelRegistro`;
  - `reiniciarAlCambiarCategoria`, que mira `FiltroDef.alcance`;
  - el tipo `EstadoMapaCategoria`.
- **Pruebas nuevas:** `categoria.test.ts` (28) y `configuracion.test.ts` (+4).
- **Salidas:** web 486 → **518**. Typecheck, build y Biome verdes.

### M4.3 · mapa por categoría

- **Lecturas:** llevan `categoria`. Los agregados usan `?categoria=` y la clave `['agregados', categoria]`. `Portada` pide con la primera activa. Mientras la categoría es `null`, se ve lo mismo que hoy durante la carga.
- **Sin contaminación:**
  - `keepPreviousData` pasa a `conservarSoloDeLaMismaCategoria`, una función pura. Una prueba con un `QueryObserver` real usa `keepPreviousData` como control.
  - En `Mapa.tsx`, `claveDeDatos` reinicia el `feature-state` y las etiquetas con conteo al cambiar de categoría. Es una contaminación real que encontró el implementador: el coloreo de la categoría anterior quedaba pintado. Con una sola categoría ese camino no corre.
- **`SelectorCategoria`:**
  - con una sola categoría, `null`;
  - con dos o más, `tablist` con *roving tabindex*, flechas, Inicio y Fin, objetivos de 48 px, foco de la marca, icono más nombre, acento solo en la pestaña activa y `scrollIntoView`;
  - se dibuja dos veces, como el buscador (escritorio y móvil);
  - la lógica del teclado está en `lib/teclado-pestanas.ts`.
- **Cambio de categoría:** reinicio por alcance; URL según D1 con `replaceState`; preferencia guardada; `aria-live` «Mostrando X: N puntos».
- **Textos:** salen de `textosDeCategoria` (título, `aria-label`, h1 del detalle, lista vacía, aviso y `metadata` de `/reportar`). Una prueba exige que sean idénticos a los literales de hoy.
- **Presentadores** (`componentes/categorias/`): registro por slug. Inundación tiene su propio presentador, que es el JSX de antes, movido. Para las demás hay uno genérico, que arma las filas desde `camposPublicos` y `preguntas`. Una prueba revisa el código y exige que no haya `=== 'inundacion'` en el código común.
- **Leyenda y enlaces:** la leyenda muestra la categoría con dos o más activas. `hrefReportar` deja `/reportar` exacto con una sola.
- **Pruebas:**
  - **Nuevas:**
    - `categoria-mapa.test.ts`;
    - `teclado-pestanas.test.ts`;
    - `conteos-mapa.test.ts`;
    - `api-categoria.test.ts`;
    - `SelectorCategoria.test.ts`;
    - `presentadores.test.ts`;
    - `VistaMapa.test.ts`.

    El implementador confirmó con 5 mutaciones que las pruebas muerden.
  - **Ajustadas:** `ubicacion-pagina.test.ts` y `radio-configurable.test.ts`. Ahora envuelven con `ProveedorCategorias`; no se cambió ninguna aserción.
- **Salidas:** 518 → **599**. Typecheck, build y Biome verdes.

### M4.4 · formulario por categoría

- **Categoría:**
  - sale de `?categoria=` de `/reportar` o, si falta, de la de por defecto;
  - **no** lee ni guarda la preferencia del mapa;
  - D1, con un anuncio;
  - con dos o más activas, «Categoría: X · Cambiar» en el paso 1, que conserva ubicación, fotos y descripción y reinicia el paso 2;
  - la pregunta del paso 1 sale de `preguntaUbicacion`.
- **Adaptadores** (`componentes/formulario-categorias/`):
  - `adaptadorFormularioDe(def)` busca en `ADAPTADORES_FORMULARIO[slug]` y, si no hay uno, usa `crearAdaptadorGenerico(def)`;
  - **inundación** registra el paso 2 y el bloque «Causa presunta y sumidero» del paso 3, **extraídos sin cambios** y con los mismos `name` planos. También declara `aDetalle`, el avance, `pasoDeCampo`, las filas de revisión y la previsualización con `def.severidad.calcular` («7/13»);
  - el **genérico declarativo** dibuja las `preguntas` con nombres `detalle.<id>` y su previsualización muestra solo la banda;
  - `Opcion`, `Pastilla` y `MensajeDeCampo` se extrajeron a `controles.tsx`.
- **Cuerpo (D2):**
  - `{ …núcleo, categoria, detalle }`, tipado con `ReporteCrearCategoriaSchema`;
  - la validación del cliente cubre el núcleo y el `detalle`;
  - prueba de **equivalencia:** `normalizarReporteCrear(nuevo)` === `normalizarReporteCrear(plano de antes)`.
- **Borrador 3:**
  - lleva `categoria`;
  - traduce los formatos 2 y anteriores como inundación;
  - **no restaura** el borrador de otra categoría;
  - un `detalle` vacío no cuenta como contenido.
- **Cupo:** `restantesDeCategoria` y `demoraDeCategoria` leen `cupos[categoria]`, con respaldo en los campos sueltos.
- **`errores.ts`:** texto para `CATEGORIA_NO_DISPONIBLE`.
- **Pruebas:**
  - **Nuevas:**
    - `adaptadores.test.ts`, que incluye la revisión del código común y la de «no toca la preferencia»;
    - `SelectorCategoriaFormulario.test.ts`;
    - `cupo-categoria.test.ts`;
    - casos en `borrador.test.ts`.
  - **Ajustadas:**
    - `formulario-reporte.test.ts`, **reescrita**. Según el implementador, conserva todas las invariantes y suma la de equivalencia. **El revisor tiene que comprobar que no quedó más débil**;
    - `radio.test.ts:287`, que pasó a la firma nueva de `armarEnvio`;
    - `borrador.test.ts`, que pasa `categoria` en dos literales.

    Las demás pruebas frágiles de texto sobre el código no necesitaron cambios.
- **Salidas:** 599 → **625**. Typecheck, build y Biome verdes.
- **E2E que rompe D2,** según la lista del implementador: `quitar-campos-web:189-190` y `formulario-sumidero-y-fotos:250-251`. `ubicacion-obligatoria:293-306` solo lee claves del núcleo, que siguen en el primer nivel, y no se rompe.

### M4.5 · ajuste de dos E2E (autorizado el 2026-10-10)

- **`quitar-campos-web`, «CA-W3»:**
  - los cuatro campos quitados se comprueban en el primer nivel **y** dentro de `detalle`;
  - la categoría tiene que ser `'inundacion'`;
  - profundidad y frecuencia se leen de `detalle`.
- **`formulario-sumidero-y-fotos`:** `toHaveProperty(campo, null)` se comprueba sobre `cuerpo.detalle`.
- **Salidas:** Biome limpio y `tsc` de `e2e/` exit 0. La ejecución E2E queda para la verificación.

### M4.6 · README de la web

La primera pasada se cortó por el límite de sesión y se retomó con el mismo agente.

**Qué cambió:**
- **Sección nueva «## Categorías»** (L150–378): cuáles hay, cuál se abre (D1), preferencia, selector y reinicio, lecturas sin contaminación, textos y presentadores, formulario por categoría, cómo sumar una categoría en M6 y pruebas.
- **Ajustes:** la introducción, la configuración, las pantallas, «El formulario no pierde lo escrito» (borrador 3), «Sin tráfico automático» y «Pruebas end-to-end». Esta última aclara que el E2E de cambio de categoría pasa a M6 (D3).

**Huecos entre el código y las ADR que encontró el agente** (solo leyendo; el revisor los evalúa):
1. **La web no lee `componenteEspecialPaso2`:** el adaptador del formulario se elige por `slug` (`formulario-categorias/registro.ts`), no por ese campo de la definición.
2. **El número del cupo no sale de la regla de la categoría:** `textoCupo` (`lib/cupo.ts`), `ComoFunciona` y `/cuenta` usan `CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA` o los campos sueltos de `/auth/yo` en lugar de `definicion.cupo.limite`. Con inundación da lo mismo. ADR 0017.
3. **El adaptador genérico no maneja `subtipos` ni `ubicacionTipoPorDefecto`.** Bloquearía una categoría con subtipos en M6.
4. **La preferencia se lee en un efecto al montar** y no en el render (ADR 0014 dice «lectura síncrona»). Es así para no romper la hidratación (regla 2).
5. **El orden de las pestañas sale del orden del registro.** En M6 hay que registrar las definiciones en el orden canónico.

La nota de D1 en la ADR 0015 ya está escrita, por el agente principal.

## Decisiones técnicas para la revisión

1. **Registros de componentes especiales en la app** (presentadores y adaptadores), con el slug como clave y un genérico de respaldo (ADR 0021). En el código común no hay `if` por categoría, y lo comprueban pruebas que revisan el código.
2. **Inundación conserva los `name` planos en el formulario.** Las E2E y el DOM no cambian, y el adaptador pasa los valores a `detalle`. Las categorías declarativas usan `detalle.<id>`.
3. **La preferencia es solo del mapa** (ADR 0014). El formulario resuelve la categoría desde la URL o la de por defecto, sin guardar nada.
4. **`lib/categoria-de-prueba.ts`** contiene la segunda categoría sintética, `DEFINICION_BACHE_DE_PRUEBA`. Vive en `src/lib/`, como `fuente-para-pruebas.ts`, y solo la importan los `*.test.ts`.
5. **Accesibilidad con una sola categoría.** La región `aria-live` del anuncio de categoría solo se dibuja si hay mensaje, para no agregar nodos (regla 1). Algunos lectores de pantalla podrían no anunciar una región que aparece ya con texto. Solo pasa con una URL inválida o inactiva.
6. **Hidratación con dos o más activas.** Los textos usan la categoría por defecto hasta que se resuelve la efectiva. Con una sola es idéntico.
7. **Fuera de alcance:** los `metadata` de `app/layout.tsx` y `app/page.tsx` siguen diciendo «inundación» y «agua». Son textos de marca de la instalación de hoy.
