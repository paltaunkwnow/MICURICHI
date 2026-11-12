# M10.1 — Revisión funcional independiente

**Dictamen: delta M10.1 CONFORME dentro del alcance estático, con una observación P2 heredada de F0.** No se detectó una regresión funcional introducida por los ocho archivos. CA2 no queda acreditado sin reservas para replay con defaults omitidos. Este informe no cierra M10.1 ni sustituye al verificador o al auditor independientes.

Se leyó AGENTS.md completo y el plan, línea base e inventario de la corrida. Comparación realizada con `C:/Users/HP/Desktop/MICURICHI/.turbo/m10-2026-10-26/f0/antes/services/api-core/`, nunca con HEAD. El test nuevo no existe en F0. Ownership de escritura: únicamente estos dos informes.

## Hallazgo por prioridad

**RF-01 · P2 · Heredado, no regresión M10.1 — El replay cruzado con causa omitida calcula huellas diferentes.**

Ubicación: [reportes.ts:224](C:/Users/HP/Desktop/MICURICHI/services/api-core/src/rutas/reportes.ts:224). Cobertura nueva: [m10-compatibilidad.test.ts:164](C:/Users/HP/Desktop/MICURICHI/services/api-core/test/m10-compatibilidad.test.ts:164).

Con la misma cuenta, clave y núcleo válido, enviar primero el cuerpo plano sin `causa_presunta` y después la forma `categoria=inundacion` con profundidad/frecuencia y causa también omitida produce el mismo default almacenado, pero distintas huellas. La forma plana ya contiene `causa_presunta='desconocida'` tras normalizar; la nueva recibe ese default en `pd.data`. Sin embargo, la huella usa `d`, cuyo detalle sigue siendo el recibido. La comparación de idempotencia distingue ausencia/default: **se deduce estáticamente 409 CLAVE_IDEMPOTENCIA_REUSADA en vez de replay**. También afecta el orden inverso. No se ejecutó esta reproducción.

Evidencia: [default y normalización del contrato](C:/Users/HP/Desktop/MICURICHI/packages/contracts/src/esquemas/reporte.ts:123), [default del detalle](C:/Users/HP/Desktop/MICURICHI/packages/contracts/src/categorias/inundacion/esquema.ts:18), [validación separada](C:/Users/HP/Desktop/MICURICHI/services/api-core/src/rutas/reportes.ts:155), [serialización de la huella](C:/Users/HP/Desktop/MICURICHI/services/api-core/src/idempotencia.ts:40) y [comparación](C:/Users/HP/Desktop/MICURICHI/services/api-core/src/idempotencia.ts:111). El [antes verdadero:209](C:/Users/HP/Desktop/MICURICHI/.turbo/m10-2026-10-26/f0/antes/services/api-core/src/rutas/reportes.ts:209) ya calculaba la huella sobre `d`, separado de `pd.data` (140/152/171): **la limitación precede a este delta**.

El replay dirigido nuevo usa causa explícita en ambas formas (test:163–168/184–228); no acredita el borde omitido/default. Registrar la limitación sin atribuirla a M10.1. Si se exige equivalencia general de replay, su tratamiento y una prueba de ambas direcciones deben entrar en alcance aprobado.

## Criterios del plan

