# M5 — Panel administrativo por categoría

**M5 completada y verificada en local; cierre documental consolidado el 2026-10-17 con evidencia de ejecución del 16/10. Sin regresiones abiertas; se conservan los rojos globales anteriores. Sin nuevos commits ni despliegue.**

- Corrida: `2026-10-15-panel-por-categoria`; continuación del 16/10/2026.
- Rama: `codex/panel-por-categoria`, HEAD de partida `09930a3`.
- Parte principal P2, `apps/panel-admin/`; ampliación P3 de seis archivos aprobada en
  [ampliacion-exportacion.md](ampliacion-exportacion.md), contracts 0.22.0.
- Ampliación P5 aprobada el 16/10: solo la expectativa de enlace de
  `e2e/tests/panel-mapa-reactivo.spec.ts`, descrita en [ampliacion-e2e-mapa.md](ampliacion-e2e-mapa.md).
- Banderas: base, contrato, ui, api, geo, privacidad y seguridad. Verificación obligatoria de
  AGENTS §12.4; sin iniciar por ello un `/sdd` completo ni autorización de commit.
- Partida: 842 hashes/copia inicial e inventario de ajenos; no reset, stash ni nueva foto
  escrita en refs. Archivos propios en [archivos.txt](archivos.txt), conservando M4/CSP.

## Resultado funcional implementado

El panel comparte disponibilidad, selección/URL, nombres, iconos y acentos del registro.
Con una categoría se oculta el selector; con varias se ofrece «Todas» y cada disponible.
Sin categoría efectiva no consulta ni muestra datos residuales o ceros inventados. El panel
no utiliza la preferencia del mapa público.

Bandeja, mapa, indicadores, ejecutivo y exportación mantienen el ámbito. Los conteos no
dependen de la página; cambiar categoría conserva zona/fechas/estado y reinicia los filtros
propios, selección/página y pestaña ejecutiva. Centro/zoom sobreviven a datos cacheados y
frescos. Detalle/ficha/impresión/TXT/GeoJSON usan la categoría real, con validación declarativa
y fallback común seguro. Fusión ofrece solo candidatos de la categoría del origen.

«Todas» conserva el historial técnico, incluidas categorías inactivas. El mapa ejecutivo
compone únicamente puntos públicos de categorías disponibles, hasta 300 por participante,
con advertencia de muestra/parcialidad; UV solo se suman con respuestas completas compatibles.
No se combinan puntajes ni se aplica la fórmula de Inundaciones a otros modelos.

Contracts 0.22.0 corrige únicamente la exportación de otras categorías con campos planos
nulos, preservando la rama técnica anterior y la exigencia estricta de Inundaciones.
No se cambian roles, moderación, geometría, publicación, cupos ni severidades de negocio.
**Inundaciones sigue siendo la única definición real registrada; no se activaron categorías.**

## Verificación y comparación

Resultados detallados, comandos, caché e incidencias en [verificacion.md](verificacion.md).

| Control | Línea base | Estado posterior confirmado |
|---|---|---|
| Panel | 458/40 | 551/52 del escritor; repetido mediante caché válida en grafo independiente |
| Consumidores sin suite completa DB | 1934 aprobadas + 12 omitidas | 2087 aprobadas + las mismas 12 omitidas; 8/8 tareas, cinco de caché |
| DB geoespacial acotada | 20/3 | 20/3, ejecución nueva |
| Tipos consumidores | Siete paquetes | Grafo 9/9 con builds; ocho tareas de caché |
| OpenAPI | Artefacto previo a 0.22.0 | 0.22.0 regenerado idéntico por bytes y SHA; no cambio adicional |
| Builds panel/web | Aprobados | Aprobados sobre dependencias 0.22.0 |
| Biome P2, secretos seguidos+nuevos, diff | Aprobados | Aprobados; sin hallazgos del escáner |
| Lint global | Un error + seis avisos ajenos | Siete diagnósticos idénticos; conserva exit 1 |
| Auditoría dependencias | Tres high | Mismas tres high, diez moderate y una low; conserva exit 1 |
| DOM real CA11 | Pendiente | 12/12 en Chromium, escritorio y móvil; sin verificación auditiva |
| E2E G1/G4/G5/fronteras | 131 aprobadas + un fallo de 132 | **132/132**: G1 47, G4 posterior 43, G5 18 y fronteras 24; mismos casos/proyecto; sin retries usados/flaky/skips en resultados vigentes |
| Limpieza e integridad | Inventarios iniciales | Fuente congelada P2/P3 igual; único E2E autorizado; cero residuos propios/pesados, cuatro puertos libres, PostGIS/MinIO healthy |

