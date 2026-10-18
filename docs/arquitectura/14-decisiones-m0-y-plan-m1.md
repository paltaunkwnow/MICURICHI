# 14 · Decisiones de M0, cambios a la arquitectura y plan de M1

> 2026-10-07. Incorpora las respuestas del usuario a [13 §27](13-planificacion-plataforma-multitematica.md).
> **Es solo planificación:** no se implementó nada de la plataforma.
>
> - Las ADR propuestas están en [14.1](14.1-adr-propuestos.md).
> - Los documentos 13, 13.1, 13.2 y 13.3 conservan su texto original, con notas fechadas que apuntan
>   acá. **Donde este documento difiera, manda este.**
>
> Etiquetas: las de [13](13-planificacion-plataforma-multitematica.md):
> [CONFIRMADO POR CÓDIGO], [CONFIRMADO POR HTML], [MEDIDO], [INFERIDO], [RECOMENDACIÓN],
> [PENDIENTE DE DECISIÓN]. Se agrega **[DECIDIDO POR EL USUARIO]**.

---

## 1. Decisiones aprobadas

Todas [DECIDIDO POR EL USUARIO], el 2026-10-07.

| # | Pregunta (13 §27) | Decisión |
|---|---|---|
| 1 | ¿Ampliar el alcance de la Misión 1? | **Sí.** La Misión 1 pasa a ser una **plataforma municipal multitemática de reportes georreferenciados** con 4 categorías iniciales (Inundaciones, Baches, Áreas verdes, Basura). La arquitectura queda preparada para las 4; la implementación es **incremental**, según el roadmap |
| 3 | Categoría al entrar | **La última usada en ese dispositivo.** Si no hay ninguna guardada, Inundaciones. Si la guardada ya no está disponible, Inundaciones. **Nunca** se abre una categoría inactiva. Es una preferencia **del dispositivo**, no de la cuenta |
| 4 | Filtro de severidad al cambiar | **Se reinicia**, junto con los filtros propios de la categoría. Se conservan centro, zoom y zona; se limpia la selección; se actualizan leyenda, iconos, contexto visual y URL |
| 5 | Cupo diario | **3 reportes por día, por usuario y por categoría** (hasta 12 por día entre las 4). Es una decisión inicial: tiene que poder cambiarse a global, por hora, por ubicación, etc. **Sin el número repetido en el código** |
| 6 | «Persona en situación de calle» | **Se mantiene.** No se elimina, no pasa a ser una categoría propia y no cambia de comportamiento sin autorización. Los riesgos se documentan y quedan **pendientes** |
| 9 | ¿Capa municipal de áreas verdes? | **No hace falta por ahora.** Áreas verdes usa el mismo mapa base y un **`Point`**. Sin polígonos, líneas, dibujo, delimitación ni detección automática de parques. Una capa o geometría futura irá por ADR |

**Propuesta del usuario sobre la URL** (§3.2): `URL explícita → categoría guardada → Inundaciones`.
**Se confirma técnicamente**, con tres precisiones de detalle.

---

## 2. Revisión de cada decisión

### 2.1 Persistencia de la última categoría

**Opciones:**

| Mecanismo | Lectura | Persistencia | Viaja al servidor | Veredicto |
|---|---|---|---|---|
| **`localStorage`** | **Síncrona**: se lee antes de pedir datos | Sí, por origen y perfil del navegador | No | **Elegido** |
| IndexedDB | Asíncrona: un ciclo más antes de saber qué pedir | Sí | No | Excesivo para una cadena corta |
| `sessionStorage` | Síncrona | **No**: se pierde al cerrar la pestaña | No | No cumple «al volver a entrar» |
| Cookie | En el servidor y en el cliente | Sí | **Sí, en cada petición** | Permitiría pintar en el servidor, pero manda una preferencia de UX al servidor sin necesidad |
| Cuenta del usuario | Requiere sesión | Sí | Sí | **Descartado por decisión**: la preferencia es del dispositivo |

**Diseño [RECOMENDACIÓN]:**

- **Clave:** `micurichi.mapa.categoria`, valor JSON `{ "v": 1, "slug": "bache" }`. La versión `v`
  permite migrar el formato.
- **Lectura y escritura** dentro de `try/catch`. En navegación privada, con el almacenamiento
  bloqueado o lleno, se sigue sin preferencia. Nunca debe romper el mapa.
