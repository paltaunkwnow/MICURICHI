# M5 — Verificación independiente

**Estado: F4 y controles de cierre completados; consolidación documental el 2026-10-17 con evidencia funcional del 16/10. Sin regresiones abiertas en el alcance verificado.**
Referencia: [plan aprobado](plan.md), [línea base](linea-base.md),
[implementación](implementacion.md) y [revisión de fuente](revision.md).

Fuente P2 congelada al recibir `m5-5-entrega-final.md` e inventario
`.turbo/m5-2026-10-15/m5-5-inventario-final-1792170440552.json`.
El implementador liberó escritura/ejecución pesada; sus 551/52, tipos y Biome verdes
son evidencia de implementación, no resultados nuevos del verificador.

Cicero (`01a14755-65a7-7c91-8f44-bbe834a708ed`) ejecutó con turno pesado exclusivo, retomando
la concesión de Gauss, ya no disponible. Newton terminó dictamen formal de fuente conforme;
Feynman (`01a14755-66b9-7fe0-85d8-3eb3b4312b12`) terminó auditoría formal de fuente
conforme a partir de los rechecks sustantivos de Aquinas; 150/150 hashes iguales.
Las revisiones completas están en `revision.md`. Sin edición funcional.
Artefactos estáticos/E2E en `.turbo/m5-2026-10-15/f4/`; DOM real CA11 en
`.turbo/f4/ca11/`. Preparación anterior no equivale a ejecución aprobada.

## Alcance y resultados confirmados

| Control | Estado |
|---|---|
| Tipos de consumidores, grafo normal con dependencias | 9/9 tareas, 8 desde caché, exit 0 |
| Suites de consumidores, excluyendo suite completa DB | 2087 aprobadas + 12 omitidas conocidas; 8/8 tareas, cinco de caché |
| Tres archivos DB geoespaciales de la línea base | 20/3, exit 0 |
| OpenAPI regenerado idéntico y builds panel/web | Aprobados; OpenAPI bytes/SHA iguales |
| Lint/Biome, secretos incluidos nuevos, diff y auditoría | P2/secretos/diff aprobados; global conserva los mismos siete diagnósticos y tres high |
| CA11 DOM real, teclado, estilo y región viva | 12/12 aprobadas, escritorio y móvil, Chromium real |
| E2E producción G1/G4/G5/fronteras: 132 casos por nombre | **132/132**: G1 47, G4 posterior 43, G5 18 y fronteras 24; mismos nombres/proyecto que FB; cero retries usados/flaky/omitidas en resultados vigentes |
| Limpieza de procesos propios, puertos y estado Docker | Cero residuos propios/pesados; cuatro puertos libres; PostGIS/MinIO healthy |

RAM medida antes de cada ejecución: 1500 MiB estáticos, 2500 MiB DOM/E2E;
un ejecutor, un worker y `--concurrency=1`. Sin instalaciones ni descargas.
E2E exclusivamente `curichi_e2e`, sin migraciones/seeds, con roles restringidos y
almacén sintético ya autorizado; jamás `curichi`/`curichi_revision`.

## Comparación obligatoria con FB y límites

**Evidencia de la primera ejecución F4:** `22-tipos-consumidores-contracts.log` y entrada
de `estaticos-resultados.jsonl`: 9/9 tareas correctas, 8 cacheadas, fin 17:10:02Z del 16/10.
El comando 24 terminó a las 17:20:40Z con `ETIMEDOUT`/`SIGTERM`, exit null, tras 625 s
de proceso: el wrapper aplicaba 600000 ms al grafo completo. Sus paquetes completos y los
archivos parciales de API no constituyen un PASS global. No aparece una aserción fallida
en el tramo API recuperado. Se preservó el intento y se amplió solo el plazo del arnés
ignorado; no los timeouts de Vitest ni expectativas de esas suites. Se comprobaron procesos
propios residuales, memoria y exclusividad. La caché válida evitó repetir paquetes ya completos.

- FB efectiva: 1934 aprobadas + 12 omitidas conocidas fuera de suite completa DB;
  subconjunto DB 20/3. Tipos de siete paquetes; el grafo final incluye hashes/builds
  de dependencias y no usa `--only`.
