# M10.4 — Evidencia independiente

Original SHA256 `0a5704180edf5e4ecabd5be886ccc8e84f644d9a19590edffb798b2b8da04147`; copia documental con vínculos adaptados. Ejecuciones y lectura pertenecen al agente autor del informe; el principal integra su evidencia.

Dictamen independiente: **CIERRE_APTO**. El único bloqueo del informe inicial quedó resuelto por una corrección de formato. [resultado.json](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/resultado.json) conserva el detalle estructurado.

Relación de evidencia: **NO_CIERRE inicial → CIERRE_APTO correctivo**. El [resultado inicial](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/../resultado.json), la [verificación inicial](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/../verificacion.md), sus raw/control/JSON y los freezes originales no se sobrescribieron:102artefactos protegidos por SHA permanecen idénticos.

La sesión anterior se cortó por cuota después de terminar AST y Biome con controles finales exit0; no eran pruebas incompletas. Al reanudar el29/10 sólo se leyeron esos controles, se capturó la conservación final y se consultaron procesos actuales. No se repitieron pruebas ni Biome. Los archivos *.running.json son registros del inicio; sus *.control.json confirman cierre normal.

Comprobación independiente de alcance: un solo archivo con SHA actualizado, `packages/db/test/m10-consumidores-internos.test.ts`; otras17fuentes y6dist idénticos.

- Antes: `99dc1718641da6b7415891d5c6e1ac0c5a706808fca2a7e571a8c801dc4117c0`. La copia de Hume coincide con el freeze original, mi snapshot inicial y la fuente registrada al ejecutar el fullDB.
- Después: `39170b6b909b75f1f7a63f8e1deb23756949e074c7ec67173425406d92772f3a`. Coincide ahora con el freeze correctivo.
- Freeze P4 original intacto: `dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc`.
- Freeze P4 correctivo de13: `3e689ccd6654e5f59d6cb58eff2150d7bca4c63a1a8f7bab3c70e0f34ca950b7`; se suma al freeze P5 de5 y al dist de6.

AST propio: TypeScript5.9.3,2903nodos en ambos archivos;3680tokens contando EOF(3679sin EOF), idénticos y sin diagnósticos. También coincide todo el texto al retirar únicamente espacios/saltos. No se importó el comparador de Hume. [AST independiente](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/ast-independiente.json). Salida literal:

```text
{
  "typescript": "5.9.3",
  "antes": {
    "sha256": "99dc1718641da6b7415891d5c6e1ac0c5a706808fca2a7e571a8c801dc4117c0",
    "nodos": 2903,
    "tokens": 3680,
    "diagnosticos": 0
  },
  "despues": {
    "sha256": "39170b6b909b75f1f7a63f8e1deb23756949e074c7ec67173425406d92772f3a",
    "nodos": 2903,
    "tokens": 3680,
    "diagnosticos": 0
  },
  "astIgual": true,
  "tokensSinTriviaIguales": true,
  "metodo": "Comparador independiente: árbol recursivo forEachChild(kind,texto semántico,hijos); hojas del parser getChildren(kind,texto exacto) para tokens, sin scanner ni posiciones/trivia. No se importa el comparador de Hume."
}
```

Biome propio: mismo ejecutable, argv y cwd raíz que el intento inicial rojo;12TS+3JS,sin --write. Comando exacto:

```text
C:/Users/HP/.local/bin/pnpm.exe --config.verify-deps-before-run=false exec biome check packages/db/src/esquema/index.ts packages/db/src/seeds/samples.ts packages/db/src/test-utils.ts packages/db/banco-puntos-criticos.ts packages/db/test/esquema-drizzle.test.ts packages/db/test/db.test.ts packages/db/test/migracion-0010-quitar-campos.test.ts packages/db/test/migracion-0013-distancia-dispositivo.test.ts packages/db/test/migracion-0014-cuota-diaria.test.ts packages/db/test/migracion-0015-publicacion.test.ts packages/db/test/servidor-local.test.ts packages/db/test/m10-consumidores-internos.test.ts scripts/banco-datos.mjs scripts/banco-consultas.mjs scripts/bancos-internos.test.mjs
```

Antes, stdout literal (reutilizado,exit1):

```text
Checked 15 files in 45ms. No fixes applied.
Found 1 error.
```

Después, stdout literal (ejecutado en este gate antes de la interrupción,exit0):

```text
Checked 15 files in 54ms. No fixes applied.
```

| Control propio del gate | Fecha UTC de ejecución | Exit | RAM antes/después MiB |
|---|---|---:|---:|
| ast | 2026-10-29T01:08:19.767Z | 0 | 5987/5976 |
| biome | 2026-10-29T01:08:21.152Z | 0 | 5977/5994 |

Guardas conservadas: allowlistOS+NODE_ENV=test+CI, sin credenciales heredadas ni lectura .env; barrera offline, TEMP y archivo de puertos nuevos dentro del ownership. AST/Biome no abrieron conexiones ni fixtures. RAM siempre superó1500MiB. [Control AST](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/ast.control.json), [control Biome](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/biome.control.json).

Resultados **reutilizados**, sin reejecución en el gate correctivo:

| Control previo | Resultado | Justificación |
|---|---|---|
| FullDB independiente |361PASS/0FAIL/0SKIP,una pasada|AST idéntico del único test formateado; fuentes/dist conservados|
| FullAPI independiente |562PASS/12SKIP históricos|fuentes y dist sin cambio funcional|
| Arnés Node |19PASS/0FAIL/0SKIP|fuentes JS/SQL/CI intactas|
| Typegraph |exit0,6tareas|fuentes,configuración y dist intactos; único delta no semántico|
| Sintaxis3JS y YAML |exit0|JS/YAML intactos|
| pnpm secretos + archivos nuevos |exit0|sin nuevos tokens/literales; patrones históricos conservados aparte|
| Dirigido Hume antes/después |10PASS/10PASS|evidencia del implementador, reusada por SHA y AST independiente|

La comparación previa por caso permanece válida:350nombresDB conservados+11nuevos,0retirados/0regresiones; API574casos con exactamente las mismas12omisiones. [Comparación completa inicial](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/../comparacion-casos.json). Ninguna omisión se convierte en PASS. Fechas,argv,RAM,exit y SHA de cada control reutilizado constan en resultado.json.

Conservación final: [snapshot-despues.json](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/snapshot-despues.json),18fuentes+6dist conformes,102originales intactos y rama/HEAD sin mutaciones. La consulta CIM actual confirmó **0procesos propios**; no usó PIDs históricos ni detuvo procesos ajenos. [procesos-final.json](../../../.turbo/m10-4-2026-10-28/verificador/correccion-formato/procesos-final.json). Heavy libre.

Archivos creados/modificados por el verificador: exclusivamente esta carpeta correctiva; producto/docs de solo lectura. Sin hallazgo bloqueante pendiente. El principal integra el cierre documental después de este gate. CIERRE_APTO no cierra M10 completo,Fase1 ni producción; las12omisionesPG/S3 y los límites operacionales del informe inicial permanecen.