- **Validación.** El valor se acepta solo si es un slug conocido **y activo** según
  `GET /configuracion`.
  - Hoy esa configuración ya llega del servidor a la app [CONFIRMADO POR CÓDIGO: `ciudad-servidor.ts`,
    `ciudad-contexto.tsx`]; se le suma `categorias_activas`.
  - Así la validación es **síncrona** en el cliente.
- **Primer pintado.** El mapa ya se monta solo en el cliente (`MapaDiferido`, `next/dynamic`
  [CONFIRMADO POR CÓDIGO]). La categoría se resuelve **antes** de la primera petición de reportes, así
  que **no** se piden ni se muestran datos de otra categoría.
  - El selector puede pintar un estado neutro durante la hidratación, para no mostrar Inundaciones un
    instante y saltar a Baches.
- **Alcance.** Solo el mapa público lee y escribe la preferencia. Mis reportes, el detalle y el panel
  no.
- **Privacidad.** Es una preferencia de interfaz, no un dato personal. No se manda al servidor ni a
  la analítica.

### 2.2 Prioridad entre la URL y la categoría guardada

**Confirmado** [RECOMENDACIÓN]:

```text
1. ?categoria= válida Y activa   → usarla
2. categoría guardada válida Y activa → usarla
3. Inundaciones
   (si Inundaciones estuviera inactiva en esa instalación: la primera activa según el orden del catálogo)
```

**Precisiones técnicas:**

1. **Alias de URL.** Los ejemplos del usuario mezclan formas (`inundacion`, `baches`,
   `areas-verdes`).
   - El **slug interno** se mantiene en `snake_case` singular (CLAUDE.md §12.1): `inundacion`,
     `bache`, `area_verde`, `basura`.
   - La URL acepta **alias**: plural, guiones, mayúsculas, sin tildes (`baches`, `areas-verdes`,
     `area-verde`, `Inundaciones`…).
   - Se **normaliza** y la barra de direcciones se reescribe con la forma pública, con
     `history.replaceState` (no ensucia el botón atrás).
   - Forma pública propuesta: `inundacion`, `bache`, `area-verde`, `basura`
     [PENDIENTE DE DECISIÓN menor].
2. **URL inválida o de una categoría inactiva.** Se ignora; se cae al paso 2 o al 3. La URL se corrige
   a la categoría efectiva y se anuncia en `aria-live` («Esa categoría no está disponible: mostrando
   Inundaciones»).
3. **Qué se guarda.**
   - La categoría **efectiva que se muestra** se guarda como «última usada», también cuando llega por
     un enlace compartido. Es la lectura literal de «la última categoría que utilizó en ese
     dispositivo» [PENDIENTE DE DECISIÓN menor; alternativa: guardar solo lo elegido en el selector].
   - Si no hay `?categoria`, se **agrega** la efectiva a la URL (`replaceState`), para que el enlace
     siempre se pueda compartir.

### 2.3 Filtros globales y filtros de categoría

[RECOMENDACIÓN] sobre la decisión 4.

| Filtro o estado | Tipo | Al cambiar de categoría | Motivo |
|---|---|---|---|
| Centro, zoom, `bbox` | **Global** | Se conserva | La persona sigue en su barrio |
| Zona elegida (distrito o UV al tocar el mapa) | **Global** | Se conserva | «Mantener zona visible» |
| Capa de fondo (distritos y UV, solo distritos, sin capa) | **Global** | Se conserva | Es del mapa, no del dato |
| Severidad | Categoría | **Se reinicia** («Todas») | Decisión 4 |
| Subtipo («¿Qué se reportó?») | Categoría | **Se reinicia** | Cada categoría tiene los suyos |
| Filtros propios de la definición (frecuencia en inundación, cantidad en basura…) | Categoría | **Se reinician** | Ídem |
| Punto crítico elegido (`puntoCritico`) | Categoría | **Se reinicia** | Los grupos son por categoría |
| Reporte elegido y hoja de detalle | Categoría | **Se limpia y se cierra** | Es de la otra categoría |
| Panel de filtros abierto | Interfaz | Se cierra | Sus opciones cambian |
| Coloreo de UV (severidad verificada) | Categoría | Se recalcula | Agregados por categoría |

**Regla para el código futuro.** Cada `FiltroDef` declara `alcance: 'global' | 'categoria'`. El
cambio de categoría conserva solo los globales. Nada de listas sueltas.

**La URL refleja todo:** `?categoria=bache&uv=…`. Los filtros de categoría se quitan de la URL al
cambiar.

### 2.4 Experiencia del selector

[RECOMENDACIÓN]

- **Orden fijo:** Inundaciones, Baches, Áreas verdes, Basura (el del usuario). Se muestran **solo las
  activas**.
