> Entrega de Turing; solo vínculos adaptados. SHA-256 original: `54303e173defcebaadb1903fc111d5fa262b7f8be0ba2fae507e8ef237bce479`.

# Corrección GPG M10.3 — entrega aislada

Meta alcanzada para implementación/pruebas. Lista para revisión/verificación independientes; NO se ejecutó sellado, GPG, SQL, Docker ni continuidad real. Ningún proceso/hijo pendiente. Demo intacta.

Cambios exactos: 
- scripts/ensayar-respaldo-multitematico.mjs
- scripts/ensayar-respaldo-multitematico.test.mjs
- docs/operaciones/respaldo-y-restauracion.md

## Evidencia

Baseline 77/77: 29 Node, 15 runner y33 Bash. Green93/93:29 Node,31 runner,33 Bash;0FAIL/0SKIP;77anteriores íntegros y16adicionales. Los cuerpos originales de15casos del runner se compararon contra F0; los otros5archivos del inventario8 no cambiaron respecto del freeze antiguo. Comparación por nombre en [comparacion77.json](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/comparacion77.json).

Los13casos iniciales nuevos fallaron antes de implementar: [red validado](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/red-runner-validado.log), exit1;los15anteriores pasaron. La primera red tenía3negativos que podían pasar por helper ausente: se corrigieron antes de producto, se conserva [salida inicial](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/red-runner.log). Los3casos finales refuerzan rechazo antes de efectos, exit2 devuelto y rollback/repetición del intento; no se presentan como rojos iniciales.

| Control | Casos / resultado | Exit | RAM MiB |
|---|---|---|---|
| [baseline-node](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-node.log) | 29 PASS | 0 | 2865 |
| [baseline-runner](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-runner.log) | 15 PASS | 0 | 2971 |
| [baseline-bash-exacto](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-bash-exacto.log) | 33 PASS | 0 | 3005 |
| [baseline-syntax](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-syntax.log) | OK | 0 | 3078 |
| [baseline-test-syntax](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-test-syntax.log) | OK | 0 | 3080 |
| [baseline-biome](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-biome.log) | OK | 0 | 3080 |
| [green-node](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-node.log) | 29 PASS | 0 | 3043 |
| [green-runner](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-runner.log) | 31 PASS | 0 | 3159 |
| [green-bash](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-bash.log) | 33 PASS | 0 | 3169 |
| [green-syntax](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-syntax.log) | OK | 0 | 3694 |
| [green-test-syntax](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-test-syntax.log) | OK | 0 | 3691 |
| [green-biome](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-biome.log) | OK | 0 | 3695 |
| [green-diff](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-diff.log) | OK | 0 | 3697 |
| [green-estado](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/green-estado.log) | OK | 0 | 3684 |

Cada enlace tiene su JSON homónimo con comando,args,exit,duración yRAM. Todas las RAM>=1500MiB,ejecuciones en serie. MSYSsandboxfalló0xC0000022([log](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/baseline-bash.log));se reintentó exactamente el arnés fuera con aprobaciónherramienta. ShellCheck sigueNO_VERIFICADO/ausente,histórico,no instalado. No TS/build ni suites de apps. CI/YAML/Shell producto sin cambios; no se ejecutó CI remoto.

## Resultado y límites

Conversor puro Windows→POSIX solo para argumentosGPG/GPGCONF; rutas nativasNodefs/Docker/ejecutable intactas. Probes dehome/socket inyectados y exactos antes de cifrar; homes cortos fijos g2-a/g2-h, sin symlinks ni adopción. Stderrfallido acotado/redactado(sinstdin/claves/passwords/URLs),SHA de flujo completo y tamaños/hashes de parciales antes de salir;todo exit distinto de0 falla, incluso conarchivo presente.

Sello vincula oldfreeze→newfreeze, hash exacto deparentarchivado yparentactual,205892/curichi/7688456033622585387,prefijo4completas,dump/sidecar/cipherfallido/homevacío/lock ydosdiagnósticos. Hijo clona evidencia4 sin ejecutar;padre incierto queda intacto. Rechaza cambios,replay,restore/carga inciertos ysegundo sellado/intentorepetido. Restaura con helpers Node/Shell yverificadorM10.2 yaexistentes cuando se habilite la operación.

Defecto comprobado: rutaWinmalinterpretada porGitGPG;sinstderr original no se afirma causaúnica. Laspruebasmock no certifican aúnel cifrado real corregido.

## Freeze e integridad

Nuevofreeze: correccion-gpg/freeze8.json;SHA-256 **ebfefc674560897b92f2b3792809cb1e8b9c3d9975565dfe73b6ecb08592ff09**. Original implementador/freeze8.json conservado **31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f**. Ochofuentes estables durantegreen. [integridad.json](../../../.turbo/m10-3-2026-10-27/implementador/correccion-gpg/integridad.json) registra padre,dump,sidecar,cipher yhome originalesintactos;no existe diariohijo ni homesg2-a/g2-h. F0 tresfuentes en f0/.

## Interfaz manual (pendiente de gate independiente)

Consulta sin efectos: 

```powershell
node scripts/ensayar-respaldo-multitematico.mjs estado-continuacion
```

Después de la revisión y mensaje técnico del principal, cada línea por separado:

```powershell
node scripts/ensayar-respaldo-multitematico.mjs sellar-continuacion --operar
node scripts/ensayar-respaldo-multitematico.mjs ejecutar-continuacion cifrar_actual --operar
```

Sellar solo crea correccion-gpg/continuacion-02/{sello.json,diario.json};sinSQL/GPG. El primer operador nuevo es ejecutar-continuacion cifrar_actual. GPGhome propio .turbo/m10-3-2026-10-27/g2-a; histg2-h. Nuevo cipher/descifrado en continuacion-02/. Se lee el dumporiginal;jamás se sobrescribe. Clave soloenmemoria/stdin.

Solo tras éxito completo usar ejecutar-continuacion ETAPA --operar para restaurar_actual,verificar_actual,negativos_actual y después crear_pre0020,sembrar_pre0020,respaldar_pre0020,cifrar_pre0020,restaurar_pre0020,verificar_pre0020,negativos_pre0020. No invocar preflight/crear_actual/sembrar_actual/respaldar_actual;se rechazan antes de conexión.

En incertidumbre o discrepancia: conservar todo y entregar estado. No editar padre/hijo, sustituirfreezeoriginal, adoptarhome/cipher ni repetir cargas;no existe reset,cleanup,retry ni continuación del intento02fallido. Inventario fuera3: ningún cambio necesario ni bloqueante nuevo detectado.
