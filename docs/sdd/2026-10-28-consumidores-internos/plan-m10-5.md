# M10.5 — Separar pruebas históricas y comportamiento vigente

**APROBADO por el usuario el29/10/2026:** «Aprobar y ejecutar M10.5 (Recomendado)»,
respuesta a call_e8c59cf3d0a342b4934d725e5c452d7f. Se ejecuta después de cerrar M10.4.
No modifica funcionalidad, contratos o bases reales.

## Por qué es el siguiente bloque

El inventario de consumidores distinguió pruebas de transiciones históricas y pruebas
de comportamiento actual. Algunas transiciones0017/0019/0020/0021 todavía aplican todas
las migraciones disponibles; una futura migración podría cambiar lo que esas pruebas
dicen demostrar. Dos suites de recurrencia actuales todavía escriben por la vista.
M10.4 dejó esta clasificación restante expresamente fuera de su inventario.

Este bloque conserva pruebas válidas para el esquema actual y pruebas reproducibles
de las transiciones originales. No elimina la vista, campos, trigger, cuota o permisos;
tampoco decide su retiro. Es preparación para el posterior plan de contracción.

Inspección de fuentes realizada el28/10: referencias y bloques descritos en el inventario
de Popper y confirmados por lectura de los seis archivos. No se presenta como tests nuevos
ejecutados. Baseline propio de M10.5 se medirá después de la aprobación.

## Inventario cerrado aprobado — Parte4, packages/db/

Un trabajador raíz sin override de modelo; un escritor y un heavy global.

| Archivo | Cambio permitido y criterio |
|---|---|
| `test/puntos-criticos-entorno.test.ts` | Mantener latest y pasar sus operaciones de reporte a tabla física con filtro flood donde la vista lo aportaba. Conservar altas, fusión/división, grupos lejanos,2000reportes y concurrencia. Añadir negativos multitemáticos sin perder positivos ni recuentos significativos. |
| `test/puntos-criticos-metrica.test.ts` | Mantener latest, métrica/CRS y bordes. Tabla física/filtro de categoría en ambos lados de distancias y lecturas/borrados; mismas coordenadas/radios/valores esperados. Negativos de otras categorías sin convertir este banco en medición nueva. |
| `test/migracion-0017-frecuencia-agua-estancada.test.ts` | Transición0016→0017, desde cero e idempotencia acotadas a0017. Conservar enum/orden y todas las frecuencias previas, filas y rechazos existentes. No sustituir el nombre de tabla histórico. |
| `test/migracion-0019-ubicacion-aproximada.test.ts` | Transición0018→0019, desde cero e idempotencia acotadas a0019. Conservar métodos anteriores, precisión178 y distanciaNULL; SQL con el nombre histórico. |
| `test/migracion-0020-base-multicategoria.test.ts` | Transición0019→0020, catálogo/vista/sincronizador/ACL de funciones e idempotencia acotados a0020. Excepción: reversa prueba expresamente0021→0019 y reaplica0020+0021, siempre acotada a0021. Mantener el rechazo de reversa con otras categorías y negativos de permisos. |
| `test/migracion-0021-indice-categoria-creado.test.ts` | Índice histórico, idempotencia y EXPLAIN acotados a0021. Mismos estados/predicado/orden/fixtures y aserciones de plan; no presentarlo como rendimiento del esquema futuro. |
| `README.md` | Documentar qué suites prueban una transición fija y cuáles usan latest, con límites de pruebas/mediciones. |

No editar producto `src/`, migraciones/reversas, contratos, apps, API, geo, scripts o CI.
Sin AGENTS.md/CLAUDE.md. Si la inspección demuestra que un archivo listado no necesita
delta, se registra no-op; no se modifica para llenar el inventario. Fuera de esos7archivos
solo documentación de la corrida, índices/roadmap y VentanaContexto.md, mantenidos por Parte5.
La corrida aprobada tendrá F0 propio: no usar HEAD ni F0 M10.4 como único antes de M10.5.

## Criterios y verificación

1. Suite y tipos DB antes de editar; conservar stdout/exit/RAM y mapa de nombres,
   aserciones y hooks. Identificar rojos previos sin corregirlos de paso.
2. Conservar los casos/aserciones existentes y sus valores/negativos. Una prueba histórica
   acredita migración, catálogo y filas reales de su versión; no basta buscar una cadena
   `hasta` en el código. La cobertura nueva debe demostrar lo que faltaba antes del cambio.
3. Los dos archivos de recurrencia siguen usando latest. Demostrar aislamiento con
   filas de otras categorías, estados y membresías concretas; preservar las comprobaciones
   métricas/concurrencia, sin ampliar DELETE por un reemplazo textual.
4. P4/P5 de M10.4 siguen disponibles como integración actual de seed/helper/FK/SQL; no
   fijar la suite completa a0021 ni sustituir validación del presente por PASS históricos.
   API/geo y sus contratos mantienen su cobertura actual sin cambiar fuente o expectativas.
5. Ejecutar suite DB completa, tipos y Biome del delta en serie. Grafo/tipos o suites de
   consumidores solo si una dependencia real lo exige; no repetir builds/suites de apps
   intactas. Las migraciones de producto conservan sus hashes; ningún número nuevo.
6. Revisión independiente funcional/seguridad y verificación nativas, comparación por caso
   y SHA. Una regresión bloquea. No omitir casos, relajar timeouts, borrar aserciones o
   reclasificar un error como éxito para obtener verde. Controlar aquí la intermitencia
   registrada de setup, conservando todos los intentos.
7. Informe, archivos exactos, índices/roadmap y contexto sincronizados; sin cierre automático
   de M10 completo, Fase1 o producción.

Todas las pruebas con PGlite/fixtures ficticias y las dependencias instaladas. Loopback
efímero solo entre fixtures propias si lo requieren. Sin PostgreSQL real/Docker/S3/HTTP
operacional/CLI de bancos, datos de demo/bancos retenidos o lectura de secretos. RAM>=1500MiB
antes de cada heavy; sin ejecuciones paralelas pesadas, instalaciones, cambios de sistema/env,
Git/publicación o limpieza de cachés/logs. No editar data/raw.

## Lo que seguirá requiriendo decisión y plan

Retención/limpieza y ACL de la cuota histórica; autoridad JSON y reversa multitemática;
ventana y cobertura de convivencia de clientes/PWA; retiro físico/HTTP y operaciones reales
de actualización. Nada de eso queda aprobado por este bloque de pruebas.

La aprobación explícita anterior satisface AGENTS.md§0.9 y§5.2. No se amplía el inventario
ni se interpreta como permiso para DDL, retiro de HTTP u operaciones reales.
