# 13 · Planificación de la plataforma multitemática

> **FASE 3 — informe principal**, 2026-10-07, sobre `main` = `3121a0f`. **Es solo planificación:**
> no se cambió código, base de datos, contratos, colores ni iconos reales.
>
> **Anexos (el detalle está ahí):**
>
> - [13.1 · Análisis del HTML, UX, iconografía y paleta](13.1-analisis-html-y-ux.md)
> - [13.2 · Núcleo, categorías y modelo de datos](13.2-modelo-core-y-categorias.md)
> - [13.3 · Migración, pruebas, criterios, riesgos y ADR](13.3-plan-migracion.md)
>
> **Base:**
>
> - [12 · Evaluación arquitectónica y de escalabilidad](12-evaluacion-arquitectonica-y-escalabilidad.md)
>   (FASE 2);
> - el prototipo `Mi Curichi · Prototipo (compartible) (23).html`;
> - una nueva lectura del código (el código manda sobre la documentación).

> **Nota del 2026-10-07 (respuestas de M0):** el usuario respondió §27 (preguntas 1, 3, 4, 5, 6 y 9). Las decisiones, sus efectos y el plan M0/M1 actualizado están en [14](14-decisiones-m0-y-plan-m1.md), y las ADR propuestas en [14.1](14.1-adr-propuestos.md). **Donde difieran, mandan 14 y 14.1**. Este documento se conserva como registro de la FASE 3.


## Etiquetas

| Etiqueta | Significa |
|---|---|
| **[CONFIRMADO POR CÓDIGO]** | Evidencia en el repositorio |
| **[CONFIRMADO POR HTML]** | Evidencia en el prototipo |
| **[MEDIDO]** | Prueba o cálculo reproducible |
| **[INFERIDO]** | Deducción razonable |
| **[RECOMENDACIÓN]** | Propuesta |
| **[PENDIENTE DE DECISIÓN]** | La decide el producto |

---

## 1. Resumen ejecutivo

1. **Qué construir.** Una plataforma con un **núcleo común** y **cuatro categorías**, no cuatro
   sistemas [RECOMENDACIÓN].
   - El núcleo ya existe y es genérico en la mitad del código: auth, fotos, auditoría (que **ya**
     usa `entidad = 'reporte'`), publicación diferida, visibilidad, ubicación del dispositivo, PIP,
     capas y ETL [CONFIRMADO POR CÓDIGO].
   - Lo de inundación está concentrado en **44 archivos fuente y 23 de prueba**
     [CONFIRMADO POR CÓDIGO]:
     - la tabla `reporte_inundacion` y sus `ENUM`;
     - el esquema de creación;
     - la severidad v2;
     - el paso 2 del formulario;
     - las filas de detalle;
     - los indicadores del panel.
2. **Cómo.** Inundación se convierte **primero** en el módulo 1, sin cambiar su comportamiento. Las
   otras tres se suman como **definiciones** en `packages/contracts/src/categorias/`:
   - esquema Zod;
   - severidad a la escala común de 4 bandas;
   - preguntas;
   - textos, icono y colores;
   - radio de recurrencia.

   Se encienden desde un **catálogo** en la base [RECOMENDACIÓN].
3. **Modelo de datos.** **Híbrido (opción D)**: tabla base `reporte` con lo común tipado, más
   `categoria`, `subtipo` y `detalle jsonb`, validado por el Zod de la categoría.
   - Se llega **renombrando** `reporte_inundacion`, lo que conserva ID, fotos, auditoría, índices y
     *grants*.
   - Una **vista de compatibilidad** filtrada a inundación evita contaminar consultas olvidadas.
   - Se sigue el patrón expandir → contraer que el proyecto ya usó [RECOMENDACIÓN].
4. **Mapa.** **Un solo mapa** con un selector arriba e **Inundaciones por defecto**.
   - Al cambiar, conserva centro y zoom, limpia la selección, reinicia los filtros propios y
     **cambia los datos de la fuente**, no un filtro de capa: en MapLibre los clusters se calculan
     antes de los filtros de capa [CONFIRMADO POR CÓDIGO].
   - La URL lleva `?categoria=` [RECOMENDACIÓN].
5. **El HTML.**
   - Valida la idea: módulos con icono y color, selector arriba, la categoría heredada del mapa, un
     paso «qué pasa» por categoría y la severidad común [CONFIRMADO POR HTML].
   - **No** sirve como especificación técnica. Usa Leaflet y polígonos aproximados, muestra solo lo
     verificado, calcula la severidad con campos que la migración 0010 quitó, tiene gamificación y
     re-tiñe toda la app.
   - Su paleta tiene dos problemas medidos:
     - **Baches ≈ severidad «alta»** (ΔE 9,2);
     - **con protanopía, Áreas verdes y Baches casi no se distinguen** (ΔE 2) [MEDIDO].
