# M5 — Panel administrativo por categoría

**Estado: APROBADO por el usuario el 2026-10-15; M5.0–5.5 completadas y verificadas en local el 2026-10-16. Panel 551/52; F4 independiente y E2E 132/132; cierre en informe.md.**
Autorización literal: «aprueba el plan M5 y continua», seguida de «continua lo que estabas trabajando».
La aprobación se aplica al alcance P2 completo y a las recomendaciones de Q1–Q3: inicio en
Inundaciones, detalle/ficha completos e historial completo en «Todas», con universo público
rotulado por separado. No autoriza editar paquetes externos, activar categorías ni publicar.

Rama local: `codex/panel-por-categoria`, desde `09930a3`, conservando el trabajo previo.
Inventario de partida: `arbol-inicial.txt` y 842 hashes en
`.turbo/m5-2026-10-15/arbol-antes.json`. Los cambios ajenos de M4/CSP se mantienen.
Las secciones de preparación de abajo describen la propuesta original; esta nota registra
la aprobación y reemplaza sus estados «propuesto/pendiente» para ejecutar el alcance aprobado.
Se usa la herramienta nativa de subagentes con modelo heredado, sin inventar alias de Claude.
**Ampliación P3 aprobada posteriormente:** `ampliacion-exportacion.md`, seis archivos de
contracts para corregir el rechazo de campos nulos de otras categorías en exportación,
versión 0.22.0 y verificación de consumidores. Se ejecuta antes del panel y añade la bandera
`contrato`; las demás exclusiones de P2 permanecen vigentes.
La ventana E2E aislada mantiene la autorización vigente; reconstrucción de la pila habitual,
túneles y nuevas specs E2E siguen fuera del alcance. Sin commits ni push.
**Ampliación P5 aprobada el 16/10:** únicamente la expectativa del enlace en
`e2e/tests/panel-mapa-reactivo.spec.ts`, según `ampliacion-e2e-mapa.md`. Conserva
tarjeta/fila/UV y todos los demás casos; no habilita otros cambios E2E ni de producto.

## 1. Meta y situación de partida

Preparar `apps/panel-admin/` para consultar y trabajar por categoría: selector «Todas + categorías», bandeja con identificación de categoría, exportaciones coherentes con la selección, indicadores y ejecutivo por categoría, sin comparar puntajes de modelos distintos. Con una única categoría disponible, conservar la experiencia actual de Inundaciones y ocultar el selector.

**M4 se cerró localmente el 2026-10-15; ver su informe y la corrección Zod/CSP. M5 está aprobada según la nota inicial.** La preparación original fue exclusivamente documental. En la ejecución, el principal concede un único turno pesado; los lectores pueden trabajar en paralelo y hay un solo escritor por carpeta.

Antes de ejecutar M5: registrar el resultado real de M4, resolver las preguntas de §9, obtener aprobación explícita y reservar FB cuando el principal libere el turno. El roadmap histórico permitía M4/M5 en paralelo por carpetas; aquí prevalecen la coordinación y las restricciones actuales.

Fuentes leídas: [AGENTS.md](../../../AGENTS.md), [VentanaContexto.md](../../../VentanaContexto.md), [14 — decisiones y roadmap](../../arquitectura/14-decisiones-m0-y-plan-m1.md), [13.3 — M5, pruebas y archivos del panel](../../arquitectura/13.3-plan-migracion.md), código actual del panel y contratos consumidos. Para banderas se consultó la [matriz local](../../../.agents/skills/sdd/matriz-de-riesgo.md). No se inicia el `/sdd` completo por estar este documento en `docs/sdd/`.

## 2. Parte, límites y banderas

| Concepto | Alcance |
|---|---|
| Tarea funcional propuesta | **P2 — Frontend administrativo**, carpeta designada **`apps/panel-admin/`**. Incluye código, pruebas del paquete y su README, tras aprobación. |
| Escritura autorizada en esta preparación | Solo este archivo: `docs/sdd/2026-10-15-panel-por-categoria/plan.md` (documentación P5 solicitada expresamente). |
| Dependencias que se consumen | Registro y esquemas existentes de **`contracts` 0.21.0**, configuración de la instalación y API existente de M3. |
| Fuera de P2 | No editar backend, `packages/contracts/`, `packages/db/`, frontend público, `e2e/`, infraestructura, scripts ni configuración raíz sin autorización específica por archivo, motivo y riesgo. Un hueco se documenta y se devuelve al principal; no se arregla de pasada. |
| Exclusiones expresas | No activar categorías, definir Baches/Basura/Áreas verdes, cambiar severidades, moderación, permisos o publicación; no cambiar la categoría de un reporte; no editar `.env` ni variantes, bases, `data/raw/`, `AGENTS.md` o `CLAUDE.md`; no instalar dependencias ni crear commits, push o PR. |
| Aislamiento | Preservar los cambios existentes de M4 y documentación. No reset/clean/stash, cambio de rama ni snapshot escrito durante esta preparación. La foto y el inventario de M5 se prepararán después de aprobar. |

**Banderas propuestas para la futura implementación:** `base`, `ui`, `api` (consumo de filtros, cabeceras y consultas), `geo` (mapas y agregados por UV), `privacidad` (vista pública/técnica, ubicación y exportación), `seguridad` (roles y sondeo de sesión). Requieren verificador, revisor y auditor independientes. Activarlas para verificar no autoriza editar sus paquetes propietarios.

