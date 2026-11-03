# Verificación independiente M10.2

**CONFORME EN ARNÉS AISLADO, CON LIMITACIONES.** Cero bloqueantes nuevos y cero regresiones observadas. Node **23/23**, Bash **23/23**, sin omisiones respecto a los nombres de casos de la corrida raíz. Los seis SHA permanecen iguales a freeze6 antes y después. Handback cerrado; todos los hijos iniciados terminaron.

Parte 5. Ownership exclusivo: `.turbo/m10-2-2026-10-27/verificador/`. Plan y AGENTS leídos; aprobación «Aprobar ambos bloques, en orden», RF cerrado previamente. Sin descendientes ni cambios al producto. Fecha: 2026-10-28T00:34:26.783Z (zona America/La_Paz). Node v24.15.0.

## Resultados ejecutados

| Control | RAM libre MiB | Exit | Resultado |
|---|---:|---:|---|
| node-test | 3587 | 0 | Conforme en su alcance |
| bash-test | 3659 | 3221225794 | Fallo MSYS antes de pruebas; resuelto en reintento |
| bash-test-reintento | 3660 | 0 | Conforme en su alcance |
| node-sintaxis | 3760 | 0 | Conforme en su alcance |
| node-test-sintaxis | 3768 | 0 | Conforme en su alcance |
| bash-sintaxis | 3762 | 0 | Conforme en su alcance |
| bash-test-sintaxis | 3717 | 0 | Conforme en su alcance |
| biome | 3764 | 0 | Conforme en su alcance |
| yaml-estatico | 3720 | 0 | Conforme en su alcance |
| shellcheck | 3670 | 3 | NO_VERIFICADO: MISSING |
| comparar-raiz | 3687 | 0 | Conforme en su alcance |

Ejecutados en serie y con RAM mínima de 3587 MiB. El primer Bash no llegó a ejecutar casos: MSYS/sandbox 0xC0000022. El mismo arnés pasó en el reintento autorizado fuera del sandbox, sin modificar pruebas ni timeouts. ShellCheck devuelve **3** por ausencia y se registra **NO_VERIFICADO**, nunca PASS. Se conserva en CI.

YAML 2.9.1 ya instalado: parseo con claves únicas, seis comandos aislados exactos, setup-node por .nvmrc, sin instalación en infra. El job postgres-real es idéntico a F0 tanto como objeto como texto; el simulacro real sigue presente. No se ejecutó CI. Comprobación propia en helper/estatico.mjs; no se ejecutó el helper raíz.

La orden exacta Node produjo reporter **spec**. Se conserva stdout literal y exit 0; logs/node-test-derivado.tap contiene una proyección TAP expresamente etiquetada, **no TAP nativo**. No se repitió la suite verde para cambiar de reporter.

## Base de comparación y criterios

Se verificaron cuatro copias F0 contra su manifiesto y se compararon las cuatro fuentes actuales con esas copias; los dos tests son archivos nuevos. No se usó HEAD ni se modificó Git. Los deltas calculados están en logs/delta-*.txt. F0 no tenía estas suites: no se inventa una suite previa aprobada. Los rojos iniciales y controles estáticos previos se atribuyen a la evidencia del implementador, sin reejecutarlos.

CA1: tabla física actual/previa y rechazo de vista comprobados. CA2: pérdida de las tres categorías no Inundaciones, contenido con igual cantidad, NULL, catálogo y compatibilidad por columnas comprobados mediante fixtures. CA3: guarda de destino de cualquier categoría, ejecutor obligatorio, error SQL y manifiestos incoherentes comprobados en helpers Bash. CA4: import/source seguros y cifrar/descifrar idénticos a F0 por lectura y comparación propia. CA5: mismas listas de 23+23 casos raíz y mutantes atribuidos correctamente. CA6: sintaxis 2+2, Biome y YAML aprobados; ShellCheck/CI real no verificados.

La comparación test por test está en logs/comparacion-raiz.json: 23 nombres Node y 23 Bash idénticos a raíz, sin casos perdidos. Los tres mutantes raíz se reutilizaron sin ejecutarlos: sin-comparar-contenido exit 1/6 fallos; tabla-vista-actual exit 1/18 fallos; ignorar-catalogo exit 1/1 fallo. Logs y helper raíz tienen SHA registrados. Las huellas de copias mutadas se reconstruyeron por sustitución exacta sobre el freeze; no son un manifiesto histórico emitido por raíz.

## Quietud SHA-256

