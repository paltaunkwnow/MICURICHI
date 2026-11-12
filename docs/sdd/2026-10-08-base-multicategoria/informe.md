# Informe — Base multicategoría (M2, migración 0020)

- **Corrida:** `docs/sdd/2026-10-08-base-multicategoria/` · **Rama:** `feat/db/base-multicategoria` · **Parte:** P4 (`packages/db/`), con una tarea de la P5 (`scripts/respaldo.mjs`) y una ampliación autorizada en `services/geo-service/` (dos archivos)
- **Banderas:** `base`, `datos`, `geo`, `privacidad`, `seguridad`, `concurrencia` · **Cambio de contrato:** no (el OpenAPI no cambia)
- **Proceso:** CLAUDE.md §12.4; `plan.md`, aprobado por el usuario el 2026-10-08, hace de spec
- **Vueltas implementador ↔ verificación:** 1 (hallazgos IMPORTANTE y MENOR del auditor y una NOTA del revisor; ninguna regresión)
- **Foto:** `refs/sdd/base-multicategoria` = `338e571` · **Cambios ajenos:** los de `arbol-inicial.txt` (M1 sin commitear en `packages/contracts/`, M0 en `docs/`, `ContextosySkills/`…), que no van en el commit de esta corrida · **Línea base:** `linea-base.md` (rojos que ya estaban: 2, `lint` y `auditoria`; decisión: seguir como conocidos)

## Qué cambia

La base queda lista para varias categorías **sin cambiar el comportamiento**. La migración 0020:
- crea el catálogo `categoria`;
- renombra `reporte_inundacion` a `reporte`;
- suma a `reporte` las columnas `categoria`, `subtipo`, `detalle` (con la de inundación armada por un disparador) y `detalle_version`;
- agrega reglas que impiden mezclar campos de una categoría con otra;
- deja la **vista de compatibilidad** `reporte_inundacion`, por la que api-core y geo-service siguen leyendo y escribiendo sin cambios;
- agrega `punto_critico.categoria` y el contador genérico `cupo_contador`.

Tiene su reversa probada. Se midió el modelo con 1 M de reportes en 4 categorías, para decidir los índices de M3. Se registraron las decisiones D3 («v2 extendida», ADR 0023) y el cupo de fotos global (ADR 0017).

## Regresión contra la línea base

**Ninguna.** Detalle test por test en `verificacion.md` (primera pasada y vuelta 1).

| Comando | Línea base | Después (vuelta 1) | Clasificación |
|---|---|---|---|
| `lint` | rojo: 1 error + 6 avisos, ajenos (`ContextosySkills/hooks/contexto.mjs`, un `.html` de `docs/dominio/`) | igual; nada en `packages/db`, `services/geo-service` ni `scripts` | igual |
| `turbo typecheck --filter=...db --concurrency=1` | verde 6/6 | verde 6/6 | igual |
| `turbo test --filter=...db --concurrency=1` | db 25/260 · api-core 405 (+11 omitidas) · geo-service 61 · geodata-etl 21 | db **26/284** · api-core 405 (+11) · geo-service 61 (ejecutado, no caché) · geodata-etl 21 | igual + 24 pruebas nuevas |
| PostgreSQL real: `cuota-concurrencia-pg` y `fotos-cuota-concurrencia-pg` | verde 2/9 | verde 2/9 | igual |
| Base efímera: `migrate` ×2, `privilegios` | verde (hasta 0019) | verde (hasta 0020): vista con `security_invoker` y `check_option=cascaded`; funciones sin `PUBLIC` y con `search_path`; `INSERT` como `curichi_api` arma el `detalle`; reversa y reaplicación de la 0020 | igual |
| `secretos` | verde | verde | igual |
| privacidad (api-core 6 archivos, `jitter`) · seguridad (9) · concurrencia (3) · puntos críticos (3) | verde | verde | igual |
| `auditoria` | rojo: 3 high (`source-map-js`, `sharp`, `next`) | igual (primera pasada; la vuelta 1 no toca dependencias) | igual |
| Migraciones existentes cambiadas (`--diff-filter=MDR`) | — | ninguna | — |

