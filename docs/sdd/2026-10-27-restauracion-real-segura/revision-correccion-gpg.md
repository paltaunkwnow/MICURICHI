> Informe independiente; solo vínculos adaptados. SHA-256 original: `571a9d41d58f821699fa51ec9822dd56332fd51158add8b4fbf934a625d7d82e`.

# Revisión independiente — corrección GPG M10.3

**Dictamen: sin bloqueantes concretos detectados en el delta revisado. Apto estáticamente para sellar la continuación manual y ejecutar su etapa cifrar_actual, tras consolidación del principal con el verificador independiente.** La aprobación humana M10.3 continúa vigente. No se operó ni selló nada en esta revisión.

Parte 5; Codex, revisión nativa funcional/seguridad. Solo se crean este informe y `resultado.json` en `revision-correccion-gpg/`; el informe anterior permanece separado. Contexto reutilizado: primera revisión de 77 casos y ocho fuentes congeladas. Leídos plan `correccion-gpg.md`, entrega breve, metadata del padre/archivado y diagnósticos conservados. Los tres diffs se compararon contra `implementador/correccion-gpg/f0/`, con sus SHA comprobados en manifest; nunca HEAD.

## Bloqueantes

Ninguno identificado para esta continuación exclusiva del intento GPG fallido. No se detectó ampliación de bancos, roles o operadores SQL respecto del alcance anterior.

## Comprobación del delta

Referencias relativas a `C:/Users/HP/Desktop/MICURICHI`, líneas iniciales verificadas.

| Criterio | Fuente | Evidencia estática |
|---|---|---|
| Rutas y homedirs GPG | scripts/ensayar-respaldo-multitematico.mjs:107,135,147,963 | Convierte solo home/entrada/salida de GPG y home de GPGCONF; ejecutables, Node fs y Docker siguen nativos. Probes exactos home/socket; continuación usa únicamente g2-a/g2-h propios, sin adoptar existentes. |
| Secretos y fallo cerrado | scripts/ensayar-respaldo-multitematico.mjs:127,147,709,749 | Clave aleatoria solo memoria/stdin con passphrase-fd 0; redacción antes de truncar (2048), stderr completo solo por SHA y longitud; sin stdin persistido. Todo exit no cero rechaza incluso con parcial, que se conserva con hash/tamaño. Kill solo home comprobado. |
| Sellado exclusivamente local, padre preservado | scripts/ensayar-respaldo-multitematico.mjs:264,512,540,595 | Compara bytes/hash de padre actual y archivado y de freezes originales, cuatro checkpoints, OID/dueño/servidor, dump/sidecar/cifrado/lock y home vacío; sella dos diagnósticos. Crea solo directorio hijo con sello.json y diario.json nuevos, sin SQL/GPG. |
| Herencia sin replay y rechazos antes de efectos | scripts/ensayar-respaldo-multitematico.mjs:352,371,595,1183 | Hijo clona cuatro completas; padre incierto inmutable. Validación de enlace/bytes/prefijo antes de lock/credenciales/operadores. Impide resellado, heredadas, etapas completas/inciertas/fuera de orden, restore incierto y segundo intento automático. |
| Rutas de artefactos y SQL restringido | scripts/ensayar-respaldo-multitematico.mjs:98,512,1038,1270 | Solo dump y sidecar actuales siguen siendo lecturas del padre; demás artefactos nuevos al hijo. Realpath/symlinks y escrituras exclusivas. Allowlist original de cuatro bancos y template1 intacta; sin DROP, ALTER ROLE o nuevas rutas SQL; conserva helpers y verificador M10.2. |
| 77 casos preservados, 16 nuevos seguros | scripts/ensayar-respaldo-multitematico.test.mjs:10,296; implementador/correccion-gpg/green-runner.{json,log} | Bloques de 15 pruebas anteriores íntegros contra F0 de corrección; cinco archivos restantes iguales al freeze original. Tests bloquean procesos/red/.env antes de importar. Nuevas fixtures inyectadas no operan padre/DB/GPG. Turing informa 29+31+33=93 PASS; no ejecutados por este revisor. |