No se propone cambio `contrato`, `datos`, `infra`, `compartir` o `lanzadores`: no hay nuevo payload, esquema, migración, proxy, cookies, CSP, túnel ni ejecutable. Si el diff real lo exige, se reclasifica y se pide ampliación antes de editar fuera de P2. La carrera de respuestas del cliente se cubre como aislamiento de consultas; no se propone alterar transacciones o concurrencia de DB.

## 3. Decisiones vigentes y hechos comprobados por lectura

| Base | Qué se conserva o reutiliza |
|---|---|
| **Decisiones aprobadas**, ADR 0009/0012 y doc 14 | Núcleo único y registro de categorías. Categoría disponible = catálogo activo **y** definición registrada. No basta la fila de catálogo ni el nombre en `SLUGS_CATEGORIA`. |
| **Decisiones aprobadas**, ADR 0014/0015 y doc 14 §2.1 | La preferencia `micurichi.mapa.categoria` pertenece solo al mapa público. El panel no la lee ni escribe. La categoría inicial del panel queda pendiente en §9. |
| **Decisiones aprobadas**, ADR 0016 | Reiniciar severidad, filtros propios y selección al cambiar categoría; conservar zona, centro y zoom. Aplicar el alcance declarado en `FiltroDef`, sin convertir preguntas del registro en filtros de API inexistentes. |
| **Base funcional vigente**, AGENTS §4.4/§13 | Técnico/admin moderan y exportan; solo admin retira verificados y ve Capas según la condición actual. Ejecutivo solo accede a `/ejecutivo`, sin moderación, exportación ni consultas técnicas. Ciudadano no entra. No introducir técnicos por categoría. |
| **Base funcional vigente**, AGENTS §4.4 | Sondeo cada **10 s**, sin caché de cifras, solo con pestaña visible; `x-curichi-sondeo` en refrescos automáticos de api-core, sin renovar inactividad. La primera consulta solicitada por la persona conserva el comportamiento actual. |
| **Confirmado por código** | `packages/contracts/package.json` declara **0.21.0**. `REGISTRO_CATEGORIAS` solo registra Inundaciones. `ConfiguracionPublicaSchema` ya incluye `categorias_activas`; el lector del panel valida la configuración, pero devuelve únicamente `ciudad`. No se consultó una DB ni se afirma su catálogo actual. |
| **Confirmado por código**, API M3 | `/tecnico/reportes`, `/exportar`, `/indicadores`, `/ejecutivo/resumen` admiten `categoria=todas`; omitir el parámetro usa Inundaciones. El detalle técnico por ID no necesita un filtro de lista. |
| **Confirmado por código**, `services/api-core/src/categorias.ts` | La lectura del panel permite slugs conocidos **aunque estén inactivos**; `todas` elimina el filtro de categoría. La doble comprobación de actividad rige disponibilidad pública/creación y la oferta de categorías disponibles, sin eliminar el historial técnico. Resolver su presentación en §9, sin cambiar esta API. |
| **Confirmado por código** | Públicos y geo exigen una categoría activa y rechazan `todas`. El ejecutivo actual usa `/ejecutivo/resumen`, `/reportes` público y `/geo/v1/agregados/unidades-vecinales`; no puede resolver «Todas» pasando ese valor a los tres. |
| **Confirmado por código** | No existe `por_categoria` en las respuestas de indicadores o resumen. Los conteos del selector deberán obtenerse mediante consultas existentes; no inventar un endpoint ni contar solo las filas de una página. |
| **Regla vigente y API existente** | Fusión dentro de la misma categoría; el servidor devuelve `409 FUSION_ENTRE_CATEGORIAS`. El panel actual busca validados por bbox sin categoría: M5 debe acotar la consulta y el filtro defensivo al reporte de origen. |
| **Antecedente de alcance, pendiente de concretar aquí** | Doc 13.3 M5 propone pastillas con conteos, columna de categoría, indicadores y ejecutivo por categoría. Doc 14 conserva M5 en el roadmap. Esto no aprueba las elecciones de producto nuevas de §4/§9. |

## 4. Diseño propuesto de M5, sujeto a aprobación

### 4.1 Disponibilidad, selector y navegación

Consumir la configuración existente conservando `categorias_activas`, además de `ciudad`. Intersectar esa lista con `REGISTRO_CATEGORIAS` y respetar el orden recibido. Reutilizar `normalizarSlugCategoria`, `slugParaUrl`, nombres, iconos y acentos del registro. No importar módulos internos de la app pública ni copiar otro catálogo al panel.

Proponer un selector común en bandeja, indicadores y ejecutivo. Con dos o más disponibles: «Todas» y cada categoría disponible. Con una: oculto, operando con esa categoría; con ninguna: estado explícito sin solicitudes públicas/geo inválidas. Un fallo de configuración no equivale a que todas estén activas: usar la última configuración validada si existe y mostrar la limitación, sin habilitar una categoría por deducción.

