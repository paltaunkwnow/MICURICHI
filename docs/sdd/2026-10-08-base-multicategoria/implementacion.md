# Implementación — Base multicategoría (M2)

Transcripción, hecha por el agente principal, de los informes de los implementadores. Las salidas son
las que pegaron ellos; la verificación independiente es la de `verificacion.md` (F4a).

| Tarea | Agente | Criterios | Archivos |
|---|---|---|---|
| M2.1–M2.2 | `trabajador-raiz` (Opus 4.8) | CA1–CA4 | `packages/db/migraciones/0020_base_multicategoria.sql`, `migraciones/reversas/0020_base_multicategoria_reversa.sql`, `test/migracion-0020-base-multicategoria.test.ts`, `src/esquema/index.ts`, `src/cli/matriz-privilegios.mjs`, `src/cli/verificar-privilegios.mjs`, `src/mantenimiento.ts`, `src/geometria-publica.ts`, `test/esquema-drizzle.test.ts`, `test/migracion-0013…`, `0016…`, `0018…` |
| M2.3 | `trabajador-raiz` | CA5 | `docs/sdd/2026-10-08-base-multicategoria/medicion.md` (scripts en el scratchpad, fuera del repo) |
| M2.4 | `general-purpose` (Sonnet) | CA6 | `scripts/respaldo.mjs` |
| M2.5 | `general-purpose` (Sonnet) | CA7 (README) | `packages/db/README.md` |
| M2.6 | agente principal | CA7 | `CLAUDE.md` §7.1, §7.2, §9.1, §16; ADR 0017 (cupo de fotos); ADR 0023 (D3), nueva; `docs/decisiones/README.md`; `docs/arquitectura/14` §8 |

Lista completa en `archivos.txt`.

## Interrupciones

- La primera ejecución de M2.1 se cortó por el límite de sesión de la API **antes de escribir nada**
  (`packages/db` sin cambios). Se retomó con su contexto.
- M2.3 se cortó dos veces (red y límite de sesión); la última, con Docker apagado. Escribió
  `medicion.md` con lo medido y se retomó para la combinación de índices cuando el usuario encendió Docker.
- El preflight de M2.1 lanzado en segundo plano se corrompió con el corte («Worker exited
  unexpectedly», 11/25 archivos). Vale como «antes» la línea base del verificador: `db` 25 archivos / 260.

## Por criterio (según los implementadores)

| CA | Qué y dónde | Prueba |
|---|---|---|
| CA1 | 0020 en una transacción e idempotente: guarda; catálogo `categoria`; función `detalle_inundacion()` (única fuente del `detalle`, `jsonb_strip_nulls`); `RENAME`; columnas `categoria`, `subtipo`, `detalle`, `detalle_version` con CHECK de objeto y tope 8192; relleno; columnas de dominio `NULL`-ables + CHECK `inundacion_campos_presentes` y `no_inundacion_sin_campos`; disparador `reporte_sincronizar_detalle`; vista `reporte_inundacion` (`security_invoker`, `CASCADED CHECK OPTION`, `SELECT *`) con los mismos *grants*; `punto_critico.categoria`; `cupo_contador`. **6b:** recrea `reporte_agregado_uv` con `categoria` en el `INCLUDE` | `migracion-0020` (20 pruebas) |
| CA2 | Conteos y `md5` iguales; `detalle` reconstruye al 100 %; vista = tabla filtrada; `INSERT`/`UPDATE`/`FOR UPDATE`/`UPDATE … FROM` por la vista; CHECK OPTION (44000) y CHECK (23514); *upsert* de `cupo_contador`; catálogo en el orden de `SLUGS_CATEGORIA`; desde cero y dos veces; **reversa** (catálogo = 0019, aborta con otra categoría, borra su fila de `_migraciones` y el migrador la reaplica) | ídem |
| CA3 | Drizzle: `categoria`, `reporte`, `cupoContador`; `reporteInundacion` sigue en `'reporte_inundacion'`. Privilegios con `categoria`, `reporte` y `cupo_contador`. Mantenimiento y geometría pública sobre `reporte`; el mantenimiento limpia ventanas viejas de `cupo_contador` (`cupoContadorBorrado`) | `esquema-drizzle`, `matriz-privilegios`, `db privilegios` en PostgreSQL real |
| CA4 | api-core, geo-service y geodata-etl sin tocar, con suites iguales a la línea base | `turbo run test --filter=...db` |
| CA5 | 1 M × 4 en `curichi_sdd_m2_banco` con capas reales | `medicion.md` |
| CA6 | `indices_reporte` cuenta `tablename IN ('reporte','reporte_inundacion')` con `schemaname = 'public'` | `node --check`, Biome |
| CA7 | README de `db`, `CLAUDE.md`, ADR | lectura |

## Salidas pegadas por los implementadores (después)

- `--filter db exec vitest run` → **26 archivos / 280 verdes** (260 de la línea base + 20 de la 0020).
- `turbo run typecheck --filter=...db --concurrency=1` → 6 successful, exit 0.
- `turbo run test --filter=...db --concurrency=1` → db 280; api-core 405 (+11 omitidas, igual que la línea base); geo-service 61; geodata-etl 21.
- PostgreSQL real: `cuota-concurrencia-pg` + `fotos-cuota-concurrencia-pg` 2 archivos / 9 verdes; base efímera `curichi_sdd_m2_priv`: migrate 20, segunda pasada «ninguna», `privilegios` correcto, `dropdb`. Vista con `security_invoker=true, check_option=cascaded`; api lee y escribe y geo solo lee por ella.
- `git diff --diff-filter=MDR refs/sdd/base-multicategoria -- packages/db/migraciones` → vacío.
- `biome check packages/db` → 58 archivos, sin diagnósticos. `scripts/respaldo.mjs`: `node --check` 0 y Biome limpio.

## Decisiones técnicas que el plan no decía al pie de la letra (para la revisión)

1. **Índice `reporte_agregado_uv` recreado** (paso 6b) con `categoria` en el `INCLUDE`. Sin eso, el agregado por UV de
   geo-service dejaba de ser *Index Only Scan* al pasar por la vista (regresión de `plan-agregados`). El plan
   decía «sin índices nuevos en M2»: no es un índice nuevo, es el mismo recreado para conservar el plan de hoy.
   La reversa lo vuelve a su forma de la 0015.
2. **Vista `SELECT *`**: el plan pedía «todas las columnas». Su lista queda fija al crearla.
3. **Pruebas existentes 0013, 0016 y 0018 ajustadas**: algunos bloques migraban a la última y reejecutaban SQL
   viejo (`ALTER TABLE reporte_inundacion`) o miraban `reporte_inundacion` por `::regclass`, que sobre una vista
   ya no sirve. Se acotaron a `{ hasta: '0019' }`; en 0016 «desde cero» (que siembra), un *helper* lee la tabla
   base se llame como se llame. Según el implementador, la intención de cada prueba se conserva.
4. **`esquema-drizzle.test.ts`** compara la vista solo por nombre y tipo (una vista informa todo como nullable y
   sin *default*).
5. `cupo_contador`: `n integer CHECK (n >= 0)` sin *default*; `clave` de 1 a 120 caracteres.

## Hallazgo resuelto durante la corrida

- La reversa no borraba su fila de `_migraciones` (lo encontró M2.5). Corregido por M2.1 con dos pruebas nuevas.
