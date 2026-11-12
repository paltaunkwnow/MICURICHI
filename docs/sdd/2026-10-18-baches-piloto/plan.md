# M6 — Baches: definición real y piloto local

**Estado: APROBADO por el usuario el 2026-10-18; ejecución iniciada.** Respuesta literal:
«apruebo el plan y su inventario, incluido los ajustes acotados de agents md y claude md».
La aprobación abarca decisiones del piloto, inventario y cambios documentales limitados de
ambos manuales. No autoriza producción ni nuevas publicaciones Git. Las referencias a
«propuesta/pendiente» en el cuerpo describen la preparación y se resuelven con esta aprobación
para M6 local; la validación municipal antes de producción permanece pendiente.
Preparación del 2026-10-18 sin cambios funcionales; ejecución y resultados se documentan por
separado, sin convertir el plan en evidencia de pruebas. Ver también el
[roadmap 14, §8](../../arquitectura/14-decisiones-m0-y-plan-m1.md).
Plan y verificación por AGENTS §0.9–10 y §12.4; no se inicia un `/sdd` completo.

## 1. Objetivo y punto de partida

Permitir reportar, consultar, revisar y exportar **Baches reales**, usando el núcleo existente,
y demostrar Inundaciones y Baches simultáneamente en un **piloto local aislado**.

[CONFIRMADO POR CÓDIGO] `contracts` está en **0.22.0** y el registro real contiene solo
Inundaciones. Migración 0020: `reporte`, catálogo con Baches inicialmente inactiva y campos
de agua obligatoriamente nulos para otras categorías. Última migración: **0021**.
Severidad admite un puntaje entero sin CHECK del rango exclusivo de Inundaciones.

[CONFIRMADO POR DOCUMENTACIÓN] M0–M5 cerradas localmente. Evidencia M5: panel 551/52,
consumidores 2087 aprobadas + 12 omisiones conocidas y E2E 132/132. Son resultados históricos;
no certifican este futuro cambio ni dos definiciones reales. Ver [informe M5](../2026-10-15-panel-por-categoria/informe.md).

Partida Git comprobada: `interfaz-prueba`, HEAD
`59b80781030707b8c3334bfbfd40f80000c60a57`, árbol limpio antes de estos documentos.
El PR #23 ya está publicado; la autorización de publicación fue puntual. Tras aprobar este
plan se propone rama local `codex/baches-piloto`, sin commits/push/PR nuevos por iniciativa del agente.

## 2. Decisiones de producto propuestas para aprobar juntas

Todas las elecciones nuevas de esta sección son **[RECOMENDACIÓN] / [PENDIENTE DE DECISIÓN]**.
No son parámetros municipales validados. El piloto no equivale a una autorización de producción.

### 2.1 Identidad, campos y textos

- Mantener la marca Mi Curichi y llamar a la categoría **Baches** (`slug: bache`, singular Bache).
- Icono `TrafficCone`; acentos del ADR 0022: `c1 #F6EDE3`, `c5 #9C6A35`, `c7 #7A4E1E`.
  Puntos por severidad; icono y nombre presentes, sin sustituir el color de severidad.
- Botón «Reportar un bache», ubicación «¿Dónde está el bache?»; paso 2 declarativo,
  cuatro pasos comunes y `ubicacion_tipo` inicial `via_publica`.
- Cuenta antes de reportar; permisos dentro del flujo; foto de cámara opcional; ubicación
  aproximada y jitter según las reglas existentes. No se guarda la posición del dispositivo.
- Sin prometer «Lo atiende Mantenimiento vial»: no se ha confirmado ese circuito municipal.
  Se conservan técnicos para todas las categorías y la máquina de estados vigente.

**Subtipo obligatorio, fuera del detalle:**

| Valor almacenado | Etiqueta | Ayuda del prototipo |
|---|---|---|
| `bache` | Bache | Pozo en el asfalto |
| `hundimiento_calzada` | Hundimiento de calzada | La calle cedió |
| `tapa_alcantarilla_faltante` | Tapa de alcantarilla faltante | Pozo abierto |
| `asfalto_levantado` | Asfalto levantado | Capa suelta o rota |
| `calle_tierra_intransitable` | Calle de tierra intransitable | Barro o zanjas |

**Detalle v1 estricto**, con solo dos claves obligatorias:

| Clave | Valores ordenados | Etiquetas visibles |
|---|---|---|
| `gravedad_declarada` | `se_puede_pasar`, `hay_que_esquivar`, `peligroso`, `causo_accidente` | «Molesta, pero se puede pasar»; «Hay que esquivarlo»; «Es peligroso, sobre todo de noche»; «Ya causó un accidente» |
| `tamano` | `plato`, `rueda`, `medio_carril`, `todo_el_carril` | «Como un plato»; «Como una rueda»; «Medio carril»; «Todo el carril» |