La URL expresa la selección y la conserva al navegar entre esas pantallas y al volver del detalle. La prioridad propuesta es URL válida → valor inicial aprobado en §9; sin persistencia local. Normalizar alias y corregir valores inválidos con aviso accesible. No trasladar automáticamente al panel la regla de M4 de quitar `?categoria` con una sola activa: fue una aclaración para la web pública, no una decisión del panel.

Al cambiar: página 1, limpiar reporte resaltado/tarjeta y filtros de categoría; conservar distrito/UV, bbox, centro y zoom. **Propuesta específica del panel:** conservar también estado y fechas como filtros comunes; «Limpiar filtros» limpia filtros de trabajo y conserva la categoría elegida. En indicadores, conservar distrito y reiniciar severidad. En ejecutivo, reiniciar pestaña de severidad al conjunto completo y conservar la zona elegida.

### 4.2 Consultas, conteos y exportación

Incluir la categoría efectiva en parámetros y claves de bandeja, mapa, indicadores, resumen, candidatos de fusión y agregados. Para consultas compuestas de «Todas», incluir también el conjunto ordenado de categorías participantes. Conservar `AbortSignal` y el tratamiento de errores. El `keepPreviousData` actual no debe mostrar una categoría anterior durante el cambio; se podrá mantener la última respuesta del mismo ámbito durante un sondeo fallido, rotulada como desactualizada.

**Propuesta de conteos, sin filtros implícitos nuevos:**

- Bandeja: `total` de lista técnica con `limite=1` para cada categoría y para «Todas», sobre publicados de todos los estados, sin filtros de trabajo. Los KPI «sin revisar» y «críticos pendientes» sí siguen la categoría seleccionada.
- Indicadores: `total` vigente por categoría, sin filtro de severidad ni distrito; las pestañas de severidad conservan sus conteos estables **dentro de la categoría elegida**.
- Ejecutivo: `activas.total` del resumen por categoría, siempre `ventana=todo`; no llamar a lista técnica o indicadores para obtener esos conteos.
- Explicar el universo junto al selector; carga/error = «—», no cero inventado. Reutilizar y deduplicar las consultas ya abiertas, con el mismo sondeo de 10 s y visibilidad. Con selector oculto, evitar consultas extra solo para sus conteos.

CSV y GeoJSON salen del endpoint actual con la misma categoría y filtros que la bandeja, sin paginación de tabla. Conservar nota metodológica, validación de la respuesta y advertencia de truncamiento. No reconstruir, recortar ni mezclar archivos en el navegador para simular un contrato nuevo. La ficha unitaria es otro flujo: §4.4.

### 4.3 Bandeja, indicadores, mapas y ejecutivo

En la vista de varias categorías, añadir categoría con nombre/icono a la tabla y tarjetas del mapa. En «Todas», usar columnas comunes; profundidad/frecuencia no son columnas universales. Para Inundaciones sola, preservar las columnas y textos actuales. No introducir filtros de subtipo/campos de detalle que la API actual no acepta.

Indicadores y ejecutivo usan bandas comunes y conteos. Nunca sumar, promediar o comparar puntajes, ni atribuir a «Todas» la fórmula de Inundaciones. Los títulos, anuncios, ayudas y nota metodológica deben expresar la selección; conservar los textos actuales cuando solo opera Inundaciones. Mantener la agrupación ejecutiva vigente «Crítica = alta + crítica», las dos gráficas, «Otros», la tabla de capa anterior y la ausencia de selector de período/exportación ejecutiva.

**«Todas» en el ejecutivo, propuesta compatible con P2:** pedir el resumen al endpoint autorizado con `categoria=todas`. Para mapa y lista UV, pedir públicos/agregados **una vez por categoría disponible**, con claves separadas; nunca `todas`. Mantener las ubicaciones públicas y los límites existentes (300 puntos por consulta ejecutiva), sin presentarlos como inventario completo. Un fallo parcial se identifica; no sustituirlo por datos técnicos ni por un cero. Sumar únicamente conteos compatibles por UV cuando participen todas las respuestas previstas; no fabricar una severidad de UV combinada entre categorías. No crear consultas de puntos críticos que la pantalla no usa.

La relación entre ese mapa de categorías disponibles y los totales históricos de «Todas» requiere Q3: si hay categorías desactivadas, el mapa y el resumen pueden abarcar universos distintos. No ocultarlo ni filtrar solo la página actual para aparentar igualdad.

### 4.4 Detalle, ficha y fusión

**Propuesta recomendada de alcance completo, pendiente de Q2:** adaptar detalle técnico, ficha unitaria imprimible/TXT/GeoJSON y explicación de severidad. La categoría del reporte recibido gobierna la presentación, aunque se llegue desde «Todas» o por un ID directo; el filtro de la bandeja no cambia la categoría del reporte.

Reutilizar `detalle`, `subtipo`, `preguntas`, opciones y notas del registro para una presentación declarativa. Mantener la presentación especializada de Inundaciones mediante un adaptador local del panel; para otras definiciones, mostrar datos y banda/versión sin inventar fórmulas, rangos ni factores que `contracts` 0.21.0 no describe. No recalcular ni reemplazar severidad del servidor. Definición ausente o detalle incompatible: datos comunes y aviso, sin interpretar esos datos como inundación ni volcar JSON arbitrario a HTML.

