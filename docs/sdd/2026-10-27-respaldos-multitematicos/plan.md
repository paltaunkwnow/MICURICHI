# M10.2 — Verificación multitemática de respaldos

**Aprobado por el usuario el27/10: «Aprobar ambos bloques, en orden».**
Este documento materializa el inventario ya aprobado en
`../2026-10-26-contraccion-compatible/inventario.md`. Primero terminar y verificarRF-01;
después implementar este bloque. No solicitar de nuevo la aprobación de estos seis archivos.
Parte5; carpetas designadas`scripts/`,`infra/respaldo/`,`.github/workflows/` y documentación
operativa enumerada. Un trabajador raíz, sin override de modelo, y revisión independiente.

**Cerrado en local el 2026-10-27, después de RF-01:** trabajador raíz nativo Bernoulli,
con ownership de los seis archivos; revisión estática de Leibniz y verificación independiente
de Socrates conformes en su alcance. Node 23/23 y Bash 23/23; sintaxis, Biome y YAML aprobados.
ShellCheck ausente, NO_VERIFICADO local. Cuatro copias F0 y seis fuentes verificadas por SHA-256.
Ver [informe y límites](informe.md): solo mocks, sin restauración ni cifrado reales.
La demo permaneció abierta y sus datos no fueron objeto de estos arneses.

## Problema y resultado esperado

El simulacro Node cuenta la vista de Inundaciones, por lo que puede omitir pérdidas de las
otras categorías. El shell exige datos de`reporte_inundacion`, que desde0020 es una vista,
y su guarda de destino vacío no contempla todos los reportes. Se comprobará la tabla física
correcta según versión, sin convertir la vista en un supuesto contenedor de las cuatro categorías.

## Inventario cerrado

| Archivo | Cambio |
|---|---|
| `scripts/respaldo.mjs` | Comparaciones de tabla física, categorías, conteos/contenido y compatibilidad por migración; importación sin ejecuciónCLI |
| `scripts/respaldo.test.mjs` (nuevo) | Casos Node con comandos/SQL simulados, positivos y negativos, sinDocker/PG/S3 |
| `infra/respaldo/respaldo.sh` | Tabla de datos correcta en dump/manifiesto y guarda completa de destino vacío; conservar cifrado/integridad |
| `infra/respaldo/respaldo.test.sh` (nuevo) | Arnés aislado, comandos simulados y barrera contra accesos externos |
| `.github/workflows/ci.yml` | Añadir controles aislados al trabajo existente; conservar simulacro real deCI. No ejecutarCI/push |
| `docs/operaciones/respaldo-y-restauracion.md` | Procedimiento y compatibilidad, límites del arnés y ensayo real pendiente |

Documentación de esta corrida (`plan`,`arbol-inicial`,`archivos`,`linea-base`,
`implementacion`,`verificacion`,`revision`,`informe`), índices, roadmap14§5 yVentanaContexto.
Evidencia local en`.turbo/m10-2-2026-10-27/`. Sin cambios aAGENTS/CLAUDE, contratos, esquema,
apps, API, geo, ETL, Dockerfiles, configuración de sistema o dependencias.

## Criterios verificables

1. Un respaldo actual se verifica contra`public.reporte`; uno anterior a0020 conserva el
   tratamiento correspondiente a su tabla física antigua. No aceptar una vista comoTABLE DATA.
2. Pérdida de una categoría distinta de inundación o cambio de contenido sin cambio de conteo
   impiden declarar verificación conforme. Conservar la distinción entre valores yNULL.
3. Destino con reportes de cualquier categoría se rechaza antes de cargar. Manifiesto incompleto,
   versión inconsistente y errores de herramientas no terminan como éxito.
4. No degradar cifrado, comprobación de integridad, reglas de restauración/versionado ni
   protección de credenciales. Importar el móduloNode no inicia procesos ni conexiones.
5. Pruebas aisladas controlan comandos/SQL reales del flujo mediante mocks; los mocks no
   pueden escapar a herramientas operativas por falta de un reemplazo. Casos nuevos en rojo
   antes del fix, verde después; ninguna aserción previa eliminada.
6. SintaxisNode ybash, pruebasNode/shell, Biome yshellcheck si está instalado; revisión
   independiente funcional y de seguridad del delta. Herramienta ausente se declara, no se instala.

## Ejecución y pruebas permitidas

Baseline de fuentes y sintaxis antes de editar; comandos secuenciales, memoria>=1500MiB.
GitBash ya está instalado en`C:/Program Files/Git/bin/bash.exe`; no confundirlo con el
shimWSL de`C:/windows/system32/bash.exe`. Usar ejecutable existente, sin instalarWSL.
El arnés trabaja solo en un directorio temporal propio dentro del scratch, con entorno
privado y sin cargar.env. Las únicas operaciones externas de las pruebas son mocks.

No ejecutar las acciones operativas`respaldar`,`restaurar`,`simulacro`, Docker, S3, pg_dump,
pg_restore o psql reales. No conectar ninguna base real, incluidas demo/bancos/E2E y las
protegidas`curichi`,`curichi_revision`,`postgres`. No crear/borrar bases, roles o contraseñas.
La tarea no limpia cachés/logs ni publicaGit; una prueba no puede invocar esos caminos por accidente.

Si shellcheck falta, conservar ese control como no verificado localmente y mantenerlo enCI.
Un mock aprobado no acredita restauración ni cifrado reales: el ensayo con origen/destino
expresamente aprobados sigue pendiente, junto con convivencia de clientes/reversa multitemática
y cualquier contracción física/HTTP. Este bloque no cierra producción niFase1.
