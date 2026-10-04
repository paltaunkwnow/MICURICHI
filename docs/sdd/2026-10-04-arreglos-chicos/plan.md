# Plan — arreglos chicos (2026-10-04)

Pedido del usuario: «arreglá los errores reales y arreglos chicos como veas necesario, vos tomá las
decisiones de cómo arreglar; solo el punto 2» (punto 2 del análisis del 2026-10-04, «Errores reales,
arreglos chicos»).

- Rama `fix/repo/arreglos-chicos`; foto `refs/sdd/arreglos-chicos`; corrida `docs/sdd/2026-10-04-arreglos-chicos/`.
- No es un `/sdd` completo: es la verificación SDD de CLAUDE.md §12.4.3. **Este plan hace de spec**: las metas
  `M-n.m` son los criterios contra los que revisa `sdd-revisor`.
- Cambios ajenos declarados (anteriores a la corrida; no se tocan ni entran en su commit): `CLAUDE.md` y
  `.claude/agents/trabajador-raiz.md`.
- Banderas: `base`, `contrato`, `privacidad`, `seguridad`, `datos`, `geo`, `api`, `ui`, `infra`.
- Docker Desktop apagado al empezar: lo que pide PostgreSQL real, la ventana E2E y «En vivo» queda
  **no verificado** salvo que se encienda.

## Decisiones (delegadas por el usuario)

1. **ID corto:** búsqueda por rango de UUID sobre la clave primaria en vez de `id::text LIKE`. La ruta
   pública solo resuelve reportes públicos, lo que también cierra el oráculo de existencia (pendiente 13
   del 2026-10-03).
2. **Manzana en el resolver:** se deja de calcular. El campo `manzana` queda obsoleto (siempre `null`) en
   contracts 0.17.0 y se quita en una contracción posterior, así no se rompe un cliente con la app vieja
   en caché.
3. **Capas en geo-service:** el índice de teselas se arma la primera vez que alguien pide una tesela de
   esa capa, y la caché no retiene el GeoJSON parseado. La capa de manzanas sigue listada en
   `/geo/v1/capas` (la E2E y el contrato la esperan), pero no se indexa si nadie la dibuja.
4. **Integridad de moderación:**
   - CHECK de motivo obligatorio en `rechazado` y `duplicado`, y de `fusionado_en_id` solo en
     `duplicado`.
   - No se agrega «duplicado ⇒ `fusionado_en_id` no nulo», porque la FK es `ON DELETE SET NULL`.
   - Se crean `NOT VALID` y se validan en la misma migración solo si ninguna fila los viola. Si alguna
     los viola, se emite un aviso y no se tocan datos: un despliegue nunca se traba por filas viejas.
   - Se quita el índice redundante `reporte_estado`.
5. **Correo al crear cuenta:** viaja por `sessionStorage` y no por la URL. Sin inicio de sesión
   automático después del alta: con un correo ya registrado eso revelaría que existe.
6. **Ejecutivo:** los criterios de severidad salen de la función de contracts. Se quitan impactos,
   acciones y prioridades sin fuente (regla 6).
7. **Ficha imprimible:** sin encabezados ni oficinas institucionales inventadas; usa la ciudad de la
   configuración.

## Tareas

Se ejecutan en paralelo, porque son carpetas distintas. El cambio de contrato es solo de documentación
(no cambia tipos). Los comandos pesados van en fila con `$SCRATCH/turno.sh`.

### T1 — contracts (anunciado) + geo-service · Parte 4 · raíz · Opus 4.8 (`trabajador-raiz`)

- **M-1.1** `resolverPunto` no consulta `geo.manzana_vigente` y devuelve `manzana: null`. Una prueba
  lo demuestra con un punto dentro de una manzana sintética.
- **M-1.2** `GET /geo/v1/capas` no construye índices de teselas. El índice de una capa se construye en
  la primera tesela pedida y se reutiliza en las siguientes. La caché no guarda el objeto GeoJSON
  parseado.
- **M-1.3** Sin cambios observables: la huella, los bytes, `n_features`, el `bbox`, el modo y las URL de
  `/capas`, y el GeoJSON servido con su `ETag`, son iguales que antes. `410` con huella vieja, `204`
  con tesela vacía y `413` siguen igual.
- **M-1.4** contracts 0.17.0:
  - `ResolverRespuesta.manzana` documentado como obsoleto (siempre `null`);
  - resumen del OpenAPI sin «manzana»;
  - entrada en `CHANGELOG.md`;
  - `pnpm --filter contracts build` y regenerar el OpenAPI no deja diferencias.

### T2 — api-core · Parte 3 · raíz · Opus 4.8 (`trabajador-raiz`)

- **M-2.1** Un solo módulo con el esquema del parámetro `id` y la resolución del ID corto. Lo usan
  `rutas/reportes.ts` (detalle público) y `rutas/moderacion.ts` (las dos resoluciones, incluida la del
  canónico al fusionar).
- **M-2.2** La resolución del ID corto usa un rango de UUID sobre la clave primaria. Con
  `SET enable_seqscan = off`, su `EXPLAIN` muestra un recorrido por índice. Una prueba lo comprueba.
