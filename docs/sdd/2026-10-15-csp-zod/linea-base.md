# Línea base de la corrección Zod/CSP — 2026-10-15

Medida por el principal antes de crear los dos archivos de instrumentación, durante el cierre
M4. Usuario aprobó el plan específico y ambos archivos; ejecución de navegador solo E2E.

- Web: **645 pruebas / 49 archivos**, typecheck y build verdes (logs `web-*-vuelta2`).
- Panel: **458 pruebas / 40 archivos**, tipos/build de consumidores verdes por caché, fuente
  intacta respecto del respaldo/base. El implementador repetirá su preflight antes de editar.
- G5 con builds de producción: **13 aprobadas, cinco fallidas**, incluso tras retry. Log
  `e2e-G5.log`, JSON `G5-resultado.json`: 128,356 s. Ambos bajo `.turbo/cierre-m4-2026-10-14/`.
- Cinco fallos: `csp.spec.ts:90` bandeja/detalle/ejecutivo; `:124` mapa público; `:141` formulario.
  Todos registran `script-src`, `bloqueado=eval`, origen chunk de la app. No se altera ese test.
- Código instalado de Zod `v4/core/util.js:219`: sonda `Function("")`, capturada pero genera
  securitypolicyviolation. `globalConfig.jitless` evita la sonda. Se encontró en ambos chunks.
- Mismos tests con Next dev/webpack: **18/18 verdes**, 164,548 s; prueba que el rojo depende
  del arranque de producción y no autoriza a ocultarlo con desarrollo.
- Rojo global ajeno: Biome un error + seis avisos; auditoría tres high sin críticas. Lockfile
  sin cambios; no se actualizan dependencias en esta corrección.

Comparación posterior: mismos cinco casos existentes con producción y política estricta intacta,
además de suites/tipos/builds de ambas apps. Mantener registro de una intermitencia anterior de
cámara móvil de M4 (retry pasó; aislada después pasó 2/2 sin retries), sin atribuirla a este cambio.