**Límite confirmado al iniciar:** la respuesta técnica actual no incluye `severidad_version`
ni `detalle_version` (tampoco los construye `vistas.ts`). La versión conocida en P2 es la de
la definición disponible: debe rotularse como tal y nunca atribuirse al cálculo histórico de
un reporte. No inventar esos campos ni ampliar el backend para mostrarlos. La versión usada
por un reporte queda no informada hasta que una tarea posterior amplíe su contrato/respuesta.

La alternativa mínima de Q2 incluye identificar categoría, mostrar datos comunes con seguridad y proteger los componentes que asumen Inundaciones; puede diferir la presentación completa/ficha de otras categorías hasta M6. No permite dejarlos mostrando profundidad o fórmula de agua para cualquier reporte. Cualquier función diferida debe quedar identificada, sin declarar cumplido el alcance completo.

La búsqueda de canónicos usa **la categoría del reporte**, nunca la categoría «Todas» de navegación. Añadirla al parámetro y clave; descartar defensivamente candidatos de otra categoría incluso si llegan de una respuesta antigua o incorrecta. Conservar validado, exclusión del propio, orden por distancia, radios 100/300/1000 m, bbox alineado para privacidad y selección desde lista. El `409` del servidor sigue siendo autoridad; la UI explica el rechazo y no intenta una fusión cruzada alternativa.

## 5. Archivos concretos

Todos los siguientes existen; rutas relativas a `apps/panel-admin/`. La aprobación delimitará cuáles se editan según Q2, sin convertir esta lista en permiso fuera de P2.

| Grupo | Archivos existentes y motivo |
|---|---|
| Configuración y proveedor | `src/lib/configuracion.ts`, `src/lib/ciudad-servidor.ts`, `src/lib/ciudad-contexto.tsx`, `src/app/layout.tsx`, `src/app/proveedores.tsx`: conservar configuración y repartir disponibilidad sin alterar formato/ciudad. Pruebas: `configuracion.test.ts`, `ciudad-contexto.test.ts`. |
| Transporte y consultas | `src/lib/api.ts`, `src/lib/consultas.ts` y sus `.test.ts`: categoría en lecturas, agregado/resumen y claves; mantener sondeo, cancelación y permisos de endpoint. |
| Filtros y navegación | `src/lib/filtros.ts`, `src/lib/indicadores-torta.ts`, `src/lib/indicadores-pestanas.ts` y sus `.test.ts`; `src/componentes/BarraLateral.tsx`: URL, reinicios y enlaces conservando categoría. |
| Bandeja | `src/app/(panel)/reportes/page.tsx`, `src/componentes/FiltrosReportes.tsx`, `src/componentes/TablaReportes.tsx`, `src/componentes/TablaReportes.test.ts`: selector, conteos, columnas y coherencia de lista/mapa/exportación. |
| Mapa | `src/componentes/Mapa.tsx`, `src/lib/mapa-seleccion.ts`, `src/lib/mapa-seleccion.test.ts`: datos y tarjeta por categoría, limpieza de selección sin perder zona. |
| Indicadores | `src/app/(panel)/indicadores/page.tsx`, `src/lib/indicadores.ts`, `src/lib/indicadores.test.ts`, `src/componentes/indicadores/PestanasPorSeveridad.tsx` y su prueba, `src/componentes/CapaAnterior.tsx`: mantener el ámbito en KPI, tortas, capa anterior y enlace UV → bandeja. |
| Ejecutivo | `src/app/(panel)/ejecutivo/page.tsx`, `src/componentes/ejecutivo/PanelEjecutivo.tsx`, `Graficas.tsx`, `CriteriosSeveridad.tsx` dentro de esa carpeta; `src/lib/ejecutivo.ts`, `src/lib/severidad.ts` y pruebas existentes: categoría en resumen/mapa/textos, explicación específica y conteos compatibles. |
| Detalle y ficha, según Q2 | `src/app/(panel)/reportes/[id]/page.tsx`, `src/componentes/ReporteUnitarioModal.tsx`, `src/componentes/FactoresSeveridad.tsx`, `src/lib/formato.ts`, `src/lib/severidad.ts`, sus pruebas existentes: datos propios, seguridad de presentación y notas de ficha. |
| Fusión | `src/componentes/PanelAcciones.tsx`, `src/componentes/CandidatosFusion.tsx`, `src/componentes/CandidatosFusion.test.ts`, `src/lib/fusion-cercana.ts`, `src/lib/fusion-cercana.test.ts`, además de consultas: mismo ámbito de categoría en búsqueda, selección y confirmación. |
| Regresión de seguridad y acceso | `src/lib/roles.ts`, `src/lib/roles.test.ts`, `src/lib/sesion.tsx`, `src/proxy.ts`, `src/proxy.test.ts`, `src/lib/next-config.test.ts`: referencias de revisión y pruebas; no se propone cambiar roles, sesión, proxy ni CSP. |
| Documentación del paquete | `README.md`: describir selección, conteos, limitaciones y verificación; corregir ahí la descripción obsoleta «sin mapa» del ejecutivo como parte de documentar la pantalla real. |