| Archivo | SHA antes y después | Comparación |
|---|---|---|
| `scripts/respaldo.mjs` | `e302dc061bc5279cd47d46e4f3099b46a69dd18c931a4227b3486ca88efb7c0d` | Igual a freeze y cierre |
| `scripts/respaldo.test.mjs` | `e5219c753edc5897d0999d658ad477fd8b7361474ff89ce4dc9c8c013a39d325` | Igual a freeze y cierre |
| `infra/respaldo/respaldo.sh` | `64223b6da233de4d06b154b341b50803776a88c7ddef0a1277b794aac95f2dde` | Igual a freeze y cierre |
| `infra/respaldo/respaldo.test.sh` | `608fa28ce9445efccbf4293fa2140b50d317798a695e04b4484b9ffb70b68708` | Igual a freeze y cierre |
| `.github/workflows/ci.yml` | `c8c9381e0f8c2735e4a25ad8a756580df8b6af93473eb42eb1d37f1d3f538755` | Igual a freeze y cierre |
| `docs/operaciones/respaldo-y-restauracion.md` | `9a978a5d5b8859d47c014ee111f41c54802d05545744d1371d40304fb7f0e392` | Igual a freeze y cierre |

F0: 4/4 copias íntegras al inicio y al cierre. Evidencia completa en logs/sha-antes.json y logs/sha-despues.json. Sin inventarios globales; la garantía directa por hash se limita a esos archivos.

## Aislamiento, alcance y límites

Entorno de cada hijo por allowlist, sin variables heredadas PG/POSTGRES/DATABASE/RESPALDO/S3/AWS/RCLONE/URL_ADMIN, NODE_OPTIONS, NODE_PATH, BASH_ENV ni ENV. No se cargó .env. M10_SCRATCH solo en hijos apunta al directorio propio con forward slashes; los sentinels del Bash los introduce internamente su fixture. Node reemplaza exec/execFile/spawn/fork y las tres variantes sync antes del import, sincroniza exports ESM y exige SQL inyectado sin fallback. El mock rechaza SQL mutante. Bash deniega diez operadores antes de source; resultados 97/127 no cuentan como negativos exitosos.

La limpieza Bash resuelve una ruta absoluta y solo admite su shell-fixture.* dentro del scratch. No quedan fixtures ni archivos temporales propios; no se limpiaron caches, logs o datos ajenos. Todos los hijos finalizaron y no quedan sesiones propias abiertas. La sesión demo y sus procesos/datos no se inspeccionaron ni modificaron. No se ejecutaron operadores reales psql/pg_dump/pg_restore/docker/rclone/gpg, CLI respaldar/restaurar/simulacro, PG/Docker/S3/HTTP/red, builds ni pruebas tipadas de paquetes intactos. No hubo instalación de dependencias.

**Limitación heredada:** scripts/respaldo.mjs:195,214–215 conserva DROP/CREATE del destino y solo protege BASE por igualdad; la función restaurar completa es idéntica a F0. No incorpora la nueva guarda de vacío Shell. Queda documentado antes de cualquier ensayo futuro con origen/destino expresamente aprobados; no se probó ese CLI ni se cambió producto.

Los ensayos usan SQL mock y COPY sintético; no cifran ni restauran un respaldo real. El oráculo Node calcula huellas en JavaScript y no acredita la semántica del motor. No se acredita DB/PostGIS, criptografía, S3, CI real, recuperación, producción, M10 completo ni cierre de Fase 1. Convivencia/reversa y contracción física/HTTP conservan sus hitos.

## Comandos y salidas literales

Los comandos que siguen fueron lanzados mediante helper/ejecutar.mjs con entorno privado. Cada .json de logs conserva argv, stdout, stderr, exit, fechas, memoria y PID del hijo finalizado.

### node-test