| CA | Revisión y evidencia |
|---|---|
| 1 | Conforme estático. `vistas.ts:87–92`: seis alias desde JSON mediante CASE por inundación; ninguna lectura de sus columnas físicas. Nombres y proyecciones mantienen tipos/nullabilidad. |
| 2 | Delta conservado; reserva RF-01. Normalización, severidad, INSERT dual, auditoría, cupo y demora no cambiaron contra F0. Casos añadidos comparan ambas entradas con false/true/null/ausencia. Replay dirigido mantiene ID, publicar_en, un cupo y una auditoría; el default omitido queda fuera de esa demostración. |
| 3 | Conforme estático. Las otras tres categorías obtienen seis NULL, incluso ante claves homónimas/booleano inválido de otra categoría (test nuevo:153–159). No cambia inundación por defecto ni Todas reservado al panel. |
| 4 | Conforme estático. Proyecciones pública/técnica/propia intactas; recorte público de detalle, jitter e identidad preservados. `consultas.ts:116/181/194` comparte SELECT para listados, detalles y propios; exportación usa la misma selección (142) y vista técnica (`rutas/admin.ts:246`). Encabezados CSV y GeoJSON sin cambios. Casos nuevos de exportación: false y NULL/ausencia; aserciones históricas de encabezados/categorías intactas. |
| 5 | Conforme en lectura acotada; auditoría separada. `reportes.ts:61–72/271/479`: forma/resultado/origen finitos, origen fijado por entorno; ningún header lo decide. Tests de datos sensibles leídos. No se emite dictamen de auditoría completo desde este rol. |
| 6 | Evidencia final del implementador verde: 535 PASS/12 SKIP, tipos 9/9 (8 caché), build/Biome exit 0. El diff de los cuatro tests existentes solo agrega casos, sin eliminar/debilitar aserciones. Verificador independiente aún separado. |
| 7 | Conforme en documentación leída. README:361 en adelante distingue preparación de adopción, límites del contador y ventana/retiros pendientes. Inventario mantiene M10.2 como propuesta no ejecutada. Esta revisión no acredita estado global ni autoriza retiros o producción. |

## Evidencia ajena revisada

En `C:/Users/HP/Desktop/MICURICHI/.turbo/m10-2026-10-26/implementador/`:

- `pruebas-rojas-contrato.{log,json,resultado.json}`: rojo corregido, exit 1, 26 PASS/12 FAIL; fallos pertinentes a lectura canónica e instrumentación ausentes. No se usa el intento rojo anterior como demostración.
- `pruebas-verdes-dirigidas.{log,json,resultado.json}`: exit 0, 38/38; 13 del test nuevo y 25 de reportes.
- `post-test.{log,resultado.json}`: 535 PASS/12 SKIP, exit 0 (final 14:10:08 UTC). Baseline válido: 511 PASS/12 SKIP.
- `comparacion-test-por-test.json`: el implementador informa 523 existentes sin pérdidas/cambios de estado y 24 nuevos verdes. Se leyó su comparación; no se recalculó ni ejecutó una suite.
- `post-tipos-grafo.{log,resultado.json}`: 9/9, 8 de caché, exit 0. `post-build.resultado.json`: exit 0. `post-biome.log`: 73 archivos, sin correcciones, exit 0.
- `freeze-final.json` (14:11:03 UTC): sus siete hashes API modificados y el hash del test nuevo coinciden con las muestras de esta revisión.

Los 12 SKIP son ocho casos de cuota concurrente PG, dos de fotos/cuota PG y dos S3; no acreditan esos servicios reales.

## Hashes de los ocho archivos

SHA-256 propio inicial **2026-10-27T14:07:09.5781057Z**, intermedio **2026-10-27T14:09:52.0533755Z** y final **2026-10-27T18:08:57.0455428Z**: **8/8 iguales**; delta sobrevenido: ninguno. Se demuestra igualdad entre muestras, sin bloqueo de escritura ni vigilancia continua. Una edición posterior requiere revisar el delta; no se promete congelación permanente.

Rutas relativas a `services/api-core/`; hashes F0 completos también en `resultado.json`.

