/**
 * Migración 0020: expandir la base al modelo multicategoría (ADR 0008–0011, 0017), SIN cambiar el
 * comportamiento de hoy. La red de seguridad es doble: esta prueba y las suites de api-core y
 * geo-service, que migran PGlite hasta la última y corren contra la 0020 y la vista de compatibilidad.
 *
 * Qué se comprueba (plan M2, CA1 y CA2):
 *  - sobre una base migrada hasta 0019 con filas de todas las combinaciones de enums, fotos, auditoría,
 *    idempotencia, puntos críticos y un `duplicado` con `fusionado_en_id`: conteos y `md5` de las
 *    columnas no tocadas IGUALES antes y después; el `detalle` reconstruye las seis columnas en el 100 %;
 *  - `SELECT` por la vista == `SELECT … FROM reporte WHERE categoria = 'inundacion'`;
 *  - `INSERT`/`UPDATE`/`SELECT … FOR UPDATE`/`UPDATE … FROM` por la vista funcionan (lo que hace api-core);
 *  - un bache por la vista falla (CHECK OPTION), un bache con campos de inundación falla, una inundación
 *    sin profundidad falla, un `detalle` que no es objeto o supera el tope falla;
 *  - `cupo_contador`: el upsert condicional no pasa el límite;
 *  - el catálogo `categoria` sigue el orden de SLUGS_CATEGORIA de contracts; `reporte` es tabla,
 *    `reporte_inundacion` es vista, `cupo_contador` existe, `punto_critico.categoria` existe;
 *  - desde cero y aplicada dos veces: la segunda no aplica nada;
 *  - la reversa, con solo inundación, deja el catálogo de la 0019 (relaciones, columnas, CHECK, índices
 *    y grants), y aborta si hay otra categoría.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SLUGS_CATEGORIA } from 'contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { aplicarMigraciones, DIRECTORIO_MIGRACIONES, listarMigraciones } from '../src/migrar.js';

const ARCHIVO_0020 = '0020_base_multicategoria.sql';
const REVERSA_0020 = join(
  DIRECTORIO_MIGRACIONES,
  'reversas',
  '0020_base_multicategoria_reversa.sql',
);
// La 0021 (índice `(categoria, creado_en)`) es posterior a la 0020 y su índice depende de la columna
// `reporte.categoria`. Para volver al esquema de la 0019 hay que revertir primero la 0021 (su índice
// y su fila de control) y después la 0020; el migrador luego reaplica ambas (M3.2).
const ARCHIVO_0021 = '0021_indice_categoria_creado.sql';
const REVERSA_0021 = join(
  DIRECTORIO_MIGRACIONES,
  'reversas',
  '0021_indice_categoria_creado_reversa.sql',
);
const numero = (f: string) => f.slice(0, 4);

const PROFUNDIDADES = ['tobillo', 'rodilla', 'muslo', 'mas_70'] as const;
const FRECUENCIAS = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
  'agua_estancada',
] as const;
const ESTADOS = ['nuevo', 'validado', 'duplicado', 'rechazado', 'resuelto'] as const;

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Columnas de dominio que NO toca la 0020: su md5 tiene que ser igual antes y después. */
const HUELLA_SQL = `md5(string_agg(
  id::text || '|' || coalesce(estado::text,'') || '|' || coalesce(ST_AsText(geom),'') || '|'
    || coalesce(descripcion,'') || '|' || coalesce(profundidad_estimada::text,'') || '|'
    || coalesce(frecuencia::text,'') || '|' || coalesce(causa_presunta::text,'') || '|'
    || coalesce(sumidero_cercano::text,'') || '|' || coalesce(sumidero_estado::text,'') || '|'
    || coalesce(agua_brota_sumidero::text,'') || '|' || coalesce(severidad_calculada::text,'') || '|'
    || coalesce(severidad_puntaje::text,'') || '|' || coalesce(severidad_version::text,'') || '|'
    || coalesce(publicar_en::text,'') || '|' || coalesce(fusionado_en_id::text,''),
  ',' ORDER BY id::text)) AS huella`;