- **M-2.3** `GET /api/v1/reportes/<id corto>` de un reporte en espera, rechazado o duplicado responde
  `404`, con el mismo cuerpo que un ID que no existe.
- **M-2.4** Sin regresión:
  - el ID corto de un reporte público resuelve;
  - un prefijo ambiguo da `404`;
  - las mayúsculas funcionan;
  - la moderación resuelve publicados en cualquier estado;
  - la prueba de tabla de visibilidad sigue verde.

### T3 — packages/db · Parte 4 · raíz · Opus 4.8 (`trabajador-raiz`)

- **M-3.1** Migración `0018` (número siguiente al mayor en disco):
  - `rechazado` y `duplicado` exigen `estado_motivo` no vacío;
  - `fusionado_en_id` no nulo solo en `duplicado`;
  - no se agrega «duplicado ⇒ canónico no nulo»: el comentario explica la FK `SET NULL`.
- **M-3.2** Los CHECK se crean `NOT VALID` y se validan en la misma migración si no hay violaciones. Si
  las hay, quedan sin validar, la migración emite un `NOTICE` con los conteos y no modifica datos.
- **M-3.3** `DROP INDEX IF EXISTS reporte_estado`, cubierto por `reporte_estado_creado`.
- **M-3.4** `test/migracion-0018-*.test.ts`:
  - desde cero;
  - una segunda pasada no aplica nada;
  - rechaza escrituras inválidas y acepta las válidas;
  - el camino con filas viejas inválidas, sin fallo y sin validar;
  - el camino limpio, validado;
  - el índice quitado y el compuesto presente.
- **M-3.5** El esquema Drizzle refleja los CHECK y el índice si ya refleja los existentes. Seeds y
  suites de `db` en verde.

### T4 — infraestructura · Parte 5 · raíz · Opus 4.8 (`trabajador-raiz`)

- **M-4.1** `postgis` con `shm_size: ${POSTGRES_SHM_SIZE:-256m}` y el porqué en un comentario.
- **M-4.2** `POSTGRES_SHM_SIZE` documentada con su etiqueta en `.env.example`.
- **M-4.3** `docs/operaciones/produccion.md`:
  - tabla de índices sin `reporte_estado`;
  - las restricciones de la 0018 donde se documentan las del reporte;
  - `shm_size` donde se documenta el ajuste de PostgreSQL.
- **M-4.4** `docker compose --profile servicios --profile minio config --quiet` sale con código 0, y
  ningún servicio salvo `proxy` publica fuera de loopback.

### T5 — panel-admin · Parte 2 · estándar · Sonnet 5.5

- **M-5.1** Ficha: el puntaje máximo sale de contracts y es el mismo en el `.txt` y en la vista
  imprimible (hoy dicen 13 y 12).
- **M-5.2** El `.txt`, la vista imprimible y el JSON descargado llevan `NOTA_METODOLOGICA` (§9.4).
- **M-5.3** La ficha no tiene contenido institucional inventado:
  - fuera «Gobierno Autónomo Municipal», «Dirección de Drenaje y Mantenimiento», «Supervisor de
    drenaje», «Código Oficial» y «Evaluación hidrológica»;
  - «Usuario verificado» pasa a «Cuenta registrada»;
  - el encabezado usa la ciudad de la configuración.
- **M-5.4** Diálogo de la ficha (§14.1): foco inicial adentro, foco atrapado mientras está abierto,
  `Escape` cierra y el foco vuelve a quien lo abrió.
- **M-5.5** Ejecutivo:
  - los criterios muestran la fórmula y los rangos de puntaje por banda tomados de contracts
    (`PUNTOS`, `PESOS`, `BANDAS`, más la regla de más de 70 cm), con la nota de que son parámetros a
    validar con el técnico municipal;
  - sin «impacto», «respuesta operativa» ni «prioridad» inventados;
  - las tarjetas siguen cambiando la pestaña.
- **M-5.6** Los agregados por UV se refrescan con el sondeo de la pantalla (cada 10 s, solo con la
  pestaña visible). La geometría sigue con caché infinita.

### T6 — web-ciudadano · Parte 1 · estándar · Sonnet 5.5

- **M-6.1** `error-envio` aparece dentro de `.pie`, encima del botón de enviar, con `role="alert"`.
  Los dos `error-foto` llevan `role="alert"` y quedan junto a su acción.
- **M-6.2** «Ya podés entrar» lleva a `/ingresar?volver=…` sin `email`.
  - El correo pasa por `sessionStorage`: clave propia, se lee una vez y se borra, todo en
    `try/catch`. Sin almacenamiento, el campo queda vacío.
  - `/ingresar` ya no lee `email` de la query.
  - La pantalla es idéntica exista o no el correo.
- **M-6.3** El paso «Ya podés entrar» → «Iniciar sesión» → `#email` con el correo
  (`e2e/tests/ayudas.ts:369-372`) sigue funcionando sin tocar la E2E.