| Archivo | Inicial | Final | Estado |
|---|---|---|---|
| `src/vistas.ts` | `0462bc4e2bffdec6e41cb17a95e8fe2b609aabae97abb840d890981076608a0a` | `0462bc4e2bffdec6e41cb17a95e8fe2b609aabae97abb840d890981076608a0a` | igual |
| `src/rutas/reportes.ts` | `13e11a6c7c0fb3815b53b020f008944ff18afe780b03fd5019027c2bf1c1c7e5` | `13e11a6c7c0fb3815b53b020f008944ff18afe780b03fd5019027c2bf1c1c7e5` | igual |
| `test/vista-publica-vs-tecnica.test.ts` | `d6d3c55c96d5803be5a5341c2c7665489d135034ad5e0519eed2ed03f4396846` | `d6d3c55c96d5803be5a5341c2c7665489d135034ad5e0519eed2ed03f4396846` | igual |
| `test/reportes.test.ts` | `63eda613a5ce59984a7923f59b80247941a172e7156bbe739b7aecaf29e2a252` | `63eda613a5ce59984a7923f59b80247941a172e7156bbe739b7aecaf29e2a252` | igual |
| `test/exportacion.test.ts` | `8c005624c37fe66a1e23e0c614379e25fc06f882fe0daa16da42ef9306616ae4` | `8c005624c37fe66a1e23e0c614379e25fc06f882fe0daa16da42ef9306616ae4` | igual |
| `test/no-contaminacion-categoria.test.ts` | `ad91cf77982784dc2f788899a55f923d6f3a9ec88eaf123d56bc7322b0ed3f90` | `ad91cf77982784dc2f788899a55f923d6f3a9ec88eaf123d56bc7322b0ed3f90` | igual |
| `test/m10-compatibilidad.test.ts` | `66aacb520d24274f9f58c8c6bf77e18ed3c10d6bf03677f544629f6d8845bd56` | `66aacb520d24274f9f58c8c6bf77e18ed3c10d6bf03677f544629f6d8845bd56` | igual |
| `README.md` | `144934abdb4b3f2eaeafcf4a1f7ae2f1e311f10601866d6d01b521dbc1555231` | `144934abdb4b3f2eaeafcf4a1f7ae2f1e311f10601866d6d01b521dbc1555231` | igual |

## Límites y entrega

Lectura de producto y de evidencia existente; no se ejecutaron suites, builds, pruebas propias, PG, HTTP o Docker; no se leyó .env, no se abrieron conexiones reales, no se lanzaron descendientes ni se editó producto/docs raíz o Git. Únicos archivos escritos: `revision-funcional/revision.md` y `resultado.json`.

El delta estático es conforme. RF-01 es una observación heredada relevante para interpretar CA2; la ejecución independiente posterior y la auditoría conservan su papel. Sin cierre de convivencia, M10 completo, M10.2, Fase 1 ni producción.



---

# Auditoría independiente de seguridad y privacidad — M10.1

**Dictamen: CONFORME en el alcance estático revisado. Sin hallazgos priorizados.**
Fecha final: 2026-10-27T18:07:52.926Z. Rol nativo `default`, sin skill SDD completa ni descendientes.
Parte 5, auditoría; producto de Parte 3 y documentación en solo lectura.
Ownership exclusivo de este informe y `resultado.json` en esta carpeta.

## Alcance y base

Se leyó AGENTS.md completo, el plan aprobado y la línea base.
El diff se calculó contra `.turbo/m10-2026-10-26/f0/antes/services/api-core/`, sin usar HEAD ni operar Git.
Entre las 74 copias API previas se detectaron siete archivos modificados, todos autorizados.
Se revisó completo el octavo archivo, nuevo, `test/m10-compatibilidad.test.ts`.
Producto: dos TS, README y tests del inventario. No se extiende esta afirmación a todo el repositorio.

## Evidencia y resultado