const conteos = async (ex: Ejecutor) => ({
  porEstado: await ex.consultar<{ estado: string; n: string }>(
    `SELECT estado::text, count(*)::text AS n FROM reporte_inundacion GROUP BY estado ORDER BY estado`,
  ),
  fotos: (await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM reporte_foto'))[0]!.n,
  auditoria: (await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM auditoria'))[0]!.n,
  idempotencia: (
    await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM idempotencia')
  )[0]!.n,
  puntosCriticos: (
    await ex.consultar<{ n: string }>('SELECT count(*)::text AS n FROM punto_critico')
  )[0]!.n,
  huella: (
    await ex.consultar<{ huella: string }>(`SELECT ${HUELLA_SQL} FROM reporte_inundacion`)
  )[0]!.huella,
});

/** Capas mínimas, auditoría, idempotencia y un punto crítico, sobre la tabla reporte_inundacion (0019). */
async function sembrarAntesDe0020(ex: Ejecutor) {
  const [autor] = await ex.consultar<{ id: string }>(
    `INSERT INTO usuario (email, nombre, rol, password_hash)
     VALUES ('autor-0020@test.local', 'Autor 0020', 'ciudadano', 'scrypt$x$y') RETURNING id::text`,
  );
  const [pc] = await ex.consultar<{ id: string }>(
    `INSERT INTO punto_critico (geom, n_reportes, primer_reporte_en, ultimo_reporte_en, severidad_max, radio_m)
     VALUES (ST_SetSRID(ST_MakePoint(-63.19,-17.79),4326), 2, now() - interval '5 days', now(), 'alta', 25)
     RETURNING id::text`,
  );
  const ids: string[] = [];
  let n = 0;
  // Las 20 combinaciones profundidad × frecuencia, variando estado, causa, sumidero, autor y punto crítico.
  for (const profundidad of PROFUNDIDADES) {
    for (const frecuencia of FRECUENCIAS) {
      const estado = ESTADOS[n % ESTADOS.length]!;
      const cercano = n % 3 === 0 ? 'si' : n % 3 === 1 ? 'no' : null;
      const sumEstado = cercano === 'si' ? (n % 2 === 0 ? 'tapado' : 'no_tapado') : null;
      const agua = cercano === 'si' ? n % 2 === 0 : null;
      const causa =
        n % 4 === 0
          ? 'desconocida'
          : n % 4 === 1
            ? 'sumidero_tapado'
            : n % 4 === 2
              ? 'colector_saturado'
              : 'contrapendiente';
      const motivo = estado === 'rechazado' || estado === 'duplicado' ? 'Motivo de prueba' : null;
      const [r] = await ex.consultar<{ id: string }>(
        `INSERT INTO reporte_inundacion (geom, geom_publico, creado_en, publicar_en, autor_id, distrito_id,
           unidad_vecinal_id, ubicacion_metodo, precision_gps_m, distancia_dispositivo_m, ubicacion_tipo,
           descripcion, profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, sumidero_estado,
           agua_brota_sumidero, severidad_calculada, severidad_puntaje, estado, estado_motivo, punto_critico_id)
         VALUES (ST_SetSRID(ST_MakePoint($1,$2),4326), ST_SetSRID(ST_MakePoint(round($1::numeric,5)::float8, round($2::numeric,5)::float8),4326),
           now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval, $4, 'distrito_municipal:01',
           'unidad_vecinal:A', 'gps', 12.5, 20, 'via_publica', $5, $6::profundidad_estimada, $7::frecuencia,
           $8::causa_presunta, $9::sumidero_cercano, $10::sumidero_estado, $11, 'media', 6, $12::estado_reporte, $13,
           CASE WHEN $12 IN ('validado','resuelto') THEN $14::uuid END)
         RETURNING id::text`,
        [
          -63.2 + n * 0.0003,
          -17.8 + (n % 4) * 0.0003,
          String(n % 30),
          n % 2 === 0 ? autor!.id : null,
          `Reporte sintético para la 0020 número ${n}`,
          profundidad,
          frecuencia,
          causa,
          cercano,
          sumEstado,
          agua,
          estado,
          motivo,
          pc!.id,
        ],
      );
      ids.push(r!.id);
      // Una foto por cada tercer reporte, para que el conteo de fotos sea > 0 y sobreviva al renombre.
      if (n % 3 === 0)
        await ex.consultar(
          `INSERT INTO reporte_foto (reporte_id, objeto_key, mime, bytes, ancho, alto, exif_sanitizado, subido_por)
           VALUES ($1, $2, 'image/webp', 100, 10, 10, true, $3)`,
          [r!.id, `foto-0020-${n}.webp`, autor!.id],
        );
      n++;
    }
  }
  // Un duplicado que apunta a un canónico validado (fusionado_en_id), para que la 0020 lo conserve.
  const canonico = ids.find((_, i) => ESTADOS[i % ESTADOS.length] === 'validado')!;
  const [dup] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, publicar_en, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada, severidad_puntaje,
       estado, estado_motivo, fusionado_en_id)
     VALUES (ST_SetSRID(ST_MakePoint(-63.195,-17.795),4326), now(), 'distrito_municipal:01', 'unidad_vecinal:A',
       'gps', 'via_publica', 'Duplicado con canónico para la 0020', 'rodilla', 'ocasional', 'media', 6,
       'duplicado', 'El mismo charco', $1::uuid) RETURNING id::text`,
    [canonico],
  );
  ids.push(dup!.id);
  await ex.consultar(
    `INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues)
     VALUES ('reporte', $1, 'crear', $2, '{"estado":"nuevo"}'::jsonb)`,
    [ids[0], autor!.id],
  );
  await ex.consultar(`INSERT INTO idempotencia (clave, huella, reporte_id) VALUES ($1, 'h', $2)`, [
    `${autor!.id}:clave-0020`,
    ids[0],
  ]);
  return { ids, autor: autor!.id };
}

describe('migración 0020 sobre una base en uso (desde 0019, con filas)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let antes: Awaited<ReturnType<typeof conteos>>;
  let despues: Awaited<ReturnType<typeof conteos>>;
  let autorId: string;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex, { hasta: '0019' });
    const r = await sembrarAntesDe0020(ex);
    autorId = r.autor;
    antes = await conteos(ex);
    await aplicarMigraciones(ex); // aplica la 0020
    despues = await conteos(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0020_*.sql y se llama 0020_base_multicategoria.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0020')).toEqual([ARCHIVO_0020]);
  });

  it('conserva conteos por estado, fotos, auditoría, idempotencia y puntos críticos', () => {
    expect(despues.porEstado).toEqual(antes.porEstado);
    expect(despues.fotos).toBe(antes.fotos);
    expect(despues.auditoria).toBe(antes.auditoria);
    expect(despues.idempotencia).toBe(antes.idempotencia);
    expect(despues.puntosCriticos).toBe(antes.puntosCriticos);
    expect(Number(despues.fotos)).toBeGreaterThan(0);
  });

  it('el md5 de las columnas no tocadas es idéntico antes y después', () => {
    expect(despues.huella).toBe(antes.huella);
  });

  it('reporte es tabla, reporte_inundacion es vista, categoria y cupo_contador existen', async () => {
    const [r] = await ex.consultar<{ reporte: string; vista: string; cupo: string; cat: string }>(
      `SELECT (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte')) AS reporte,
              (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.reporte_inundacion')) AS vista,
              (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.cupo_contador')) AS cupo,
              (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.categoria')) AS cat`,
    );
    expect(r).toEqual({ reporte: 'r', vista: 'v', cupo: 'r', cat: 'r' });
    const [pc] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='punto_critico' AND column_name='categoria'`,
    );
    expect(pc!.n).toBe(1);
  });

  it('el catálogo categoria sigue el orden de SLUGS_CATEGORIA, con solo inundación activa', async () => {
    const filas = await ex.consultar<{ slug: string; activa: boolean; orden: number }>(
      'SELECT slug, activa, orden FROM categoria ORDER BY orden',
    );
    expect(filas.map((f) => f.slug)).toEqual([...SLUGS_CATEGORIA]);
    expect(filas.map((f) => f.activa)).toEqual([true, false, false, false]);
  });

  it('el detalle reconstruye las seis columnas de inundación en el 100 % de las filas', async () => {
    const [r] = await ex.consultar<{ malas: number; total: number }>(`
      SELECT count(*) FILTER (WHERE NOT (
        (detalle->>'profundidad_estimada') IS NOT DISTINCT FROM profundidad_estimada::text
        AND (detalle->>'frecuencia') IS NOT DISTINCT FROM frecuencia::text
        AND (detalle->>'causa_presunta') IS NOT DISTINCT FROM causa_presunta::text
        AND (detalle->>'sumidero_cercano') IS NOT DISTINCT FROM sumidero_cercano::text
        AND (detalle->>'sumidero_estado') IS NOT DISTINCT FROM sumidero_estado::text
        AND (detalle->>'agua_brota_sumidero') IS NOT DISTINCT FROM agua_brota_sumidero::text
      ))::int AS malas, count(*)::int AS total
      FROM reporte WHERE categoria = 'inundacion'`);
    expect(r!.total).toBeGreaterThan(20);
    expect(r!.malas).toBe(0);
    // Y el round-trip por la misma función que usan el relleno y el disparador.
    const [f] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte WHERE categoria='inundacion'
         AND detalle IS DISTINCT FROM detalle_inundacion(profundidad_estimada, frecuencia, causa_presunta,
                                                         sumidero_cercano, sumidero_estado, agua_brota_sumidero)`,
    );
    expect(f!.n).toBe(0);
  });

  it('el detalle omite las claves NULL (las preguntas del sumidero sin responder)', async () => {
    const [r] = await ex.consultar<{ claves: string[] }>(
      `SELECT array(SELECT jsonb_object_keys(detalle) ORDER BY 1) AS claves
         FROM reporte WHERE categoria='inundacion' AND sumidero_cercano IS NULL LIMIT 1`,
    );
    expect(r!.claves).not.toContain('sumidero_cercano');
    expect(r!.claves).toContain('profundidad_estimada');
  });

  it('SELECT por la vista == SELECT de reporte filtrado a inundación', async () => {
    const [r] = await ex.consultar<{ iguales: boolean }>(`
      SELECT (SELECT count(*) FROM reporte_inundacion)
           = (SELECT count(*) FROM reporte WHERE categoria='inundacion') AS iguales`);
    expect(r!.iguales).toBe(true);
    const [sinDiferencia] = await ex.consultar<{ n: number }>(`
      SELECT count(*)::int AS n FROM (
        (SELECT id FROM reporte_inundacion EXCEPT SELECT id FROM reporte WHERE categoria='inundacion')
        UNION ALL
        (SELECT id FROM reporte WHERE categoria='inundacion' EXCEPT SELECT id FROM reporte_inundacion)
      ) d`);
    expect(sinDiferencia!.n).toBe(0);
  });

  it('INSERT por la vista (como api-core): toma inundación por defecto y el detalle del disparador', async () => {
    const [r] = await ex.consultar<{
      id: string;
      categoria: string;
      detalle: string;
      version: number;
    }>(
      `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
         descripcion, profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, severidad_calculada,
         severidad_puntaje, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326), 'distrito_municipal:01', 'unidad_vecinal:A',
         'gps', 'via_publica', 'Reporte por la vista como api-core', 'muslo', 'permanente', 'sumidero_tapado',
         'si', 'alta', 9, now() + interval '60 seconds')
       RETURNING id::text, categoria, detalle::text AS detalle, detalle_version AS version`,
    );
    expect(r!.categoria).toBe('inundacion');
    expect(r!.version).toBe(1);
    expect(JSON.parse(r!.detalle)).toMatchObject({
      profundidad_estimada: 'muslo',
      frecuencia: 'permanente',
    });
    // UPDATE, SELECT FOR UPDATE y UPDATE … FROM por la vista (las formas que usa api-core).
    await expect(
      ex.consultar(
        `UPDATE reporte_inundacion SET estado = 'validado', actualizado_en = now() WHERE id = $1`,
        [r!.id],
      ),
    ).resolves.toBeDefined();
    const bloqueo = await ex.consultar<{ id: string }>(
      `SELECT id::text FROM reporte_inundacion WHERE id = $1 FOR UPDATE`,
      [r!.id],
    );
    expect(bloqueo).toHaveLength(1);
    await expect(
      ex.consultar(
        `UPDATE reporte_inundacion AS r SET ip_hash = v.h FROM (SELECT 'h'::text AS h) v WHERE r.id = $1`,
        [r!.id],
      ),
    ).resolves.toBeDefined();
  });

  it('un INSERT por la vista con categoria = bache falla (CHECK OPTION)', async () => {
    await expect(
      ex.consultar(
        `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
           descripcion, severidad_calculada, severidad_puntaje, publicar_en, categoria, causa_presunta)
         VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326), 'd', 'u', 'gps', 'via_publica',
           'Bache colado por la vista', 'media', 6, now() + interval '60 seconds', 'bache', NULL)`,
      ),
    ).rejects.toMatchObject({ code: '44000' });
  });

  it('un bache con campos de inundación y una inundación sin profundidad fallan (23514)', async () => {
    await expect(
      ex.consultar(
        `INSERT INTO reporte (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
           severidad_calculada, severidad_puntaje, publicar_en, categoria, profundidad_estimada, causa_presunta)
         VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','gps','via_publica','Bache con profundidad',
           'media', 6, now() + interval '60 seconds', 'bache', 'rodilla', NULL)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      ex.consultar(
        `INSERT INTO reporte (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
           severidad_calculada, severidad_puntaje, publicar_en, categoria, frecuencia, causa_presunta)
         VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','gps','via_publica','Inundación sin profundidad',
           'media', 6, now() + interval '60 seconds', 'inundacion', 'ocasional', 'desconocida')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('un detalle que no es objeto o supera el tope falla (23514)', async () => {
    const base = `geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion, severidad_calculada, severidad_puntaje, publicar_en, categoria, causa_presunta`;
    const vals = `ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','gps','via_publica','Detalle inválido','media',6, now()+interval '60 s','bache', NULL`;
    await expect(
      ex.consultar(`INSERT INTO reporte (${base}, detalle) VALUES (${vals}, '"soy texto"'::jsonb)`),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      ex.consultar(
        `INSERT INTO reporte (${base}, detalle) VALUES (${vals}, jsonb_build_object('relleno', repeat('x', 9000)))`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('cupo_contador: el upsert condicional no pasa el límite', async () => {
    const upsert = () =>
      ex.consultar<{ n: number }>(
        `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n)
         VALUES ($1, 'reportes:inundacion', '2026-10-08', 1)
         ON CONFLICT (usuario_id, clave, ventana_inicio) DO UPDATE
           SET n = cupo_contador.n + 1, actualizado_en = now()
           WHERE cupo_contador.n < 3 RETURNING n`,
        [autorId],
      );
    const n: Array<number | null> = [];
    for (let i = 0; i < 4; i++) n.push((await upsert())[0]?.n ?? null);
    expect(n).toEqual([1, 2, 3, null]);
    await expect(
      ex.consultar(
        `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n) VALUES ($1, 'x', now(), -1)`,
        [autorId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('volver a migrar no aplica nada y ejecutar el archivo a mano no falla ni cambia el detalle', async () => {
    const otra = await aplicarMigraciones(ex);
    expect(otra.aplicadas).toEqual([]);
    const leer = () =>
      ex.consultar(
        `SELECT id::text, detalle::text, detalle_version FROM reporte ORDER BY id::text`,
      );
    const antesReexec = await leer();
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0020), 'utf8')),
    );
    expect(await leer()).toStrictEqual(antesReexec);
  });
});

describe('migración 0020 desde cero', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('el disparador llena el detalle de un INSERT directo en reporte, y un UPDATE lo mantiene', async () => {
    const [r] = await ex.consultar<{ id: string; detalle: string }>(
      `INSERT INTO reporte (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
         profundidad_estimada, frecuencia, causa_presunta, severidad_calculada, severidad_puntaje, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'distrito_municipal:01','unidad_vecinal:A','gps',
         'via_publica','Inundación directa en reporte','tobillo','primera_vez','desconocida','baja',3, now()+interval '60 s')
       RETURNING id::text, detalle::text AS detalle`,
    );
    expect(JSON.parse(r!.detalle)).toEqual({
      profundidad_estimada: 'tobillo',
      frecuencia: 'primera_vez',
      causa_presunta: 'desconocida',
    });
    await ex.consultar(`UPDATE reporte SET profundidad_estimada = 'mas_70' WHERE id = $1`, [r!.id]);
    const [d] = await ex.consultar<{ detalle: string }>(
      'SELECT detalle::text AS detalle FROM reporte WHERE id = $1',
      [r!.id],
    );
    expect(JSON.parse(d!.detalle)).toMatchObject({ profundidad_estimada: 'mas_70' });
  });
});

/** Catálogo comparable (relaciones, columnas, CHECK, índices y grants) de public y geo. */
async function catalogo(ex: Ejecutor) {
  return {
    relaciones: await ex.consultar(
      `SELECT n.nspname||'.'||c.relname AS rel, c.relkind FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','geo') AND c.relkind IN ('r','v') ORDER BY 1`,
    ),
    columnas: await ex.consultar(
      `SELECT table_schema||'.'||table_name AS rel, column_name, data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns WHERE table_schema IN ('public','geo') ORDER BY 1,2`,
    ),
    checks: await ex.consultar(
      `SELECT conrelid::regclass::text AS rel, conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='c' ORDER BY 1,2`,
    ),
    indices: await ex.consultar(
      `SELECT schemaname||'.'||tablename AS rel, indexname, indexdef FROM pg_indexes
        WHERE schemaname IN ('public','geo') ORDER BY 1,2`,
    ),
    grants: await ex.consultar(
      `SELECT grantee, table_schema||'.'||table_name AS rel, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema IN ('public','geo') AND grantee IN ('curichi_api','curichi_geo')
        ORDER BY 1,2,3`,
    ),
  };
}

const crearRoles = (ex: Ejecutor) =>
  ex.ejecutar('CREATE ROLE curichi_api NOLOGIN; CREATE ROLE curichi_geo NOLOGIN;');

/** Nombres registrados en el control de migraciones (`src/migrar.ts`). */
const migracionesRegistradas = async (ex: Ejecutor) =>
  (await ex.consultar<{ nombre: string }>('SELECT nombre FROM _migraciones ORDER BY nombre')).map(
    (f) => f.nombre,
  );

describe('migración 0020: la reversa deja el esquema de la 0019', () => {
  let dbA: Awaited<ReturnType<typeof crearPglite>>;
  let dbB: Awaited<ReturnType<typeof crearPglite>>;
  let cat0020Antes: Awaited<ReturnType<typeof catalogo>>;
  let catApostReversa: Awaited<ReturnType<typeof catalogo>>;
  let cat0020Reaplicado: Awaited<ReturnType<typeof catalogo>>;
  let cat0019: Awaited<ReturnType<typeof catalogo>>;
  let migracionesTrasReversa: string[];
  let reaplicar: Awaited<ReturnType<typeof aplicarMigraciones>>;

  beforeAll(async () => {
    // Base A: roles, todas las migraciones (→0020), la reversa, y después una nueva corrida del
    // migrador (que debe reaplicar la 0020, porque la reversa borró su fila de `_migraciones`).
    dbA = await crearPglite();
    const exA = ejecutorPglite(dbA);
    await crearRoles(exA);
    await aplicarMigraciones(exA);
    cat0020Antes = await catalogo(exA);
    // Se revierte la cadena en orden inverso: primero la 0021, después la 0020.
    await exA.ejecutar(readFileSync(REVERSA_0021, 'utf8'));
    await exA.ejecutar(readFileSync(REVERSA_0020, 'utf8'));
    catApostReversa = await catalogo(exA);
    migracionesTrasReversa = await migracionesRegistradas(exA);
    reaplicar = await aplicarMigraciones(exA);
    cat0020Reaplicado = await catalogo(exA);
    // Base B: roles y migraciones hasta la 0019.
    dbB = await crearPglite();
    const exB = ejecutorPglite(dbB);
    await crearRoles(exB);
    await aplicarMigraciones(exB, { hasta: '0019' });
    cat0019 = await catalogo(exB);
  }, 240_000);

  afterAll(async () => {
    await dbA?.close();
    await dbB?.close();
  });

  it('relaciones, columnas, CHECK, índices y grants coinciden con la base migrada hasta 0019', () => {
    expect(catApostReversa.relaciones).toEqual(cat0019.relaciones);
    expect(catApostReversa.columnas).toEqual(cat0019.columnas);
    expect(catApostReversa.checks).toEqual(cat0019.checks);
    expect(catApostReversa.indices).toEqual(cat0019.indices);
    expect(catApostReversa.grants).toEqual(cat0019.grants);
  });

  it('reporte_inundacion vuelve a ser una tabla', () => {
    const r = catApostReversa.relaciones.find(
      (x) => (x as { rel: string }).rel === 'public.reporte_inundacion',
    ) as { relkind: string } | undefined;
    expect(r?.relkind).toBe('r');
  });

  it('la reversa quita la 0020 del control de migraciones y conserva 0001–0019', () => {
    expect(migracionesTrasReversa).not.toContain(ARCHIVO_0020);
    expect(migracionesTrasReversa).toEqual(listarMigraciones().filter((f) => numero(f) <= '0019'));
  });

  it('tras la reversa el migrador reaplica la 0020 y la 0021 y el catálogo vuelve a ser el de la 0020', () => {
    expect(reaplicar.aplicadas).toEqual([ARCHIVO_0020, ARCHIVO_0021]);
    expect(cat0020Reaplicado).toEqual(cat0020Antes);
  });

  it('la reversa aborta si hay un reporte de otra categoría', async () => {
    const db = await crearPglite();
    const ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
    await ex.consultar(
      `INSERT INTO reporte (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
         severidad_calculada, severidad_puntaje, publicar_en, categoria, causa_presunta)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','gps','via_publica','Un bache cualquiera',
         'media', 6, now()+interval '60 s', 'bache', NULL)`,
    );
    await expect(ex.ejecutar(readFileSync(REVERSA_0020, 'utf8'))).rejects.toThrow(
      /categoría distinta de inundación/,
    );
    await db.close();
  }, 120_000);
});

describe('migración 0020: las funciones del detalle no quedan ejecutables por PUBLIC', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let privs: Array<{
    proname: string;
    api: boolean;
    geo: boolean;
    proconfig: string[] | null;
    proacl: string | null;
  }>;
  let detalleComoApi: string;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    // Roles ANTES de migrar, para que los GRANT por rol de la 0020 se apliquen.
    await crearRoles(ex);
    await aplicarMigraciones(ex);
    privs = await ex.consultar(
      `SELECT p.proname,
              has_function_privilege('curichi_api', p.oid, 'EXECUTE') AS api,
              has_function_privilege('curichi_geo', p.oid, 'EXECUTE') AS geo,
              p.proconfig, p.proacl::text AS proacl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('detalle_inundacion', 'reporte_sincronizar_detalle')
        ORDER BY p.proname`,
    );
    // El disparador corre con el rol que escribe (security_invoker): un INSERT como curichi_api debe
    // armar el detalle, lo que exige que curichi_api pueda EXECUTE detalle_inundacion.
    await ex.ejecutar('SET ROLE curichi_api');
    const [r] = await ex.consultar<{ detalle: string }>(
      `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
         descripcion, profundidad_estimada, frecuencia, causa_presunta, sumidero_cercano, severidad_calculada,
         severidad_puntaje, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint(-63.18,-17.78),4326),'d','u','gps','via_publica','insert como curichi_api',
         'rodilla','ocasional','sumidero_tapado','si','media',6, now()+interval '60 seconds')
       RETURNING detalle::text AS detalle`,
    );
    detalleComoApi = r!.detalle;
    await ex.ejecutar('RESET ROLE');
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  const por = (nombre: string) => privs.find((p) => p.proname === nombre)!;

  it('ni PUBLIC ni un rol sin grant (curichi_geo) ejecutan las funciones del detalle', () => {
    // curichi_geo no tiene grant propio sobre estas funciones; si pudiera ejecutarlas sería porque
    // PUBLIC conserva el EXECUTE por defecto. Que no pueda confirma el REVOKE de PUBLIC.
    expect(por('detalle_inundacion').geo).toBe(false);
    expect(por('reporte_sincronizar_detalle').geo).toBe(false);
    // Y el ACL ya no tiene una entrada de PUBLIC (grantee vacío antes de '=').
    for (const p of privs) expect(p.proacl, p.proname).not.toMatch(/[,{]=/);
  });

  it('solo curichi_api ejecuta detalle_inundacion; la función del disparador no la ejecuta nadie (disparar no lo exige)', () => {
    expect(por('detalle_inundacion').api).toBe(true);
    expect(por('reporte_sincronizar_detalle').api).toBe(false);
  });

  it('las dos funciones tienen search_path fijo', () => {
    for (const p of privs) expect(p.proconfig?.join(' '), p.proname).toMatch(/search_path=/);
  });

  it('un INSERT como curichi_api por la vista dispara el trigger y arma el detalle', () => {
    expect(JSON.parse(detalleComoApi)).toMatchObject({
      profundidad_estimada: 'rodilla',
      frecuencia: 'ocasional',
      causa_presunta: 'sumidero_tapado',
    });
  });
});