- **Con una sola activa, el selector se oculta.** Así M1–M5 no cambian nada visible.
- **Abrir directamente en Basura** (4.º, por la preferencia guardada): la pastilla activa se desplaza
  a la vista al montar (`scrollIntoView` sin animación).
- **Accesibilidad:**
  - `role="tablist"`, con flechas izquierda y derecha, Inicio y Fin;
  - objetivo de 48 px;
  - foco visible (el de la marca, no el color de la categoría);
  - anuncio `aria-live` «Mostrando Baches: N puntos».
- **Sin conteos por categoría en el mapa público.** Exigirían 4 consultas en cada carga, contra «la
  página pública sin tráfico automático» (§8.2 del manual). Los conteos van en Mis reportes y en el
  panel.
- **Iconos y acentos:** los de 13.1 §6, pendientes de diseño.

### 2.5 Comportamiento del mapa

Sin cambios respecto de 13.1 §7–§8.4 salvo dos ajustes:

- la categoría **inicial** sale de §2.2 (antes: siempre Inundaciones);
- la tabla de filtros sale de §2.3.

Se mantiene la regla técnica clave: **cambiar los datos de la fuente**, no un filtro de capa, y
**no** mostrar datos de la categoría anterior mientras carga [CONFIRMADO POR CÓDIGO: cluster en la
fuente, `Mapa.tsx`].

### 2.6 Política de cupos

**Hoy** [CONFIRMADO POR CÓDIGO]:

- El `3` vive en un solo lugar: `CONFIG_DOMINIO.REPORTES_POR_DIA_POR_CUENTA`.
- Se puede reemplazar por la variable de entorno del mismo nombre (`api-core/src/config.ts`).
- Lo aplica `api-core/src/cuota.ts` sobre `cuota_reporte_diaria (usuario_id, dia)`, con un *upsert*
  atómico (0014).
- El mismo contador fija la **demora** de publicación: 60 s el 1.º, 240 s el 2.º y el 3.º.
- `/auth/yo` devuelve `reportes_restantes_hoy`, `demora_proximo_s` y `puede_reportar_desde`, **de la
  cuenta**.

**Diseño propuesto [RECOMENDACIÓN].** Una política configurable, no un número.

```ts
// CONCEPTUAL (contracts). Cada regla produce una CLAVE de contador; todas deben cumplirse.
interface ReglaCupo {
  id: string;                                   // 'reportes-por-categoria'
  ambito: 'cuenta' | 'cuenta+categoria' | 'cuenta+categoria+uv';  // extensible: '+hora', '+zona'…
  ventana: 'dia_local' | 'hora';                // día calendario en ZONA_HORARIA (como hoy)
  limite: number;                               // 3 por defecto; reemplazable por instalación
}
// Política inicial (decisión 5): [{ id:'reportes-por-categoria', ambito:'cuenta+categoria', ventana:'dia_local', limite:3 }]
// Cada definición de categoría puede reemplazar el límite; la instalación también (variable de entorno o catálogo).
```

**En la base (M2):** un contador genérico.

```text
cupo_contador (usuario_id, clave text, ventana_inicio timestamptz, n)
clave = «reportes:categoria:bache»
```

- Usa el mismo *upsert* atómico de hoy, una vez por regla, dentro de la transacción del reporte.
- Si una regla cambia de global a por categoría, o a por hora, **solo cambia la configuración**.

**Consecuencias que hay que decidir:**

| Tema | Propuesta | Estado |
|---|---|---|
| **Demora de publicación** | Se calcula con el contador **de la categoría**: el 1.º del día en Baches espera 60 s aunque ya haya reportado inundaciones. Alternativa: con el total de la cuenta | [PENDIENTE DE DECISIÓN] |
| **Cupo de fotos** (12 por día y por cuenta) | Con 12 reportes posibles por día, 12 fotos dan una por reporte. Mantener 12 global o pasar a **12 por categoría** | [PENDIENTE DE DECISIÓN] |
| **`/auth/yo`** | Se suma `cupos: { inundacion: {restantes, demora_proximo_s, puede_reportar_desde}, … }`. Los campos actuales se mantienen como los de **inundación** (compatibilidad) | [RECOMENDACIÓN] |
| **`429 CUOTA_DE_REPORTES`** | Suma `categoria` en el cuerpo; `Retry-After` hasta la medianoche, como hoy | [RECOMENDACIÓN] |
| **Antiabuso** | El techo diario por cuenta pasa de 3 a 12; el límite por IP (10 por hora) no cambia. Habrá hasta 4× más carga de moderación. Vigilar con la alerta de bandeja atrasada | [INFERIDO] |
| **Interfaz** | `CupoAgotado` y «Te quedan N de 3» pasan a ser por categoría (`lib/cupo.ts`) | [RECOMENDACIÓN] |

