# M10.3 — Corrección de rutas GPG y continuidad manual conservada

**2026-10-28. Corrección necesaria dentro del inventario M10.3 aprobado.**
Se limita al runner, sus pruebas y el documento operativo: tres de los ocho archivos
ya autorizados. No amplía bancos, roles, conectividad ni herramientas; no relaja fallos.
Trabajador raíz Turing, con pruebas previas/posteriores y controles independientes antes
de ejecutar de nuevo un operador. No es permiso para repetir una carga/restauración incierta.

## Hechos observados

Gate inicial superada con 77 pruebas independientes, revisión estática conforme y ocho
fuentes iguales al freeze `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f`.
Después terminaron preflight, crear_actual, sembrar_actual y respaldar_actual, todos exit0.
Banco único creado: `curichi_sdd_m10_20261027_actual`, OID205892,
servidor7688456033622585387; 21 migraciones, cuatro reportes ficticios, uno por categoría.

`cifrar_actual` terminó incierta: GPG exit2 antes de descifrar. Produjo un archivo de
79164 bytes, que se conserva; eso no demuestra validez del cifrado. La clave efímera
ya no está disponible. Dump original de79005 bytes intacto; SHA-256
`3794a55bc944c3bd47c2b8cfe54232ad3e8da288658ca93437395f70b2c80562`.
No existe descifrado ni se creó la copia de restauración o los dos bancos históricos.

El error original conserva solo el hash de stderr, no su texto. No se afirma su causa
única. El diagnóstico posterior sí comprobó un defecto concreto: Git GPG/gpgconf recibe
el homedir Windows como ruta relativa y lo antepone al directorio actual. Al pasar la
ruta POSIX `/c/Users/...`, devuelve el homedir y socket correctos. Son consultas
`gpgconf --list-dirs`, sin repetir cifrado, descifrado ni operaciones de base.

Evidencia en `.turbo/m10-3-2026-10-27/cierre/`:

- `diario-antes-diagnostico-cifrar-actual.json` y `freeze8-antes-correccion-gpg.json`;
- `gpg-intento1-artefactos.json` y `cifrar-actual-real.json`;
- `gpg-list-dirs-diagnostico.json` y `gpg-list-dirs-ruta-posix.json`.

## Delta acotado y nueva puerta técnica

1. Convertir solo los argumentos de ruta de Git GPG/GPGCONF al formato que entiende
   ese runtime. Node/filesystem/Docker mantienen sus rutas actuales. Añadir pruebas
   de normalización y errores con diagnósticos acotados, redactados y sin stdin/secretos.
2. Conservar íntegros el diario original incierto, freeze, dump, cifrado y homedir.
   Añadir continuación **manual explícita y exclusiva de esta falla de cifrar_actual**,
   en diario hijo y rutas nuevas fijas; ningún reset ni edición del intento original.
3. Sellar el enlace freeze antiguo→nuevo, hash del diario archivado, cuatro checkpoints
   completos, OID/dueño/servidor, dump/sidecar y manifiesto del intento fallido. Rechazar
   cualquier discrepancia, carga/restore incierto o repetición de la continuación.
4. Heredar evidencia de las cuatro etapas completas sin volver a ejecutarlas. El nuevo
   cifrado usará otra clave efímera por descriptor y homedir propio. Solo un resultado
   correcto permitirá continuar a la restauración desde sus artefactos nuevos.
5. Baseline77 antes de editar, casos nuevos en rojo/verde, comparación y freeze nuevos;
   revisión funcional/seguridad y verificación independientes antes del operador manual.

Si no puede conservarse esa separación e identidad dentro de los tres archivos, detenerse
y concretar el cambio necesario; no inventar un bypass ni manipular el diario para avanzar.
El ensayo general sigue abierto. Ningún éxito unitario nuevo se presenta como restauración real.