6. **Iconos y colores [RECOMENDACIÓN].**
   - `Waves` / `TrafficCone` / `Trees` / `Trash2`, ya disponibles en `lucide-react`.
   - Colores de **acento** `#0A4A69` / `#7A4E1E` / `#0F6E5C` / `#6B3FA0`: todos ≥ 6,1:1 con blanco
     [MEDIDO].
   - **Los puntos siguen pintados por severidad**, y **icono + nombre** son obligatorios: ninguna
     paleta de 4 colores separa bien con daltonismo [MEDIDO].
7. **Escala.** Agregar una 5.ª categoría debería costar **5–8 archivos nuevos y 2–3 líneas de
   registro**. Hoy costaría ~44 archivos más una migración con `ENUM` [INFERIDO].
8. **Roadmap seguro.**
   1. M0, decisiones y ADR;
   2. M1, registro;
   3. M2, expandir la base;
   4. M3, núcleo consciente de la categoría;
   5. M4 y M5, mapa y panel;
   6. M6 Baches → M7 Basura → M8 Áreas verdes (punto);
   7. M9, medición;
   8. M10, contraer;
   9. M11, áreas por capa.

   Hasta M6, **nada cambia** para el usuario final [RECOMENDACIÓN].
9. **Bloqueo formal.** CLAUDE.md §3 cierra el alcance de la Misión 1. Implementar exige que
   apruebes **ampliar el alcance** (regla de oro 11) [CONFIRMADO POR CÓDIGO].

---

## 2. Estado actual real

| Hecho | Etiqueta |
|---|---|
| Rama `main` = `origin/main` = `3121a0f`; contracts 0.18.0; migración 0019; sin cambios desde la FASE 2 | [CONFIRMADO POR CÓDIGO] |
| Una sola categoría implícita: inundación. No hay «categoría», «tipo» ni «temática» en ninguna capa | [CONFIRMADO POR CÓDIGO] |
| Las rutas ya tienen nombres neutros (`/api/v1/reportes`…); ninguna dice `inundaciones` | [CONFIRMADO POR CÓDIGO] |
| La auditoría ya usa `entidad = 'reporte'` | [CONFIRMADO POR CÓDIGO] |
| `reporte_foto`, `idempotencia` y `fusionado_en_id` tienen FK a `reporte_inundacion(id)` | [CONFIRMADO POR CÓDIGO] |
| `curichi_api` tiene `SELECT, INSERT, UPDATE` **por tabla** sobre los reportes (0008); los privilegios por columna existen solo en `usuario` | [CONFIRMADO POR CÓDIGO] |
| El mapa público (`Mapa.tsx`, `VistaMapa.tsx`) **no** nombra campos de inundación: una fuente con cluster y filtros en la `queryKey` | [CONFIRMADO POR CÓDIGO] |
| El formulario tiene 4 pasos y **solo el paso 2** es de dominio («¿Hasta dónde llegó y cada cuánto pasa?»), más los textos de los pasos 1 y 4 | [CONFIRMADO POR CÓDIGO] |
| Iconos: `lucide-react` 1.45.0 exporta `Waves`, `Trees`, `TrafficCone`, `Trash2` (y candidatos futuros) | [CONFIRMADO POR CÓDIGO] |

**Discrepancia corregida.** El informe 12 decía «privilegios por columna» para `curichi_api`. En la
tabla de reportes son por tabla. Quedó corregido en el 12 con una nota fechada.

---

## 3. Qué encontraste en el HTML