Rechazar claves extra, valores desconocidos, subtipo ausente/inválido y detalle incompleto
sin consumir cupo. No añadir profundidad, posición en la vía, cantidad, tipo de pavimento ni
personas afectadas: figuran como investigación, no como decisiones aprobadas.

[CONFIRMADO POR HTML] El prototipo trae esos cinco tipos, cuatro gravedades y cuatro tamaños.
Sus ayudas numéricas de tamaño saltan de 60 cm a 1 m. Se propone **usar solo las referencias
visuales**, sin intervalos numéricos ni rellenar ese hueco con un umbral inventado.
Nota visible: tamaño y gravedad son percepción ciudadana; no son una medición de pavimento,
una comprobación de accidente ni un diagnóstico técnico.

`camposPublicos`: las dos claves del detalle. El subtipo es un dato público separado ya
existente en el núcleo. Declarar ambas claves en `camposExportacion` como metadatos de la
definición; la API actual no los convierte en columnas. **CSV conserva sus encabezados**,
`categoria`, `subtipo` y `detalle` JSON: las respuestas de Baches viajan en ese objeto y las
celdas de agua quedan vacías. GeoJSON conserva propiedades y detalle. No duplicar subtipo
dentro de `detalle` ni añadir un formato de archivo nuevo.

### 2.2 Severidad v1 propuesta

Con índices `g` y `t` de 0 a 3, en el orden de la tabla anterior:

1. `s = g + t + 2`.
2. Banda combinada: `s >= 7` crítica; `>= 5` alta; `>= 4` media; resto baja.
3. Banda final: máximo entre la banda combinada y la banda declarada (`g`).

La banda reproduce la fórmula válida del HTML `sevNoAgua`. No se copian sus respuestas
por defecto silenciosas ante datos incompletos: el servidor y el formulario deben rechazarlos.

| Gravedad declarada / tamaño | Plato | Rueda | Medio carril | Todo el carril |
|---|---|---|---|---|
| Se puede pasar | baja | baja | media | alta |
| Hay que esquivarlo | media | media | alta | alta |
| Peligroso | alta | alta | alta | crítica |
| Causó un accidente | crítica | crítica | crítica | crítica |

[MEDIDO POR CÁLCULO LOCAL] Las 16 bandas de la tabla se derivaron el 18/10 de la fórmula
del HTML; no es una ejecución del producto ni validación municipal.

**Decisión de almacenamiento nueva:** guardar `puntaje = s` (2–8), modelo de severidad
**versión 1**, detalle **versión 1**. El piso de gravedad puede elevar la banda para un mismo
puntaje; no derivar la banda únicamente del puntaje guardado. No comparar ese índice con
Inundaciones, sumar puntajes entre categorías ni presentarlo como medición de riesgo.
La interfaz genérica muestra banda y versiones de definición disponibles, sin atribuir una
versión histórica que la API actual no devuelve. Se conserva la auditoría E1 de Inundaciones.

### 2.3 Radio, cupos y disponibilidad

- Proponer **10 m** de radio de recurrencia para Baches, configurable en su definición.
  Inundaciones conserva sus 25 m. El radio del dispositivo continúa en 60 m: son conceptos distintos.
- Cupo de reportes por cuenta/categoría/día desde `CONFIG_DOMINIO` y override existente;
  valor inicial 3, sin literal nuevo. Fotos globales 12; misma demora por contador de categoría.
- Registrar la definición no activa la categoría: también hace falta catálogo activo.
  Activar Baches solo durante el piloto aislado y restaurar el catálogo después; conservar reportes.
- No activar Áreas verdes ni Basura, cambiar categoría de reportes, crear roles/derivaciones,
  órdenes de trabajo, avisos de emergencia nuevos, geometrías nuevas ni ejecutar M7–M10.

## 3. Hallazgos técnicos que debe resolver M6

1. **Respuestas generales.** Los contratos público/técnico/propio aún asumen agua no nula.
   La exportación 0.22.0 ya admite otra categoría con planos nulos. Hace falta una alternativa
   explícita por categoría, preservando Inundaciones y clientes antiguos sin `categoria`.
   No basta hacer nullable todo ni definir tipos HTTP paralelos en las apps. Mantener bases
   objeto para `.extend`/`.shape` y construir las alternativas después; adaptar los consumidores
   de `.strict()` a cada rama sin perder sus rechazos. La condición debe figurar también en OpenAPI.
   Las rutas actuales pueden enviar 200/201 incompatibles con el contrato: no se afirma un 500.