El CLI exige `--operar` tanto para sellar como para ejecutar. El sellado no construye el adaptador real; la primera etapa nueva admitida es `cifrar_actual`. Esa etapa conserva las comprobaciones de identidad originales, por lo que podrá consultar metadatos del contenedor/servidor antes de llamar a GPG. Las cuatro etapas heredadas no se vuelven a ejecutar. Un fallo de cifrado o cierre del agente deja el hijo incierto y bloquea avances/repetición.

## Estado previo e interpretación

La metadata preservada muestra cuatro etapas completas (`preflight`, `crear_actual`, `sembrar_actual`, `respaldar_actual`) y `cifrar_actual` incierta. Identidad registrada: `curichi_sdd_m10_20261027_actual`, OID `205892`, dueño `curichi`, servidor `7688456033622585387`. Las cifras 21 migraciones/cuatro reportes son evidencia operativa previa comunicada y registrada; no se comprobaron contra SQL aquí.

Los diagnósticos archivados muestran que gpgconf interpretó el home Windows como relativo y que la variante POSIX devolvió el home/socket esperados. El error original solo conserva SHA de stderr: **no queda demostrada una causa única del exit 2**. La presencia del cifrado fallido no acredita validez; la clave anterior se perdió.

## Integridad

Inicio UTC 2026-10-28T15:30:15.0164575Z; final UTC 2026-10-28T15:33:08.1694043Z. **8/8 fuentes inicio = final = freeze nuevo**, cuyo SHA-256 es `ebfefc674560897b92f2b3792809cb1e8b9c3d9975565dfe73b6ecb08592ff09`. Solo cambiaron runner, su test y documento operativo frente al freeze original; los otros cinco hashes permanecen iguales. Los tamaños de las ocho fuentes también coinciden con el nuevo freeze.

| Fuente | SHA-256 inicio | SHA-256 final |
|---|---|---|
| `scripts/respaldo.mjs` | `546d47ad980e1d7961d0c340bf78139ad340dc528ae9df8f9ec6c6fcb5509afa` | `546d47ad980e1d7961d0c340bf78139ad340dc528ae9df8f9ec6c6fcb5509afa` |
| `scripts/respaldo.test.mjs` | `23a53a5c95f2f84ee4597bad3fa28c7ab202f53d712b1373c42b37123d0d9e5b` | `23a53a5c95f2f84ee4597bad3fa28c7ab202f53d712b1373c42b37123d0d9e5b` |
| `infra/respaldo/respaldo.sh` | `58c793facdf7476f6d2d8a3af6d265aa43bb203209aca7c2513cd89c7968a1c8` | `58c793facdf7476f6d2d8a3af6d265aa43bb203209aca7c2513cd89c7968a1c8` |
| `infra/respaldo/respaldo.test.sh` | `e9b9753c9a65faee7d895c9f3b04a8bad23a6f5afed0c0064c7a75223a7a29b8` | `e9b9753c9a65faee7d895c9f3b04a8bad23a6f5afed0c0064c7a75223a7a29b8` |
| `scripts/ensayar-respaldo-multitematico.mjs` | `8985dcb6b423dd82f970066decc17633fb769954816780353eed162c09b2cbaa` | `8985dcb6b423dd82f970066decc17633fb769954816780353eed162c09b2cbaa` |
| `scripts/ensayar-respaldo-multitematico.test.mjs` | `c87af7b0b83813f12297f504362b18de0c4242361695a792ad17e2d955fc2f43` | `c87af7b0b83813f12297f504362b18de0c4242361695a792ad17e2d955fc2f43` |
| `.github/workflows/ci.yml` | `3d71edf78157c03dcdb8bb71297e3ebdf8b6a22960001ae7d676432d44297aac` | `3d71edf78157c03dcdb8bb71297e3ebdf8b6a22960001ae7d676432d44297aac` |
| `docs/operaciones/respaldo-y-restauracion.md` | `c79665eff0035097f63f88d8c6db9dac6255dad5b219395079950f84a24b7539` | `c79665eff0035097f63f88d8c6db9dac6255dad5b219395079950f84a24b7539` |