**Archivos nuevos propuestos, todavía inexistentes:** `src/lib/categorias-panel.ts` y `.test.ts` (resolución/estado de UI, usando tipos de contracts), `src/lib/categorias-contexto.tsx`, `src/componentes/SelectorCategoria.tsx` y `.test.ts`; si se aprueba Q2 completo, adaptadores bajo `src/categorias/` con sus pruebas. Elegir los nombres finales en M5.1; no crear otro registro de negocio ni tipos HTTP propios. Usar `crearRegistroCategorias` con definiciones sintéticas exclusivamente en pruebas locales del panel; no añadirlas al registro productivo ni activar filas de DB.

## 6. Criterios de aceptación propuestos

Todos están **pendientes**, sin resultados atribuidos a esta preparación. Q1–Q3 deben quedar resueltas antes de fijar sus expectativas.

| CA | Resultado verificable | Evidencia prevista |
|---|---|---|
| CA1 | Selector oculto con una disponible; dos disponibles muestran «Todas + ambas» en orden. Fila activa sin definición y definición sin fila activa no se ofrecen. Cero disponibles/fallo no habilitan categorías por defecto. | Pruebas de resolución, configuración y render con registro inyectado; revisión visual de una sola categoría. |
| CA2 | URL/alias y enlaces restauran la selección conforme a Q1; panel no lee/escribe la preferencia del mapa. Cambiar conserva zona/estado/fechas y limpia severidad/selección/página según §4.1. | Pruebas de ida/vuelta de filtros, enlaces de indicadores y navegación; navegador tras autorización. |
| CA3 | Todas las consultas dependientes llevan ámbito en parámetro y clave; una respuesta tardía de otra categoría no pinta tabla, mapa, totales ni agregados. Un fallo parcial no aparenta un resultado completo. | Pruebas con respuestas controladas y categorías superpuestas; revisión de `keepPreviousData` y cancelación. |
| CA4 | Conteos usan `total`/`activas.total` del universo rotulado, no longitud de página; no cambian por filtros de trabajo cuando §4.2 los define globales. Fallo/carga muestra «—» y no hay solicitudes de conteos con selector oculto. | Pruebas de consultas y componentes con paginación, errores y selección distinta. |
| CA5 | Bandeja y tarjetas identifican categoría; «Todas» usa datos comunes; Inundaciones sola conserva su presentación. CSV/GeoJSON envían exactamente categoría y filtros de la selección, conservando notas/truncamiento. | `TablaReportes`, filtros, API y exportación; escenario filtrar → validar → exportar en verificación autorizada. |
| CA6 | Indicadores, torta UV y capa anterior mantienen categoría; ejecutivo conserva `ventana=todo`, bandas y roles. No hay fórmulas de inundación ni agregación de puntajes en «Todas». | Pruebas de indicadores/ejecutivo, textos y rangos; revisión de gráficas. |
| CA7 | Ninguna petición a públicos/geo usa `todas`. En ejecutivo «Todas», puntos conservan vista pública; resumen/mapa y su posible historial inactivo se rotulan conforme a Q3. | Pruebas de URLs y roles, resultados parciales, límites por consulta y categorías desactivadas; auditoría independiente. |
| CA8 | El detalle por ID usa su categoría real; no renderiza campos/factores de inundación sobre otra. Ficha y adaptadores cumplen la opción aprobada de Q2; definición/detalle no disponible produce aviso seguro. | Pruebas de render, TXT/GeoJSON unitario y factores, con fixtures de dos categorías y valores incompatibles. |
| CA9 | Fusión solo ofrece validados de la categoría de origen aun entrando desde «Todas»; respuesta con un candidato ajeno no lo habilita. Se conserva bbox/radio/orden y el manejo de `409`. | `fusion-cercana`, `consultas`, `CandidatosFusion` y pruebas de interacción existentes/aprobadas. |
| CA10 | Roles y límites de acceso actuales intactos. Sondeo 10 s solo visible, automático marcado sin renovar sesión, sin nuevo origen/CSP y sin datos técnicos para ejecutivo/público. | Pruebas de roles/API/consultas/proxy, suites de frontera y E2E de acceso/panel al día/CSP. |
| CA11 | Selector accesible: nombre/icono/texto, foco visible, objetivos de 48 px, teclado apropiado a la semántica elegida y anuncio estable del cambio. Mismo sondeo sin cambios no repite anuncios. | Pruebas de componentes + DOM real, teclado, accesibilidad y responsive; no tomar solo render estático como evidencia del anuncio. |
| CA12 | Sin regresiones frente a FB, sin edición fuera de lo aprobado, README del panel actualizado y verificación independiente completa. No activar categorías para demostrarlo. | Inventario/diff y comparación prueba por prueba; salida y códigos de cada comando; pendientes explícitos. |

## 7. Reparto secuencial propuesto

No se crean ni se envían tareas a subagentes en esta preparación. La aprobación precede al reparto. Un escritor por `apps/panel-admin/`; toda ejecución pesada en serie y con turno concedido por el principal. La excepción que permite al principal ejecutar/corregir M4 **no se extiende automáticamente a M5**.

Los niveles siguientes siguen AGENTS §12.4. Las equivalencias de modelo se acuerdan con las herramientas reales de Codex; no afirmar que los alias heredados de Claude están disponibles ni cambiar el modelo del usuario. Revisor/verificador/auditor requieren nivel raíz y el modelo disponible aprobado para ese nivel.

