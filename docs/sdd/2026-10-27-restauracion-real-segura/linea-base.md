# M10.3 — Línea base antes de editar

**Ejecutada por Turing, trabajador raíz, el 2026-10-27 America/La_Paz.**
Principal consolidó las salidas guardadas, sin atribuirse su ejecución. F0 contiene seis
fuentes existentes y dos archivos nuevos ausentes: [arbol-inicial.txt](arbol-inicial.txt).
No se usa HEAD como versión previa: contiene otros hitos sin commit.

Evidencia: `.turbo/m10-3-2026-10-27/implementador/baseline-*.{log,json}`.
La metadata de cada control contiene orden, argumentos, RAM, exit y duración del proceso.

| Control previo | Resultado confirmado |
|---|---|
| `node --test scripts/respaldo.test.mjs` | 23/23, 0 fallos, 0 skip; exit0; 5273 MiB libres |
| Bash de respaldo | 23/23, 0 fallos; reintento fuera del sandbox exit0; 5264 MiB libres |
| Sintaxis Node de script y test | Exit0 en ambos |
| Sintaxis Bash de script y test | Exit0 en ambos; 5262 y 5247 MiB libres |
| Biome de los dos `.mjs` | Exit0; 5187 MiB libres |
| YAML con parser2.9.1 ya instalado y claves únicas | Exit0; 5184 MiB libres |

```text
ℹ tests 23
ℹ pass 23
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 147.2829

TOTAL=23 PASS=23 FAIL=0
```

El primer Bash no llegó a ejecutar la suite por el error MSYS/sandbox ya observado en M10.2.
El reintento del mismo arnés con Git Bash instalado aprobó. No se instala WSL ni otra herramienta.
Los logs originales conservan la salida y el exit de ambos intentos.

No había runner de ensayo ni su suite antes de M10.3; no se declara un resultado vacío como
aprobado. ShellCheck local ya estaba ausente y sigue **NO_VERIFICADO**, conservado en CI.
El resultado M10.2 anterior incluía revisión/verificación independientes para sus seis fuentes;
sirve de antecedente, pero no sustituye estas pruebas nuevas previas del implementador.

Defectos de partida aprobados para resolver: el CLI Node borra/recrea el destino; solo protege
BASE por igualdad. La migración0020 siembra cuatro categorías, cuya carga desde un respaldo
puede colisionar en un esquema nuevo: inferencia estática, todavía sin ensayo de motor.
No se realizó PostgreSQL/Docker/GPG/S3/HTTP/red real desde estos controles.
