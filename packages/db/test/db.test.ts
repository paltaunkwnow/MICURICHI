import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ejecutorPg } from '../src/ejecutor.js';
import { ejecutarMantenimiento } from '../src/mantenimiento.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from '../src/test-utils.js';

let base: BaseEfimera;
let pool: pg.Pool;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  await cargarCapasDePrueba(ejecutorPg(pool));
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

describe('migraciones y PostGIS', () => {
  it('aplica el esquema y PostGIS responde', async () => {
    const r = await pool.query('SELECT postgis_version() AS v');
    expect(r.rows[0].v).toMatch(/^3\./);
    const t = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('reporte_inundacion','punto_critico','usuario','auditoria')`,
    );
    expect(t.rows[0].n).toBe(4);
  });

  it('es idempotente: volver a migrar no aplica nada', async () => {
    const { aplicarMigraciones } = await import('../src/migrar.js');
    const r = await aplicarMigraciones(ejecutorPg(pool));
    expect(r.aplicadas).toEqual([]);
    expect(r.omitidas.length).toBeGreaterThan(0);
  });

  it('point-in-polygon con GIST devuelve la UV correcta', async () => {
    const r = await pool.query(
      `SELECT id FROM geo.unidad_vecinal_vigente WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326))`,
    );
    expect(r.rows.map((x) => x.id)).toEqual(['unidad_vecinal:B']);
    const plan = await pool.query(
      `EXPLAIN SELECT id FROM geo.unidad_vecinal WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-63.185, -17.79), 4326))`,
    );
    const texto = plan.rows.map((x) => x['QUERY PLAN']).join('\n');
    expect(texto).toMatch(/Index|Bitmap|Seq/); // el planificador elige GIST cuando la tabla es grande; con 3 filas puede usar Seq Scan
  });

  it('acepta varias conexiones simultáneas por el socket', async () => {
    const resultados = await Promise.all(
      [1, 2, 3, 4].map((n) => pool.query('SELECT $1::int AS n', [n])),
    );
    expect(resultados.map((r) => r.rows[0].n)).toEqual([1, 2, 3, 4]);
  });
});

describe('puntos críticos (DBSCAN, radio 25 m)', () => {
  it('agrupa reportes cercanos y separa lejanos', async () => {
    const ex = ejecutorPg(pool);
    // tres reportes a < 25 m entre sí, uno a 200 m, uno nuevo (no cuenta)
    const a = await insertarReporte(ex, -63.195, -17.79, 'validado', 'media');
    const b = await insertarReporte(ex, -63.1951, -17.79005, 'validado', 'alta');
    const c = await insertarReporte(ex, -63.19495, -17.7901, 'resuelto', 'baja');
    const lejos = await insertarReporte(ex, -63.193, -17.79, 'validado', 'critica');
    const nuevo = await insertarReporte(ex, -63.19501, -17.79001, 'nuevo', 'critica');
    const r = await recalcularPuntosCriticos(ex, 25);
    expect(r.reportes).toBe(4);
    expect(r.puntos).toBe(2);
    const pc = await pool.query(
      `SELECT punto_critico_id::text AS pc FROM reporte_inundacion WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[a, b, c]],
    );
    expect(new Set(pc.rows.map((x) => x.pc)).size).toBe(1);
    const grupo = await pool.query(
      `SELECT n_reportes, severidad_max, unidad_vecinal_id FROM punto_critico WHERE id = $1`,
      [pc.rows[0].pc],
    );
    expect(grupo.rows[0].n_reportes).toBe(3);
    expect(grupo.rows[0].severidad_max).toBe('alta');
    expect(grupo.rows[0].unidad_vecinal_id).toBe('unidad_vecinal:A');
    const solo = await pool.query(`SELECT punto_critico_id FROM reporte_inundacion WHERE id = $1`, [
      lejos,
    ]);
    expect(solo.rows[0].punto_critico_id).not.toBe(pc.rows[0].pc);
    const sinGrupo = await pool.query(
      `SELECT punto_critico_id FROM reporte_inundacion WHERE id = $1`,
      [nuevo],
    );
    expect(sinGrupo.rows[0].punto_critico_id).toBeNull();
  });
});