2. **Núcleo existente.** API valida con la definición, calcula severidad/cupo y escribe en `reporte`.
   Sin embargo, hoy **no comprueba pertenencia ni obligatoriedad del subtipo**: agregar ese control
   antes de consumir cupo, según `def.subtipos`, sin cambiar el caso de Inundaciones sin subtipos.
   Corregir además los tipos no nullable de `FilaReporte` en `vistas.ts`, que ocultan los NULL reales.
   DBSCAN ya itera por categoría con su radio; geo tiene caché por categoría. Reutilizar esos caminos.
3. **Web.** Formulario y presentadores genéricos ya existen. Ajustar solo compatibilidad nullable,
   prueba con definición real y presentación del subtipo mediante las opciones del registro.
   Usar «Tipo de problema» en lugar del rótulo técnico «Subtipo» en el formulario público.
4. **Panel.** M5 ya presenta detalle declarativo, nota y ficha por categoría. Certificar el Bache real,
   la exportación y los nulos; no rehacer pantallas ni interpretar datos de agua para Baches.
5. **Pruebas sintéticas.** Se preservan como pruebas de abstracción, inyectando su registro donde
   corresponda. Añadir pruebas reales; registrar Baches no debe convertir un mock distinto en dominio.
6. **Disponibilidad en memoria.** API/geo usan caché de catálogo de 30 s, configuración pública
   puede cachearse 300 s. El arnés debe arrancar/refrescar los procesos de prueba tras cambiar catálogo
   y usar un contexto limpio; no reducir esos TTL globalmente para hacer pasar la prueba.
7. **Notas de exportación.** `rutas/admin.ts` usa siempre la nota de agua en CSV y GeoJSON.
   Selección Inundaciones/legado conserva su texto exacto; Baches usa limitaciones comunes más su
   nota; «Todas» usa base neutral y notas identificadas de las categorías presentes, sin atribuir
   campos de agua a Baches. Si falta una definición histórica, declarar ese límite. No ampliar
   la respuesta de indicadores para añadir metadatos que hoy no tiene.
8. **Recurrencia y actividad.** DBSCAN no consulta `categoria.activa`: puede agrupar historial
   verificado registrado aunque esté inactivo públicamente. Conservar ese comportamiento.
   `advertencia_diametro` usa hoy el umbral global de 100 m, no el radio del grupo. Proponer aplicar
   el factor vigente `100/25 = 4` al `radioGrupo`: Baches 40 m, Inundaciones 100 m. Es un ajuste
   acotado de P4 para cumplir la regla de diámetro de AGENTS §9.2, sin exponer métricas exactas al público.

## 4. División, dependencias y límites

El principal prepara documentos, coordina y revisa. Implementación y verificación por agentes
nativos del entorno, con modelo heredado disponible; no se inventan aliases de Claude.
Un escritor por carpeta; un único ejecutor pesado; trabajo de lectura independiente en paralelo.

| Tarea | Parte y carpeta designada | Nivel | Depende de | Meta verificable |
|---|---|---|---|---|
| M6.0 | P5 documentación y F0 | principal | aprobación | Plan aprobado, rama propia, inventario y FB con salidas, sin cambios ajenos |
| M6.1 | P3 `packages/contracts/` | raíz | FB | Definición, severidad y respuestas 0.23.0 con validación estricta por categoría; pruebas y OpenAPI |
| M6.2 | P3 `services/api-core/` | raíz | M6.1 | Bache real crea/lee/modera/exporta sin agua; aislamiento, cupos, auditoría y notas correctos |
| M6.3 | P4 `packages/db/`, `services/geo-service/` | raíz | M6.1 | DBSCAN 10 m, aviso de diámetro por radio y pruebas de motores/agregados/caché separados; catálogo doble puerta |
| M6.4 | P1 `apps/web-ciudadano/` | estándar | M6.1–2 | Declarativo real, subtipo legible y nulos seguros, mapa/URL/borrador aislados |
| M6.5 | P2 `apps/panel-admin/` | estándar | M6.1–2 | Bandeja/detalle/ficha/exportación/indicadores y ejecutivo con Baches e Inundaciones |
| M6.6 | P5 `e2e/` | raíz | M6.2–5 | Arnés piloto seguro y E2E real de dos categorías; restauración comprobada |
| M6.7 | P5 documentos y coordinación | principal + verificadores independientes | M6.1–6 | F4 comparada, revisor y auditor conformes; informe y continuidad actualizados |