**Las siguientes diez rutas tienen el mismo SHA al inicio y al final.** Padre/freeze actuales coinciden byte a byte por hash con sus archivados; dump/cifrado solo fueron leídos para hash, sin inspeccionar filas/contenido.

| Ruta preservada | Bytes | SHA-256 inicio = final |
|---|---:|---|
| `.turbo/m10-3-2026-10-27/implementador/freeze8.json` | 1548 | `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f` |
| `.turbo/m10-3-2026-10-27/implementador/ensayo/diario.json` | 27917 | `365a8a89aedb963c88ad7a119eac15589bdfe12d0c76fded16fcd62efcaa6d57` |
| `.turbo/m10-3-2026-10-27/implementador/ensayo/actual.dump` | 79005 | `3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562` |
| `.turbo/m10-3-2026-10-27/implementador/ensayo/actual.dump.migracion` | 32 | `aee3709b328658f141dba6ca688f84257abb650544f068402903c1cffb3ccbb5` |
| `.turbo/m10-3-2026-10-27/implementador/ensayo/actual.dump.gpg` | 79164 | `ebd6eb5929321d5ba0fa00240380542782d7e9c47991c304cc9762d2cb458a1d` |
| `.turbo/m10-3-2026-10-27/cierre/diario-antes-diagnostico-cifrar-actual.json` | 27917 | `365a8a89aedb963c88ad7a119eac15589bdfe12d0c76fded16fcd62efcaa6d57` |
| `.turbo/m10-3-2026-10-27/cierre/freeze8-antes-correccion-gpg.json` | 1548 | `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f` |
| `.turbo/m10-3-2026-10-27/implementador/ensayo/cifrar_actual.lock-conservado.json` | 73 | `abfc7631a13e905838d749e697c8c6d86f4226e48291e85876f3631cda34807c` |
| `.turbo/m10-3-2026-10-27/cierre/gpg-list-dirs-diagnostico.json` | 517 | `e67231f52817dfe3e29a0af90d218d040ad5b4395f9b63528a07f5d8c0fe8bb3` |
| `.turbo/m10-3-2026-10-27/cierre/gpg-list-dirs-ruta-posix.json` | 417 | `e1c4313286d8eff6cb835a52092cdf2da6d115ba9e94e05ce5689d226de22566` |

El home original `implementador/ensayo/gpg-actual` es un directorio sin enlace y sigue vacío. No existen aún `correccion-gpg/continuacion-02`, `g2-a` ni `g2-h` en ambas comprobaciones. No se sobrescribieron diarios, freezes, cifrados ni reportes anteriores.

## Límites y puerta técnica

- Turing: baseline77; green93 (29 Node +31 runner +33 Bash), cero fallos/skip, 77 conservados +16 nuevos. Se contrastaron entrega/metadata y resumen runner; no son ejecuciones propias. Los primeros 13 nuevos cuentan con rojo validado; los otros tres son refuerzos posteriores. No se atribuye rojo inicial a los 16.
- Meitner es el verificador independiente designado; este dictamen estático no sustituye su informe. No se esperó ni se solicitó trabajo adicional a Turing.
- Fixtures nuevas simulan procesos, archivos, probes y diario; no ejecutan el CLI real de sellado ni prueban GPG corregido en Windows. Los rechazos de filesystem/CLI se revisaron por lectura. No se certifica cifrado/descifrado, restauración posterior ni resultado de los bancos futuros.
- Sin suites, imports del producto, .env, SQL/PG, Docker, GPG, HTTP/red, S3, instalaciones, Git writes o limpieza. Solo lecturas, hashes y diffs. Sin subagentes/hijos delegados.
- Continúan los límites del primer dictamen: ensayo sintético fijo, histórico 0019 acotado, sin S3/fotos externas, producción, custodia durable de claves, caída/concurrencia, otros históricos o cierre M10/Fase1. ShellCheck sigue NO_VERIFICADO y CI remoto no ejecutado.

El principal puede usar este dictamen para consolidar la puerta de la **continuación 02 conservada**, sin modificar el padre ni relajar el comportamiento ante fallos.