### 2.7 «Persona en situación de calle»

**Decisión:** se mantiene, como **subtipo de Áreas verdes** (como en el prototipo). No es una
categoría propia y no cambia de comportamiento sin autorización. [DECIDIDO POR EL USUARIO]

**Su comportamiento por defecto**, cuando se implemente, es el del prototipo [CONFIRMADO POR HTML]:

- un subtipo más de Áreas verdes, con la nota «Esto no es una denuncia. Se deriva a Desarrollo Social
  para ofrecer ayuda, no a seguridad. No subas fotos donde se vea la cara de la persona»;
- derivado a «Desarrollo Social».

**Riesgo que hay que documentar** [INFERIDO]:

- Con las reglas actuales del sistema real (ADR 0006), todo reporte se publica **solo** a los 60 o
  240 s como «NO SE HA VERIFICADO».
- El jitter solo se aplica a `vivienda_o_predio`.
- Por lo tanto, **la ubicación de una persona vulnerable sería pública en minutos**, sin revisión
  previa. Eso tensiona la regla de oro 8 («la ubicación de un reporte es dato sensible») y §13 del
  manual.
- Que en el prototipo no se vea depende de que el prototipo **solo** publica lo verificado.

**Propuesta [RECOMENDACIÓN].** No se cambia nada ahora, por la decisión. Se agrega una **puerta antes
de producción** (no antes de desarrollo): para activar Áreas verdes en producción, decidir en el
ADR 0018:

1. visibilidad de este subtipo: igual que el resto, solo técnicos, solo tras validación, o ubicación
   agregada a nivel de UV;
2. fotos: permitidas, prohibidas o con difuminado (backlog);
3. moderación prioritaria;
4. retención;
5. marco legal de datos personales en Bolivia `<a confirmar>`.

En local, en pruebas y en piloto interno, el subtipo funciona como el resto.

### 2.8 Áreas verdes

**Confirmado** [DECIDIDO POR EL USUARIO]:

- `Point`, igual que las demás;
- mapa base actual;
- **sin dependencia** de una capa municipal;
- sin polígonos, líneas, dibujo ni detección de parques.

Coincide con la opción **G1** de 13.2 §3.3. La G2 (`area_ref` por PIP) **sale del roadmap** y va al
backlog, con su ADR futuro.

**Detalle [RECOMENDACIÓN]:**

- **Subtipos:** los del prototipo (plaza descuidada, juegos rotos, árbol caído o rama peligrosa, pasto
  sin riego, persona en situación de calle).
- **Atributos:** «¿Cuánto ocupa?» y la gravedad.
- **`ubicacion_tipo` por defecto:** «vía o espacio público» (sin jitter), como baches.
- **«Árbol caído sobre cables o una casa»:** aviso de emergencia (como el agua con 911).

---

## 3. Qué cambia respecto de las recomendaciones anteriores

| Tema | Antes (13, 13.1, 13.2, 13.3) | Ahora | Efecto en la arquitectura |
|---|---|---|---|
| Alcance | Bloqueado por CLAUDE.md §3 | **Ampliado** | Hay que editar `CLAUDE.md` (§1, §2, §3, §15 en M0; §7, §9 y §13 cuando aterricen M2 y M3), **con tu autorización** |
| Categoría inicial | Siempre Inundaciones (recordar, abierto) | **Última del dispositivo**, con prioridad URL → guardada → Inundaciones | +1 módulo de preferencia en el cliente; `/configuracion` con `categorias_activas` pasa a ser **necesario**; alias de URL |
| Filtro de severidad | Reiniciar (recomendado) | **Reiniciar** (decidido) | Sin cambios; se formaliza el alcance de cada filtro (§2.3) |
| Cupo | Global al empezar (recomendado) | **Por categoría** y configurable | **Cambia M2 y M3**: contador genérico con clave, `/auth/yo` y `429` por categoría, interfaz de cupo; decidir demora y fotos |
| «Persona en situación de calle» | Excluir del mapa público (recomendado) | **Se mantiene** como subtipo | Sin cambio de modelo; **puerta de privacidad antes de producción** (ADR 0018) |
| Áreas verdes | G1 ya, G2 con capa (M11) | **G1**; **M11 sale** del roadmap | Simplifica: no se espera ninguna capa |
| Slugs | `inundacion`, `bache`, `area_verde`, `basura` | Iguales en el interior, con **alias en la URL** | Normalizador en `contracts` |
| Numeración de ADR | 0008–0016 (13.3 §8) | **0008–0022** (14.1) | 13.3 §8 queda como antecedente |

