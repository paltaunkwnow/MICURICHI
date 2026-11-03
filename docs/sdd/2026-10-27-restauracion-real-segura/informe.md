# M10.3 — Cierre local del ensayo real de respaldo y restauración

**Cerrado en local el2026-10-28, con verificación operacional independiente conforme.**
Los casos actual e histórico se cifraron, descifraron y restauraron realmente en bancos
sintéticos nuevos. Se conservaron datos, archivos y bancos. No se retiraron estructuras
ni compatibilidad HTTP, ni se abrió producción o se cerró por ello la Fase1.

## Qué cambió

Node rechaza destinos existentes antes de crear/migrar/cargar y ya no los borra. La
preparación de catálogo solo admite las semillas exactas de un destino nuevo sin datos;
Node y Shell fallan ante diferencias o errores. El runner limita bases, herramientas,
rutas, identidad y checkpoints; no repite etapas inciertas o completas.

La primera ejecución de GPG quedó incierta. Se comprobó un defecto de ruta Windows
interpretada como relativa por Git GPG; stderr textual original no se conservó y no se
afirma una causa única del exit2. La corrección normaliza sus argumentos POSIX y añade
diagnóstico redactado. Una continuación manual sellada conservó intactos el padre y sus
artefactos, heredó cuatro checkpoints completos y ejecutó once nuevos, sin resetear el
intento anterior. Las dos puertas independientes se completaron antes de operar.

## Verificación

| Control | Resultado y atribución |
|---|---|
| Implementación inicial | Turing77/77; baseline46 conservados |
| Gate independiente inicial | Meitner77/77 propios y revisión estática Laplace conforme |
| Corrección GPG | Turing93/93;77 anteriores conservados,16 nuevos |
| Gate independiente correctiva | Meitner31 actuales propios +62 anteriores reutilizados por hash/dependencias; Laplace sin bloqueantes |
| Cifrado/descifrado real | Actual79005 bytes e histórico63952: igualdad byte a byte y SHA-256 idéntico al dump |
| Restore actual | 21→21, cuatro reportes: uno por categoría |
| Restore histórico | 19→21, un ejemplo de Inundaciones conservado mediante helpers Node+Shell |
| Negativos reales | Dos destinos ocupados rechazados; alteración con igual conteo y pérdida de categoría detectadas en cada copia; cuatro rollback con huellas anteriores/finales iguales |
| Comprobación operacional independiente | Meitner139SELECT, cuatro conexiones de solo lectura, contenido/IDs/auxiliares/restricciones/geometrías conformes |
| Integridad | Ocho fuentes y cápsula estables; diez artefactos iniciales intactos;15 checkpoints válidos (4 heredados,11 nuevos) |

No sumar77 y93 como casos distintos ni presentar62 reutilizados como otra ejecución.
Sintaxis/Biome/YAML locales aprobaron en sus alcances; ShellCheck ausente y CI remoto
siguen no verificados. No se repitieron suites de apps sin cambios ni etapas operativas.

Se comprobaron cuentas, fotos referidas, auditoría, contadores/idempotencias y demás
auxiliares de la fixture; cero geometrías inválidas y restricciones no validadas. El control
independiente confirmó también que las fuentes seguían iguales al momento de respaldarlas
y las copias iguales a sus recibos tras los negativos. No se conectó a bases protegidas.

## Entrega conservada

| Banco | OID |
|---|---|
| `curichi_sdd_m10_20261027_actual` |205892|
| `curichi_sdd_m10_20261027_copia_actual` |207565|
| `curichi_sdd_m10_20261027_pre0020` |209239|
| `curichi_sdd_m10_20261027_copia_pre0020` |210842|

Servidor7688456033622585387, dueño curichi. PostgreSQL/pg_dump/pg_restore18.6 y GnuPG2.4.9
ya instalados. Ninguna descarga, instalación, cambio de roles globales, contraseña, sistema,
variables persistentes o limpieza de cachés/logs. Sin DROP, Dockerdown/rm/-v, commit/push/PR.

Evidencia completa en `.turbo/m10-3-2026-10-27/`: diarios padre/hijo, sello, archivos reales,
recibos, logs, freezes y cápsula `cierre/fuente-operacion/` para distinguir cambios futuros.
El original permanece incierto deliberadamente; **no editarlo ni volver a ejecutar el ensayo**.
Los bancos se conservan; este cierre no autoriza borrarlos.

Control final del principal a18:45UTC:8/8fuentes y8/8cápsula iguales al freeze;30archivos
de producto/documentación cambiados desde F0, todos dentro del inventario M10.3 o la
propuesta M10.4. Cero cambios inesperados, borrados, archivos enumerados ausentes o enlaces
locales rotos. Rama/HEAD sin cambios y `git diff --check` exit0. Metadata completa en
`cierre/integridad-final-m10-3.json`; es integridad de cierre, no otra ejecución de pruebas.

La revisión automática de la consulta final de agentes GPG y la verificación independiente
se interrumpieron por límite de uso; no fueron rechazos por inseguridad ni fallos de los
restores. Tras reanudarlas por los mismos mecanismos, finalizaron correctamente: cero
agentes activos de los homedirs propios, cuatro conexiones independientes cerradas y ningún
hijo pendiente. Los intentos fallidos quedaron registrados.

## Documentos y límites

[Plan aprobado](plan.md), [línea base](linea-base.md), [implementación](implementacion.md),
[corrección](correccion-gpg.md), [operación real](operacion.md),
[gate correctiva](puerta-tecnica-correccion-gpg.md) y
[verificación operacional independiente](verificacion-operacional.md).

Son fixtures de conservación: referencias fotográficas, no objetos; sin PIP, API,
autenticación o DBSCAN de este ensayo. El histórico0019 tiene puntos críticos vacíos:
no acredita todos los históricos ni transformaciones de auxiliares poblados. No certifica
todos los índices únicos independientes, ACL/secuencias/disparadores, S3/fotos externas,
concurrencia, apagado, CI remoto, hardware ni custodia durable de claves. La clave efímera
prueba el ciclo realizado; no proporciona recuperación futura del ciphertext por sí sola.

La demo se mantuvo separada y está disponible: web4000, panel4100, API4001 y geo4002 en
127.0.0.2; cincoHTTP200, API sin degradación y cuatro categorías a18:32UTC. Es disponibilidad,
no nueva ejecución de las14E2E históricas.

El siguiente paso es aprobar el [plan compatible de consumidores internos M10.4](../2026-10-28-consumidores-internos/plan.md). Mantendrá
vista/columnas/cuota/HTTP hasta sus puertas posteriores. No se declara M10 completo ni
se eliminan decisiones municipales, ventana de convivencia o reversa multitemática pendientes.
