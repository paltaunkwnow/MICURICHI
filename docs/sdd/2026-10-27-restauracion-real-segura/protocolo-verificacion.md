# M10.3 — Protocolo de comprobación del ensayo aprobado

Estado al abrir la corrida: **PENDIENTE** de implementación y control independiente.
Complementa el [plan aprobado](plan.md); no amplía archivos, bancos ni permisos.
Todos los resultados de ejecución se registrarán con fecha UTC, comando, exit y atribución.

## Puerta técnica previa a cualquier operación real

| Comprobación | Evidencia exigida |
|---|---|
| Destino existente | Rechazo antes de crear/migrar/cargar; nada de DROP/CREATE sobre él |
| Catálogo inicial | Solo seeds exactos de migración en destino nuevo sin datos; rechazar diferencias y SQL fallido; sin CASCADE |
| Aislamiento | Import/estado sin SQL/procesos; tests bloquean operadores antes del import/source; ningún fallback real |
| Diario e identidad | Bancos fijos y OID/diario propios; etapa incierta impide repetir carga, restore o migración automáticamente |
| Secretos | Clave por descriptor y memoria privada; sin URLs/clave/credenciales en argv, logs o artefactos |
| Baseline y resultado | Conservar 23 Node + 23 Bash anteriores; nuevos rojos/verdes; sintaxis/formato/YAML; fuente quieta |
| Revisión independiente | Funcionalidad y seguridad sobre el delta exacto F0; verificación propia de suites antes de operar |

No atribuir conformidad hasta recibir las salidas y comprobar sus hashes. Las pruebas
previas de mocks no acreditan por sí solas el SQL o la criptografía del motor real.

## Matriz operativa posterior a esa puerta

| Caso | Origen autorizado | Copia nueva autorizada | Resultado esperado |
|---|---|---|---|
| Actual | `curichi_sdd_m10_20261027_actual`, esquema0021 | `curichi_sdd_m10_20261027_copia_actual` | Cuatro categorías y todas las entidades sintéticas iguales tras cifrar/descifrar/restaurar |
| Pre0020 | `curichi_sdd_m10_20261027_pre0020`, esquema0019 | `curichi_sdd_m10_20261027_copia_pre0020` | Restaurar0019 y migrar0021 conserva datos y tipos; nuevas estructuras legítimas diferenciadas |

`template1` solo metadatos/creación. Si falta una herramienta o permiso, detenerse sin
instalar ni alterar roles. No usar Docker run/pull/build ni `simulacro` heredado con borrado.
No conectar `curichi`, `curichi_revision`, `postgres`, E2E, demo o bancoM9 para este ensayo.
Nombres coincidentes sin identidad propia y etapas inciertas son rechazos, no invitación
a vaciar o recrear. Los cuatro bancos y archivos sintéticos se conservan al terminar.

Registrar por caso migración, OID, conteos/huellas por categoría, geometrías y referencias,
cuentas, fotos referidas, cupos, auditoría e idempotencia; versión de herramientas instalada,
hashes/tamaños reales de archivos y byteigualdad tras descifrar. Conservar hora/exit de cada
etapa antes de evaluar recursos de la siguiente. No inventar duración de una etapa interrumpida.

Negativos solo en copia propia: destino ocupado rechazado sin cambios; cambio de contenido
con igual conteo y pérdida de categoría detectados dentro de transacción con ROLLBACK.
Capturar pruebas del retorno al estado anterior. No convertir esos negativos en cambios
permanentes ni realizarlos en instalaciones existentes.
`BEGIN`, alteración, verificador y `ROLLBACK` deben compartir la conexión de la copia;
un `psql` independiente por consulta no observaría el cambio sin confirmar. La inyección
del ejecutor SQL del verificador debe respetar esa conexión durante cada negativo.

## Cierre

Registrar toda omisión y distinguir prueba real, mock, lectura e inferencia. Confirmar cierre
de hijos/agenteGPG propios y conservar bancos/artefactos. La demo se mantiene abierta; si los
recursos obligan a pausarla, identificar sus procesos y reabrirla con `iniciar`, sin preparar,
seed, carga o migración. No cerrar aplicaciones ajenas ni cambiar configuración del equipo.

Este ensayo no acredita S3/fotos externas, custodia durable de claves, corte eléctrico,
todos los esquemas históricos, producción, ventana de adopción ni contracción física/HTTP.