| Hallazgo | Etiqueta |
|---|---|
| Maqueta navegable empaquetada (4,3 MB): Leaflet 1.9.4, ~182 KB de JS propio, tres modos (celular, escritorio, panel) y ~30 pantallas | [CONFIRMADO POR HTML] |
| Objeto `MOD` con 4 módulos: `agua`, `verde`, `baches`, `basura` | [CONFIRMADO POR HTML] |
| Cada módulo trae icono Lucide, tres tonos, rampa, verbo, pregunta, dirección municipal, tipos, gravedad y tamaño | [CONFIRMADO POR HTML] |
| Selector `tablist` arriba del mapa | [CONFIRMADO POR HTML] |
| Al cambiar de módulo: conserva la vista, reinicia severidad y tipo, cierra los filtros y **re-tiñe toda la app** | [CONFIRMADO POR HTML] |
| El reporte hereda la categoría del mapa | [CONFIRMADO POR HTML] |
| Severidad de los módulos nuevos = gravedad declarada con empuje por tamaño, en la **misma escala de 4** | [CONFIRMADO POR HTML] |
| Muestra **solo** verificados en el mapa | [CONFIRMADO POR HTML] |
| La severidad del agua usa duración y afectación, **que la migración 0010 quitó** | [CONFIRMADO POR HTML] [CONFIRMADO POR CÓDIGO] |
| Gamificación; sin clustering; avisos sin `aria-live` | [CONFIRMADO POR HTML] |
| Detalle de escritorio con campos de agua fijos; indicadores que mezclan severidades | [CONFIRMADO POR HTML] |
| Incluye «Persona en situación de calle» como tipo de Áreas verdes | [CONFIRMADO POR HTML] |

Detalle completo en [13.1 §1–§3](13.1-analisis-html-y-ux.md).

---

## 4. Qué comportamiento del HTML recomiendo adoptar

[RECOMENDACIÓN]

- **Un solo mapa** con selector arriba.
- Inundaciones por defecto.
- **Conservar centro y zoom** al cambiar.
- **Reiniciar los filtros propios**.
- La categoría del reporte se hereda del mapa, con opción de cambiarla en el paso 1.
- Verbo y pregunta por categoría.
- **Paso «Qué pasa»** con tipo, gravedad y tamaño.
- **Severidad declarada que nunca baja** con empuje por tamaño, para las categorías nuevas.
- **Escala común de 4 bandas**.
- Pastillas «Todos + categorías **con conteo**» en Mis reportes y en el panel.
- «Lo atiende: …».
- Los iconos Lucide.
- La tarjeta «Cuatro módulos, un mismo sistema».

Ver [13.1 §5.1](13.1-analisis-html-y-ux.md).

---

## 5. Qué NO recomiendo copiar

[RECOMENDACIÓN]

| Elemento | Problema |
|---|---|
| Leaflet y polígonos aproximados | El real usa MapLibre y capas oficiales |
| Mapa solo con verificados | Contradice ADR 0006 |
| Severidad del agua con duración y afectación | Campos quitados en 0010 |
| Pin fijo sin control del dispositivo | Rompe el radio de 60 m y ADR 0007 |
| Gamificación | Fuera de alcance (§3.2) |
| Re-teñir toda la app | Rompe el foco y obliga a revalidar todo el contraste |
| Distritos teñidos por índice | Parece un dato y no lo es |
| Indicadores que mezclan escalas | — |
| Detalle con campos fijos | Debe salir de la definición |
| «Persona en situación de calle» en un mapa público | Privacidad y riesgo para personas vulnerables |
| Avisos sin `aria-live` | WCAG 4.1.3 |

Ver [13.1 §5.2–§5.4](13.1-analisis-html-y-ux.md).

---

## 6. UX/UI propuesta

[RECOMENDACIÓN]

| Pregunta | Respuesta |
|---|---|
| **¿Qué ve al entrar?** | El mapa con Inundaciones (`/?categoria=inundacion`) |
| **¿Dónde se elige la categoría?** | En un `tablist` bajo el buscador. En el celular se desplaza y mantiene la activa a la vista, con objetivos de 48 px. En escritorio, las 4 visibles en la columna izquierda |
| **¿Cuál está activa por defecto?** | Inundaciones. Recordar la última es [PENDIENTE DE DECISIÓN] |
| **¿Cómo cambia el mapa?** | Ver §13 |
| **¿Dónde está la leyenda?** | Pastilla abajo a la izquierda: icono, nombre de la categoría y cantidad. Se despliega con los estados («NO SE HA VERIFICADO», «Verificado») y el gris de UV sin verificados |
| **¿Cómo se ve un reporte?** | Chip de categoría, chip de severidad, chip de estado, foto, dirección, UV y distrito, **filas de la categoría** y nota de limitaciones |
| **¿Cómo se inicia uno nuevo?** | Botón «Reportar un bache» en el color de acento; la categoría viene del mapa |
| **¿Cómo cambia el formulario?** | Solo el paso 2 |
| **¿Celular y escritorio?** | Bocetos en [13.1 §8.2–§8.3](13.1-analisis-html-y-ux.md) |

---

## 7. Sistema de categorías

[RECOMENDACIÓN]