**Anuncio de contrato propuesto:** minor **0.23.0**, desde 0.22.0. Nuevo dominio de Baches
y alternativas de respuesta no inundación, conservando la forma de petición antigua, ruta v1 y
requisitos de agua de Inundaciones. Generar OpenAPI, comprobar regeneración idéntica y todos los
consumidores. No se promete compatibilidad de clientes que codificaron todas las respuestas como agua.

No hay necesidad identificada de una migración 0022: catálogo y esquema ya existen.
Si aparece un cambio de esquema o un archivo fuera del inventario final, documentar archivo,
motivo y riesgo antes de pedir ampliación; no modificar migraciones antiguas.

## 5. Aislamiento del piloto y reversibilidad

- Nunca conectar a `curichi` ni `curichi_revision`. PostgreSQL real solo `curichi_e2e`
  existente o una efímera `curichi_sdd_*`, con destino validado **antes** de crear conexión.
- E2E usa la base existente en 0021 y sus capas/cuentas. El runner normal prepara/migra/siembra:
  no se ejecutará ciegamente. **Nuevo arnés limitado** `node e2e/scripts/piloto-m6.mjs`, destino
  fijo `curichi_e2e`, sin opción de crear, migrar, sembrar ni elegir otra base.
  Un modo de regresión `--grupo G1` (hasta G5, de uno en uno) mantiene Baches inactiva; el modo
  piloto ejecuta solo la spec nueva con dos disponibles. Config dedicada: `webServer: []`,
  selección explícita de specs/proyectos y sin arranque automático de `pnpm dev`. Para el piloto,
  sustituir el setup general por preflight completo del arnés; preservar sus comprobaciones
  pertinentes en regresión, sin afirmar que se probó un setup que se excluyó.
- Antes de **cualquier cliente**, validar las tres URLs derivadas (dueño/API/geo): protocolo,
  host/puerto locales permitidos, ruta exacta `/curichi_e2e`, roles esperados, sin parámetros o
  fragmentos que cambien el destino. No conectar a la URL de origen ni a una base de mantenimiento
  para comprobar existencia. Limpiar variables heredadas de destino/credenciales; cada servicio
  recibe su rol restringido también en su fallback `DATABASE_URL`. No imprimir URLs con credenciales.
- Preflight conectado solo a `curichi_e2e`: comprobar base/usuario/atributos de roles, inventario
  de migraciones hasta 0021, capas/cuentas/almacén existentes. Si falta algo, abortar sin repararlo.
- Cambiar solo actividad de Baches y sus metadatos necesarios, guardando el estado previo y una
  marca de recuperación **durable y sin secretos**, antes del UPDATE confirmado. Exclusión por
  archivo local y advisory lock de sesión; la activación necesita COMMIT visible a los servicios.
  Restaurar en `finally` y señales manejables. Un cierre forzado puede impedir `finally`:
  diario pendiente bloquea otro piloto; recuperación explícita con
  `node e2e/scripts/piloto-m6.mjs --restaurar .turbo/piloto-m6/<id>/catalogo.json`, repitiendo
  las guardas. Verificar que la fila aún coincide con el estado temporal antes de restaurarla;
  si hay cambios externos, conservar diario y declarar conflicto sin sobrescribirlos.
- Nunca desactivar o sobrescribir las demás categorías por comodidad. Si la precondición no
  permite comparar el caso de una categoría, abortar y declararlo antes de alterar el escenario.
- Crear reportes sintéticos por la API. SQL de pruebas no escribe reportes fuera de los helpers/seeds
  de `packages/db`; no borrar reportes ni fotos para restaurar el catálogo o ahorrar espacio.
  Ubicar fixtures verificados lejos de reportes preexistentes o abortar antes de validar para
  no modificar agrupaciones ajenas; sin recálculo completo persistente como limpieza.
  Restauración significa catálogo y procesos propios; las cuentas/reportes/fotos sintéticos
  permanecen identificados por corrida. No prometer restauración idéntica de toda la base.
- Desactivar Baches corta creación y lecturas públicas; historial técnico conserva datos según
  ADR 0012. Desactivación no es reversa de 0020 ni autorización de contracción M10.
- `PLAYWRIGHT_BROWSERS_PATH` físico existente únicamente en procesos de verificación;
  no copiar/descargar navegadores ni modificar variables persistentes.
- No cambiar `.env`, seguridad del sistema, Compose/volúmenes, imagen habitual, proxy, túnel
  ni puertos de procesos ajenos. Solo arrancar/detener procesos identificados de la prueba.

