# M10.4 — Consumidores internos compatibles

**CERRADO EN LOCAL el29/10/2026.** Implementación, confirmación independiente y
[adenda documental final](revision-cierre.md) conformes,5/5cotejos y0hallazgos.
Este cierre no es aprobación de M10 completo, Fase1 o producción. Plan/inventario aprobados por el usuario el28/10: [plan.md](plan.md).

## Resultado

Seed/helper y bancos delimitados usan la tabla física reporte, conservando el filtro de
inundación que antes aportaba la vista. La FK tipada de fotos apunta a reporte.id con cascade.
La limpieza del banco conserva puntos/reportes/fotos de las otras categorías, aun con la misma
marca sintética. El humo de CI exige inundaciones, conserva tres comprobaciones y la de UV.
Imports seguros, alias JSON/NULL/false,30tuplas manuales y distribuciones históricas preservadas.
Los bancos siguen midiendo consultas históricas; no acreditan el SELECT HTTP actual.

Se mantienen vista, columnas planas, trigger, enums, ambas formas HTTP, cuota antigua con
limpieza/ACL y contador vigente. Sin nuevas migraciones ni cambio de contratos. Las cuatro
categorías ya funcionaban en la instalación local separada antes de M10.4.

## Verificación y regresiones

**Cero regresiones funcionales y bloqueo de formato resuelto.**

| Control | Resultado y procedencia |
|---|---|
| DB completa independiente |361PASS/0FAIL/0SKIP en una pasada;350anteriores conservados y11nuevos;31archivos,307,90s |
| API completa independiente |562PASS/12SKIP históricos,0FAIL;574casos conservados con exactamente las mismas omisiones;256,72s |
| Arnés Node independiente |19PASS/0FAIL/0SKIP; SQL literal en PGlite/PostGIS y mocks, sin operadores reales |
| Tipos de consumidores |Typegraph exit0,6tareas; compilados DB conservados |
| Sintaxis/YAML/secretos |3JS y YAML exit0; escaneo local y archivos nuevos sin secretos nuevos |
| Biome correctivo independiente |15archivos TS/JS,exit0; mismo comando/cwd raíz del intento inicial rojo |
| Equivalencia tras formato |AST/tokens idénticos; solo un test cambió espacios/saltos,17fuentes y6dist quietos |
| Revisión funcional/seguridad/alcance |Godel conforme,0hallazgos;76casos/186aserciones de los archivos afectados conservados; cápsula M10.3 íntegra8/8 |

Salida completa y comparación por caso: [verificación inicial](verificacion.md).
La confirmación final es [CIERRE_APTO correctivo](verificacion-formato.md): preserva el
NO_CIERRE original y102artefactos idénticos. Las suites completas anteriores se reutilizan
por equivalencia AST y SHA después del formato; no se presentan como reejecutadas el29/10.

Se conserva el incidente del implementador: full352PASS/9auto-SKIP por timeout antes de9casos,
reintento dirigido9/9 y posterior full independiente361/361 limpio. No se ocultó ni se cambió
el timeout. Biome detectó después una cadena multilinea en una prueba nueva; el trabajador
corrigió solo formato, dirigidas10/10 antes/después y AST idéntico. Hegel lo confirmó por su
propio comparador y Biome. Los12PG/S3 de API siguen NO_VERIFICADOS, no cuentan como PASS.

Implementación y comandos: [baseline](linea-base.md), [entrega](implementacion.md),
[Parte5](implementacion-parte5.md), [corrección](implementacion-formato.md),
[revisión Parte4](revision-parte4.md) y [revisión final](revision-final.md).

## Alcance y conservación

[Archivos exactos](archivos.txt) calculados contra F0 propio, no HEAD. Los21archivos
aprobados y documentación conservan los cambios ajenos anteriores. Manuales solo
fecha/estado§1/§4.8/§16.7; APIREADME solo cuota. Rama codex/cuatro-categorias y
HEAD59b80781030707b8c3334bfbfd40f80000c60a57 conservados, sin nueva publicación Git.

Pruebas herméticas con datos ficticios; sin PostgreSQL/Docker/S3/HTTP operacional,
seed/bancos/SQLmanual reales o modificaciones de la demo. Cápsula M10.3 con el CI anterior
preservada; CI actual cambió solo en su humo y nueva línea del arnés. No se ejecutó CI remoto.
No hay nuevas pruebas de interfaz, producción, rendimiento HTTP o concurrencia PG real.
El lint/audit global histórico no se reabre con un delta sin cambio de dependencias.

## Qué falta para M10 y el proyecto

1. [M10.5 aprobado el29/10](plan-m10-5.md): separar pruebas históricas y latest en6tests
   y README DB. Sin DDL ni funcionalidad nueva; inicia después de este cierre.
2. Retención/limpieza y ACL de cuota histórica, autoridad JSON y reversa multitemática:
   decisiones e inventarios de sus cambios antes de retirar estructuras. Reversa0020 no
   sirve con las cuatro categorías; cupo_contador se conserva.
3. Convivencia medida de clientes/PWA y criterios de retiro HTTP. Sin duración aprobada;
   cero tráfico antiguo no demuestra abandono ni ausencia de lectores de campos planos.
4. Cierre humano de Fase1/producción: fuente/licencia de capas, parámetros/plazos/retención
   municipales, privacidad de Persona, hosting/mapas/secretos, fotos fuera de máquina y
   custodia de claves; verificaciones reales pendientes.

Este cierre no autoriza DROP, migrar bases protegidas/demo, retirar compatibilidad,
publicar Git o declarar el software certificado para producción.