Rojos que ya estaban y siguen igual: `lint` y `auditoria`, ajenos. **Intermitentes:** en la vuelta 1, la primera corrida de la suite de `db` del implementador se cayó por contención de *workers* (236 verdes, 48 omitidas, exit 1, 424 s); repetida, 26/284 verde, y el verificador la corrió limpia. `api-core > exportacion.test.ts` pasó en todas las corridas de esta corrida.

## Criterios

| CA | Prueba | Antes | Después |
|---|---|---|---|
| CA1 · migración 0020 | `packages/db/test/migracion-0020-base-multicategoria.test.ts` (24 pruebas) | no existía | verde |
| CA2 · prueba y reversa | ídem (conteos y `md5`, reconstrucción del `detalle`, vista = tabla filtrada, CHECK OPTION, *upsert*, desde cero y dos veces, reversa = catálogo de la 0019, borra su fila y se reaplica) + reversa en PostgreSQL real | no existía | verde |
| CA3 · Drizzle, privilegios, mantenimiento, geometría pública | `esquema-drizzle.test.ts`, `matriz-privilegios.test.ts`, `pnpm --filter db privilegios` en PostgreSQL real | verde | verde |
| CA4 · compatibilidad sin tocar consumidores | suites de api-core, geo-service y geodata-etl iguales a la línea base | verde | verde |
| CA5 · medición | `medicion.md` (1 M × 4, capas reales, 4 opciones de índice y su combinación) | — | hecho |
| CA6 · respaldo | `scripts/respaldo.mjs:256-258`; `node --check`, Biome | — | hecho |
| CA7 · documentación | README de `db`, `CLAUDE.md` §7.1, §7.2, §9.1, §16; ADR 0017 y 0023; `docs/arquitectura/14` §8; `docs/seguridad/modelo-de-seguridad.md` | — | hecho |

## Medición (resumen de `medicion.md`)

- **Base de la medición:** 1 000 000 de reportes, 250 000 por categoría, sobre las capas reales; PostgreSQL 18.6 con PostGIS 3.6.4.
- **El caso lento es el listado público de un barrio**, que trae unas 3 000 coincidencias. El planificador deja el índice espacial y recorre `reporte_creado`: 18,8 ms y 16 978 bloques.
- **Opciones que no lo mejoran:**
  - el índice espacial compuesto con `btree_gist`;
  - un índice espacial parcial por categoría.
- **La que sí:** un índice parcial `(categoria, creado_en DESC)` sobre los estados públicos.
- **Combinación medida:** con ese índice y el espacial juntos, el barrio baja a **2,92 ms y 3 818 bloques**. El planificador sigue usando el espacial en los recuadros chicos (0,12 ms).
- **Recomendación para la migración de M3:** crear el índice parcial junto al espacial, sin reemplazarlo.
- **Agregados por UV:** quedan cubiertos por la 0020, con Index Only Scan en 354 ms.
- **DBSCAN de una categoría:** 1,04 s. Queda para vigilar.

## Hallazgos del revisor y del auditor

