# M10.3 — Resultados del ensayo real conservado

**Operación completada el2026-10-28; comprobación independiente final conforme.**
El principal ejecutó una etapa por llamada, revisando el checkpoint antes de avanzar.
No se repitieron etapas completas, cargas ni restauraciones. Resultado estructurado:
`.turbo/m10-3-2026-10-27/cierre/resumen-operacion-real.json`.
Meitner confirmó posteriormente por139SELECT de solo lectura los cuatro bancos, los
archivos y15checkpoints, sin repetir cifrado/restore/negativos; [informe](verificacion-operacional.md).

## Bancos y casos

Todos pertenecen al servidor `7688456033622585387`, dueño `curichi`; se conservaron.

| Caso / banco | OID | Migraciones | Reportes |
|---|---|---|---|
| `curichi_sdd_m10_20261027_actual` | 205892 | 0021 | Cuatro, uno por categoría |
| `curichi_sdd_m10_20261027_copia_actual` | 207565 | 0021 | Los mismos cuatro |
| `curichi_sdd_m10_20261027_pre0020` | 209239 | 0019 | Un ejemplo de Inundaciones |
| `curichi_sdd_m10_20261027_copia_pre0020` | 210842 | 0019 restaurada →0021 | El mismo ejemplo, convertido por migraciones |

El caso actual usó los helpers Node. El histórico restauró con Node y el helper Shell
`cargar_datos_local`, y después aplicó 0020–0021. PostgreSQL/pg_dump/pg_restore18.6,
PostGIS de la imagen ya instalada `postgis/postgis:18-3.6`; GnuPG2.4.9 de Git.
No hubo descarga, instalación ni construcción de imágenes.

## Cifrado y conservación

| Caso | Dump / descifrado | SHA-256 de ambos | Resultado |
|---|---:|---|---|
| Actual | 79005 bytes | `3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562` | Igualdad byte a byte |
| Histórico | 63952 bytes | `58ed20231f8fe74e1c174972b1205ee00fc84c7f8e0ff3499cef5fd1a740d971` | Igualdad byte a byte |

Se cifró/descifró realmente con AES256 y clave efímera por stdin, sin archivo ni argv
con clave. Los ciphertexts tienen sus hashes/tamaños registrados antes del descifrado.
Los dos homedirs eran propios y sus agentes recibieron cierre específico; la consulta
CIM posterior del28/10 a18:29UTC confirmó **cero agentes activos de esos homedirs**.
No se consultaron ni cerraron agentes/llaveros ajenos.

La clave efímera no es custodia durable: este ensayo acredita el ciclo realizado, no la
capacidad de recuperar mañana el ciphertext sin disponer de su clave. Dumps y descifrados
sintéticos se conservan junto con la evidencia; no hay datos de la instalación de demo.

## Comparación y negativos

Ambas copias aprobaron el verificador M10.2 sobre PostgreSQL real: contenido de reportes,
categorías, geometrías, cuentas, fotos referidas, auditoría, cuotas/contadores, idempotencia,
auxiliares y definiciones de claves dentro de la fixture. Cero geometrías inválidas y cero
restricciones con `convalidated=false`. El histórico admite columnas/tablas/índices nuevos
legítimos y conserva los datos proyectados del origen0019.

En cada copia se rechazó un destino ocupado antes de crear/migrar/cargar. Dos negativos
transaccionales detectaron cambio de contenido con igual conteo y pérdida de categoría.
`BEGIN`, mutación, verificación y `ROLLBACK` compartieron conexión; las huellas antes y
después de cada rollback fueron idénticas. Los negativos no dejaron cambios persistentes.
No se usaron bases protegidas para estos controles.

## Interrupción inicial y continuación explícita

El primer intento de cifrar_actual terminó exit2 y permanece **incierto** en su diario
original, con el ciphertext y homedir originales conservados. Su validez no se acreditó
y la clave anterior se perdió. Se comprobó un defecto de interpretación de ruta Windows
en Git GPG; no se conserva stderr textual para atribuirle una causa única al exit2.

La [corrección](correccion-gpg.md) y su [nueva puerta técnica](puerta-tecnica-correccion-gpg.md)
habilitaron una continuación manual sellada. El hijo conservó los cuatro checkpoints
completos sin ejecutarlos y completó once etapas nuevas: **15 completas en total**.
Padre actual y archivado mantuvieron el mismo hash; no se editó el original para avanzar.
El hijo y sello están en `implementador/correccion-gpg/continuacion-02/` de la evidencia.

Se conservó una cápsula de las ocho fuentes ejecutadas en `cierre/fuente-operacion/`,
con `fuente-operacion-manifest.json`, para distinguirlas de cambios futuros de CI o código.
Freeze de operación `ebfefc674560897b92f2b3792809cb1e8b9c3d9975565dfe73b6ecb08592ff09`.
Los JSON de cada llamada en `cierre/*-real.json` registran UTC y exit. No sumar la espera
de diagnóstico, código o límites de uso como si fuera duración de restauración/RTO.

## Límites

Fixture de conservación, no payloads API/PIP/autenticación ni fotografías reales. Solo
el esquema histórico0019, con puntos críticos vacíos; no todos los históricos ni todas
las transformaciones de auxiliares. No se acreditan todos los índices únicos independientes,
ACL/secuencias/disparadores, S3/fotos externas, pérdida eléctrica, concurrencia, custodia
de claves o producción. ShellCheck local y CI remoto permanecen no verificados.

La demo se reabrió por operación separada normal a15:14UTC, sin preparar/seed/carga/migración;
cinco HTTP200 y cuatro slugs a15:15UTC. Eso es disponibilidad, no nueva ejecución E2E.
Sin commits, push, PR, limpieza de cachés/logs, cambios persistentes o acceso a bases protegidas.
