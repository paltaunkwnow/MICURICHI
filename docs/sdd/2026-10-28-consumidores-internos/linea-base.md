# M10.4 — Línea base antes de editar

Medida por Hume, trabajador raíz de Parte4, antes de editar producto. Base de datos
completa al28/10T19:03:42Z y API dependiente completa al19:08:19Z. No es el cierre del hito.

| Control | Resultado ejecutado | Evidencia |
|---|---|---|
| db, suite original | 30archivos,350/350PASS,0fallos/omisiones;304,59s | [stdout](../../../.turbo/m10-4-2026-10-28/parte4/baseline-db-03.stdout.log), [JSON de casos](../../../.turbo/m10-4-2026-10-28/parte4/baseline-db-03.vitest.json), [control](../../../.turbo/m10-4-2026-10-28/parte4/baseline-db-03.control.json) |
| db typecheck | exit0 | [control](../../../.turbo/m10-4-2026-10-28/parte4/baseline-typecheck.control.json) |
| db build | exit0 | [control](../../../.turbo/m10-4-2026-10-28/parte4/baseline-build.control.json) |
| API, suite original | 562PASS/12SKIP de574casos,0fallos;274,87s | [stdout](../../../.turbo/m10-4-2026-10-28/parte4/baseline-api.stdout.log), [JSON de casos](../../../.turbo/m10-4-2026-10-28/parte4/baseline-api.vitest.json), [control](../../../.turbo/m10-4-2026-10-28/parte4/baseline-api.control.json) |

Extractos literales de los stdout, sin convertir las omisiones en aprobaciones:

```text
 Test Files  30 passed (30)
      Tests  350 passed (350)
   Start at  14:58:17
   Duration  304.59s (transform 2.25s, setup 0ms, import 10.62s, tests 286.85s, environment 2ms)
```

```text
 Test Files  36 passed | 2 skipped (38)
      Tests  562 passed | 12 skipped (574)
   Start at  15:03:44
   Duration  274.87s (transform 3.57s, setup 0ms, import 40.55s, tests 224.49s, environment 3ms)
```

Comando común: pnpm local con `--config.verify-deps-before-run=false --filter db`;
acciones `test`, `typecheck`, `build`. Suite con configuración temporal `envDir:false`,
un worker y archivos en serie, reporters verbose/JSON; argumentos literales en cada control.

Entorno hijo por allowlist del sistema, `NODE_ENV=test`, sin URLs/credenciales heredadas,
PG*, *DATABASE*, *POSTGRES* o S3*. Barrera de conexión solo a puertos efímeros de fixtures
propios; se conserva el transporte original de la suite, sin el adaptador HTTP simulado.
No se conecta la demo ni otra instalación. RAM libre:4225MiB antes/4372después de db,
4354/4319tipos,4323/4291build y4295/4350API. No hubo heavy paralelo del principal.

El primer intento falló por `EPERM rename` en la caché temporal de Vitest **antes de
ejecutar casos**:0casos,exit1. Se conserva su salida; no es un rojo de producto ni PASS.
El intento02 no se usa como resultado final. La línea base válida es la03 con salida
completa,exit0 y350casos. No borrar estos intentos.

F0, ajenos y límites: [arbol-inicial.txt](arbol-inicial.txt),
[plan aprobado](plan.md), [protocolo](protocolo-verificacion.md).
Las12omisiones PG/S3 siguen sin verificar; no cuentan como PASS. Los problemas globales
históricos de lint/audit no se atribuyen a M10.4; solo los controles ejecutados aquí tienen
resultado nuevo.

## Parte5 — Antes de tocar scripts/CI

Popper midió los dos scripts existentes: sintaxis Node de ambos, Biome2archivos y parseo
YAML de7jobs, todos exit0. No existía un arnés de esos bancos. Sus fuentes anteriores
coinciden con F0 global y se conservan en `parte5/fuente/`; no se ejecutó ningún CLI real
para producir esta línea base. [Controles y comparación antes/después](implementacion-parte5.md).
El arnés nuevo añade19casos; no se presenta como una suite que ya existía antes.