| Severidad | Hallazgo | Resolución |
|---|---|---|
| IMPORTANTE (auditor) | La guarda de solo lectura de geo-service (`services/geo-service/src/servidor.ts:56`) miraba la vista `reporte_inundacion`, no la tabla `reporte`: una escritura concedida sobre `reporte` no se habría detectado | **Resuelto** con autorización del usuario: `puedeEscribir(pool, 'reporte')`. El auditor comprobó que la guarda nueva detecta ese caso y la vieja no, y que no da falso positivo con `curichi_geo` |
| MENOR (auditor) | `detalle_inundacion` y `reporte_sincronizar_detalle` con `EXECUTE` a `PUBLIC` y sin `search_path` | **Resuelto**: `REVOKE … FROM PUBLIC`, `SET search_path = public, pg_temp`, `EXECUTE` de `detalle_inundacion` solo a `curichi_api` (el disparador corre como quien escribe y la llama). 4 pruebas nuevas |
| IMPORTANTE (revisor) | Alcance de documentación: además de lo que listaba CA7, la corrida editó ADR 0017, `docs/decisiones/README.md`, `docs/arquitectura/14` y `CLAUDE.md` §9.1 y §16, y creó la ADR 0023. 0017 y 14 figuraban como ajenos en la línea base | **Aceptado y declarado**: registran las dos decisiones que el usuario tomó al aprobar el plan (D3 y cupo de fotos). Están en `archivos.txt` desde M2.6; el verificador los reconcilió contra él. La edición de `CLAUDE.md` está dentro de la autorización del usuario. Se suma `docs/seguridad/modelo-de-seguridad.md`, desactualizado por el renombre |
| NOTA (revisor) | `plan-agregados.test.ts:38` hacía `VACUUM ANALYZE` sobre la vista (sin efecto) | **Resuelto** con autorización: `VACUUM ANALYZE reporte` |
| NOTA (revisor) | Índice `reporte_agregado_uv` recreado con `categoria` en el `INCLUDE` (el plan decía «sin índices nuevos») | Justificado: conserva el Index Only Scan de hoy a través de la vista; no es un índice nuevo por categoría. La reversa lo devuelve a la 0015 |
| NOTA (revisor) | Pruebas 0013, 0016 y 0018 acotadas a `{ hasta: '0019' }` | **Sin debilitamiento**: la línea base ya terminaba en la 0019, así que comprueban lo mismo; la de 0016 «desde cero» gana cobertura de la 0020 |
| NOTA (revisor) | `scripts/respaldo.mjs` cuenta `IN ('reporte','reporte_inundacion')` en vez de solo `'reporte'` | Mejor que la letra del plan: sirve antes y después de la 0020 (la base del usuario sigue en la 0009) |
| NOTA (revisor) | Una sonda del auditor apareció un momento en `packages/db/__sonda_priv_tmp.mjs` | Ya no existe; el `git status` final del verificador no muestra archivos sueltos |
| NOTA (auditor) | `docs/seguridad/modelo-de-seguridad.md:151` decía «cinco tablas» para `curichi_geo` | **Resuelto**: remite a la matriz e incluye `categoria`, `reporte` y la vista |

## Para M3 (pendientes que deja esta corrida)

- **Índice** parcial `(categoria, creado_en DESC) WHERE estado IN (públicos)`, junto al GIST (medición).
- **Vista:** al agregar una columna a `reporte`, recrearla. Si el código la usa por Drizzle, sumar la columna también a `reporteInundacion`.
- **Otra categoría:** una categoría distinta de inundación inserta `causa_presunta = NULL` explícito.
- **`detalle` de otras categorías:** lo valida el Zod estricto de su definición. El tope de 8192 bytes es solo una red de seguridad.
- **`cupo_contador`:**
  - su prueba de concurrencia con PostgreSQL real;
  - un ámbito de regla desconocido tiene que **fallar cerrado**.
- **DBSCAN** particionado por categoría.
- **Decisión pendiente, antes de M3:** `fusionado_en_id`. `PATCH /estado` solo acepta UUID (`packages/contracts/src/esquemas/reporte.ts:331`), mientras que `POST /fusionar` y el manual aceptan también el ID corto.

## En vivo y túnel

No aplica (sin `ui`, `api` ni `infra`). La pila no se reconstruyó. Bases efímeras usadas y borradas: `curichi_sdd_base_multicategoria`, `curichi_sdd_m2_priv`, `curichi_sdd_m2_banco` (medición), `curichi_sdd_m2_v1`. **`curichi` y `curichi_revision` intactas.**

## No verificado (y por qué)

| Qué | Motivo | Qué haría falta |
|---|---|---|
| Ventanas E2E (`datos-reales.spec.ts`; G1 + `ubicacion-obligatoria`, `ubicacion-aproximada`; G1 + `csp`, `camara-foto`) | El usuario no autorizó la ventana E2E | Autorizarla. Las suites de api-core y geo-service ya corren contra la 0020 y la vista |
| `api-core > test/almacen-s3.test.ts` | `S3_SECRET_KEY` no está en el entorno | La variable; el diff no toca almacenamiento |
| `pnpm auditoria` en la vuelta 1 | La vuelta no toca dependencias (en la primera pasada, igual a la línea base) | — |
| La 0020 sobre la base real del usuario (`curichi`) | No se migra por decisión previa (está en la 0009) | Un `pg_dump` y la autorización del usuario, cuando quiera ponerla al día |