### T7 — severidad como pestañas en Indicadores · Parte 2 · estándar · Sonnet 5.5

Pedido del usuario durante la corrida (2026-10-04), con captura de `/indicadores`: «que la severidad
sea también filtro para que muestre el gráfico por crítico, alto, medio, etc., y añadí el botón de
todo». Eligió la opción **«Como pestañas»**. Arranca cuando termina T5, porque es la misma carpeta.

- **M-7.1** En `/indicadores`, «Por severidad» es un grupo de botones:
  - «Todo» primero y después las cuatro severidades, cada uno con su número;
  - tocar una severidad deja el filtro en solo esa (`?severidad=<s>`), con las tortas y los totales
    filtrados como hoy;
  - «Todo» quita el filtro;
  - tocar la pestaña que ya está activa no cambia nada.
- **M-7.2** Los números de las pestañas no cambian al filtrar:
  - salen de la consulta sin filtro de severidad («Todo» es el total vigente sin filtro);
  - sin filtro activo no se agrega ninguna consulta (misma clave);
  - con filtro, la consulta extra sigue el sondeo de 10 s como las demás.
- **M-7.3** Una sola fuente de estado: la URL. La fila «Filtrar por severidad» (selección múltiple) y
  las pestañas se reflejan entre sí:
  - con dos severidades elegidas arriba, las dos pestañas quedan marcadas y «Todo» no;
  - el distrito elegido se conserva al cambiar de pestaña.
- **M-7.4** Accesibilidad (§14.1):
  - botones nativos con `aria-pressed` dentro de un grupo con nombre;
  - color + texto + forma (`ChipSeveridad`);
  - objetivos de 24 px o más;
  - teclado con Tab y Enter/Espacio.
- **M-7.5** `e2e/tests/panel-indicadores-tortas.spec.ts` sigue valiendo sin tocarla: el filtro
  `indicadores-filtro-severidad` y sus botones no cambian. Las pruebas unitarias cubren la transición
  de estado (función pura) y el marcado de las pestañas.

### T8 — fusionar solo con reportes cercanos · Parte 2 · estándar · Sonnet 5.5

Pedido del usuario durante la corrida (2026-10-04), con captura del detalle `/reportes/[id]`: «que al
fusionar detecte puntos cercanos al reportado, para fusionarlo solo con los que están cerca». Eligió
**«Solo cercanos, sin ID a mano»**. Lo hace el mismo agente que T7, después de T7, en la misma
carpeta.

Hoy `apps/panel-admin/src/componentes/PanelAcciones.tsx:82-86` ofrece los 50 validados más recientes
de toda la ciudad, sin distancia, más un campo para pegar cualquier ID.

- **M-8.1** La lista de fusión muestra solo reportes `validado` a 100 m o menos de la coordenada
  exacta del reporte, sin el propio reporte, ordenados del más cercano al más lejano. Cada opción
  dice el ID corto, la UV, la distancia («a 35 m») y el comienzo de la descripción.
- **M-8.2** Si no hay ninguno, lo dice («No hay reportes validados a menos de 100 m») y ofrece ampliar
  a 300 m y a 1 km. El radio vigente se ve en el rótulo de la lista.
- **M-8.3** Se quita el campo para pegar un ID: solo se fusiona con un reporte de la lista. Se
  conservan el motivo y el resto del formulario.
- **M-8.4** Sin cambios de API ni de contrato:
  - la búsqueda usa el filtro `bbox` de `GET /api/v1/tecnico/reportes`, con la caja calculada desde el
    punto y el radio;
  - la distancia exacta sale de `distanciaMetros` de contracts, la misma cuenta del radio de 60 m;
  - la consulta sale solo con el formulario abierto;
  - si la API recorta la respuesta (`total` mayor que lo recibido), se avisa.
- **M-8.5** Accesible (§14.1): lista con rótulo, teclado, y la distancia en texto. Las pruebas cubren
  la caja, el filtro por distancia, el orden, la exclusión del propio reporte y el marcado (sin campo
  de ID).
- Decisión: la restricción por distancia es de la interfaz. La API sigue aceptando cualquier canónico
  `validado` (§7.3). Hacerla regla del servidor sería otro cambio, en api-core y contracts.

## Invariantes de todas las tareas

- **I-1** Nada fuera de la carpeta designada; la de T1 incluye `packages/contracts/` por anuncio. Ninguna
  tarea toca `e2e/`.
- **I-2** Ninguna prueba existente se debilita, se borra ni se salta. Los `data-testid` existentes se
  conservan.
- **I-3** Regla 10: la suite del paquete corre antes de la primera edición y después, con la salida
  pegada. Lo que estaba verde no queda rojo.
- **I-4** Biome limpio. Sin `any` sin comentario, sin `@ts-ignore` y sin `console.log`. Los textos de la
  interfaz van en español con voseo.

## Fuera de alcance

- Los puntos 1, 3, 4 y 5 del análisis.
- `x-request-id`.
- La cuarta consulta secuencial del resolver.
- Pruebas E2E nuevas.
- El índice funcional para el ID corto, que no hace falta con el rango.