| Orden | Responsable y nivel | Trabajo y meta verificable | Depende de |
|---|---|---|---|
| 0 | Principal + usuario | Registrar estado final real de M4, aprobar este plan/Q1–Q3 y alcance de verificación, inventariar cambios ajenos y preparar foto SDD sin commits del trabajo. | E2E de M4 y decisiones pendientes. |
| FB | `sdd-verificador`, raíz | Medir línea base con los mismos comandos/alcance de §8; conservar salida, fallos previos, inventario y evidencia UI disponible. Ninguna edición funcional antes. | 0 y turno pesado libre. |
| M5.1 | Implementador raíz | Resolver configuración, estado/URL, claves y límites público/técnico/geo; pruebas de CA1–3/7/10. Dejar la base común probada para las pantallas. | FB. |
| M5.2 | Implementador estándar, bajo revisión raíz | Selector, bandeja, columna/tarjetas, conteos y exportación. CA2–5/11. | M5.1 aceptada. |
| M5.3 | Implementador estándar; fusión revisada a nivel raíz | Detalle/ficha según Q2 y fusión por categoría, sin cambiar máquina de estados. CA8–9. | M5.2 aceptada. |
| M5.4 | Implementador estándar, bajo revisión raíz | Indicadores y ejecutivo, incluidas consultas compuestas de «Todas», textos, notas e historial según Q3. CA4/6/7/11. | M5.3 aceptada. |
| M5.5 | Implementador estándar | README y pruebas restantes dentro de P2; entregar inventario final y evidencia antes/después de cada bloque editado. | M5.4 aceptada. |
| V1 | `sdd-revisor`, raíz, independiente | Revisar CA1–12, límites de carpeta, abstracción del registro y conservación de aserciones existentes; sin suites simultáneas. | M5.5. |
| V2 | `sdd-auditor`, raíz, independiente | Revisar roles, vista pública/técnica, fusión, datos/exportaciones, sesión/sondeo y CSP. Cualquier prueba usa el turno exclusivo. | V1 y correcciones aceptadas. |
| V3 | `sdd-verificador`, raíz, independiente | Repetir FB, comparar caso por caso y hacer navegador/E2E/en vivo solo en la ventana aprobada. | V2 y turno libre. |
| Cierre | Principal | Integrar evidencia y pendientes; regresión bloquea cierre. No declarar E2E de dos categorías reales sin haberla autorizado/ejecutado; esa prueba puede seguir en M6. | V3 y resolución de hallazgos. |

Antes y después de cada bloque que edite código: pruebas del paquete y casos afectados, registradas. Si dos intentos no alcanzan la meta, subir el nivel. Una falla previa se informa; no habilita arreglos ajenos.

## 8. Comandos previstos de FB y verificación — NO EJECUTADOS

**Nota de ejecución del 2026-10-15:** los comandos originales de esta sección son la propuesta
de referencia. Los comandos efectivos y salidas se registran en `linea-base.md`. La suite
completa de API cubre también sus archivos de privacidad/seguridad: no se repiten si ya pasaron.
La ampliación de contrato añade tipos de todos los consumidores y sus suites pertinentes. Las
migraciones de DB no cambian; para la bandera geo se mantiene el subconjunto de tres archivos
previsto abajo, sin exigir una repetición de todas las migraciones. El intento adicional de
ejecutar toda la suite DB dentro del grafo se conserva con su resultado real, aunque deba
acotarse por duración. F4 usará los mismos comandos efectivos y opciones de FB, documentando
caché, fallos de entorno y omisiones. No ocultar resultados ni presentar una ejecución parcial
como aprobada.

**Fallo previo confirmado de CA10:** G4 de FB pasó 42 casos y falló, en ambos intentos,
`panel-al-dia.spec.ts:202` (bandeja oculta sin pedidos). JSON/trazas muestran que después de
ocultar se navega con un bbox nuevo y salen dos primeras cargas sin marca de sondeo. El
debounce de 400 ms de la bandeja no comprueba visibilidad; el bloqueo del intervalo no cubre
esas claves nuevas. M5 debe corregirlo dentro de P2: pausar/cancelar trabajo automático oculto,
conservar bbox pendiente y reanudar como sondeo incluso si la clave es nueva, manteniendo
las cargas/cambios manuales visibles sin marca. Cubrir navegación pendiente y mapa que termina
de cargar oculto, sin duplicar pedidos al volver. No se debilita ni edita la E2E. Este defecto
preexistente está dentro del CA10 ya aprobado, no es una regresión causada por M5.

Ejecutar solo después de aprobación, con el principal liberando el turno. Mismos comandos, opciones y entorno en FB y después; cualquier diferencia se explica. No instalar pnpm ni usar `npx -y` que descargue herramientas como remedio automático. Los artefactos de contracts 0.21.0 deben estar disponibles; si están ausentes/desactualizados, pedir al principal la preparación fuera de P2, sin reconstruirlos ahora.

### Control de ejecución y base

Desde la raíz, guardar resultados en la futura evidencia de M5, sin modificar archivos ajenos. Los controles de memoria/puertos se repiten antes de pruebas/builds; no autorizan detener procesos.