| Pieza | Dónde |
|---|---|
| **Definición declarativa** (`DefinicionCategoria`): slug, textos, icono (nombre), colores, esquema Zod, preguntas, severidad versionada, filtros, radio de recurrencia, campos públicos y de exportación, aviso de emergencia, nota metodológica, tipo de geometría | **`contracts`**: única fuente de tipos (§4.8) |
| **Catálogo** `categoria` (slug, `activa`, orden, quién la activó) | **Base**: integridad y activación por instalación, con auditoría |
| **Componentes especiales** (el paso 2 de inundación) | **Cada app**, registrados por slug |

**Regla:** el núcleo no pregunta `if (categoria === …)`; le pregunta a la definición.

Detalle en [13.2 §6](13.2-modelo-core-y-categorias.md).

---

## 8. Iconos y colores

[RECOMENDACIÓN] con medición [MEDIDO]

| | Inundaciones | Baches | Áreas verdes | Basura |
|---|---|---|---|---|
| slug | `inundacion` | `bache` | `area_verde` | `basura` |
| Icono | `Waves` | `TrafficCone` | `Trees` | `Trash2` |
| Principal (`c7`) | `#0A4A69` | `#7A4E1E` | `#0F6E5C` | `#6B3FA0` |
| Secundario (`c5`) | `#0D6189` | `#9C6A35` | `#2E8B76` | `#8462B8` |
| Tinte (`c1`) | `#E3EEF5` | `#F6EDE3` | `#E1F2EE` | `#F1EBF8` |
| Blanco sobre `c7` | 9,56 | 7,15 | 6,17 | 7,38 |
| Marcador, cluster y selección | Por severidad, tinta con anillo de severidad, anillo tinta: **iguales en las 4** | Ídem | Ídem | Ídem |

**Por qué:**

- matices fuera de la escala de severidad;
- el azul agua ya existe como *token*;
- el verde azulado se separa de la marca y de «baja»;
- el tierra evita el choque con «alta»;
- el violeta es el más lejano a toda la severidad.

**Peor par con daltonismo:** ΔE 22 (antes 2). Por eso el icono es obligatorio.

Para categorías futuras: **familias de color + icono propio**.

Ver [13.1 §4 y §6](13.1-analisis-html-y-ux.md). Los hex son punto de partida para diseño
[PENDIENTE DE DECISIÓN].

---

## 9. Arquitectura «Core + Categorías»

**El diagrama es correcto con correcciones** [INFERIDO]:

- la severidad tiene escala común y función por categoría;
- los puntos críticos tienen algoritmo común con radio y partición por categoría;
- las estadísticas se dividen en conteos comunes e indicadores del módulo;
- el mapa es núcleo parametrizado.

Además faltan en el diagrama piezas de núcleo:

- registro de categorías;
- visibilidad y jitter;
- cupos y antiabuso;
- ubicación del dispositivo;
- ETL;
- privacidad de fotos;
- exportación con nota.

Y aparece una pieza de módulo nueva: la **derivación**.

**No se crea un `packages/core`.** El núcleo ya está en `api-core`, `contracts`, `db` y
`geo-service`; lo que se hace es **sacar** el dominio de inundación a módulos [RECOMENDACIÓN].

Ver la clasificación completa en [13.2 §1–§2](13.2-modelo-core-y-categorias.md).

---

## 10. Modelo de datos recomendado

**Opción D, híbrido** [RECOMENDACIÓN].

**Columnas tipadas** (camino caliente y estadísticas comunes):

- `id`;
- `categoria` (FK al catálogo);
- `subtipo`;
- `geom` y `geom_publico`;
- `estado` y `publicar_en`;
- `severidad_*` (escala común; `severidad_version` por categoría);
- zona, fechas, autor, `punto_critico_id`, `ubicacion_*`.

**`detalle jsonb`** + `detalle_version`, con `CHECK jsonb_typeof = 'object'` y el Zod estricto de la
categoría (api-core es el único escritor).

**Por qué gana:**

| Contra | Gana por |
|---|---|
| A (tabla ancha) | Mantenimiento y `ENUM` |
| B (tabla por categoría) | Costo de sumar categorías |
| C (solo JSONB) | Integridad de lo común |

**Falta** un *spike* medido con 1 M × 4 categorías.

Ver [13.2 §4–§5](13.2-modelo-core-y-categorias.md).

---

## 11. Modelo de reporte recomendado