La repetición del grafo completó tras ampliar solo el plazo del arnés ignorado: el primer
intento de 625 s fue interrumpido, no aprobado. No se modificaron timeouts; la única expectativa
E2E ajustada tiene aprobación específica y preflight rojo/focal verde conservados.
Las 153 pruebas adicionales corresponden a 60 de contracts y 93 del panel;
las aserciones históricas se conservaron. No se suman intentos ni caché como nuevas ejecuciones.

## Revisión independiente y correcciones

[revision.md](revision.md) integra dictámenes formales de Newton y Feynman: **conformes
de fuente/evidencia**, con 150/150 hashes P2 congelados iguales y ningún hallazgo abierto.
El verificador independiente completó además runtime, comparación de 132 casos y limpieza.

Se reprodujeron y corrigieron datos en caché sin ámbito, filtros heredados al cambiar
disponibilidad, cero inventado, reintento sin categoría, pestaña A→B→A y encuadre que se
perdía al llegar datos frescos. La configuración pública automática omite cookie para no
renovar inactividad; las consultas manuales conservan autenticación. Evidencias rojas/verdes
y límites de cada recheck permanecen en [implementacion.md](implementacion.md).

## Operación, límites y siguiente paso

La ventana autorizada es exclusivamente `curichi_e2e`, roles restringidos y fotos sintéticas
existentes. No se migraron/sembraron bases ni se conectó a `curichi`/`curichi_revision`.
No se reconstruyó la pila Docker/Caddy habitual, abrió túnel ni desplegó.

Las doce omisiones de PG real/S3, lector de pantalla auditivo y escenario con dos categorías
reales no se certifican; este último continúa para M6. Los diagnósticos globales previos
quedan declarados, sin arreglos de dependencias/archivos ajenos. Manuales protegidos aún
declaran una versión anterior de contracts; el estado real está aquí y en VentanaContexto.
Los esquemas generales de respuestas públicas/técnicas conservan su validación previa:
0.22.0 amplía solo exportación. Antes de activar Baches se debe comprobar y planificar
la compatibilidad completa de sus datos reales, además de campos, severidad y radio.

El 17/10 se completaron los controles documentales: escáner sin hallazgos, candidatos
revisados y diff exit 0. El cotejo actual conserva 150 P2, seis P3 y 34 E2E respecto al estado
probado. Enlaces locales/lista de archivos y estado actual de puertos/Docker comprobados.
No se repitieron los recorridos funcionales del 16/10 por el cierre de los documentos.

La expectativa de enlace autorizada en [ampliacion-e2e-mapa.md](ampliacion-e2e-mapa.md)
quedó corregida con preflight rojo/focal verde, revisión independiente y **G4 completo 43/43**.
El popup y el retorno preservan categoría/UV; CA10 pasó al primer intento. Los intentos rojos
originales siguen conservados y no se contabilizan como verdes.

**Siguiente paso:** preparar el plan M6 de Baches y concretar campos, severidad, radio y
compatibilidad de los datos de esa categoría antes de implementarla/activarla. M5 no activa
otra categoría ni autoriza desplegar, commitear o publicar. Contexto actualizado en la raíz.
No se aplicó reversión; cualquier retirada futura se seleccionaría por inventario propio,
preservando los cambios ajenos y sin ejecutar operaciones destructivas automáticas.
