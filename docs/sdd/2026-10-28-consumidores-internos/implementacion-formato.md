# M10.4 — Corrección acotada de formato

Informe de Hume, original SHA256 `56f01bc6a568ba43efc762ce23064f8f00aa943bcf599ddb4175ad26a3b4bac2`; vínculos relativos adaptados. La comprobación independiente correctiva se registra por separado.

Corrección de formato completada; gate final de Hegel pendiente.

Único archivo: packages/db/test/m10-consumidores-internos.test.ts. Cambio de saltos/indentación alrededor de línea 347; AST y léxico sin trivia idénticos (2903 nodos, 3679 tokens; TypeScript 5.9.3).

El control anterior usó --filter db (contexto del paquete). Aquí se reprodujo el comando de Hegel desde cwd raíz. Esta diferencia de contexto está registrada; no se atribuye una causa interna no comprobada.

| Control | Exit | RAM previa MiB | Resultado literal/resumen |
|---|---:|---:|---|
| biome-antes | 1 | 5922 | Checked 15 files. Found 1 error. |
| test-antes | 0 | 5885 | 10 PASS / 0 FAIL / 0 SKIP |
| formato | 0 | 5906 | Checked 1 file. Fixed 1 file. |
| biome-despues | 0 | 5826 | Checked 15 files. No fixes applied. |
| test-despues | 0 | 5864 | 10 PASS / 0 FAIL / 0 SKIP |

Comandos exactos/cwd/guardas y stdout/stderr literales en [adenda.json](../../../.turbo/m10-4-2026-10-28/parte4/correccion-formato/adenda.json) y sus controles enlazados por nombre. Test dirigido idéntico antes/después: 10/10, sin cambios de nombres o estados.

Salida posterior de Biome:
```text
Checked 15 files in 38ms. No fixes applied.
```

Salida posterior del test:
```text

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  21:02:12
   Duration  9.04s (transform 1.00s, setup 0ms, import 1.59s, tests 7.17s, environment 0ms)

JSON report written to C:/Users/HP/Desktop/MICURICHI/.turbo/m10-4-2026-10-28/parte4/correccion-formato/test-despues.vitest.json
```

AST/léxico: [ast-lexico.json](../../../.turbo/m10-4-2026-10-28/parte4/correccion-formato/ast-lexico.json), salida literal [ast.stdout.log](../../../.turbo/m10-4-2026-10-28/parte4/correccion-formato/ast.stdout.log), exit 0. El intento inicial del comparador incluía SourceFile.text/espacios y scanner sin contexto de plantillas; se corrigió sólo el arnés, sin tocar nuevamente producto.

SHA archivo antes: 99dc1718641da6b7415891d5c6e1ac0c5a706808fca2a7e571a8c801dc4117c0
SHA archivo después: 39170b6b909b75f1f7a63f8e1deb23756949e074c7ec67173425406d92772f3a

Freeze original preservado: dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc
Nuevo freeze anidado de 13, con sólo un hash actualizado: 3e689ccd6654e5f59d6cb58eff2150d7bca4c63a1a8f7bab3c70e0f34ca950b7 — [freeze.json](../../../.turbo/m10-4-2026-10-28/parte4/correccion-formato/freeze.json).

Conservación por SHA: otras 17 fuentes y seis dist iguales; freeze original y reportes originales intactos. Copia byte a byte del archivo anterior y freeze original en esta carpeta. Sin nuevo full DB/API/Node/typegraph/build.

Procesos propios al cierre: 0; heavy libre. Hegel conserva la revisión final; esta adenda no cierra M10.4.