## 6. Criterios de aceptación

| ID | Evidencia exigida |
|---|---|
| CA1 | Registro contiene Inundaciones y Baches reales; Áreas verdes/Basura ausentes. Catálogo inactivo no ofrece Baches. Tipo/detalle inválidos no crean reporte ni consumen cupo. |
| CA2 | Prueba parametrizada de las 16 bandas; monotonicidad en cada dimensión y piso de gravedad. Datos inválidos rechazados, modelo 1 e inundación v2 intacta. |
| CA3 | Público/propio/técnico y colecciones aceptan los planos nulos que expone cada vista de Bache; DB/técnico contienen los seis nulos. Inundaciones explícita y legado sin categoría siguen rechazando nulos en sus tres datos obligatorios. Conservar payloads anteriormente válidos; entradas cruzadas de categoría/detalle fallan. |
| CA4 | Crear Bache devuelve sus datos, puntaje/modelo guardados y demora; reintento idempotente no duplica ni gasta dos cupos. No posición del dispositivo/autor en público. |
| CA5 | Cupos de reportes independientes y configurable; fotos globales. Fusión entre categorías sigue 409; estados y roles previos no se amplían. |
| CA6 | Mismos puntos superpuestos: cada API/mapa/agregado solo devuelve su categoría; «Todas» técnico combina sin puntajes comparados. Vista `reporte_inundacion` excluye Baches. |
| CA7 | DBSCAN Bache: 9,9/10,1 m en ambos ejes, caso 20 m, encadenamiento/retirada del puente; solo verificados y sin mezcla. Equivalencia completo PostGIS/alternativa Node/incremental por miembros, no UUID. Radio Inundación 25 m intacto; aviso >4×radio (40/100 m); fallo distinto de 42883 se propaga. |
| CA8 | Formulario real de cuatro pasos, tipo/gravedad/tamaño, revisión, cámara y envío; sin campos de agua. Detalle/mis reportes presentan etiquetas y datos correctos. |
| CA9 | Cambio de mapa conserva centro/zoom/zona, limpia severidad/selección; URL/preferencia/prioridad correctas; dos definiciones reales, sin fixture de categoría inyectado en producción. Borrador y cupo no cruzan ámbito. |
| CA10 | Panel: Baches, Inundaciones y Todas; detalle/ficha/notas/CSV/GeoJSON incluyen tipo y respuestas, nulos sin valores de agua inventados; fusión acotada; rol ejecutivo no modera/exporta. |
| CA11 | Piloto acepta solo destinos permitidos antes de conectar, no migra/siembra, restaura estado previo al pasar/fallar/interrumpir y detecta ejecución forzada incompleta. |
| CA12 | Suite anterior de una categoría conservada + E2E nuevas con dos; CSP, accesibilidad DOM/teclado, escritorio/móvil. Sin regresiones respecto de FB, omisiones/lector auditivo no comprobado explícitos. |

## 7. Verificación prevista (no ejecutada en esta preparación)

Banderas: `base`, `contrato`, `api`, `ui`, `geo`, `datos` (catálogo piloto/pruebas),
`concurrencia`, `privacidad`, `seguridad`; `infra` solo si cambia el arnés E2E, no Compose.
Aplicar [matriz local de riesgo](../../../.agents/skills/sdd/matriz-de-riesgo.md)
con las restricciones de este plan prevaleciendo sobre comandos históricos inseguros.

F0 tras aprobación: rama propia y referencia al HEAD de partida, inventario/hashes de ajenos
y documentos; no `stash`, reset, limpieza ni commit automático. FB nueva para el cambio M6,
sin repetir el cierre histórico M5 como si estuviera pendiente. Cada escritor ejecuta la suite
del paquete antes/después y pega la salida, con casos e invariantes identificados.

- Usar pnpm **ya instalado**, `--config.verify-deps-before-run=false`, sin auto-sincronización.
  Tipos/tests/builds por grafo real con `--concurrency=1`; Vitest `--maxWorkers=1`.
- Suite contracts y consumidor de respuesta; OpenAPI esperado 0.23.0 y segunda generación sin diff.
  Tipos de todos los consumidores; suites de API, geo, DB y ambas apps, ETL consumidor de contracts.
- Seguridad/privacidad existentes: autenticación, roles, visibilidad/publicación, jitter, fotos,
  dispositivo, idempotencia y cupos; PostgreSQL real acotado si la matriz lo exige.
  S3/PG que no se puedan ejecutar se declaran no verificados, nunca PASS por estar omitidos.