- **Métricas/logs finitos:** `src/rutas/reportes.ts:61–73` añade únicamente `forma=plana|categoria`, `resultado=aceptado|replay` y `origen=entorno_prueba|no_clasificado`. Nombre de métrica, evento y mensaje constantes. La forma viene de los dos literales de `packages/contracts/src/esquemas/reporte.ts:255–272`. Cota global: ocho combinaciones, con origen fijo por registro de rutas. Ningún payload, GPS, coordenada, autor, email, IP, ID de dominio, clave o texto libre alimenta las nuevas etiquetas. El `reqId` técnico estándar existente es aceptado y no es etiqueta métrica.
- **Origen controlado:** `src/rutas/reportes.ts:59–61` captura solo `NODE_ENV === 'test'` al registrar las rutas. Desarrollo, demo y producción quedan sin clasificar; ninguna cabecera decide las nuevas etiquetas. `README.md:379–387` no certifica sinteticidad del contenido ni adopción; los tests nuevos, `test/m10-compatibilidad.test.ts:296–327`, contemplan headers falsos.
- **Resultado real:** replay se registra al recuperar la fila existente (`src/rutas/reportes.ts:258–272`); aceptado, después de COMMIT y relectura (`:455–480`). Los rechazos y conflictos salen antes de ambos puntos de registro, incluidos clave en curso/huérfana, cupo y fotos inválidas. El contador acredita ese resultado de negocio, no la entrega HTTP al dispositivo. `test/m10-compatibilidad.test.ts:265–293` añade aserciones de exclusión para rechazo/conflicto.
- **Privacidad de las proyecciones:** el diff de `src/vistas.ts` solo cambia los seis alias SQL y un comentario. `detallePublico` conserva `camposPublicos` y cierre a objeto vacío sin definición (`:126–136`); la vista pública conserva jitter/geom_publico (`:150–167`) y no agrega autor ni campos técnicos (`:192–227`). La propia y la técnica mantienen sus reglas (`:231–285`). Se conserva el filtro de publicación y bbox público en `src/consultas.ts:25–65`; la identidad no se deduce de una proyección nueva.
- **JSON y otras categorías:** `src/vistas.ts:87–92` usa seis CASE por `categoria='inundacion'`, sin fallback físico. `->>` convierte NULL/ausencia en SQL NULL; el cast boolean conserva false y permanece dentro de esa rama. Otras categorías reciben alias NULL aun con claves homónimas o valor no booleano. No se introduce cast sobre sus dominios ni se amplía su detalle público. `test/m10-compatibilidad.test.ts:122–160` cubre esas semánticas en su código.
- **Reglas conservadas:** validación, autor de sesión, INSERT dual, cupos, demora, idempotencia sin dispositivo y auditoría de reglas permanecen intactos en el diff (`src/rutas/reportes.ts:186–456`). La redacción de GPS, serializadores, visibilidad, consultas, observabilidad, app, idempotencia y `src/rutas/admin.ts` coinciden con F0. Exportar continúa requiriendo técnico/admin (`src/rutas/admin.ts:228`) y conserva columnas/formato (`:276–336`).
- **Cobertura inspeccionada:** los tests previos reciben adiciones sin retirar aserciones. El test nuevo comprueba etiquetas exactas y ausencia de datos sensibles (`test/m10-compatibilidad.test.ts:234–258`). Las adiciones de vistas, exportación y aislamiento preservan false/NULL y privacidad. Se revisó su fuente; no se ejecutaron aquí.

Las referencias de esta sección son relativas a `services/api-core/`, salvo contracts.
Las conclusiones proceden de lectura de código y comparación, no de una prueba en vivo.

## Escaneo scoped y falsos positivos

Se analizaron únicamente líneas añadidas de los ocho archivos respecto a F0, incluido el nuevo completo.
Patrones: credenciales/autorización/sal; firmas de claves AWS/privadas/GitHub/sk; y términos de GPS, payload, identidad, IP y coordenadas.
No se detectaron firmas de secretos reales.

Los tres aciertos de credenciales en `test/m10-compatibilidad.test.ts` son una sal sintética (`:131`), un sentinel fabricado de autorización para verificar su exclusión (`:193`) y el nombre SQL de la columna de cupos `clave` (`:226`).
Los restantes aciertos son fixtures, aserciones negativas y documentación de privacidad. `resultado.json` enumera archivos/líneas sin reproducir valores.
Esto no sustituye un escaneo global de secretos ni una auditoría de dependencias.

## Hashes de los ocho archivos

SHA-256 inicial: 2026-10-27T10:07:41.8460124-04:00. Final: 2026-10-27T18:07:52.926Z.
**8/8 sin cambios durante la auditoría y 8/8 coinciden con el freeze-final del implementador.**
Los SHA-256 completos de F0, antes, después y freeze están en `resultado.json`; aquí se muestran prefijos de ocho caracteres.

| Ruta en services/api-core/ | Antes | Final | Coincide freeze |
|---|---|---|---|
| `src/vistas.ts` | 0462bc4e | 0462bc4e | Sí |
| `src/rutas/reportes.ts` | 13e11a6c | 13e11a6c | Sí |
| `test/vista-publica-vs-tecnica.test.ts` | d6d3c55c | d6d3c55c | Sí |
| `test/reportes.test.ts` | 63eda613 | 63eda613 | Sí |
| `test/exportacion.test.ts` | 8c005624 | 8c005624 | Sí |
| `test/no-contaminacion-categoria.test.ts` | ad91cf77 | ad91cf77 | Sí |
| `test/m10-compatibilidad.test.ts` | 66aacb52 | 66aacb52 | Sí |
| `README.md` | 144934ab | 144934ab | Sí |