- E2E FB: 131 aprobadas + un fallo previo de 132. CA10 exige corregir
  `panel-al-dia.spec.ts:202` sin editar ni debilitar la E2E.
- Lint global previo: un error y seis advertencias ajenos. Auditoría previa: tres high,
  cero críticas. Comparar diagnósticos, sin llamar verdes a esos comandos rojos.
- Las 12 omisiones PG/S3 siguen sin verificarse; no presentarlas como PASS.
- No reconstruir ni verificar por sustitución la pila Docker/Caddy habitual, abrir
  túneles, activar categorías reales, editar fuentes fuera del alcance o crear commits/push.
- Dos categorías reales y lector de pantalla auditivo no quedan certificados por
  pruebas con definiciones sintéticas. Cualquier fallo nuevo/regresión bloquea el cierre.

## Ampliación E2E aprobada: enlace del mapa

G4 abre la tarjeta y resalta la fila. El fallo es la igualdad antigua del href, que esperaba
`/reportes/<id>` sin los parámetros de categoría y retorno exigidos por CA2.
CA10 de pestaña oculta pasó al primer intento; el caso del enlace falló en ambos intentos.
El usuario aprobó el 16/10 «Sí, ajustar y verificar esa expectativa», con el alcance exacto
de [ampliacion-e2e-mapa.md](ampliacion-e2e-mapa.md). Sagan fue único escritor del archivo;
recibió el turno pesado tras completar fronteras y liberar los puertos. Después del preflight
rojo y focal verde, Cicero repitió G4 completo con artefactos nuevos, conservando los originales.
No cambió código del producto ni se omitieron pruebas. **G4 posterior: 43/43, sin retry.**

**Posterior del escritor:** el preflight focal reprodujo el fallo del href en los dos intentos.
Tras reemplazar únicamente la expectativa aprobada, el mismo caso pasó **1/1** en 5,1 s
(3,1 s del test), sin retry. Typecheck E2E completo y Biome del archivo: exit 0 antes/después.
El principal comprobó el diff: un solo bloque; tarjeta visible, fila y UV conservan aserciones.
Registros separados `f4/correccion-enlace/antes/` y `despues/`, sin sobrescribir el rojo.
El G4 completo independiente posterior confirma ese resultado; el focal no se suma al total.

## Comparación final de E2E, integridad y limpieza

```text
G1:        47 passed
G4 post:   43 passed (2.3m)
G5:        18 passed
fronteras: 24 passed
```

Los cuatro JSON de resultados registran cero skipped, unexpected y flaky, y un solo intento
aprobado por caso. `e2e-comparacion-post-expectativa.json` compara **132 nombres/proyecto**,
sin faltantes ni añadidos. CA10, antes rojo en FB, pasa en primer intento (3230 ms en G4 post).
No se presenta el primer G4 como verde: permanecen sus 42 aprobadas y el fallo en dos intentos,
las trazas y el motivo del ajuste autorizado. Solo se reemplaza su resultado vigente por el
G4 posterior, sin sumar repeticiones ni repetir G1/G5/fronteras después del cambio de expectativa.

Comandos efectivos de coordinación, con pnpm/Chromium existentes y Next `start`, no `dev`:

```text
node .turbo/m5-2026-10-15/f4/verificacion-e2e.mjs
node .turbo/m5-2026-10-15/f4/verificacion-e2e.mjs G5 fronteras
node .turbo/m5-2026-10-15/f4/verificacion-g4-post-expectativa.mjs --turno-g4-independiente
```

El primero se detuvo al terminar G4 rojo; el segundo completó solo los grupos independientes
que faltaban y el tercero verificó G4 tras la autorización/corrección. Todos preservan guardas
de RAM, roles/base/almacén y limpieza; no sustituyen por el runner general que puede migrar/sembrar.
Logs: `e2e-G1-f4.log`, `e2e-G4-f4-post-expectativa.log`, `e2e-G5-f4.log` y
`e2e-fronteras-f4.log`, bajo `.turbo/m5-2026-10-15/f4/`, con JSON/trazas por grupo.