```text
Reporte (núcleo)
 ├── id (uuid, se conserva)          ├── estado / publicar_en / visibilidad (sin cambios)
 ├── categoria  (FK catálogo)        ├── severidad común: calculada (por la categoría), manual, motivo
 ├── subtipo    (de la categoría)    ├── fotos (reporte_foto, sin cambios)
 ├── ubicación: geom, geom_publico, distrito, UV, versión de capa, método, precisión, distancia
 ├── autor, fechas (creado, evento, publicar, validado)   ├── auditoría (entidad 'reporte')
 └── detalle (jsonb, validado por la categoría) + detalle_version
```

| Categoría | `detalle` |
|---|---|
| **Inundación** | Profundidad, frecuencia, causa y sumidero (lo de hoy) |
| **Bache** | Tamaño, gravedad declarada; por decidir: profundidad, posición, cantidad |
| **Área verde** | Tipo de problema, gravedad, «¿cuánto ocupa?»; más adelante, `area_ref` |
| **Basura** | Tipo, cantidad, gravedad; por decidir: antigüedad y peligro |

[RECOMENDACIÓN]; los campos por decidir son [PENDIENTE DE DECISIÓN].

---

## 12. Flujo de datos

El diagrama completo, con la anotación de núcleo y módulo, está en
[13.2 §7](13.2-modelo-core-y-categorias.md). Puntos clave [RECOMENDACIÓN]:

| Pregunta | Respuesta |
|---|---|
| **La categoría** | La declara el cliente y api-core la valida contra el catálogo activo |
| **La validación** | La hace el servidor con el Zod de la categoría; el cliente valida solo como UX |
| **La visibilidad** | `condicionPublico` **sin cambios**, más `categoria = $c` |
| **El mapa** | Una categoría por consulta |
| **El clustering** | En el cliente, sobre los datos de una categoría; en el servidor, DBSCAN con `PARTITION BY categoria` y radio por categoría |
| **Las estadísticas** | Conteos comunes; indicadores desde la definición. Se comparan bandas, nunca puntajes entre categorías |

---

## 13. Flujo del mapa

[RECOMENDACIÓN]. Ver [13.1 §7–§8.4](13.1-analisis-html-y-ux.md).

```text
Entrar ─▶ categoría = URL ?categoria o «inundacion»
       ─▶ GET reportes?categoria&bbox (TanStack Query, key con la categoría) ─▶ setData en la fuente con cluster
Cambiar Inundaciones → Baches:
  reportes : se reemplazan (caché o «Cargando baches…»; NUNCA los anteriores)
  filtros  : zona y bbox se conservan; severidad y tipo se reinician
  leyenda, iconos, botón y acentos: los de Baches; severidad y foco iguales
  vista    : centro y zoom se conservan
  selección: se limpia; se cierra el detalle y el panel de filtros
  barrios  : color por severidad verificada DE Baches
  URL      : ?categoria=bache (replaceState)
  aria-live: «Mostrando Baches: N puntos»
```

---

## 14. Flujo de creación de reporte

[RECOMENDACIÓN]

```text
Mapa (Baches) ─▶ «Reportar un bache» ─▶ [cuenta y cupo, como hoy]
 Paso 1  Ubicación (NÚCLEO): dispositivo ≤ 60 m o aproximada; UV en vivo; «Categoría: Baches · Cambiar»
 Paso 2  «Qué pasa» (MÓDULO): preguntas de la definición (tipo, gravedad, tamaño…) → severidad previa
 Paso 3  Foto con cámara + descripción (NÚCLEO)
 Paso 4  Revisar (NÚCLEO + filas del módulo) ─▶ POST /reportes {categoria, subtipo, detalle, …}
 Confirmación + cuenta regresiva de publicación (NÚCLEO, igual que hoy)
```

Inundación conserva su paso 2 actual como componente especial registrado.

---

## 15. Estrategia para formularios específicos

[RECOMENDACIÓN]

- **Declarativo por defecto.** Lista de preguntas de opción única o múltiple, con etiqueta, ayuda y
  referencia («como un plato»). Las genera un renderizador común; el Zod de la categoría valida.
- **Componente especial** solo cuando la interacción lo pida (la profundidad por referencia
  corporal y la lógica del sumidero de inundación).
- **Máximo 4 pasos.** El 2 es el único variable.
- **El borrador** (`lib/borrador.ts`, `sessionStorage`) guarda `categoria` y `detalle`.

Ver [13.2 §6](13.2-modelo-core-y-categorias.md).

---

## 16. Estrategia para áreas verdes y geometrías

