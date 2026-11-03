# M9 — Ejecución de la preparación

**Actualización26/10 18:13UTC; prevalece sobre los relevos históricos siguientes.**
Los dos scripts terminaron su freeze68PASS, sintaxis/Biome0 y revisiones P4/seguridad
conformes. Se ejecutó preparación real105etapas/exit0: banco OID197700,0021/capas,
1Mexacto/250kcada categoría y validación completa aprobada. La medición posterior se
detuvo por recursos a15:12:35UTC, con`pending:equivalence` conservado y sin resultado final.
Anscombe volvió como único escritor de scripts/tests para recuperación explícita y
checkpoints, sin bajar guardas ni modificar algoritmos productivos. Ver `medicion.md`.
La demo sigue detenida y sus datos anteriores están guardados mediante conteos/huellas.

Estado: en curso, 2026-10-25. Plan e inventario aprobados; no se ha creado aún el banco,
detenido la demo ni ejecutado una medición de volumen.

## Reanudación del 26/10 — estado vigente

Los actores del25/10 quedaron inaccesibles tras interrupción. La CLI/adaptador quedó
escrita con39PASS y luego44PASS de aislamiento; sus logs se conservan en
`relevo-implementador/`. Los cinco adversarios P4 posteriores quedaron rojos/parciales;
el fallo `CONTROL_NO_SIMULADO` no se presenta como un rojo semántico válido del oráculo.
Anscombe recibe ambos scripts para completar esas correcciones y controles finales,
sin permiso de abrir PostgreSQL ni ejecutar medición todavía.

Las revisiones parciales detectaron dosP2 de seguridad (comparación de endpoint mediante
origin nulo y falta de instrumentación de ayuda/importación) y cincoP2 de oráculos/PIP/
páginas/equivalencia/tiempos. El adapter ya tiene correcciones parciales; el delta congelado
requiere revisión independiente antes de acreditar su resolución.

La demo quedó detenida después del nuevo arranque de Windows26/10. Se acreditaron todos
los PIDs previos ausentes y puertos libres; se conservó el lock obsoleto en un archivo
de evidencia, sin borrar datos. Control fresco `operacion/antes-medicion.json`:9usuarios,
48reportes,6fotos,10contadores,45auditorías,4categorías. Aún no existe resultado de bancoM9.
Se reabrirá el runner normal al concluir la ventana de medición, sin preparar la demo otra vez.

## Preflight y propiedad de archivos

**DeltaTOP50,27/10:**88antes→95PASS0,sintaxis0/0,Biome0;SQLproductivo idéntico.
El control agrupa los datos independientes completos y delega solo su orden aPostgreSQL,
conservando comparación exacta, TOP50Todas/distrito/duplicados/conteos y negativos.
Se acreditaron rojos semánticos: antes se rechazaba el ordenPG y se aceptaba la permutaJS.
Nueva recuperación explícita`recuperar-consulta-top50`solo para160completed/54queries,
sin incrementar completados, con captura/procedencia/hash/READONLYy artefacto incierto.
Se comparte mecanismo privado con el incidenteBBox, sin aceptar consultas libres o retry
automático. Equivalencia/RR1/BBox conservados. Freeze`fix-top50-27/`; review independiente
de Harvey en`review-top50-27/`, sin PG hasta conformidad y negativos reales en memoria.

**DeltaBBOX congelado,26/10 23:28Bolivia:**81antes→88PASS0,7casos nuevos,sintaxis0/0,
Biome0. Control de coordenadas públicas/técnicas devueltas con PostGIS`&&`, rechazo de
texto/null/no finitos y negativos lejanos. Conteos/página/orden/IDs/detalle preservados;
SQL productivo y guardas RR1/equivalencia sin cambios funcionales. Nuevo comando explícito
`recuperar-consulta-bbox`solo para el incidente137completed/31queries/OID/runconocidos:
puente de manifiestos cambia únicamente ambos scripts, coteja captura y reconstrucción,
rechaza resultado ya presente/incierto, revalida enREADONLYy conserva completed sin avanzar.
Freeze`fix-bbox-26/`; revisión de Harvey en`review-bbox-26/`pendiente,0PGhasta conformidad.