### ¿Alguna decisión contradice decisiones previas?

| Decisión previa | Choque | Resolución |
|---|---|---|
| **CLAUDE.md §3 y regla de oro 11** (alcance cerrado) | Directo | Resuelto por la decisión 1. Falta reflejarlo en el texto del manual (M0, con autorización) |
| **CLAUDE.md §2, §7.1, §7.2, §7.5 y §13**: «3 reportes por cuenta y por día», «demora: 1.º del día **de la cuenta**», `cuota_reporte_diaria (usuario_id, dia)` | Directo con la decisión 5 | Se actualizan cuando se implemente (M2 y M3), con autorización |
| **ADR 0006** (publicación sin moderación previa) + **regla de oro 8** + **§13** (ubicación sensible) | **Tensión** con «persona en situación de calle» | No se cambia nada ahora; **puerta antes de producción** (ADR 0018) |
| **§8.2 «la página pública sin tráfico automático»** | Ninguno: guardar la preferencia es local | Sin conteos por categoría en el mapa público (§2.4) |
| ADR 0004 (una instalación por ciudad) | Ninguno | Las categorías se activan por instalación |
| ADR 0007 (ubicación aproximada) | Ninguno | Aplica igual a las 4 |

---

## 4. Misión 1 ampliada y diagrama

**Misión 1 (propuesta de redacción para CLAUDE.md §1 y §3).** Hay que aprobarla para editar el
manual:

> **Mi Curichi** pasa a ser una **plataforma municipal multitemática de reportes ciudadanos
> georreferenciados**: el vecino marca dónde está el problema, saca una foto y carga los datos; el
> sistema lo publica como «NO SE HA VERIFICADO» tras una demora corta, lo valida, lo clasifica por
> severidad y lo muestra en un mapa cruzado con la división oficial.
>
> Categorías iniciales: **Inundaciones, Baches, Áreas verdes y Basura**, sobre **un mismo núcleo**.
> La implementación es incremental (roadmap de `docs/arquitectura/14`): **Inundaciones** es la
> categoría en funcionamiento; las demás se activan por instalación cuando se completen sus fases.
> No hay sistemas clonados por categoría.

### Diagrama

Ajustado al código real [RECOMENDACIÓN]:

```text
                              PLATAFORMA (una instalación por ciudad, ADR 0004)
                                              │
              ┌───────────────────────────────┴───────────────────────────────┐
              │                                                               │
            NÚCLEO                                                   CATEGORÍAS (módulos)
              │                                                               │
  ├── contracts: tipos, validación, severidad COMÚN,             registro: contracts/src/categorias/
  │   máquina de estados, visibilidad, registro                        │
  ├── api-core: usuarios, sesión, roles, reportes,       ┌─────────────┼─────────────┬─────────────┐
  │   publicación diferida, moderación, fotos,         Inundaciones    Baches     Áreas verdes    Basura
  │   auditoría, cupos (POLÍTICA), antiabuso,             (módulo 1)              (Point; subtipo
  │   exportación, indicadores comunes                                            «persona en
  ├── geo-service: PIP, capas con huella, teselas,                                situación de
  │   agregados y puntos críticos POR CATEGORÍA                                   calle»)
  ├── db: esquema, migraciones, DBSCAN particionado      Cada una define: icono, color de acento,
  ├── geodata-etl: capas (sin dominio)                   subtipos, preguntas, campos (detalle),
  ├── web: mapa (1, con selector), formulario            filtros de categoría, severidad (función),
  │   (pasos 1, 3 y 4), detalle                          radio de recurrencia, política de cupo,
  ├── panel: bandeja, moderación, «Todas + categoría»    campos públicos y de exportación, avisos
  └── infra, CI, observabilidad, seguridad
```

**Diferencias con el diagrama del usuario:**

- **la severidad común, la visibilidad y la política de cupos** van al núcleo;
- **la función** de severidad y **el límite** de cupo, a la categoría;
- **el clustering** está en el núcleo, pero **particionado** por categoría;
- **el registro de categorías** vive en `contracts`;
- no hay un `packages/core` nuevo (13.2 §9).

---

## 5. Roadmap actualizado