```powershell
git status --short --untracked-files=normal
git diff --name-only
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,3001,3002,3100 } | Select-Object LocalAddress,LocalPort,OwningProcess
pnpm lint
pnpm exec biome check apps/panel-admin --reporter=summary
pnpm exec turbo run typecheck --filter=...panel-admin --concurrency=1
pnpm exec turbo run test --filter=...panel-admin --concurrency=1 -- --maxWorkers=1
pnpm exec turbo run build --filter=...panel-admin --concurrency=1
pnpm secretos
git diff --check
```

`pnpm lint` puede conservar el error de formato y seis advertencias ajenos documentados en VentanaContexto; volver a medir y comparar, sin llamarlo verde ni corregirlo fuera de alcance. El panel debe quedar sin errores nuevos. Build nunca durante E2E, `next dev` u otro build; su `prebuild` copia el worker dentro de la app, lo que se incluye en el control del diff. Secretos: revisar también archivos nuevos, ya que `pnpm secretos` solo recorre versionados. Para el barrido adicional de candidatos, mostrar **ruta y línea**, sin imprimir valores:

```powershell
git ls-files --others --exclude-standard -- apps/panel-admin docs/sdd/2026-10-15-panel-por-categoria | ForEach-Object { Select-String -LiteralPath $_ -Pattern '(password|contrase|secret|token|BEGIN [A-Z ]*PRIVATE KEY)' } | Select-Object Path,LineNumber
```

Ese barrido produce candidatos para revisión, no un certificado de ausencia de secretos. Comparar archivos seguidos y nuevos con el inventario de FB; el árbol ya contiene cambios ajenos de M4.

### Fronteras de API/geo, privacidad y seguridad

Comandos previstos por las banderas, también **sin ejecutar**. Las suites pueden crear bases efímeras: su ejecución futura requiere entorno de prueba aislado y turno autorizado. No apuntar a `curichi` ni `curichi_revision`, ni reutilizar `curichi_e2e` mientras la ocupa M4. No leer/imprimir `.env`, cambiar URLs persistentes, migrar, sembrar o activar categorías como parte de este plan.

```powershell
pnpm exec turbo run test --filter=...api-core --concurrency=1 -- --maxWorkers=1
pnpm exec turbo run test --filter=...geo-service --concurrency=1 -- --maxWorkers=1
pnpm --filter geodata-etl exec vitest run --maxWorkers=1
pnpm --filter db exec vitest run test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts test/puntos-criticos-metrica.test.ts --maxWorkers=1
pnpm --filter api-core exec vitest run test/privacidad-ubicacion.test.ts test/vista-publica-vs-tecnica.test.ts test/publicacion-diferida.test.ts test/exportacion.test.ts test/ubicacion-dispositivo.test.ts test/ubicacion-aproximada.test.ts --maxWorkers=1
pnpm --filter contracts exec vitest run test/jitter.test.ts --maxWorkers=1
pnpm --filter api-core exec vitest run test/seguridad.test.ts test/autenticacion.test.ts test/fotos.test.ts test/fotos-abuso.test.ts test/cuentas-y-cuota.test.ts test/cupo-diario.test.ts test/fotos-cuota.test.ts test/fotos-webp.test.ts test/guarda-disco.test.ts --maxWorkers=1
pnpm auditoria
```

La matriz incluye `test/almacen-s3.test.ts` con MinIO sano y credenciales ya disponibles en el entorno: solo en esa condición y ventana autorizada, con `pnpm --filter api-core exec vitest run test/almacen-s3.test.ts --maxWorkers=1`. Si no se habilita, consignar **no verificado**, sin levantar servicios ni obtener credenciales por iniciativa de P2. No regenerar OpenAPI: no se propone cambio de contrato. Si la revisión concluye que hace falta, detener esa ampliación y solicitar P3.

### Navegador, E2E y pila en vivo

Ventana futura separada, coordinada por el principal: memoria medida (referencia del runner: 2,5 GB libres antes de E2E), puertos disponibles, servicios exclusivamente contra `curichi_e2e` y restauración del estado previo. Los problemas de RAM/configuración de M4 son antecedentes: revalidar el procedimiento ya resuelto por el principal, sin reducir umbrales, editar `.env` o inventar otra configuración. No ejecutar el runner si exige una reparación fuera de alcance.

Comandos de referencia del runner existente, **de a uno**, únicamente después de autorizar la ventana y comprobar sus precondiciones:

```powershell
node e2e/scripts/correr-local.mjs --grupo G1
node e2e/scripts/correr-local.mjs --grupo G4
node e2e/scripts/correr-local.mjs --grupo G5
```

G4 incluye `panel-tecnico`, `panel-al-dia`, `panel-ejecutivo`, `panel-indicadores-tortas`, `panel-mapa-reactivo`, `quitar-campos-panel` y `recorrido-completo`. G5 cubre accesibilidad, responsive y CSP. Para las banderas de frontera, en la misma ventana preparada por el principal y sin otro runner a la vez:

```powershell
pnpm --filter e2e exec playwright test tests/ubicacion-obligatoria.spec.ts tests/ubicacion-aproximada.spec.ts tests/camara-foto.spec.ts tests/datos-reales.spec.ts --project=chromium --workers=1
```

