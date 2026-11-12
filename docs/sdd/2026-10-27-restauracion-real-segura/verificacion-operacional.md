> Informe independiente de Meitner; solo vínculos adaptados. SHA-256 original: `bf456208149b4e9738f71b0a5dbef75351f8d04c24d12687523ffe7b4eb8b637`.

# M10.3 — verificación operacional independiente final

**CONFORME en local, sin bloqueantes.** El28/10/2026 a18:29UTC se comprobaron resultados PostgreSQL reales mediante139SELECT, cuatro conexiones propias de solo lectura y ningún operador de backup/GPG/restore. Se reutilizó la verificación de archivos inicial de15:54UTC y se confirmó su quietud al finalizar. [Resultado estructurado](../../../.turbo/m10-3-2026-10-27/verificador-operacional/resultado.json).

| Caso sintético | OID origen→copia | Migraciones | Reportes | Resultado |
|---|---|---|---|---|
| Actual, cuatro categorías | 205892→207565 |21→21|4→4, uno por categoría|Conforme|
| Histórico de inundación |209239→210842|19→21|1→1|Conforme|

Servidor `7688456033622585387`, rol `curichi`, loopback127.0.0.1:5432. `default_transaction_read_only=on` y `transaction_read_only=on` confirmados en cada banco. No conexión a template1 ni a bases protegidas. URL derivada a cada destino antes de construir Client; credenciales solo en memoria privada, nunca en logs o variables exportadas.

## Resultados propios

- `snapshot/verificar` deM10.2 con SQL inyectado confirma contenido por categoría, tipos/NULL/geometrías y catálogo, IDs de reportes y conteos. Fuentes iguales a su snapshot al respaldar. Índices15→15(actual),14→15(histórico); restricciones de origen preservadas y cero no validadas.
- Auxiliares completos iguales, incluidos IDs y contenido:13tablas en actual y12en histórico. Actual:1usuario,4fotos referidas,4auditorías,4cupos genéricos y4idempotencias; histórico:1usuario,1foto,1auditoría,1idempotencia y cuota antigua conservada. Tablas legítimas nuevas de la copia histórica vacías. Cero geometrías inválidas en los cuatro bancos.
- El snapshot **completo** de cada copia, incluidas columnas nuevas del histórico, coincide además con los recibos posteriores al restore y al rollback. [SQL y comparaciones](../../../.turbo/m10-3-2026-10-27/verificador-operacional/sql-readonly.json), [contraste de evidencia](../../../.turbo/m10-3-2026-10-27/verificador-operacional/contraste-evidencia.json), [139consultas literales](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/consultas-readonly.2.jsonl). El comparador reutilizó SELECT en caché para evitar consultas duplicadas.
- Dump/descifrado leídos ahora: igualdad byte a byte en ambos casos. Actual79005bytes,SHA256 `3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562`; histórico63952bytes,SHA256 `58ed20231f8fe74e1c174972b1205ee00fc84c7f8e0ff3499cef5fd1a740d971`. Hashes de ambos cifrados actuales coinciden con recibos/resumen. No se ejecutó GPG ni se regeneró ningún archivo.
- Diario hijo:15checkpoints completos con hashes válidos,4heredados idénticos al padre y11nuevos. Recibos de operadores con exit0. Negativos ya ejecutados: destino ocupado rechazado sin cambios, dos mutaciones detectadas por caso y SHAantes/después deROLLBACK iguales; aquí solo se revisaron esos recibos y se contrastó el estado persistido.

## Integridad y recursos

[Archivos antes](../../../.turbo/m10-3-2026-10-27/verificador-operacional/archivos-inicio.json) · [archivos finales](../../../.turbo/m10-3-2026-10-27/verificador-operacional/archivos-final.json):8/8fuentes quietas y cápsula8/8idéntica al freeze operacional `ebfefc674560897b92f2b3792809cb1e8b9c3d9975565dfe73b6ecb08592ff09`. Freeze original `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f` intacto. Los10artefactos del fallo inicial conservan hashes/tamaños; padre sigue incierto, home original vacío y cifrado fallido conservado. Diario hijo/sello/resumen y archivos reales no cambiaron durante el control.

RAM medida antes de cada comando/conexión, mínimo3610MiB, umbral1500. Ejecución en serie y entorno de hijos por allowlist, sin PG/AWS/S3,NODE_OPTIONS,BASH_ENV o --env-file. Primer intento SQL recibióEACCES antes de conectar y ejecutó0consultas; el mismo helper aprobado fuera del sandbox terminó0. Ambos logs se conservan. Ningún fallo de producto atribuido a ese bloqueo.

[Cierre propio](../../../.turbo/m10-3-2026-10-27/verificador-operacional/hijos.json): cuatroClient.end completados, cero PIDs propios activos y cero sesiones pendientes. No se detuvieron procesos ajenos ni se consultó/tocó la demo. Sin subagentes, cambios de producto, políticas persistentes, instalaciones, limpiezas o escriturasGit.

## Límites

GPG2.4.9 y pg_dump/pg_restore18.6 son versiones **registradas por el principal**, sin nueva ejecución. Esta revisión confirma sus recibos y resultados persistidos; no repite criptografía o restauración. Clave efímera sin custodia durable y clave del primer intento perdida. Fotos son referenciasDB, sin comprobación de objetos/S3.

Solo los casos sintéticos actual e histórico0019 descritos: no todos los esquemas. UV y puntos críticos vacíos; sin PIP, DBSCAN, API/HTTP, concurrencia, corte eléctrico, CI remoto, hardware o certificación de producción. No cierra por sí solo la Fase1 ni sustituye su aprobación humana.

## Evidencia literal de comandos

| Control/intento | Exit | RAM MiB | Duración ms | Logs |
|---|---:|---:|---:|---|
| archivos-inicio.1 | 0 | 4123 | 138 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-inicio.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-inicio.1.stderr.log) · [args/RAM/exit](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-inicio.1.json) |
| sql-readonly.1 | 1 | 3657 | 242 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.1.stderr.log) · [args/RAM/exit](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.1.json) |
| sql-readonly.2 | 0 | 3663 | 3421 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.2.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.2.stderr.log) · [args/RAM/exit](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/sql-readonly.2.json) |
| archivos-final.1 | 0 | 3761 | 138 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-final.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-final.1.stderr.log) · [args/RAM/exit](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/archivos-final.1.json) |
| contraste-evidencia.1 | 0 | 3759 | 133 | [stdout](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/contraste-evidencia.1.stdout.log) · [stderr](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/contraste-evidencia.1.stderr.log) · [args/RAM/exit](../../../.turbo/m10-3-2026-10-27/verificador-operacional/logs/contraste-evidencia.1.json) |
