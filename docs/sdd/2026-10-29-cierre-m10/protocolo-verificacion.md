# Cierre M10 — protocolo de pruebas aisladas

El [plan canónico aprobado](plan.md) y su F0 propio prevalecen sobre resúmenes anteriores.
Todos los ejecutores conservan stdout/stderr, argumentos/cwd, RAM, fecha UTC, exit y mapa
por nombre/estado. Un heavy global, un escritor por carpeta y ninguna prueba real implícita.

## Baseline y conservación

- Capturar antes de editar los paquetes/operadores afectados. Reutilizar una medición
  anterior solo si fuentes/dependencias/dist relevantes coinciden por SHA y no cambió su
  entorno; documentar qué se reutiliza y qué se ejecuta. Mantener cápsulas M9/M10.3/M10.5.
- Caso verde que desaparece o pasa a rojo bloquea; no reducir aserciones/negativos,
  geometrías, volúmenes, roles, timeouts o controles de cámara/seguridad para obtener PASS.
- No fijar pruebas actuales a0021 para ocultar el cambio. Los tests históricos acotados
  a su versión siguen así; excepción0020 conserva21→19→21, no prueba la nueva reversa.
- Ensayos de objetos eliminados incluyen equivalencia100% de seis campos, detalle completo
  por categoría/versiones, NULL/ausente/false, conteos/huellas de columnas no tocadas,
  auxiliares/cupos y copia exacta de cuota. No basta intersección de columnas o conteos.

## Entorno

Pnpm instalado `C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false`.
RAM>=1500MiB antes de unit/SQL; tipos/build/suites en serie. Biome desde raíz del repo.
Entorno hijo por lista permitida OS+NODE_ENV=test/CI, sin PG*/DATABASE/POSTGRES/S3/URLs/
credenciales heredadas ni dotenv. PGlite/fixtures, comandos/SQL de operadores simulados;
loopback efímero propio con el transporte original cuando una suite lo necesita.
No adaptar HTTP a un falso transporte para sortear restricciones. Una denegación de
herramienta se escala para el mismo control autorizado si procede, sin bypass.

## Metas de cierre

Suite propia antes/después por parte; suite DB/API/geo y Node/Bash afectados, tipos del
grafo, build que valide artefactos necesarios, OpenAPI idéntico, Biome raíz y secretos.
Control de nombres/aserciones y SHA. Revisión funcional y auditoría independientes.
Los12SKIP históricos PG/S3 de API continúan NO_VERIFICADOS hasta prueba real autorizada.
Fallos/audit/lint ajenos se documentan con fecha y no se corrigen de pasada.

Probar0022 pendiente sin consentimiento por runner/CLI/SQLdirecto, conservación/no-op,
rechazo de versiones/estados incompatibles y rollback completo. Reversa multicategoría
22→21→22, archivo idéntico/divergente/usuarios faltantes y datos aceptados en22; recuperar
código y esquema como conjunto. Guardas de respaldo/actualizador no permiten destinos
ocupados, pérdida de otra categoría, permiso heredado o arranque/resembrado implícitos.

La guarda de arranque debe demostrar también una versión posterior que solo cambie el
historial de migraciones y conserve las relaciones/columnas de22. Un comentario de catálogo
no acredita por sí solo la última versión. La solución debe respetar que `curichi_api`
no tiene SELECT sobre `_migraciones`: interfaz mínima controlada, sin acceso general a
la tabla ni elevación global de roles, con comprobaciones SQL/ACL positivas y negativas.
No sustituir esa prueba por un mock que invente una propiedad de versión inexistente.

La verificación actual **no** ejecuta CLI de bancos, backup/restauración reales, Docker,
demo, PGreal/S3, E2E contra instalaciones, CI remoto o despliegue. Sus protocolos de
operación se preparan después y requieren aprobación específica antes de actuar.