No crear/editar E2E ahora ni por aprobar solo P2. El escenario nuevo «filtrar categoría → validar → exportar» necesita autorización P5 con archivos concretos antes de añadirlo; lo mismo cualquier ajuste de fixtures/expectativas existentes. Hasta entonces usar pruebas del panel con categorías sintéticas; el E2E con dos categorías reales sigue pendiente para M6 si no se autoriza otra opción. Que G4 actual pase con Inundaciones no demuestra ese escenario multitemático.

La bandera `ui` también exige DOM real, teclado/anuncio, escritorio/móvil y consola sin errores de CSP. Verificar en una imagen del panel construida desde el árbol aprobado. Reconstruir/recrear servicios de la pila habitual y probarlos por `https://panel.localhost` necesita permiso específico del principal/usuario; no arrancar el perfil general de Compose, que puede migrar bases. No añadir túneles. Si no se autoriza en vivo, consignarlo **no verificado** y no presentar una imagen anterior como evidencia de M5.

## 9. Decisiones de producto aprobadas

Con la aprobación del plan se adoptan las alternativas recomendadas: **Q1 Inundaciones;
Q2 alcance completo; Q3 historial completo**. Se conserva abajo el texto de las alternativas
para trazabilidad; no son preguntas pendientes ni habilitan ampliar el backend.

1. **Categoría inicial del panel:** cuando no hay `?categoria` y haya varias disponibles, ¿abrir **Inundaciones** (recomendación para conservar el comportamiento actual) o **Todas** como bandeja general? Una URL válida prevalece; con una disponible se usa esa y se oculta el selector. La preferencia del mapa público no participa.
2. **Alcance del detalle:** ¿aprobar M5 completo con **detalle técnico + ficha imprimible/TXT/GeoJSON + presentación de severidad por categoría** (recomendado), o limitar M5 a pantallas de consulta y fusión, con protección mínima de detalle/ficha y diferir su adaptación completa a M6? La protección mínima de §4.4 es necesaria en ambos casos para que una fila de otra categoría no se interprete como inundación.
3. **Historial en «Todas»:** ¿mantener **el historial completo que devuelve hoy la API técnica**, incluidas categorías desactivadas, indicando que mapa/UV públicos solo abarcan disponibles (recomendado), o exigir que todos los elementos de «Todas» abarquen únicamente categorías disponibles? La segunda opción exige replantear conteos, paginación y exportación; no se simula filtrando una página ni habilita cambios de backend/contracts sin aprobación aparte.

Los campos, radios, derivaciones y severidades de categorías futuras, técnicos por categoría y privacidad de Áreas verdes antes de producción siguen en sus fases/ADR. No son preguntas que haya que reabrir para preparar M5 con la única definición real actual.

## 10. Riesgos y condiciones de salida

| Riesgo | Tratamiento propuesto |
|---|---|
| Confundir este documento con cierre de M4 o permiso de M5 | Mantener estado PROPUESTO, sin resultados de ejecución ni reparto; el principal registra el cierre real y la aprobación antes de FB. |
| Competir por RAM, puertos o DB con E2E en marcha | Solo lectura/documentación ahora; turnos pesados únicos en FB, implementación y verificación. No administrar procesos de M4. |
| Registro cliente/servidor o configuración desalineados | Doble comprobación, último valor validado y aviso; no activar categorías ni adoptar un catálogo local alternativo. |
| Datos cruzados por claves, respuesta antigua o `keepPreviousData` | Ámbito completo en claves y pruebas con respuestas tardías/categorías superpuestas; conservar último dato solo del mismo ámbito. |
| Ampliar derechos del ejecutivo al resolver «Todas» | Usar exclusivamente resumen autorizado y rutas públicas/geo por categoría; auditoría de URLs y roles. |
| Totales históricos y mapa disponible no equivalentes | Resolver Q3 y rotular universos; no afirmar sumas exactas entre conjuntos incompletos, ni confundir el límite de puntos con el total. |
| Coste de una consulta por categoría | Reutilizar/deduplicar consultas existentes, limitar a disponibles, sondeo visible y sin consultas ocultas de conteo. Medir en FB/F4; no agregar benchmarks M9. |
| Supuestos de Inundaciones en tabla, detalle, ficha o rangos | Adaptadores del panel y presentación declarativa; no trasladar fórmula/puntaje a otra categoría. Revisión especial de Q2. |
| Fusión cruzada o fuga de coordenada por bbox | Categoría del reporte en consulta/filtro; preservar alineación de bbox, radios y validación del servidor. |
| Pruebas unitarias sin navegación real entre categorías | Fixtures sintéticas solo en P2; declarar límites. E2E nueva requiere permiso específico y categorías reales permanecen para M6. |
| Fallos preexistentes, sandbox o herramientas heredadas | Medir FB propia, distinguir fallo de entorno/regresión y mantener evidencia; no instalar, tocar configuración ni atribuir verificación a agentes que no la hicieron. |

**Salida propuesta:** CA aprobados contrastados con FB, revisiones independientes sin bloqueantes, ninguna regresión, modificaciones solo en archivos autorizados, evidencia de ejecución y límites expresos. La falta de ventana/E2E/en vivo queda pendiente y no se convierte en PASS. Este documento se entrega únicamente como propuesta pendiente de aprobación/FB; no cierra M4 ni M5.