> **Actualización posterior del 2026-10-15 — M5 aprobada:** el usuario aprobó
> `docs/sdd/2026-10-15-panel-por-categoria/plan.md`, con inicio en Inundaciones, detalle/ficha
> completos e historial completo en «Todas». Autorizó por separado seis archivos de contracts
> para corregir la exportación multitemática (0.22.0); ver `ampliacion-exportacion.md` en esa
> corrida. **Cierre consolidado el 2026-10-17:** M5.0–5.5 y revisión independiente completas,
> panel 551/52, E2E 132/132 e integridad/limpieza confirmadas. La expectativa de enlace E2E
> aprobada en `ampliacion-e2e-mapa.md` pasó G4 completo posterior 43/43. Ver `informe.md`.
> M6 Baches requiere plan y decisiones de campos/severidad/radio. No se activan
> categorías, no hay despliegue y no se hacen nuevos commits/push.

> **Actualización del 2026-10-15:** M4 cerrada y verificada en local; evidencia en
> `docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/informe.md`. Incluye la corrección
> aprobada Zod/CSP de ambas apps, sin relajar la política. Se conservan rojos ajenos y una
> intermitencia inicial de cámara. M5 tiene plan propuesto en
> `docs/sdd/2026-10-15-panel-por-categoria/plan.md`, pendiente de decisiones/aprobación y FB.
> No se implementa M5 por cerrar M4 ni se activan categorías nuevas.

> **Nota del 2026-10-09 (avance).** Todo sin commit, a pedido del usuario: se commitea al final.
>
> | Fase | Estado | Corrida |
> |---|---|---|
> | M0 | hecha | — |
> | M1 | verificada | `docs/sdd/2026-10-07-registro-de-categorias/` |
> | M2 | verificada | `docs/sdd/2026-10-08-base-multicategoria/` |
> | M3a, lecturas por categoría | verificada | `docs/sdd/2026-10-08-nucleo-por-categoria/`, que tiene el plan completo de M3 |
> | M3b, escrituras y cupo por categoría | verificada (2026-10-10) | `docs/sdd/2026-10-09-cupo-por-categoria/` |
> | M4, mapa y formulario por categoría (web) | implementada; falta la verificación final | `docs/sdd/2026-10-10-mapa-y-formulario-por-categoria/` |
>
> `contracts` está en la 0.21.0 (M4: `textos?` por categoría) y la base, en la migración 0021. Las E2E de navegador corrieron por primera vez en la
> verificación de M3b: 87/87. Para eso, `PLAYWRIGHT_BROWSERS_PATH` se fija solo en los comandos, por la virtualización
> de AppData de la app de Claude, como se anota en las corridas de M3a y M3b.

| Fase | Qué | Para el usuario final | Cambio respecto de 13.3 |
|---|---|---|---|
| **M0** | Aprobar las ADR de 14.1; autorizar la edición de `CLAUDE.md` (§1, §2, §3, §15); decidir lo menor que bloquea M1 (§6); materializar las ADR aprobadas | — | Suma: alcance aprobado, ADR 0008–0022, decisiones menores |
| **M1** | Registro de categorías y **políticas** (cupo, filtros con alcance, alias de slug) en `contracts`, sin cambio de comportamiento | Nada | Suma `ReglaCupo`, `FiltroDef.alcance`, normalizador de slug |
| **M2** | Expandir la base: catálogo, renombre + vista, `categoria`/`subtipo`/`detalle`, **contador de cupo genérico** | Nada | Suma `cupo_contador` |
| **M3** | Núcleo consciente de la categoría: unión discriminada, filtro por categoría, **cupo por categoría**, `/auth/yo` con `cupos`, fusión dentro de la categoría, DBSCAN particionado | Nada (cupo de inundación idéntico) | Suma el cupo por categoría |
| **M4** | Mapa y formulario: selector (oculto con 1 activa), **preferencia local + prioridad de URL + alias**, reinicio de filtros por alcance, paso 2 desde el registro | Nada | Suma la preferencia y la URL |
| **M5** | Panel por categoría | Nada | — |
| **M6** | **Baches** (piloto) | Primera categoría nueva | — |
| **M7** | **Basura** | — | — |
| **M8** | **Áreas verdes** (`Point`, subtipos incluida «persona en situación de calle»). **Puerta de producción:** ADR 0018 decidida | Áreas verdes | Suma la puerta de privacidad |
| **M9** | Medición con 4 categorías y 1 M de filas | — | — |
| **M10** | Contraer (vista, campos planos, `cuota_reporte_diaria`) | — | Suma retirar la tabla de cupo vieja |
| ~~M11~~ | ~~Áreas verdes con capa (G2)~~ | — | **Pasa al backlog** (decisión 6) |

