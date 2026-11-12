# M10.2 — Cierre local de la verificación multitemática de respaldos

**Cerrado en local el 2026-10-27 (America/La_Paz), dentro del alcance aislado aprobado.**
Sin bloqueantes nuevos ni regresiones observadas en los controles comparables. El usuario
aprobó «Aprobar ambos bloques, en orden»: RF-01 terminó primero y después se ejecutó
[este plan](plan.md). No se certifica una restauración real por aprobar mocks.

## Resultado

Las comprobaciones eligen la tabla física por migración: `reporte` desde 0020 y
`reporte_inundacion` antes. Ya no se usa la vista actual de Inundaciones para representar
las cuatro categorías. Node compara todas las categorías, conteos y huellas SHA-256 del
contenido y del catálogo, sin filtrar por activación; conserva tipos y NULL, y permite
columnas añadidas por migraciones posteriores sin ocultar columnas de origen perdidas.

Shell comprueba todos los reportes y usuarios antes de cargar un destino y valida
manifiesto, versión, tamaños, integridad, tablas físicas y conteos. Los fallos SQL no
se interpretan como destino vacío. Importar/source no inicia las acciones operativas.
Los arneses bloquean operadores reales antes de cargar el código y trabajan con fixtures.
CI incorpora los controles aislados; el trabajo `postgres-real` sigue idéntico a F0.

**Límite heredado relevante:** el CLI Node `restaurar` conserva el DROP/CREATE anterior
(`scripts/respaldo.mjs:195–215`); solo protege BASE por igualdad. No tiene la nueva guarda
de Shell. No se ejecutó ese CLI y este cierre no autoriza su uso sobre datos existentes.
[M10.3](../2026-10-27-restauracion-real-segura/plan.md) propone retirar ese borrado automático
y ensayar una restauración real solo con bases sintéticas nuevas; requiere aprobación.

## Verificación y atribución

| Control | Implementador Bernoulli | Verificador independiente Socrates |
|---|---|---|
| Node | 23/23, 0 fallos, 0 skip | 23/23, 0 fallos, 0 skip |
| Bash | 23/23, 0 fallos | 23/23, 0 fallos |
| Sintaxis Node/Bash | Exit 0 en cuatro archivos | Exit 0 en cuatro archivos |
| Biome de los dos `.mjs` | Exit 0 | Exit 0 |
| YAML y conservación de `postgres-real` | Conforme con parser instalado | Comprobación propia conforme |
| ShellCheck | Ausente; NO_VERIFICADO | Ausente; NO_VERIFICADO, detector exit 3 |
| Quietud de las seis fuentes | Freeze guardado | 6/6 SHA-256 iguales antes/después |

Son **46 casos únicos**, ejecutados también de manera independiente; no 92 casos distintos.
Se conservaron los 18 casos Node y 16 Bash del rojo inicial y se añadieron cinco y siete.
Socrates comparó los 23+23 nombres finales con los del implementador: ninguno perdido.
El primer arranque Bash de cada actor falló por MSYS/sandbox antes de ejecutar casos;
los reintentos del mismo control fuera del sandbox aprobaron sin cambios de pruebas.

El implementador detectó tres mutantes por aserciones: ignorar contenido produjo seis
fallos; elegir la vista actual, dieciocho; ignorar catálogo, uno. El verificador reutilizó
esa evidencia y la atribuyó correctamente, sin afirmar una ejecución propia de mutantes.
Leibniz realizó la revisión estática funcional y de seguridad: **conforme con limitaciones**,
cero hallazgos nuevos bloqueantes. No ejecutó suites. Los tres actores finalizaron.

[Línea base](linea-base.md), [implementación y salidas literales](implementacion.md),
[revisión independiente](revision.md) y [verificación independiente](verificacion.md).
Los tres entregables se copiaron sin alterar desde sus artefactos; se comprobó igualdad
SHA-256. Evidencia completa en `.turbo/m10-2-2026-10-27/`.

## Integridad y alcance

Seis archivos de producto/documentación operativa, dos de ellos nuevos, enumerados en
[archivos.txt](archivos.txt). Cuatro copias F0 intactas; seis fuentes iguales al freeze
y ocho fuentes API/RF-01 estables al retomar el cierre. No se usó HEAD como línea base
de estos cambios. Índices, roadmap y `VentanaContexto.md` se sincronizan como documentación
de continuidad, conservando evidencia y el resto de cambios locales.

Control final del principal a las 00:49:23 UTC del28/10 (27/10 local): seis fuentes M10.2 y
ocho API/RF-01 iguales a sus freezes; nueve documentos creados/modificados durante el cierre,
todos dentro del inventario. Cero borrados, cambios inesperados, archivos enumerados ausentes
o enlaces locales rotos. Rama y HEAD sin cambios; `git diff --check` terminó con exit0.
Evidencia `.turbo/m10-2-2026-10-27/cierre/integridad-cierre.json`. Es un control de cierre
documental y de integridad; no añade pruebas operativas a las suites ya verificadas.

No se ejecutaron acciones operativas de respaldo, PostgreSQL, Docker, S3, GPG, HTTP o
red desde los arneses. No hubo instalaciones, cambios de dependencias, secretos impresos,
limpieza de cachés/logs, commits, push ni PR nuevos. No se tocaron bases protegidas.

La demo se comprobó **por separado**, sin reiniciarla ni preparar, sembrar o migrar datos:
el 28/10 a las 00:46:45 UTC (27/10 local), web, panel, API ready, geo ready y configuración
devolvieron 200; API sin degradación y cuatro slugs activos. El primer intento de HTTP
en sandbox recibió EACCES, no probó una caída. El reintento autorizado fuera del sandbox
confirmó que los servicios seguían abiertos. Evidencia
`.turbo/m10-2-2026-10-27/cierre/demo-http-sin-sandbox.json`.

## Qué sigue sin verificarse

- SQL generado en PostgreSQL/PostGIS, transformación de datos de migraciones antiguas,
  dump/restauración y cifrado/descifrado reales. El oráculo Node calcula huellas de fixtures
  en JavaScript; no interpreta SQL. Shell usa COPY sintético.
- ShellCheck local y ejecución remota de CI; respaldos S3 y fotos fuera del servidor.
- Convivencia de clientes, consumidores internos, reversa multitemática y contracción
  física/HTTP; M10 completo, producción y cierre humano de Fase 1 permanecen abiertos.

Próximo paso concreto: revisar y aprobar el [plan M10.3](../2026-10-27-restauracion-real-segura/plan.md).
Propone ocho archivos y cuatro bancos sintéticos conservados, con acceso administrativo
limitado a `template1`. No está aprobado por el cierre de este bloque ni se ejecutó.