No hace falta revalidar delta en estas huellas. Cualquier modificación posterior de uno de estos ocho archivos exige revalidar el delta antes de reutilizar el dictamen.

## Resultados ajenos y límites

La línea base leída documenta 511 PASS/12 SKIP. El usuario comunicó dirigido 38 PASS,
post 535 PASS/12 SKIP, grafo 9/9 y tipos/build API/Biome exit 0.
Estos resultados pertenecen al implementador/corrida; este auditor no ejecutó ni revalidó sus logs.
Se cotejaron de forma independiente los ocho hashes actuales con `implementador/freeze-final.json`;
también se leyó `freeze8-comprobado.json`.

No se ejecutaron suites, builds, Biome, typecheck, HTTP, PostgreSQL, Docker o S3; no se leyó .env, no hubo descendientes, instalaciones ni operaciones Git.
La ejecución dinámica y la comparación test a test quedan a cargo del verificador en serie.
No se acredita concurrencia/almacenamiento real, sinteticidad general, adopción/convivencia representativa,
seguridad de toda la instalación ni modificaciones fuera del inventario.
El dictamen no cierra M10.1/M10 integralmente ni autoriza retirada física/HTTP, producción o migraciones.
Solo se escribieron los dos entregables autorizados de esta carpeta.


---

# Revisión independiente RF-01 + fixture M10.1

Dictamen: **CONFORME ESTÁTICO**, sin hallazgos P0–P3 en el delta revisado. Revisión P5 de cambios P3; autorización «Aprobar ambos bloques, en orden». Aquí se revisan únicamente RF-01 y los tres casos nuevos de exportación M10.1. M10.2 queda fuera.

Solo se escriben `resultado.json` y este archivo. No se ejecutaron suites, builds, PG, HTTP, Docker, S3 ni descendientes; no se leyó ningún `.env`. No se comparó contra HEAD.

## Funcional — límite estático

- `services/api-core/src/rutas/reportes.ts:224` calcula la huella con el detalle validado. En `:250` el único fallback requiere conflicto, categoría Inundaciones y causa `desconocida`; elimina únicamente esa clave de una copia. No omite descripción, coordenadas, categoría ni otro contenido.
- La segunda llamada a `reclamarClave` usa el mismo cliente dentro del mismo BEGIN. El helper intacto (`src/idempotencia.ts:76–112`) hace INSERT ON CONFLICT DO NOTHING y SELECT FOR UPDATE. Una fila vigente ya bloqueada no se reescribe ni renueva; el reloj de la transacción conserva su decisión de vigencia. Cupo/auditoría quedan después del replay.
- Los tres esquemas reales restantes (`packages/contracts/src/categorias/{bache,basura,area_verde}/esquema.ts`) son objetos estrictos de enums requeridos: sin defaults, transformaciones ni trim. La nueva huella no cambia valores/claves de detalles aceptados en esas categorías; el orden ya era irrelevante. Registro por defecto comprobado en `categorias/index.ts:119`.
- Los 27 casos RF añadidos en `test/m10-compatibilidad.test.ts:333` cubren 8 combinaciones nuevas y 4 históricas entre formas opuestas, default omitido/expreso, GPS releído, mismo ID/publicación, una creación/cupo/auditoría, una métrica/evento por replay y conservación exacta de huella/reporte_id/creado_en. Comprueban una conexión, la transacción y 1/2 SELECT FOR UPDATE.
- Los negativos (`:545`) conservan 409 ante causa real, descripción, coordenada o categoría distinta para ambas huellas históricas; cubren causas reales previas y huella arbitraria. `:600–684` cubre 25 h de caducidad, otra cuenta, envío en curso y clave huérfana. La huérfana simula solo la lectura ausente porque la FK impide fabricarla en SQL; no prueba una base corrupta real.
- `test/exportacion.test.ts:554–560` añade únicamente la UV del reporte a las seis consultas de cada caso false/null/ausente. Conserva los selectores sin categoría, Inundaciones y Todas y sus aserciones. Comparación directa con `.turbo/m10-2026-10-26/rf01/implementador/exportacion-antes.txt`: todo el prefijo histórico, incluidos MASIVOS en UV C, truncado, límites y tiempos, está intacto. No cambian timeout ni skips.