## Hallazgos fuera de la carpeta designada (documentados, NO tocados)

| Archivo:línea | Síntoma | Riesgo |
|---|---|---|
| `ContextosySkills/hooks/contexto.mjs` (formato; :42, :43, :45, :49) | Biome: 1 error de formato + 5 `noUndeclaredEnvVars` | `pnpm lint` en rojo; el pre-commit fallaría si se versiona tal cual |
| `docs/dominio/infografia-plataformas-riesgo.html:128` | Biome: `noDescendingSpecificity` (aviso) | Bajo |
| Dependencias de `apps/*` y `services/api-core` | `pnpm audit`: 3 high (`next` < 16.3.8, `sharp`, `source-map-js`) | Preexistente; tarea propia |

## Cómo volver atrás (si no se aprueba)

- **Código:** `git checkout refs/sdd/base-multicategoria -- <archivo>` por cada modificado de `archivos.txt`, y borrar los nuevos (`packages/db/migraciones/0020_base_multicategoria.sql`, `packages/db/migraciones/reversas/`, `packages/db/test/migracion-0020-base-multicategoria.test.ts`, `docs/decisiones/0023-…`). Ojo: `CLAUDE.md`, `docs/decisiones/README.md` y `docs/arquitectura/14` también tienen cambios de M0, que la foto incluye (`git stash create`), así que volver esos archivos a la foto conserva M0.
- **Base:** ninguna base del usuario se migró. Una base ya migrada a la 0020 vuelve con la reversa (`psql -v ON_ERROR_STOP=1 -f packages/db/migraciones/reversas/0020_base_multicategoria_reversa.sql`) mientras solo tenga inundaciones.

## Puerta 2

**Sin commit**, por decisión del usuario del 2026-10-08 («primero tengamos todo terminado en local»). La corrida queda verificada; `refs/sdd/base-multicategoria` se conserva. Cuando el usuario lo pida, el commit de esta corrida lleva solo `archivos.txt` y esta carpeta, añadidos archivo por archivo, por ejemplo `feat(db): base multicategoría con vista de compatibilidad (migración 0020, ADR 0010 y 0011)`, después del de M1.

---

## Plantilla de PR (`.github/PULL_REQUEST_TEMPLATE.md`)

### Parte y carpeta designada
- Parte: `P4` (`packages/db/`), más `P5` (`scripts/respaldo.mjs`) y dos archivos de `services/geo-service/` con autorización del usuario
- Carpeta designada: `packages/db/`

### Qué cambia
Migración 0020: catálogo `categoria`, `reporte_inundacion` → `reporte` con `categoria`/`subtipo`/`detalle`/`detalle_version`, vista de compatibilidad `reporte_inundacion`, `punto_critico.categoria`, `cupo_contador`, reversa probada. Sin cambios de comportamiento ni de API. Medición 1 M × 4 para los índices de M3.

### Cómo verificarlo

```bash
npx -y pnpm@12.4.1 --filter db exec vitest run
npx -y pnpm@12.4.1 exec turbo run typecheck test --filter=...db --concurrency=1
```

### Cambios de contrato (`packages/contracts`)
- [x] No hay

### Hallazgos fuera de la carpeta designada (documentados, NO tocados)
`ContextosySkills/hooks/contexto.mjs` y un `.html` de `docs/dominio/` (Biome); 3 vulnerabilidades high preexistentes.

### Definition of Done (CLAUDE.md §10)
- [x] Compila sin warnings nuevos
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` sin regresiones contra la línea base (`lint` rojo solo por archivos ajenos)
- [x] Al menos un test cubre el camino crítico de la parte (`migracion-0020`: relleno, vista, CHECK, reversa)
- [x] README propio con comandos y variables de entorno
- [x] `.env.example` sin valores reales (no cambia)
- [x] Sin datos ficticios presentados como reales (la medición es sintética y lo declara)
- [x] Sin cambios fuera de la carpeta designada salvo los autorizados y registrados aquí
- [x] Checklist de seguridad revisado (auditor F4a, primera pasada y vuelta 1)
