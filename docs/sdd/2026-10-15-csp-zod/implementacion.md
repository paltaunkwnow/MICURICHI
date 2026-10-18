# Implementación — Zod y CSP estricta

Fecha: 2026-10-15. Implementador raíz acotado, con modelo heredado de Codex según la
adaptación autorizada. Aprobación específica del usuario y transferencia explícita del
turno pesado recibidas antes de editar.

## Cambio realizado

Se crearon únicamente estos dos archivos de código:

- `apps/web-ciudadano/src/instrumentation-client.ts`
- `apps/panel-admin/src/instrumentation-client.ts`

Ambos contienen exactamente:

```ts
import { z } from 'zod';

// Evita la sonda de eval de Zod bajo la CSP estricta del navegador.
z.config({ jitless: true });
```

La configuración se aplica en el arranque cliente de Next. Se conservan los esquemas y
validadores existentes, usando el intérprete de Zod en lugar de su compilador JIT.
El código instalado de Zod 4.6.4, `v4/core/util.js`, comprueba
`globalConfig.jitless` antes de ejecutar la sonda `new Function("")` de `allowsEval`.
No se cambió la configuración de Zod del backend.

No se editaron CSP, pruebas, proveedores, configuración, contratos, backend, archivos raíz,
`.env` ni DB. Tampoco se instalaron dependencias, se hicieron commits o se arrancaron
servicios. Este informe es la única escritura documental del implementador; `plan.md`,
`linea-base.md` y `archivos.txt` quedan a cargo del principal.

## Preflight y restricciones del entorno

Antes de la edición se ejecutaron ambas suites completas, fuera del sandbox, y se
reprodujeron las cifras comunicadas por el principal:

```text
web-ciudadano
 Test Files  49 passed (49)
      Tests  645 passed (645)
   Duration  6.32s
EXIT_CODE=0

panel-admin
 Test Files  40 passed (40)
      Tests  458 passed (458)
   Duration  22.48s
EXIT_CODE=0
```

Hubo dos intentos previos fallidos por el entorno, antes de cambiar código:

1. pnpm en caché, dentro del sandbox, no pudo resolver el directorio:

   ```text
   Error:   × canonicalizing the `--dir` argument: C:\Users\HP\Desktop\MICURICHI
     ╰─▶ Acceso denegado. (os error 5)
   EXIT_CODE=1
   ```

   No llegó a ejecutar pruebas. Esta salida se transcribe aquí desde la salida de la
   herramienta; el log de preflight web se reutilizó para el reintento satisfactorio.

2. Vitest instalado, ejecutado directamente dentro del sandbox, inició el runner pero no
   pudo cargar los archivos por `EPERM` al renombrar la caché temporal. La salida fue
   `49 failed (49)` y `Tests no tests`: no hubo aserciones ejecutadas. El log completo se
   conserva en `csp-zod-preflight-web-test-local.log`.

Se repitió fuera del sandbox con `sandbox_permissions=require_escalated`, dentro del
alcance de suites autorizado. No se cambió código ni configuración para resolver esos
errores. La consulta CIM de memoria también estaba restringida; se usó
`node:os.freemem()` para medir RAM.

Las suites, los chequeos de tipos y los builds se ejecutaron en serie, con una comprobación
de al menos 1500 MiB libres antes de cada comando. La menor lectura entre esas ejecuciones
satisfactorias fue 5001 MiB. El control inicial no encontró procesos Node ni listeners en
3000, 3001, 3002 o 3100.

## Comandos y resultados posteriores

Todos los comandos de esta tabla terminaron con `EXIT_CODE=0`. Los nombres de log son
relativos a `.turbo/cierre-m4-2026-10-14/`.

| Comprobación | Resultado | RAM libre al inicio (MiB) | Log |
|---|---|---:|---|
| Preflight web | 645 pruebas, 49 archivos | 5001 | `csp-zod-preflight-web-test.log` |
| Preflight panel | 458 pruebas, 40 archivos | 5401 | `csp-zod-preflight-panel-test.log` |
| Suite web posterior | 645 pruebas, 49 archivos | 5436 | `csp-zod-post-web-test.log` |
| Suite panel posterior | 458 pruebas, 40 archivos | 5384 | `csp-zod-post-panel-test.log` |
| Tipos web | Sin diagnósticos | 5384 | `csp-zod-post-web-typecheck.log` |
| Tipos panel | Sin diagnósticos | 5369 | `csp-zod-post-panel-typecheck.log` |
| Build web | Next 16.3.6, Turbopack; generación 10/10 | 5370 | `csp-zod-post-web-build.log` |
| Build panel | Next 16.3.6, Turbopack; generación 9/9 | 5309 | `csp-zod-post-panel-build.log` |
| Biome, los dos archivos | 2 archivos comprobados, sin correcciones | — | `csp-zod-biome.log` |
| Inspección de artefactos | Configuración presente en ambos bundles | — | `csp-zod-artifacts.log` |