`integridad-150p2-6p3-post-g4-final.json`: 150 P2 y seis P3 coinciden con fuente congelada;
entre 34 E2E solo cambia la expectativa autorizada. Dictamen de delta E2E conforme de Cicero.
`g4-post-limpieza-final.json`: cero residuos propios/pesados/puertos, sin kill manual.
`g4-post-docker-final.log`: PostGIS/MinIO healthy; solo consulta de estado, sin reconstrucción.
No se detuvieron procesos ajenos. El falso positivo `HPMediaNetwork.exe` del primer registro
se excluyó por fecha anterior/PID reutilizado, conservando su evidencia y sin tocarlo.

## Comandos y salida conservada de estáticos

Se usó el pnpm 12.4.1 ya instalado, invocando su `pnpm.mjs` con Node; no `npx` ni instalación.
Desde la raíz, estos son sus argumentos efectivos, con un único ejecutor:

```text
pnpm --config.verify-deps-before-run=false exec turbo run typecheck --filter=...contracts --concurrency=1
 Tasks:    9 successful, 9 total
Cached:    8 cached, 9 total
  Time:    2.581s

pnpm --config.verify-deps-before-run=false exec turbo run test --filter=...contracts --filter=!db --concurrency=1 -- --maxWorkers=1
 Tasks:    8 successful, 8 total
Cached:    5 cached, 8 total
  Time:    5m5.343s
```

Ambos exit 0. Registros originales: `22-tipos-consumidores-contracts.log` y
`24-test-consumidores-sin-db-retoma1.log`, con argumentos/exit en los JSONL de resultados
de `f4/`. El segundo no incluye la suite completa DB; su subconjunto se ejecutó aparte:
`pnpm --config.verify-deps-before-run=false --filter db exec vitest run
test/puntos-criticos-entorno.test.ts test/puntos-criticos-volumen.test.ts
test/puntos-criticos-metrica.test.ts --maxWorkers=1`, 20 pruebas/3 archivos, exit 0.
Los avisos de Turbo sobre ausencia de archivos de salida en tareas test se conservan en
el log, sin modificar configuración ni borrar caché para ocultarlos.

## Control final de continuidad — 2026-10-17

Tras el corte, Cicero ya no estaba disponible. Boole ejecutó únicamente los controles
25, 27 y 26 con artefactos nuevos en
`.turbo/m5-2026-10-15/f4/cierre-documental-2026-10-17/`; no repitió suites/builds/E2E.
Usó una derivación ignorada del arnés con guardas conservadas, sin modificar el original.
La primera consulta CIM del sandbox no inició el escaneo; el mismo control se ejecutó
con acceso autorizado, conservando ambos intentos. RAM previa: 1947/2109/1981 MiB.

```text
25-secretos-todos-final: exit 0 — [secretos] sin hallazgos
27-candidatos-nuevos-final: exit 0 — 20 candidatos (ruta/línea, sin valores)
26-diff-check-final: exit 0 — salida vacía
```

Los 20 candidatos se inspeccionaron en contexto: 19 menciones documentales de controles,
comandos o variables y un fixture de prueba; sin valor de credencial identificado.
Se conservan la inspección inicial y su clasificación v2, sin snippets/valores en las salidas.
El cotejo actual confirmó **150/150 P2, 6/6 P3 y 34/34 E2E** iguales al estado posterior
ya probado; SHA de la expectativa E2E coincide con el aprobado. No se certifican archivos
ignorados ni historia Git por este escaneo.
Dictamen formal de Boole: **CONFORME, sin bloqueantes documentales en el alcance**,
en `f4/cierre-documental-2026-10-17/entrega.md`. Conserva los intentos del auxiliar de
clasificación y su v2 corregida, sin alterar fuente ni repetir suites. El scanner mantiene
sus excepciones y límites de 2 MiB por archivo/líneas de 500 caracteres; no es un certificado
universal. El turno de ejecución quedó liberado.

El principal comprobó además 139 enlaces locales de 13 documentos, sin faltantes;
`archivos.txt`, 75 rutas sin duplicados/faltantes; rama/HEAD sin cambios, cuatro puertos
E2E libres y PostGIS/MinIO healthy en consulta de estado actual. No hubo mutaciones de bases
ni contenedores. Los resultados funcionales conservan sus fechas originales del 16/10;
estos controles finales corresponden al 17/10 y no se presentan como nueva ejecución E2E.