Las tres copias RF en `rf01/f0/` y la copia previa de exportación coinciden por SHA-256 con `f0/manifest8.json`. Ese manifiesto documenta ocho coincidencias con el freeze M10.1. Los cuatro archivos restantes del inventario siguen con sus huellas originales. El cuerpo previo del test M10 y el prefijo histórico de exportación se conservan literalmente.

## Privacidad y seguridad — límite estático

Sin hallazgos en el delta. `dispositivo` se extrae antes de construir ambas huellas (`src/rutas/reportes.ts:186`); GPS no se añade a persistencia, auditoría o logs. La clave mantiene el prefijo de la cuenta de sesión. El fallback no acepta otra categoría ni contenido distinto y no añade una vía de acceso a reportes ajenos.

El delta no añade logs ni altera etiquetas. La salida de replay sigue siendo única (`:285–287`); los caminos 409 terminan antes. Las aserciones anteriores de instrumentación finita y exclusión de cuerpo, GPS, identidad, claves y secretos (`test/m10-compatibilidad.test.ts:187–293`) permanecen intactas; los casos nuevos comprueban conteos de métrica/evento y ausencia en los negativos. `idempotencia.ts`, `registro.ts` y los esquemas contrastados coinciden con F0. No cambia autorización, vista pública, jitter ni fotos. Los artefactos históricos contienen fixtures sintéticos.

## Efectividad de las evidencias

`.turbo/m10-2026-10-26/rf01/implementador/huellas-historicas-reales.json` contiene las huellas plana `406b16ad…d0c0f47` y categoría `4f10c53a…ff059e`, idénticas a las constantes del test. Se inspeccionó el script `capturar-huellas.mts`: hace dos POST 201 reales sobre la API previa y lee la huella persistida con SELECT; no se limita a calcularla con el código nuevo. La ejecución exit 0 ocurrió de 20:56:28 a 20:56:44 UTC, antes de la corrida roja y del fix. La siembra histórica del test inserta una vez esa huella y una antigüedad de 2 h; no transforma una clave vigente mediante UPDATE/DELETE.

Los artefactos leídos acreditan:

| Evidencia del implementador | Resultado registrado |
|---|---|
| Baseline independiente M10.1 | 535 PASS / 12 SKIP |
| Baseline actual, ocho fuentes aún intactas | 533 PASS / 2 timeouts / 12 SKIP |
| Rojo dirigido RF + idempotencia | 41 PASS / 10 FAIL, por aserciones del defecto |
| Exportación aislada anterior | 22 PASS / 2 timeouts de 5000 ms |
| Exportación ajustada | 24 PASS / 0 FAIL, exit 0 |

Son salidas de otro actor inspeccionadas por este revisor. No se ejecutó otra carga pesada. El postfull de Dewey sigue en curso según el principal; este dictamen no espera su resultado ni acredita todavía el verde postfix de RF.

## Huellas y vigencia

Ocho hashes iniciales: **2026-10-27T21:04:11.2734489Z**. Ocho hashes finales: **2026-10-27T21:06:35.1924837Z**. **8/8 idénticos**, sin delta observado durante la lectura. Valores completos, comparación de snapshots y referencias en [resultado.json](resultado.json).

El dictamen aplica a esas huellas, sin presumir freeze permanente. Una edición posterior de Dewey u otro actor requiere revalidar su delta.

No verificados aquí: postfull/postfix, concurrencia/bloqueos en PostgreSQL real, S3 real, HTTP/live, navegador, Docker y demo. La inspección del helper y las aserciones PGlite no sustituyen esas verificaciones. No se inicia M10.2 ni se abre una puerta de contracción, adopción o Fase 1.


