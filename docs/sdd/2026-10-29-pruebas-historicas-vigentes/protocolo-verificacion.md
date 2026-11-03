# M10.5 — Protocolo de conservación y verificación

Plan aprobado: [plan.md](plan.md). No se aplica un retiro de estructuras; se separan
pruebas históricas de integración actual dentro de los siete archivos autorizados.

## Antes y después

El trabajador raíz mide suite DB completa y tipos antes de editar, con salida literal,
exit, RAM y casos. F0 propio: `.turbo/m10-5-2026-10-29/f0/manifest.json`,1006archivos
y siete copias de producto; los cambios anteriores de M10.4 son ajenos conservados.
No usar HEAD ni el freeze M10.4 como antes de esta corrida.

Se conservan nombres y significado de casos, matchers, números, filas positivas y rechazos.
Un literal de nombre de tabla dentro de SQL puede adaptarse al destino físico autorizado
con su predicado de categoría; debe demostrar equivalencia, no ampliar la lectura/borrado.
Toda alteración adicional de expectativa se justifica semánticamente, no por hacer verde.
No quitar casos/aserciones, añadir skip/only, relajar timeouts o cambiar coordenadas/radios.

## Qué debe demostrar el cambio

- Recurrencia actual: ambas suites usan latest, tabla física y categoría explícita donde
  la vista la aportaba. Conservar altas, unión/división, grupos lejanos y sus IDs,2000filas,
  concurrencia, métrica y CRS; negativos con otras categorías en fixtures controladas.
- Transiciones históricas0017/0019/0020/0021: versión real aplicada en catálogo, filas y
  características de esa transición. No basta buscar una cadena `hasta` en la fuente.
  Acotar también desde cero e idempotencia; no sustituir nombres de tabla históricos.
- Excepción de reversa0020: cadena0021→0019, comparación con0019 y reaplicación hasta0021,
  conservando el rechazo con otras categorías y los negativos de permisos/search_path.
- Integración actual sigue latest: no fijar toda la suite a0021 ni contabilizar pruebas
  históricas como certificación del esquema presente/futuro. M10.4 mantiene su cobertura
  de seed/helper/FK/SQL y las pruebas actuales no se sustituyen por PASS históricos.

## Gate independiente

Verificador nativo ejecuta suite DB completa, tipos y Biome de los seis TS desde raíz,
comparando casos contra baseline; revisor nativo evalúa el delta contra F0/plan y el
significado de las aserciones. Mismo criterio: regresión bloqueante, sin verde por conteo
si desapareció un caso. Documentar intentos incompletos y distinguir evidencia propia/reusada.
Fuente de producción, migraciones, contracts, API/geo/apps/scripts/CI y manuales deben
conservar sus SHA de F0. Si permanecen iguales, las suites intactas de API/UI/Node de M10.4
no se repiten sin una dependencia o preocupación nueva; no llamarlas ejecuciones M10.5.

Un solo heavy, RAM>=1500MiB antes de cada comando; env hijo sin PG/S3/URLs/secretos heredados.
Fixtures/PGlite y loopback efímero propio, sin PostgreSQL/Docker/S3/HTTP operacional, bancos
o SQL manual reales. Pnpm ya instalado; sin instalaciones, Git de escritura, cambios de
sistema/env persistentes, datos raw ni limpieza de cachés/logs. No alterar la demo/bancos.

El informe final incluye archivos exactos, baselines/rojos/verdes, conservación, límites
y cómo recuperar el contexto. No cierra M10 completo, Fase1 o producción. El inventario
de planificación restante es solo lectura y no aprueba otra implementación.