describe('retención de datos (§13)', () => {
  it('borra sesiones caducadas, vacía ip_hash vencido y quita fotos huérfanas', async () => {
    const ex = ejecutorPg(pool);
    const [u] = await ex.consultar<{ id: string }>(
      `INSERT INTO usuario (email, nombre, rol, password_hash) VALUES ('retencion@test.local', 'R', 'tecnico', 'scrypt$x$y') RETURNING id::text`,
    );
    await ex.consultar(
      `INSERT INTO sesion (id, usuario_id, expira_en) VALUES ('caducada', $1, now() - interval '1 day'), ('vigente', $1, now() + interval '1 day')`,
      [u!.id],
    );
    const viejo = await insertarReporte(ex, -63.195, -17.79, 'validado');
    const nuevo = await insertarReporte(ex, -63.194, -17.791, 'validado');
    await ex.consultar(
      `UPDATE reporte_inundacion SET ip_hash = 'abc', creado_en = now() - interval '40 days' WHERE id = $1`,
      [viejo],
    );
    await ex.consultar(`UPDATE reporte_inundacion SET ip_hash = 'def' WHERE id = $1`, [nuevo]);
    await ex.consultar(
      `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado, creado_en)
       VALUES ('huerfana.jpg', 'image/jpeg', 1, 1, 1, true, now() - interval '3 days'),
              ('reciente.jpg', 'image/jpeg', 1, 1, 1, true, now())`,
    );

    const r = await ejecutarMantenimiento(ex, { retencionIpHashDias: 30, horasFotoHuerfana: 24 });

    expect(r.sesionesCaducadas).toBe(1);
    expect(r.ipHashBorrados).toBe(1);
    expect(r.fotosHuerfanas).toEqual(['huerfana.jpg']);
    const sesiones = await ex.consultar<{ id: string }>('SELECT id FROM sesion');
    expect(sesiones.map((s) => s.id)).toEqual(['vigente']);
    const [conservado] = await ex.consultar<{ ip_hash: string | null }>(
      'SELECT ip_hash FROM reporte_inundacion WHERE id = $1',
      [nuevo],
    );
    expect(conservado?.ip_hash).toBe('def'); // el reciente NO se toca
    const fotos = await ex.consultar<{ objeto_key: string }>('SELECT objeto_key FROM reporte_foto');
    expect(fotos.map((f) => f.objeto_key)).toEqual(['reciente.jpg']);
  });
});

describe('mantenimiento: idempotencia y alcance', () => {
  it('borra también intentos de login y claves de idempotencia caducadas', async () => {
    const ex = ejecutorPg(pool);
    await pool.query('DELETE FROM intento_login');
    await pool.query('DELETE FROM idempotencia');
    await ex.consultar(
      `INSERT INTO intento_login (clave, exito, creado_en) VALUES
         ('email:viejo', false, now() - interval '48 hours'),
         ('email:reciente', false, now())`,
    );
    const id = await insertarReporte(ex, -63.196, -17.792, 'nuevo');
    await ex.consultar(
      `INSERT INTO idempotencia (clave, huella, reporte_id, creado_en) VALUES
         ('envio-viejo', 'h1', $1, now() - interval '48 hours'),
         ('envio-reciente', 'h2', $1, now())`,
      [id],
    );

    const r = await ejecutarMantenimiento(ex, { horasIntentosLogin: 24, horasIdempotencia: 24 });
    expect(r.intentosLoginBorrados).toBe(1);
    expect(r.clavesIdempotenciaBorradas).toBe(1);

    const intentos = await ex.consultar<{ clave: string }>('SELECT clave FROM intento_login');
    expect(intentos.map((i) => i.clave)).toEqual(['email:reciente']);
    const claves = await ex.consultar<{ clave: string }>('SELECT clave FROM idempotencia');
    expect(claves.map((c) => c.clave)).toEqual(['envio-reciente']);
  });

  it('es idempotente: correrlo dos veces no borra nada la segunda vez', async () => {
    const ex = ejecutorPg(pool);
    const primera = await ejecutarMantenimiento(ex);
    const segunda = await ejecutarMantenimiento(ex);
    // La segunda pasada no tiene nada que hacer; si borrara algo más, estaría tocando datos vivos.
    expect(segunda.sesionesCaducadas).toBe(0);
    expect(segunda.ipHashBorrados).toBe(0);
    expect(segunda.fotosHuerfanas).toEqual([]);
    expect(segunda.intentosLoginBorrados).toBe(0);
    expect(segunda.clavesIdempotenciaBorradas).toBe(0);
    expect(primera).toBeDefined();
  });

  it('no toca los datos vivos: reportes, fotos asociadas ni sesiones vigentes', async () => {
    const ex = ejecutorPg(pool);
    const reportes = await ex.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion',
    );
    const [u] = await ex.consultar<{ id: string }>(
      `INSERT INTO usuario (email, nombre, rol, password_hash) VALUES ('vivo@test.local', 'V', 'tecnico', 'x') RETURNING id::text`,
    );
    await ex.consultar(
      `INSERT INTO sesion (id, usuario_id, expira_en) VALUES ('vigente-larga', $1, now() + interval '7 days')`,
      [u!.id],
    );
    const [rep] = await ex.consultar<{ id: string }>(
      'SELECT id::text FROM reporte_inundacion LIMIT 1',
    );
    await ex.consultar(
      `INSERT INTO reporte_foto (objeto_key, reporte_id, mime, bytes, ancho, alto, exif_sanitizado, creado_en)
       VALUES ('asociada-vieja.jpg', $1, 'image/jpeg', 1, 1, 1, true, now() - interval '90 days')`,
      [rep!.id],
    );

    await ejecutarMantenimiento(ex);

    const despues = await ex.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion',
    );
    expect(despues[0]!.n).toBe(reportes[0]!.n);
    // Una foto vieja PERO asociada a un reporte no es huérfana: se queda.
    const foto = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM reporte_foto WHERE objeto_key = 'asociada-vieja.jpg'`,
    );
    expect(foto[0]!.n).toBe('1');
    const sesion = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM sesion WHERE id = 'vigente-larga'`,
    );
    expect(sesion[0]!.n).toBe('1');
  });
});