```text
RAM=3587 MiB
COMANDO=["C:/Program Files/nodejs/node.exe","--test","scripts/respaldo.test.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:30:27.339Z
--- stdout ---
✔ importar no imprime, cambia exitCode ni inicia CLI/procesos (2.1006ms)
✔ sin SQL inyectado falla cerrado (0.4367ms)
✔ actual compara tabla física y las cuatro categorías con contenido (9.3865ms)
✔ rechaza pérdida de bache aunque Inundaciones siga intacta (0.7584ms)
✔ rechaza pérdida de basura aunque Inundaciones siga intacta (0.5166ms)
✔ rechaza pérdida de area_verde aunque Inundaciones siga intacta (0.3432ms)
✔ rechaza cambio en categoria con igual cantidad total (0.4074ms)
✔ rechaza cambio en detalle con igual cantidad total (0.3644ms)
✔ rechaza cambio en detalle_version con igual cantidad total (0.3051ms)
✔ rechaza cambio en geom con igual cantidad total (0.4021ms)
✔ rechaza cambio en descripcion con igual cantidad total (0.3194ms)
✔ NULL no se confunde con cadena vacía (0.4097ms)
✔ orden de filas no afecta evidencia (0.2561ms)
✔ previo 0020 conserva tabla antigua; columnas nuevas e índices no implican pérdidas (0.3803ms)
✔ columna actual perdida no se oculta como compatibilidad (0.2363ms)
✔ rechaza vista usada como tabla física (0.0979ms)
✔ rechaza migración ausente o inconsistente y error SQL (0.9297ms)
✔ mock no previsto y operadores reales permanecen bloqueados (0.1169ms)
✔ pérdida o cambio de catálogo de categorías falla (0.2118ms)
✔ evidencia parcial de categorías no puede pasar por completa (0.258ms)
✔ conteos inválidos, geometría inválida e índices perdidos fallan (0.8473ms)
✔ mismas columnas actuales en versión posterior admite columna nueva (0.2804ms)
✔ oráculos de fixtures discriminan pérdida, cambio de igual conteo y NULL (0.3292ms)
ℹ tests 23
ℹ suites 0
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 134.3391

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### bash-test

```text
RAM=3659 MiB
COMANDO=["C:/Program Files/Git/bin/bash.exe","--noprofile","--norc","infra/respaldo/respaldo.test.sh"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:30:43.750Z
--- stdout ---

--- stderr ---
      0 [main] bash (12004) C:\Program Files\Git\bin\..\usr\bin\bash.exe: *** fatal error - NtCreateDirectoryObject(\BaseNamedObjects\msys-2.0S5-1888ae32e00d56aa): 0xC0000022

EXIT=3221225794
SIGNAL=null
ERROR=null
```

### bash-test-reintento

```text
RAM=3660 MiB
COMANDO=["C:/Program Files/Git/bin/bash.exe","--noprofile","--norc","infra/respaldo/respaldo.test.sh"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:31:04.597Z
--- stdout ---
PASS actual exige reporte físico
PASS previo0020 acepta tabla antigua
PASS actual rechaza vista como TABLE DATA
PASS previo rechaza versión inconsistente
PASS migración inválida
PASS destino vacío actual
PASS destino ocupado solo otras categorías
PASS sin ejecutor SQL no hay fallback
PASS error SQL no es vacío
PASS manifiesto completo coincide con archivo leído
PASS manifiesto omite tabla física
PASS versión de manifiesto inconsistente
PASS manifiesto omite otra tabla
PASS formato desconocido
PASS manifiesto sin integridad
PASS manifiesto sin tamaño
PASS manifiesto con tamaño inválido
PASS objeto y migración deben coincidir
PASS conteo distinto del archivo
PASS tabla duplicada en manifiesto
PASS manifiesto previo0020 compatible
PASS parser COPY cuenta filas reales incluidas NULL/vacío
PASS error al leer archivo propaga fallo
TOTAL=23 PASS=23 FAIL=0

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### node-sintaxis

```text
RAM=3760 MiB
COMANDO=["C:/Program Files/nodejs/node.exe","--check","scripts/respaldo.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:31:47.013Z
--- stdout ---

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### node-test-sintaxis

```text
RAM=3768 MiB
COMANDO=["C:/Program Files/nodejs/node.exe","--check","scripts/respaldo.test.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:31:48.072Z
--- stdout ---

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### bash-sintaxis

```text
RAM=3762 MiB
COMANDO=["C:/Program Files/Git/bin/bash.exe","--noprofile","--norc","-n","infra/respaldo/respaldo.sh"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:31:55.724Z
--- stdout ---

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### bash-test-sintaxis

```text
RAM=3717 MiB
COMANDO=["C:/Program Files/Git/bin/bash.exe","--noprofile","--norc","-n","infra/respaldo/respaldo.test.sh"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:31:57.696Z
--- stdout ---

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### biome

```text
RAM=3764 MiB
COMANDO=["C:/Users/HP/.local/bin/pnpm.exe","--config.verify-deps-before-run=false","exec","biome","check","scripts/respaldo.mjs","scripts/respaldo.test.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:32:02.717Z
--- stdout ---
Checked 2 files in 14ms. No fixes applied.

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### yaml-estatico

```text
RAM=3720 MiB
COMANDO=["C:/Program Files/nodejs/node.exe",".turbo/m10-2-2026-10-27/verificador/helper/estatico.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:32:07.096Z
--- stdout ---
YAML 2.9.1: válido; 6 comandos aislados; postgres-real idéntico a F0 (objeto y texto); shellcheck conservado.
Barreras previas a import/source y limpieza absoluta verificadas por lectura. Cifrar/descifrar y restaurar Node (DROP heredado) idénticos a F0.

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```

### shellcheck

```text
RAM=3670 MiB
COMANDO=["C:/Program Files/Git/bin/bash.exe","--noprofile","--norc",".turbo/m10-2-2026-10-27/verificador/helper/shellcheck-local.sh"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:32:46.082Z
--- stdout ---
NO_VERIFICADO: ShellCheck MISSING localmente; control conservado en CI.

--- stderr ---

EXIT=3
SIGNAL=null
ERROR=null
```

### comparar-raiz

```text
RAM=3687 MiB
COMANDO=["C:/Program Files/nodejs/node.exe",".turbo/m10-2-2026-10-27/verificador/helper/comparar-evidencias.mjs"]
ENTORNO_SERVICIOS_HEREDADO=0
INICIO=2026-10-28T00:32:54.567Z
--- stdout ---
Comparación raíz: Node 23/23 y Bash 23/23 nombres idénticos, sin omisiones; 3 mutantes raíz aplicables al freeze, fallos 6/18/1 (no reejecutados).
Salida Node spec original preservada; TAP derivado etiquetado, sin repetir suite verde.

--- stderr ---

EXIT=0
SIGNAL=null
ERROR=null
```