- Biome de lo cambiado, `git diff --check`, secretos seguidos+nuevos; comparar lint/auditoría global
  con FB, sin reparar de pasada sus rojos ni modificar dependencias.
- Comparación E2E anterior con Baches inactiva y después specs nuevas con las dos activas.
  Grupos de rutas tocadas G1–G5 por separado según matriz y casos nuevos; un worker/retry 0 para
  resultado final, conservando intentos fallidos. No debilitar expectativas anteriores en silencio.
- Navegador producción local aislada, cámara simulada y CSP conservada, desktop/móvil; no certificar
  el despliegue Docker habitual ni lectura auditiva si no se comprobaron. No se reconstruye ni
  migra la pila habitual como forma de cumplir «en vivo».
- RAM antes de cada pesado: 1500 MiB estáticos y 2500 MiB navegador. Un pesado por vez;
  si falta RAM, esperar/avisar, sin matar apps ajenas ni bajar la guarda.
- F4 independiente: verificador contra FB, revisor contra CA e inventario, auditor de contratos,
  privacidad/API y destinos del piloto. Regresión = bloqueante. Informe con salidas, riesgos,
  archivos propios, estado del catálogo y limpieza de procesos propios.

## 8. Riesgos y límites de cierre

La ampliación de contratos puede afectar tipos `.shape` y consumidores que asumían agua;
por eso precede al resto y se comprueba todo el grafo. Registrar Baches puede cambiar mocks
que antes simulaban su ausencia; mantener esa invariante con registros inyectados, no quitarla.

Gravedad/tamaño/radio son propuestas de piloto: requieren validación municipal antes de
producción. El informe debe distinguir definición disponible y versión histórica del reporte.
La actividad de la instalación habitual no se ha consultado; no afirmar que registrar por sí solo
garantiza su estado de catálogo ni desplegar sin una ventana futura autorizada.

[MEDIDO POR CÁLCULO LOCAL, 18/10] Contraste sRGB del c7 propuesto: blanco **7,150:1**,
c1 **6,180:1**, fondo `#EEF2EF` **6,330:1**. Certifica esos pares calculados; la verificación
DOM debe comprobar combinaciones y estados reales antes de declarar accesible la interfaz.

El usuario rechazó el 18/10 borrar cachés/logs: **no se borra nada** de esa lista ni de la evidencia
M4/M5. El coste futuro de caché se observa; no se incorpora una limpieza a M6.

M6 se cierra solo con los CA verificados, documentación sincronizada y piloto restaurado.
No equivale a completar M7–M10, aprobar producción ni actualizar/publicar el PR #23.

## 9. Inventario explícito de la propuesta

N = nuevo, M = modificación acotada. Son archivos propuestos **para después de aprobar**,
excepto este plan, índices y continuidad, que documentan esta preparación. Los tests existentes
enumerados se cambian únicamente si lo exige el nuevo registro o la estructura de las uniones:
preservar casos negativos, nombres/semántica y resultados de FB; explicar cada ajuste.

### P3 — contratos y dominio, antes de los consumidores

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| N `packages/contracts/src/categorias/bache/esquema.ts`, `definicion.ts`, `severidad.ts` | Campos/subtipos, textos, nota, matriz/radio/cupo aprobados | Parámetros piloto; tabla 16 casos, enums estrictos e invariantes |
| M `packages/contracts/src/categorias/index.ts` | Registro y reexportaciones reales | No confundir registro con activación; preservar fábrica sintética |
| M `packages/contracts/src/esquemas/reporte.ts`, `esquemas/admin.ts` | Alternativas de respuesta con planos nulos; mantener bases para derivación y exportación | Flood/legado estrictos, payloads válidos previos y todos los consumidores |
| M `packages/contracts/src/openapi.ts`, `openapi/openapi.yaml` | Representar la condición en OpenAPI, no solo refinamientos runtime | Regeneración por script y segunda generación idéntica |
| M `packages/contracts/package.json`, `CHANGELOG.md`, `README.md` | Versión 0.23.0 y documentación | Sin cambios de dependencias/lockfile |
| N `packages/contracts/test/contrato-0-23.test.ts`, `test/bache-severidad.test.ts` | Respuestas y dominio real con negativos, score y matriz | Pruebas independientes de la fórmula de implementación |
| M `packages/contracts/test/contrato-0-19.test.ts`, `contrato-0-22.test.ts` | Expectativa de registro y nueva compatibilidad general aprobada | Sustituir «solo Inundaciones» y rechazo antiguo de NULL Bache; no borrar negativos flood |
| M `packages/contracts/test/contrato-0-5.test.ts`, `contrato-0-9.test.ts`, `contrato-0-11.test.ts`, `contrato-0-14.test.ts`, `esquemas.test.ts` | Accesos `.shape` y errores de uniones, solo si requieren adaptación | Mismos rechazos de campos comunes/privados; no aflojar aserciones |