---

## 6. Plan M0 actualizado (antes de implementar)

| # | Tarea | Quién | Bloquea | Verificación |
|---|---|---|---|---|
| M0.1 | Revisar y aprobar (o ajustar) las **ADR 0008–0022** de 14.1. La tabla de 14.1 §0 dice cuáles piden aprobación explícita | Usuario | M1+ | Tabla de 14.1 con el estado de cada una |
| M0.2 | **Autorizar la edición de `CLAUDE.md`**. Ahora: §1 (propósito: plataforma), §3 (alcance ampliado), §15 (backlog: capa de áreas verdes y geometrías no puntuales; «Me pasa a mí»). En M2 y M3: §2, §7 y §13 (cupo por categoría). Texto propuesto en §4 | Usuario autoriza; Claude edita | M1 | Diff de `CLAUDE.md` revisado por el usuario |
| M0.3 | Decisiones menores que **bloquean M1** [PENDIENTE DE DECISIÓN]: <br>(a) forma pública de la URL (§2.2); <br>(b) qué cuenta como «última usada» (§2.2); <br>(c) demora de publicación por categoría o por cuenta (§2.6); <br>(d) cupo de fotos global o por categoría (§2.6) | Usuario | M1: (a) y (b) entran en el normalizador y la preferencia; (c) y (d) en `ReglaCupo` | Respuestas anotadas en 14.1 |
| M0.4 | Decisiones que **bloquean M2** [PENDIENTE DE DECISIÓN]: <br>(e) activación de categorías por catálogo en la base (recomendado) o por variable de entorno; <br>(f) **D3**: subir `severidad_version` de inundación por `agua_estancada` (requiere un `UPDATE` en M2) o documentarlo como v2 extendida | Usuario | M2 | Ídem |
| M0.5 | Incoherencia del contrato y el manual: `fusionado_en_id` en `PATCH /estado` solo acepta UUID y el manual dice «UUID o ID corto». Decidir cuál manda | Usuario | M3 | Ídem |
| M0.6 | Materializar las ADR aprobadas en `docs/decisiones/0008-…` y actualizar `docs/decisiones/README.md` | Claude (documentación) | M1 | Archivos creados, README al día |
| M0.7 | **Plan de M1** en el formato de CLAUDE.md §12.4 (§7 de este documento), aprobado | Usuario | M1 | «Aprobado» explícito |
| — | **Antes de producción** (no antes de desarrollo): decidir la privacidad de «persona en situación de calle» (ADR 0018) y la paleta final con diseño | Usuario y municipio | Activar Áreas verdes en producción | ADR 0018 aceptada |

---

## 7. Plan M1 actualizado (lo primero que se implementaría con tu autorización)

**Objetivo.** Que `packages/contracts` tenga el **registro de categorías y las políticas** con
**inundación como única definición**, sin cambiar ningún comportamiento ni la API.

**Parte:** 3 (custodia de `contracts`). **Carpeta designada:** `packages/contracts/`.

**No puede tocar:** `services/*`, `apps/*`, `packages/db`, `pipelines/*`, `infra/*`, `e2e/*`, la raíz
y `CLAUDE.md`. Los consumidores siguen importando lo de hoy, sin cambios.

