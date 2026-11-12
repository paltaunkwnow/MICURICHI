# M10.4 — Implementación y evidencia

**Entrega verificada en local el29/10.** Partes4/5 y gate independiente completados; [confirmación final](verificacion-formato.md). No es cierre de
M10 completo, Fase1 ni producción. El cierre de M10.4 consta en [informe.md](informe.md).
Aprobación y límites: [plan.md](plan.md).

## Parte4 — Datos

Hume, trabajador raíz `01a183db-c09e-7da3-847a-d340b9caf078`, entregó y quedó cerrado.
Los13archivos coinciden con su [freeze](../../../.turbo/m10-4-2026-10-28/parte4/freeze.json),
SHA256 `dc68903bad3e12c087625f12c363a85d9deaa511b4078da79ad1361028880cbc`.
[Informe del trabajador](../../../.turbo/m10-4-2026-10-28/parte4/informe.md),
[entrega estructurada](../../../.turbo/m10-4-2026-10-28/parte4/entrega.json) y
[comparación por caso](../../../.turbo/m10-4-2026-10-28/parte4/comparacion.json).

- FK tipada de fotos hacia `reporte.id`, con cascade. La FK física ya conservaba su
  destino tras0020; no se aplicó DDL.
- Seed y helper insertan inundaciones en la tabla física. Ambos DELETE del seed y su
  conteo conservan filtro de categoría; mismos valores/RNG, fechas y publicación.
  Columnas planas y trigger vigente mantienen coherente el JSON.
- Banco TypeScript importable sin ejecutarse; inserción/selección explícitas para
  inundación, misma rejilla y comparativa. El banco real no se operó.
- Pruebas actuales usan tabla física; los bloques históricos mantienen sus versiones
  y significado. Cuota antigua/limpieza/ACL y contador vigente se conservan y distinguen.
- Cobertura nueva de categorías, fotos/cascade, seed/helper, cuota y banco; README DB.

Baseline DB350/350 y API562PASS/12SKIP antes de editar. Rojo de cobertura nueva:
6FAIL/8PASS de14casos. Después,87/87 del conjunto modificado. Tipos/build antes y después
y Biome del delta:exit0. La comparación conserva350casos anteriores y añade11, sin
retirar casos ni aserciones. Esas cifras no convierten en verde una corrida incompleta.

### Incidente de verificación conservado

El primer full posterior se interrumpió con el host, sin resultado final. El segundo
terminó con timeout de120000ms en el `beforeAll` de `db.test.ts`, antes de sus9casos:

```text
 Test Files  1 failed | 30 passed (31)
      Tests  352 passed | 9 skipped (361)
   Duration  635.97s (transform 2.56s, setup 0ms, import 11.23s, tests 617.25s, environment 2ms)
```

El reintento dirigido de ese archivo, sin modificar fuentes o timeouts, terminó:

```text
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  8.20s (transform 804ms, setup 0ms, import 1.12s, tests 6.83s, environment 0ms)
```

Salida completa y controles: [full02](../../../.turbo/m10-4-2026-10-28/parte4/final-db-02.stdout.log),
[error del hook](../../../.turbo/m10-4-2026-10-28/parte4/final-db-02.stderr.log),
[dirigido03](../../../.turbo/m10-4-2026-10-28/parte4/final-db-03-dirigido.stdout.log).
El conjunto tiene361casos aprobados entre ambos intentos; **hasta ese momento no había un full
limpio de361casos en una pasada**. Los9auto-SKIP no son omisiones intencionales nuevas.
**Actualización del gate independiente:** Hegel completó después una corrida limpia
de361/361,31archivos,0omisiones y307,90s; ver [stdout](../../../.turbo/m10-4-2026-10-28/verificador/db-full-01-retry-02/stdout.log).
El incidente anterior se conserva; el informe final debe distinguir esas ejecuciones.
API posterior562PASS/12SKIP y controles restantes confirmados; el formato detectado después se resolvió en la [corrección acotada](implementacion-formato.md) y su [adenda independiente](verificacion-formato.md). No se repiten baseline ni los controles íntegros de tipos/build
sin cambios; los originales se conservan.

## Parte5 — Scripts y CI

Popper, trabajador raíz `01a18501-51b8-7ff3-9d28-656469121bd6`, entregó después de la
congelación Parte4 y quedó cerrado, sin procesos propios. Solo los5archivos del plan.
Sus SHA coinciden; las13fuentes Parte4 siguen quietas. Freeze Parte5 SHA256
`1984a1f69aa41814afb76f91ad536a5f2c7f749868265e52587355a689d9e417`.
[Informe completo con stdout y limitaciones](implementacion-parte5.md).

Baseline: sintaxis de2scripts, Biome2 y YAML7jobs,exit0. No existía un arnés previo de
estos bancos y no se operaron bancos reales para medir baseline. Nueva cobertura roja:
16FAIL/1PASS de17casos. Se conservan esos17 y se agregan2; final19/19,0omisiones,
sintaxis3scripts/Biome3/YAML7jobs aprobados. Se ejecutó también el comando Node exacto
añadido a CI, en local:

```text
ℹ tests 19
ℹ suites 0
ℹ pass 19
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7745.5527
```

Imports sin operación, tablas/filtros flood, aliases JSON y conservación del benchmark
histórico, limpieza acotada de puntos, SQL manual30tuplas y tres consultas del humo.
El arnés usa SQL literal en PGlite/PostGIS, F0 embebido y fixtures ficticias; no depende
de los archivos ignorados de `.turbo` para correr en CI. PC/capas globales conservan su
significado anterior; este banco no acredita SQL HTTP actual ni latencias de producción.
CI remoto no se ejecutó. El informe conserva fallos de fixture/formato/control intermedio
sin contarlos como PASS. La verificación independiente completa se aprobó; ver [informe final](informe.md).

## Documentación y control de alcance

AGENTS.md y CLAUDE.md: solo fecha y estado de§1/§4.8/§16.7; resto idéntico aF0,
comprobado por [control intermedio](../../../.turbo/m10-4-2026-10-28/cierre/alcance-intermedio-20261028T2233.json).
APIREADME precisa que cuota antigua ya no reserva cupos, pero sigue mantenida.
Plan aprobado, baseline, protocolo, índices, roadmap y contexto actualizados.

Godel preparó en solo lectura un mapa F0 de76casos/186aserciones de los7archivos
históricos afectados;76/76 corresponden a la baseline. No ejecutó producto ni certificó
todavía la implementación. [Mapa](../../../.turbo/m10-4-2026-10-28/revision/mapa-pruebas-f0.md),
[correspondencia](../../../.turbo/m10-4-2026-10-28/revision/correspondencia-baseline.json).
La [revisión estática Parte4](revision-parte4.md) fue conforme:76nombres/186aserciones
conservados y13/13fuentes quietas. No ejecutó pruebas ni resolvió el timeout.
Godel completó Parte5 y alcance sin hallazgos. Hegel, trabajador raíz
`01a18513-5f63-74a1-88ad-12681dd31b3d`, completó la verificación independiente
en `.turbo/m10-4-2026-10-28/verificador/` y el gate correctivo con dictamen CIERRE_APTO,
reutilizando las suites por AST/SHA tras un cambio exclusivo de formato. No queda heavy de pruebas activo.

Sin operaciones en instalaciones reales, sin nuevas migraciones, sin publicación Git.
Las12omisiones PG/S3 de API siguen sin verificar. CI remoto y producción no ejecutados.