### P3 — API

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| M `services/api-core/src/vistas.ts` | Tipos de fila con NULL reales y construcción tipada | Sin datos ficticios ni ampliación de vista pública |
| M `services/api-core/src/rutas/reportes.ts` | Subtipo de la definición obligatorio/válido antes de cupo | No alterar Inundaciones, idempotencia, dispositivo o demora |
| N `services/api-core/src/nota-metodologica.ts`; M `src/rutas/admin.ts` | Nota por selección/categorías presentes; mismo CSV y GeoJSON | No perder limitaciones, escapado, permisos o aviso de truncamiento |
| N `services/api-core/test/m6-bache-real.test.ts`; M `test/exportacion.test.ts`, `test/cupo-diario.test.ts`, `test/no-contaminacion-categoria.test.ts` | Recorrido real, subtipo, notas/celdas, cupo y registro ausente explícito | Preservar pruebas sintéticas y caso «activo sin definición» |
| M `services/api-core/test/quitar-campos-del-reporte.test.ts`, `test/ubicacion-dispositivo.test.ts`, `test/ubicacion-aproximada.test.ts` | `.strict()` por ramas, solo si cambia su acceso | Mismos campos privados/extras prohibidos y protección de ubicación |
| M `services/api-core/README.md` | Bache/nota/subtipo y límites de piloto | No anunciar activación de instalaciones habituales |

### P4 — geoespacial

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| M `packages/db/src/puntos-criticos.ts` | Aviso de diámetro según radio del grupo, factor vigente | Inundaciones sigue 100 m; no cambiar agrupación, visibilidad o CRS |
| N `packages/db/test/puntos-criticos-bache.test.ts`; M `test/puntos-criticos-categoria.test.ts` | Matriz radio real/equivalencia; inyectar registro ausente | Sin tocar bases habituales, comparar miembros de grupos |
| M `services/geo-service/test/no-contaminacion-categoria.test.ts` | Definición real y radio distinto, cuatro combinaciones de disponibilidad | No forzar 25 m a todos ni debilitar caché/privacidad |
| M `packages/db/README.md`, `services/geo-service/README.md` | Radio, advertencia y doble puerta/historial | No atribuir al catálogo el gobierno del DBSCAN |

No se prevé modificar fuentes de geo-service, esquema, migraciones, privilegios ni seeds.

### P1 — web pública

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| M `apps/web-ciudadano/src/lib/formato.ts`, `src/componentes/categorias/inundacion.tsx` | Nulos seguros/tipado de respuestas; no inventar agua | Negativos/fixtures malformados y regresión Inundación |
| M `apps/web-ciudadano/src/componentes/categorias/generico.tsx`, `src/componentes/formulario-categorias/generico.tsx` | Subtipo legible desde registro en detalle/tarjeta/revisión; «Tipo de problema» | Reutilizar renderizador, sin otro formulario específico |
| M `apps/web-ciudadano/src/lib/categoria.test.ts`, `src/componentes/categorias/presentadores.test.ts`, `src/lib/formato.test.ts`, `src/componentes/formulario-categorias/generico.test.ts` | Registro real nuevo, ausencia explícita y nullable | Conservar abstracción sintética y fallback seguro |
| N `apps/web-ciudadano/src/lib/m6-bache-real.test.ts`; M `apps/web-ciudadano/README.md` | Adaptador/URL/borrador/presentación con detalle real | No cargar una definición de prueba en producción |

### P2 — panel administrativo

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| M `apps/panel-admin/src/lib/reportes-panel.ts` | Consumir tipo técnico canónico ampliado, retirar derivación temporal de exportación si ya es redundante | No definir un payload paralelo ni perder nulabilidad |
| N `apps/panel-admin/src/lib/m6-bache-real.test.ts`; M `apps/panel-admin/README.md` | Certificar presentación/ficha/CSV/GeoJSON/nota y tipos reales de M5 | Sin refactor de pantallas, fórmulas de agua para Bache ni nuevos permisos |

No se ha demostrado necesidad de cambiar otros componentes P2: si las pruebas reales revelan
un defecto, presentar su archivo/motivo/riesgo antes de salir de este inventario.

### P5 — arnés, E2E y documentos