| Opción | Decisión [RECOMENDACIÓN] |
|---|---|
| **G1 · `Point`** | **Ahora**, para todas. «¿Cuánto ocupa?» queda como atributo, que es lo que hace el prototipo [CONFIRMADO POR HTML] |
| **G2 · `Point` + `area_ref` por PIP** | **Después**, contra una capa de plazas y parques cargada por el ETL actual |
| G3 · polígono dibujado | No sin ADR: mala UX en el celular, imprecisión, y choca con el radio, el jitter, el DBSCAN y los clusters |
| G4 · línea | No sin ADR |
| G5 · geometría genérica | No sin ADR |

El esquema deja la puerta abierta: una futura `geom_extension` nullable, sin tocar `geom`.

**Pendiente:** ¿existe una capa municipal de áreas verdes? ¿Inventario de arbolado?
[PENDIENTE DE DECISIÓN]

Ver [13.2 §3.3](13.2-modelo-core-y-categorias.md).

---

## 17. Escalabilidad

**Del sistema** [INFERIDO a partir de lo MEDIDO en la FASE 2]:

- 4 categorías en la misma base multiplican filas y tráfico: el umbral del millón de reportes llega
  antes.
- Lo que crece mal es lo mismo de la FASE 2: el agregado por UV es lineal y el DBSCAN encadena.
  Con categorías se **particiona**, lo que achica cada cálculo.
- El listado del mapa por categoría es igual de barato (1–4 ms a 100 000 [MEDIDO]) si el índice
  incluye `categoria`. Hay que medirlo en M9.

**Del diseño:**

- La 5.ª categoría debería ser **agregar un módulo**: 5–8 archivos, 0 cambios en el núcleo.
- Las categorías futuras (alumbrado, señalización, transporte, mascotas…) entran **si son
  puntuales**. Las de línea o área piden el ADR de geometría.
- El color deja de alcanzar desde ~6 categorías: familias de color + icono.

[RECOMENDACIÓN]

---

## 18. Migración de inundaciones

**Expandir → convivir → contraer** [RECOMENDACIÓN]:

1. Catálogo.
2. **Renombre** a `reporte`, que conserva ID, FK de fotos e idempotencia, índices y *grants*
   [CONFIRMADO POR CÓDIGO].
3. Columnas nuevas.
4. **Copia** de los campos de inundación al `detalle`.
5. **Vista de compatibilidad** `reporte_inundacion` filtrada a inundación.
6. `punto_critico.categoria`.

**Verificación en una copia:** conteos, sumas, reconstrucción del 100 % y suites en verde. Con
respaldo restaurado y **vuelta atrás probada** mientras no haya otras categorías.

**Contracción (M10):** solo cuando ningún cliente use la forma vieja.

Ver [13.3 §3](13.3-plan-migracion.md).

### Compatibilidad hacia atrás

- **Sin `/api/v2`.**
- Por defecto, **sin `categoria` = `inundacion`** en todas las lecturas.
- `categoria=todas` explícito para el panel.
- `POST` con la forma plana = inundación.
- Respuestas aditivas: `categoria`, `subtipo`, `detalle`, con los campos planos durante una ventana.
- `contracts` 0.19 (aditivo) → 0.20 (contracción).

Ver [13.2 §8](13.2-modelo-core-y-categorias.md).

---

## 19. Roadmap

| Fase | Contenido | Para el usuario |
|---|---|---|
| **M0** | Decisiones y ADR 0008–0016; cerrar D3 y la incoherencia de `fusionado_en_id`; **aprobar la ampliación del alcance** | — |
| **M1** | Registro de categorías en `contracts`; inundación como primera definición | Sin cambios visibles |
| **M2** | Expandir la base (renombre, vista, columnas, relleno) | Sin cambios visibles |
| **M3** | Núcleo consciente de la categoría (api-core, `geo-service`, DBSCAN) | Sin cambios visibles |
| **M4** | Mapa y formulario multitemáticos (selector oculto con una sola categoría) | Sin cambios visibles |
| **M5** | Panel por categoría | Sin cambios visibles |
| **M6** | **Baches** | Primera categoría nueva |
| **M7** | **Basura** | — |
| **M8** | **Áreas verdes (punto)** | — |
| **M9** | Medición con 4 categorías y 1 M de filas | — |
| **M10** | Contraer | — |
| **M11** | Áreas verdes con capa | — |

Metas verificables y niveles en [13.3 §2](13.3-plan-migracion.md).

---

## 20. Riesgos