| Tarea | Nivel y modelo (§12.4) | Contenido | Meta verificable | Depende de |
|---|---|---|---|---|
| **M1.1 · Tipos y registro** | **Raíz**: `trabajador-raiz` (Opus 4.8), sin pasar `model` | `src/categorias/tipos.ts`: `DefinicionCategoria`, `Pregunta`, `FiltroDef` con `alcance`, `ReglaCupo`, `geometria: 'punto'`. `src/categorias/slugs.ts`: `SLUGS_CATEGORIA`, alias y `normalizarSlugCategoria()`. `src/categorias/index.ts`: registro | `pnpm --filter contracts typecheck` y `test` en verde | M0 |
| **M1.2 · Inundación como definición** | Raíz | `src/categorias/inundacion/definicion.ts`: textos, icono `Waves`, colores (los *tokens* `agua-*` actuales), esquema de detalle **extraído** de `ReporteCrearSchema` **sin cambiar** el esquema público, severidad v2 **reexportada** desde su lugar actual (no se mueve todavía), radio de 25 m, política de cupo con el valor de `CONFIG_DOMINIO`, campos públicos y de exportación iguales a los de hoy | Tabla de severidad de §9.1 idéntica (prueba existente en verde); **OpenAPI sin cambios**: `pnpm --filter contracts build` + `git diff --exit-code packages/contracts/openapi/openapi.yaml` | M1.1 |
| **M1.3 · Pruebas de invariantes** | Raíz | Slugs únicos; los alias normalizan bien; `camposPublicos ⊆ claves del esquema`; cada `FiltroDef` apunta a un campo real; **contraste** de los colores de la definición (≥ 4,5 contra blanco y ≥ 3 sobre el mapa); prioridad URL → guardada → por defecto como **función pura** `resolverCategoriaInicial(url, guardada, activas)`; **categoría sintética** de prueba que se registra con ≤ 8 archivos sin tocar el núcleo | Pruebas nuevas en verde; ninguna existente en rojo | M1.1, M1.2 |
| **M1.4 · Versión y documentación** | Estándar: Sonnet (`model: 'sonnet'`) | `contracts` **0.19.0** (exportaciones nuevas, **sin cambios de API**); `CHANGELOG.md`; README del paquete; `dist/dominio.json` regenerado | CHANGELOG y README revisados; `pnpm --filter contracts build` en verde | M1.3 |
| **Verificación SDD** (regla 10, §12.4) | `sdd-verificador`: **línea base** antes y **verificación** después; `sdd-revisor` contra estas metas. Sin `sdd-auditor` (sin banderas de seguridad: no cambia el comportamiento) | — | **Ninguna regresión**: `pnpm typecheck` y `pnpm test` de **todo** el repo iguales a la línea base, con la salida pegada; lint de Biome en verde | M1.1–M1.4 |

**Fuera de M1**, aunque estén decididos:

| Qué | Fase |
|---|---|
| Cupo por categoría en la base y en la API | M2 y M3 |
| Preferencia local, URL y selector | M4 |
| Definiciones de Baches, Basura y Áreas verdes | M6–M8. Sus campos siguen pendientes de validar con cada dirección |

**Por qué este M1** [RECOMENDACIÓN]:

- es **raíz**: todo depende del contrato;
- no cambia nada observable;
- prueba la abstracción con una categoría sintética antes de tocar la base;
- deja codificadas como datos y funciones puras las decisiones de este documento (prioridad de URL,
  alcance de filtros, política de cupo).

---

## 8. Decisiones que todavía faltan

> **Nota del 2026-10-08.** Ya decididas: forma de la URL, «última usada», demora por categoría y
> activación por catálogo (con la aprobación de las ADR, 2026-10-07); **cupo de fotos global**, 12 por
> cuenta y por día (ADR 0017), y **D3 como «v2 extendida»** (ADR 0023), al aprobar el plan de M2. Sigue
> abierto antes de M3: nada (`fusionado_en_id` se decidió el mismo día: `PATCH /estado` acepta UUID o ID
> corto, cambio de contrato de M3). El plan y la corrida de M2 están en
> `docs/sdd/2026-10-08-base-multicategoria/`.

Todas [PENDIENTE DE DECISIÓN].

**Bloquean M1 a M3:**

| Pregunta | Dónde |
|---|---|
| Forma pública de la URL | §2.2 |
| Qué cuenta como «última usada» | §2.2 |
| Demora de publicación: por categoría o por cuenta | §2.6 |
| Cupo de fotos: global o por categoría | §2.6 |
| Activación por catálogo o por variable de entorno | 13 §27.12 |
| D3: versionado de la severidad | — |
| `fusionado_en_id`: qué manda, el contrato o el manual | — |

**Bloquean M6–M8 o producción:**

| N.º en 13 §27 | Pregunta |
|---|---|
| 2 | **Nombre** de la plataforma («Mi Curichi» para baches y basura) |
| 7 | **Campos y severidad** de cada categoría, validados con Mantenimiento vial, Parques y jardines, Aseo urbano y Desarrollo Social |
| 8 | **Radio de recurrencia** por categoría |
| 10 | **Derivación**: ¿se muestra «Lo atiende…»? ¿Hay un proceso real detrás? |
| 11 | **Técnicos por categoría** o técnicos para todas |
| 13 | **Paleta final** y si «Resuelto» sigue en azul agua |
| 14 | **Ciclo de vida** corto en basura |
| 15 | **Cuenta** al final o antes (recomendado: antes, como hoy) |
| 16 | **«Me pasa a mí»** (recomendado: backlog) |
| 17 | ¿Se puede **cambiar la categoría** de un reporte ya creado? |
| — | **Privacidad de «persona en situación de calle»** antes de producción (ADR 0018) |