| Archivos | Cambio y motivo | Riesgo / control |
|---|---|---|
| N `e2e/scripts/piloto-m6.mjs`, `e2e/scripts/piloto-m6.test.mjs` | Ejecución existente/regresión/piloto/restauración y tests de guardas con dobles | Cero conexiones ante destino inválido, diario/CAS/locks, no migración/seed |
| N `e2e/playwright.piloto-m6.config.ts`, `e2e/tests/piloto-m6.piloto.ts` | Config aislada y recorrido real; sufijo fuera de suite normal | Evitar activación accidental al correr E2E común; desktop/móvil explícitos |
| M `e2e/README.md` | Precondiciones, comandos, restauración y límites | Comandos sin secretos/rutas absolutas de usuario ni downloads |
| N `docs/dominio/baches.md`, `docs/decisiones/0024-baches-v1-y-piloto-local.md`; M `docs/decisiones/README.md` | Decisión del usuario y límites técnicos/municipales tras aprobar | ADR no se marca aceptada antes de la respuesta humana |
| N documentos de esta corrida `linea-base.md`, `arbol-inicial.txt`, `archivos.txt`, `implementacion.md`, `verificacion.md`, `revision.md`, `informe.md` | Evidencia conforme se ejecute cada etapa | No crear resultados PASS ni vacíos que suplanten evidencia |
| M `docs/sdd/README.md`, `docs/README.md`, `docs/arquitectura/14-decisiones-m0-y-plan-m1.md`, `VentanaContexto.md` | Enlace/avance/decisiones y próximo paso; continuidad ya autorizada | Preservar historia, distinguir plan e implementación |
| M propuesto `AGENTS.md` y `CLAUDE.md`, solo §1, §4.8 y fila multitemática de §16 | Registrar definición Baches/piloto, versión 0.23 y decisiones nuevas al verificarse | **Autorización específica incluida en la aprobación**; sin reescribir reglas. No afirmar activación normal |

Las rutas de la primera fila de contratos comparten el prefijo `src/categorias/bache/`;
los nombres abreviados en cada fila comparten su paquete, salvo el prefijo explícito `src/`/`test/`.
No se modifican `e2e/tests/ayudas.ts`, specs antiguas, runner normal ni setup/config normal:
el recorrido nuevo crea su cuerpo real y su preflight aislado. Un fallo de expectativa anterior
requiere diagnóstico y ampliación específica, como se hizo en M5.

## 10. Aprobación que habilita la implementación

Solicitar una sola aprobación del plan completo: elecciones de §2, radio/aviso de diámetro,
contrato 0.23.0, límites/inventario de §9, ventana aislada sin seed/migraciones y cambios
documentales acotados de ambos manuales. **AGENTS §0.9 y §12.4 exigen «plan → aprobación
→ reparto»; §5.2 exige archivo, motivo y riesgo para ampliar carpetas.** Esa es la causa concreta
de la aprobación previa; no la disponibilidad de tokens ni un fallo automático de herramientas.

Después de aprobar: registrar la decisión, rama/inventario y FB; delegar M6.1 primero. Si cambia
una decisión de dominio, actualizar el plan antes de implementarla. Ninguna tarea funcional de
M6 se da por completada por haber preparado este documento.

## 11. Evidencia de esta preparación

- Lectura completa de AGENTS y cotejo de CLAUDE; continuidad, roadmap, ADR 0022, contratos,
  fuentes UI/genéricas, API, DB/geo y arneses existentes. Sin conexiones ni pruebas de producto.
- Lectura estática del HTML local `Mi Curichi · Prototipo (compartible) (23).html`, plantilla
  JSON descomprimida sin ejecutar JavaScript: `MOD.baches`, `MOD.baches.tam`, `sevNoAgua`.
- Diagnóstico independiente solo lectura de P3: Avicenna,
  `01a150ec-e973-7d13-927e-923b0dcf0ca8`; confirma respuestas, subtipo sin validación, notas y
  CSV existente, accesos `.shape`/`.strict` y fixtures afectados.
- Diagnóstico independiente solo lectura de P4/P5: Carson,
  `01a150ec-eac5-7162-93a7-76fdd1e2a025`; confirma runner sin modo existente, ausencia de
  necesidad de CLI general, restauración durable, DBSCAN y advertencia global de diámetro.
- No se borraron cachés/logs, no se cambió código/configuración/manuales protegidos y no
  se ejecutaron suites, builds, instalaciones, operaciones de base, commit ni push en esta preparación.
- Control documental ejecutado: `git diff --check` exit 0; cuatro Markdown revisados,
  cero enlaces locales ausentes y cero líneas con espacios finales (incluido el plan nuevo).
  Git confirma únicamente este plan y los tres documentos de continuidad/índices; HEAD sin cambios.