**Vuelta RR1,26/10 22:00Bolivia:** el primer dictamen de recuperación quedó NO CONFORME
y se conserva en`revision-recuperacion.md`. Se reprodujo en rojo la repetición de un acotado
tras COMMIT/lectura incierta. El fix mínimo solo modifica`recoveryProof`: la existencia por
nombre de cualquier checkpoint acotado commit/verificado, en raíz o carpetas de ejecución,
aborta antes deClient; el contenido falsy/corrupto no permite ignorarlo. Sin resume parcial.
78casos previos conservados+3nuevos:81PASS0,sintaxis0/0,Biome0. Freeze
`.turbo/m9-2026-10-25/recuperacion-fix-replay-26/freeze.json`; fuentequieta/0hijos.
Harvey revisa el delta y ejecuta sus controles independientes, sinPG; no hay conformidad aún.

**Recuperación del26/10, freeze18:32:22UTC.** Diez pruebas nuevas conservan las68previas:
78PASS/0FAIL, sintaxis0/0, Biome0. Fuentequieta y0hijos delimplementador. Se añade comando
explícito`recuperar-equivalencia`, fijado alOID/run/pending conocidos; coteja manifiestos
(solo los dos scripts pueden cambiar), datos y particiones DBSCAN actuales antes de medir
los cuatro acotados. No repite el completo ni inventa su tiempo perdido: null/NO_MEDIDO.
Checkpoints deCOMMIT/verificación se guardan antes de guardas posteriores. El diagnóstico
de recursos añade solo números finitos/etiqueta finita, sin copiar mensajes o campos libres.
La comparación semántica conserva47SQLúnicos y26bloques protegidos; diario/eventos intactos.
Evidencia `.turbo/m9-2026-10-25/recuperacion-26/`; revisiónindependiente pendiente.

F0 preservó938huellas y el diff inicial; la rama conserva todo el trabajo anterior sin
commit. La demo de cuatro categorías permanece funcionando en su instalación propia.

Heisenberg tiene escritura exclusiva de `scripts/medir-cuatro-categorias.mjs` y
`scripts/medir-cuatro-categorias.test.mjs`. Antes de crearlos, el preflight del runner
existente aprobó40casos, cero fallos/omisiones, duración1203ms. Evidencia:
`.turbo/m9-2026-10-25/implementador/preflight-antes.txt`.

Los nuevos negativos se redactaron primero y se conserva su intento rojo en
`guardas-rojo.txt`; la implementación sigue parcial. El intento parcial no es un PASS
ni autoriza todavía ejecutar una conexión real. El trabajador solo tiene turno de
pruebas locales pequeñas/sintaxis/Biome, sin PostgreSQL, servicios ni carga real.

## Revisión de consultas P4

Avicenna entregó `.turbo/m9-2026-10-25/revision-p4/diseno.md` por lectura y cerró su tarea.
Es insumo de diseño, no revisión conforme de código ni resultado de medición.

- Reutilizar `armarWhere`, `SELECT_REPORTE` y `SQL_AGREGADOS_UV`; otras consultas privadas
  necesitan captura fiel del handler o extracción con anclas/huella verificadas.
- Indicadores devuelve las50UV principales. Listado/exportación tienen topes y conteos
  diferentes; distinguir conteo real, muestra/truncamiento y tiempo SQL/HTTP.
- DBSCAN usa verificados de cada categoría con radios25/10/10/10, sin filtrar `publicar_en`.
- Los agregados pueden contar reportes sin geometría pública que el listado excluye.
- La generación usa las cuatro definiciones0.24 reales, campos planos solo para inundación,
  y validación antes de cargar. Decorrelacionar categoría/estado/espacio/tiempo y comprobar
  oráculos distinguibles para que la igualdad de250kpor categoría no oculte contaminación.

El principal comunicó estos hallazgos al implementador antes de la operación real.
Siguiente: recibir script completo y controles propios, revisión independiente de guardas
y cobertura; solo después pausar demo, guardar snapshot, preparar y medir el banco propio.
