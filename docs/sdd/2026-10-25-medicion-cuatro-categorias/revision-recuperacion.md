# M9 — Revisión independiente de recuperación

## Primer dictamen: NO CONFORME, P2-RR1

Control independiente de Archimedes sobre freeze18:32:22UTC del26/10:
runner`842176eec32ddf5d330c54ff79ac3f56498fa1de192e248557d09ff7bc34647d`,
tests`2e56adea8be1e9f672c54a08555c48efa944c507038db096d60734fce97441f0`.
El actor quedó inaccesible después de la interrupción/reinicio; no se recibió su Markdown
final. Este registro transcribe su evidencia física, sin atribuirle una revisión posterior.

Evidencia: `.turbo/m9-2026-10-25/recuperacion-revision-26/resultado.json`,
`ataque-replay.json`, `controles.json`, `comparacion-independiente.json` y salidas por comando.

- Node:78PASS/0FAIL,exit0; sintaxis0/0; Biome0.
- Sin PostgreSQL real. El arnés inocuo alcanzó2Client/2connects/46queries simuladas.
- Ataque: primer intento de recuperación hace COMMIT del acotado de inundación y guarda
  checkpoint; una lectura posterior falla y conserva el diario incierto.
- Segundo intento: el lector de pruebas ignora el checkpoint del acotado y vuelve a
  recalcular inundación antes de continuar otras categorías. Se observan cinco llamadas:
  inundación,inundación,bache,area_verde,basura; cero repeticiones del completo.
- El diario llega a106etapas/pendingnull pese a esa repetición. La suite78no cubría este
  segundo intento. «No replay automático» no está demostrado por rechazar solo`medir`.
- La comprobación final del auditor acredita0procesos propios restantes/turno liberado.

**Bloqueante antes de PG:** rechazar explícitamente una recuperación si existe cualquier
evidencia previa de COMMIT/verificación de acotados, conservando diario y archivos. El
arreglo mínimo no necesita reanudar parcialmente ni repetir las mutaciones inciertas.

## Vuelta de corrección en curso

Anscombe retomado con propiedad exclusiva de los dos scripts, sin PG/.env/Docker/HTTP.
Scratch`recuperacion-fix-replay-26/`. Se exige rojo semántico del segundo intento,
control positivo sin acotados previos,78casos conservados y revisión independiente del delta.
Mientras no haya conformidad, no ejecutar`recuperar-equivalencia`en el banco real.


## Segunda revisión independiente: CONFORME para el delta RR1

Freeze de Anscombe del 27/10/2026 02:00:16 UTC, confirmado fuente quieta y turno libre.
Alcance Parte 5: solo reparación P2-RR1 en recoveryProof. El NO CONFORME anterior
permanece íntegro y corresponde al freeze de 78 pruebas.

- Runner SHA-256: b2be5543860d86d3b8e9e22d2af21a9657413b8d402509de2239d2f92152f4fb.
- Tests SHA-256: fb562ad73635549a418af8f1796aea7911abef90e044e3c8b9fb888ee75daaf5.
- SHA idénticos antes/después y al freeze. Fuera de recoveryProof, runner idéntico byte
  por byte a runner-antes.mjs. Los cuerpos de 78 pruebas anteriores (68+10) se conservan;
  tres casos RR1 añadidos. Solo cambia la ruta de evidencia de pruebas, aislada por cwd.
- Vuelta independiente única: 81 PASS / 0 FAIL, 0 skip/cancel, exit 0; sintaxis exit 0/0;
  Biome solo dos scripts exit 0. Todos los comandos conservan stdout, stderr y exit.
- Segundo recover tras COMMIT de inundación y lectura incierta: adaptador real rechaza
  RECUPERACION_ACOTADO_INCIERTO antes de otro Client o sonda; permanece una llamada
  acotada total, diario pendiente y checkpoint sin cambios. No añade artefactos al
  llamar recover; el manifiesto del segundo intento ya existía antes de la llamada.
- Bloqueo por NOMBRE en 28 combinaciones: raíz/ejecución, commit/verificado y contenidos
  objeto, null, false, 0, cadena vacía, JSON corrupto o archivo vacío. Cero Client/sondas
  en todos; contenido y listas de archivos conservados.
- Control positivo actual con createDependencies real y Client inocuo: primer recover
  sin acotados previos completa cuatro acotados, 106 etapas y pending null. Se inspeccionó
  equivalencia.json real: fullMs null y fullTime NO_MEDIDO. No repite el full.
- Nombres/rutas: patrón cubre categorías y sufijos que emite artifact; inspecciona raíz
  y carpetas ejecucion UUID generadas por CLI. Decide antes de parsear acotados. Archivos
  parciales existentes bloquean; checkpoints escritos permanecen ante fallos posteriores
  de artifact/save. R7 conservado verifica pending en esos fallos. Sin resume parcial.

**CONFORME para cerrar P2-RR1 y continuar por el principal la operación del banco M9
ya aprobado.** No se ejecutó PG, Docker, HTTP, Git ni lectura de .env. La recuperación
semántica y los 71 casos SQL quedan para el principal. Tiempo full perdido NO_MEDIDO;
sin inferir aceleración. Este dictamen no cierra M9.

Evidencias: .turbo/m9-2026-10-25/recuperacion-review-replay-26/antes.json, despues.json,
delta.json, unit81.stdout.txt, unit81.exit.json, syntax-runner.exit.json,
syntax-tests.exit.json, biome.stdout.txt, biome.exit.json, controles.json,
positivo-real-deps.json, resultado.json y append-preservado.json. El primer comparador
del revisor falló por su regex antes de iniciar pruebas; corregido por límites del método.
La primera lectura posterior de evidencias encontró un diario sintético null; corregida
para omitirlo. Ninguno fue fallo de producto ni repitió la suite.
Procesos síncronos terminados: **0 hijos propios restantes; slot LIBRE**.