Suites y tipos, ejecutados desde la carpeta exacta de cada app con las dependencias locales:

```powershell
# web-ciudadano, antes y después
node node_modules/vitest/vitest.mjs run

# panel-admin, antes y después
node node_modules/vitest/vitest.mjs run --maxWorkers=1

# ambas apps, después
node node_modules/typescript/bin/tsc --noEmit
```

Builds, ejecutados desde la raíz, uno después de terminar el otro, usando el pnpm instalado
en caché y sin descargas:

```powershell
node C:/Users/HP/AppData/Local/npm-cache/_npx/90fd45f2ce56cc10/node_modules/pnpm/bin/pnpm.mjs --filter web-ciudadano build
node C:/Users/HP/AppData/Local/npm-cache/_npx/90fd45f2ce56cc10/node_modules/pnpm/bin/pnpm.mjs --filter panel-admin build
```

Los scripts existentes de build ejecutaron también su `prebuild` de MapLibre. Ambos builds
compilaron, completaron TypeScript y finalizaron la optimización de páginas sin errores.
No se ejecutó un build transversal ni se regeneraron contratos.

Salidas resumidas posteriores a la edición:

```text
web:   Test Files 49 passed (49); Tests 645 passed (645); Duration 5.38s
panel: Test Files 40 passed (40); Tests 458 passed (458); Duration 20.47s
tipos web:   EXIT_CODE=0, sin diagnósticos
tipos panel: EXIT_CODE=0, sin diagnósticos
build web:   Compiled successfully in 3.8s; Finished TypeScript in 2.3s
build panel: Compiled successfully in 3.6s; Finished TypeScript in 2.4s
Biome: Checked 2 files in 9ms. No fixes applied.
```

Vitest mostró antes y después el mismo aviso sobre sintaxis ESM en `vitest.config.ts`
cargado como CommonJS y el futuro `configLoader: 'native'`. No se modificó esa configuración.

## Arranque cliente y límites de la comprobación

La inspección estática de los artefactos encontró:

- Web: `.next/static/chunks/2f75_rt_xy0kr.js`, módulo `51923`, con
  `e.i(43892).z.config({jitless:!0})`, enlazado como
  `private-next-instrumentation-client`.
- Panel: `.next/static/chunks/0ob8-fnzi_lee.js`, módulo `87449`, con la misma
  llamada a Zod y el mismo enlace de instrumentación.

El Next instalado importa `require-instrumentation-client` en
`dist/client/app-next-turbopack.js:11`, antes de `appBootstrap` en la línea 12 y de
`hydrate` en la línea 15. `dist/lib/require-instrumentation-client.js:26` carga el alias
de instrumentación en producción. El hook propio importa únicamente Zod, sin importar
esquemas de la app ni `contracts`. Esta es evidencia estática del arranque y del empaquetado;
no sustituye el recorrido de integración en el navegador.

Las cifras de ambas suites se conservaron y no hubo fallos de tipos o builds. La línea base
de los cinco casos CSP de producción rojos procede del principal; este implementador no
volvió a ejecutar G5 ni atribuye un resultado dinámico a la inspección de chunks. La sonda
puede seguir presente como código en los bundles: la meta es impedir su ejecución mediante
`jitless`, no eliminar su texto por minificación.

Quedan a cargo del principal los cinco casos CSP existentes con producción y el recorrido
de integración tras el arranque. No se afirma todavía que hayan pasado. También corresponde
al principal integrar la revisión y auditoría independientes del cierre SDD. El riesgo
previsto sigue siendo una posible reducción del rendimiento de validación cliente al
desactivar JIT; no se hizo una medición específica de rendimiento en este turno.

## Entrega del turno

Tras finalizar las comprobaciones se confirmó `NODE_PROCESS_COUNT=0` y
`E2E_LISTENER_COUNT=0`. Se comunicó la liberación del turno pesado al principal. Después de
esa entrega, el trabajo del implementador se limitó a redactar este informe; no se volvieron
a ejecutar suites, tipos o builds ni se editaron los dos archivos ya compilados.
