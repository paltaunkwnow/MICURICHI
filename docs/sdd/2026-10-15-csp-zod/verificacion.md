# Verificación final — Zod/CSP, 2026-10-15

**Meta cumplida en verificación local.** Dos entradas cliente, sin cambios de política CSP,
contrato, pruebas o backend. Implementación y revisión independientes en los documentos de
esta carpeta. Aprobación del usuario en `plan.md`.

| Comprobación | Antes | Después |
|---|---|---|
| Web, suite | 645 / 49 archivos | **645 / 49**, exit 0 |
| Panel, suite | 458 / 40 archivos | **458 / 40**, exit 0 |
| Tipos y builds de las dos apps | Verdes | **Verdes**, ejecutados en serie por implementador |
| Cinco CSP existentes, producción | **5 rojas**, evento `eval` de sonda Zod | **5 verdes**, sin eventos ni cambios a las aserciones |
| G5 completo, producción | 13/18 | **18/18**, 81,769 s, exit 0, 0 flaky |
| Recorrido ciudadano→técnico→exportación | Verde previo | **5/5**, 16,098 s, exit 0, 0 flaky |
| Biome de las dos entradas | No existían | Sin diagnósticos |

Logs/JSON en `.turbo/cierre-m4-2026-10-14/`: `csp-zod-*`, `e2e-G5-jitless.log`,
`G5-jitless-resultado.json`, `e2e-recorrido-jitless.log` y `recorrido-jitless-resultado.json`.
El implementador ejecutó suites/tipos/builds; el principal ejecutó navegador. La revisión no
se presenta como una ejecución adicional. No se hizo un benchmark del coste de desactivar JIT.

Se usaron Next start y builds nuevos, Chromium completo 1243, política de nonce original,
workers 1/retries 1 y configuración temporal sin autoarranque. Servicios exclusivamente contra
`curichi_e2e`, roles restringidos y entorno de prueba 3 envíos/demoras 2–4 s. No migraciones,
seeds ni consultas a `curichi` o `curichi_revision`. Fotos sintéticas en temporal de corrida.

Se cerraron los cuatro árboles propios y se comprobaron 3000/3001/3002/3100 libres. PostGIS y
MinIO siguen sanos; no se recreó ni detuvo ningún contenedor. Next start avisa sobre despliegue
standalone; esta ejecución local no certifica la imagen Docker ni una VPS.

Rojos ajenos: Biome global conserva un error/seis avisos, auditoría mismas tres high sin
críticas. La intermitencia previa de cámara móvil pertenece al recorrido M4 anterior a este
cambio; consta allí con su retry y diagnóstico aislado. No se han ocultado intentos previos.

Sin commits ni push. Para reversión futura, revisar y retirar únicamente los dos archivos
listados en `archivos.txt` con autorización; no restaurar masivamente el árbol ni la base.
