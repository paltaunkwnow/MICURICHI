# M10.3 — Puerta técnica previa al ensayo real

**Superada el 2026-10-28**, tras consolidación por el principal de dos controles independientes.
La aprobación humana completa del27/10 sigue vigente; no se vuelve a solicitar.

**Vigencia limitada a la fuente inicial.** Tras el exit2 de GPG y el diario incierto, la
[corrección acotada](correccion-gpg.md) cambió tres fuentes. Una continuación exige su nueva
verificación/revisión y freeze; esta gate inicial no sustituye esos controles.

- Meitner: 77/77 propios (29 Node, 15 runner, 33 Bash), cero fallos, omisiones o regresiones;
  46 casos anteriores preservados y 31 nuevos. Sintaxis 4+2, Biome y YAML aprobados.
- Laplace: apto estáticamente para el ensayo acotado, sin bloqueantes concretos; revisados
  callee de migraciones y permisos locales sin cambios globales de roles/contraseñas.
- Ocho fuentes estables al freeze; seis copias F0 íntegras. Freeze SHA-256
  `31e2e511fb44aa68caffddb2bae466e122959668d9bcd66e5fced927066d8a1f`.
- Los dos actores finalizaron y se cerraron; no quedan hijos propios de su trabajo.

Evidencia: [verificación](verificacion.md), [revisión](revision.md), originales y logs en
`.turbo/m10-3-2026-10-27/{verificador,revision}/`. Las copias de los informes solo adaptan
vínculos relativos; se registra el hash de cada original. ShellCheck local sigue ausente,
NO_VERIFICADO; CI remoto no se ejecutó.

Se puede ejecutar ahora el protocolo ya aprobado, **una etapa explícita por llamada**,
comprobando estado/evidencia antes de la siguiente. Solo `template1` para metadatos/creación
y los cuatro bancos fijos sintéticos. Se conservan bancos y artefactos, sin DROP ni repetición
de etapas inciertas. No usar esta puerta como permiso para producción, otros bancos,
contracción física/HTTP, nuevos archivos de producto o publicación Git.

Límites conservados del dictamen: fixture de conservación, no payload API/PIP/autenticación;
caso histórico0019 específico, con puntos críticos vacíos, no todos los históricos. Clave
GPG efímera no demuestra custodia durable. No se acreditan S3/fotos externas, ACL/secuencias
completas, apagado o concurrencia. El ensayo real todavía debe aportar sus propios resultados.

`iniciar --operar` terminó con exit0 y creó únicamente el diario local antes del primer
preflight. No se crearon bases ni se invocó criptografía en ese paso.