Los principales, con la matriz completa en [13.3 §6](13.3-plan-migracion.md):

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Migración de datos | Media | **Muy alto** | Expandir y contraer, copia, sumas, respaldo, vuelta atrás |
| Contaminación entre categorías | Media | Alto | Por defecto `inundacion`, datos por categoría, vista filtrada, semilla superpuesta en las pruebas |
| Acoplamiento a inundaciones | Alta | Alto | Inundación a módulo primero, con la suite como red |
| Geometrías de áreas verdes | Media | Alto | `Point` primero, `area_ref` después |
| Privacidad («persona en situación de calle», fotos con personas) | Media | Alto | Excluir esa categoría; avisos; Zod estricto |
| Confusión de colores | Alta sin icono | Medio | Icono obligatorio, paleta medida |

---

## 21. Testing

[RECOMENDACIÓN]. Plan en [13.3 §4](13.3-plan-migracion.md).

| Tipo | Qué |
|---|---|
| Unitarias | Por definición; invariantes del registro, **incluido el contraste** |
| Integración | Forma vieja = inundación; categoría inactiva → 422; fusión entre categorías → 409 |
| Visibilidad | Prueba de tabla extendida a **rutas × estados × categorías** |
| Base de datos | Migración desde cero, idempotente y con vuelta atrás |
| PostGIS | DBSCAN particionado |
| **No contaminación** | Semilla con las 4 categorías en las mismas coordenadas |
| E2E | Cambio de categoría y reporte de bache |
| Accesibilidad | `axe`, teclado, `aria-live` |
| Rendimiento | 1 M × 4 |
| Seguridad | Auditor SDD |
| Migración | Ensayo en una copia |

---

## 22. Criterios de aceptación

Lista verificable completa (categorías, reportes, datos y migración, arquitectura, calidad) en
[13.3 §5](13.3-plan-migracion.md). Destacan:

- [ ] Inundaciones por defecto.
- [ ] Un bache jamás aparece en Inundaciones: ni en los puntos, ni en los clusters, ni en los
  agregados, ni en la exportación, ni en la vista vieja.
- [ ] Centro y zoom se conservan al cambiar.
- [ ] Todos los reportes migrados conservan ID, fotos, auditoría, fechas, ubicación y estado.
- [ ] Los clientes sin `categoria` funcionan como hoy.
- [ ] Una «categoría sintética» de prueba se agrega con ≤ 8 archivos y sin tocar el núcleo.

---

## 23. ADRs necesarios

| ADR | Tema | Recomendación |
|---|---|---|
| 0008 | Modelo genérico | D, híbrido |
| 0009 | Registro de categorías | `contracts` + catálogo |
| 0010 | Geometría | G1, luego G2 |
| 0011 | Formularios | Declarativo + especiales |
| 0012 | Mapa | Uno, datos por categoría |
| 0013 | Migración | Renombre + vista + expandir y contraer |
| 0014 | Compatibilidad de API | Aditivo en v1, por defecto `inundacion` |
| 0015 | Paleta e iconografía | Solo acentos, icono obligatorio |
| 0016 | Cupos multi-categoría | Global al empezar |

Más dos futuros: marca y nombre; derivación y órdenes de trabajo.

Cada uno con problema, opciones e información faltante en [13.3 §8](13.3-plan-migracion.md).
**No se escribieron todavía:** falta información.

---

## 24. Archivos que eventualmente deberán modificarse

Lista exacta por paquete en [13.3 §7.1](13.3-plan-migracion.md) [CONFIRMADO POR CÓDIGO]. Resumen:

| Paquete | Archivos |
|---|---|
| `contracts` | 9 (`esquemas/reporte.ts`, `dominio/severidad.ts`, `dominio/enums.ts`…) |
| `db` | 9 + migraciones |
| `api-core` | 12 (consultas, vistas, visibilidad, rutas de reportes, moderación, admin, ejecutivo, fotos, configuración…) |
| `geo-service` | 3 |
| `web-ciudadano` | ~16 (`FormularioReporte.tsx`, `HojaDetalle.tsx`, `TarjetaReporte.tsx`, `VistaMapa.tsx`, `Mapa.tsx`, `LeyendaMapa.tsx`…) |
| `panel-admin` | ~11 |
| `e2e` | Ayudas y especificaciones |
| `scripts` | `banco-*` (en M9) |
| `CLAUDE.md` | Con autorización |

---

## 25. Archivos que deberían crearse

[RECOMENDACIÓN] Ver [13.3 §7.2](13.3-plan-migracion.md).

- ADR 0008–0016.
- `docs/dominio/{baches,areas-verdes,basura}.md`.
- `packages/contracts/src/categorias/` (tipos, registro, núcleo y una carpeta por categoría con
  definición, esquema, severidad y pruebas).
- Las migraciones de expandir y contraer, con sus pruebas.
- `apps/*/src/categorias/`.
- `e2e/tests/categorias-*.spec.ts`.

---

## 26. Qué NO debe modificarse todavía

1. **Nada** antes de aprobar M0.
2. **La máquina de estados, la visibilidad, la publicación diferida, el jitter y la ubicación del
   dispositivo**: pasan al núcleo **tal cual**.
3. La severidad v2 de inundación: se mueve, no se cambia.
4. Los identificadores `curichi_*`.
5. Los benchmarks, hasta M9.
6. `CLAUDE.md` sin autorización. Hoy su §3 excluye el multi-categoría.

[RECOMENDACIÓN] Ver [13.3 §9](13.3-plan-migracion.md).

---

## 27. Información que todavía necesito decidir como producto

> **Nota del 2026-10-07 (respuestas de M0):** respondidas la 1 (alcance ampliado), la 3 (**última categoría del dispositivo**, no siempre Inundaciones), la 4 (reiniciar severidad), la 5 (**cupo por categoría**), la 6 (**se mantiene** «persona en situación de calle») y la 9 (sin capa: **`Point`**). Ver [14 §1 y §8](14-decisiones-m0-y-plan-m1.md).


Todas son [PENDIENTE DE DECISIÓN].

1. **¿Aprobás ampliar el alcance** de la Misión 1 (CLAUDE.md §3 y regla de oro 11) para
   multi-categoría?
2. **Nombre** de la plataforma: ¿sigue siendo «Mi Curichi»?
3. **Al entrar**: ¿siempre Inundaciones o la última categoría usada en el dispositivo?
4. Al cambiar de categoría, ¿**se reinicia** el filtro de severidad (como el prototipo) o se
   conserva?
5. **Cupo diario**: ¿3 en total o por categoría?
6. **«Persona en situación de calle»**: ¿se excluye (recomendado) o va por un canal no público?
7. **Campos de cada categoría** y su severidad. Validarlos con Mantenimiento vial, Parques y
   jardines, y Aseo urbano:
   - tamaño, profundidad, posición y cantidad (baches);
   - antigüedad y peligro (basura);
   - tipos (áreas verdes).
8. **Radio de recurrencia** por categoría (agua 25 m; ¿baches 5–10 m?).
9. **¿Existe una capa de áreas verdes** (plazas y parques) del GAMSCS? ¿Hay inventario de arbolado?
10. **Derivación**: ¿«Lo atiende: …» se muestra al vecino? ¿Hay un proceso real detrás?
11. **Técnicos por categoría** o técnicos para todas.
12. **Activación por ciudad**: ¿desde el panel (catálogo) o por configuración?
13. **Paleta final** (los hex son punto de partida) y si «Resuelto» sigue siendo azul agua.
14. **Ciclo de vida corto** en basura: ¿cierre o caducidad automática?
15. **Cuenta al final** del flujo (prototipo) o antes (hoy): recomendado mantener «antes».
16. **«Me pasa a mí»** (sumarse a un punto): ¿entra en el alcance? (No recomendado en el primero.)
17. **¿Puede cambiarse la categoría** de un reporte después de creado? ¿Solo el técnico, con
    auditoría?

---

## 28. Recomendación final

**Una plataforma, cuatro módulos** [RECOMENDACIÓN].

- No hay razón arquitectónica para cuatro apps, APIs o bases: comparten el 100 % del núcleo y el
  cuello medido es la base y el tamaño de las respuestas, no las fronteras.
- Lo correcto es convertir **inundación en el primer módulo**, sin cambiar su comportamiento, sobre
  un núcleo que ya existe. Después se encienden Baches, Basura y Áreas verdes (con punto) como
  **definiciones**.

**El orden más seguro:**

1. **M0**: tus decisiones de §27, la ampliación del alcance y los ADR.
2. **M1–M3**: contrato, base y núcleo, sin cambios visibles.
3. **M4 y M5**: mapa y panel, con el selector oculto mientras haya una sola categoría.
4. **M6 Baches** como piloto.
5. **M7 y M8**.
6. **M9**, medir.
7. **M10**, contraer.

**El prototipo HTML queda como referencia de experiencia**: selector, herencia de la categoría,
paso «qué pasa», severidad común. **No** es una especificación técnica.

**Próximo paso propuesto:** que respondas §27, o al menos las preguntas 1, 3, 4, 5, 6 y 9. Con eso
escribo los ADR 0008–0016 y el plan de M1 para tu aprobación, sin programar nada todavía.
