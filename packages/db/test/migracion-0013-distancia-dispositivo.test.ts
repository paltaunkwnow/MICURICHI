/**
 * Migración 0013 (T2, contrato 0.9.0): cada reporte guarda a cuántos metros quedó el punto de la
 * posición del dispositivo al enviarlo (`reporte_inundacion.distancia_dispositivo_m`).
 *
 * api-core rechaza el reporte si el punto queda a más de 60 m del teléfono y guarda la distancia
 * redondeada, nunca la posición del dispositivo. La columna nace en NULL para los reportes
 * anteriores y un CHECK de 0 a 1000 m la acota igual que `ReporteTecnicoSchema` en contracts.
 *
 * Dos bases: una migrada hasta 0012 con filas, a la que después se le aplica el resto (el camino de
 * producción), y otra migrada desde cero. Las dos tienen que terminar con la misma restricción.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DOMINIO, ReporteTecnicoSchema } from 'contracts';
import { getTableColumns } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';

const ARCHIVO_0013 = '0013_distancia_dispositivo.sql';
const numero = (f: string) => f.slice(0, 4);

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Un reporte mínimo con el esquema de 0012; `extra` agrega columnas (p. ej. la distancia). */
async function insertarReporte(
  ex: Ejecutor,
  descripcion: string,
  extra: { columna: string; valor: unknown } | null = null,
): Promise<string> {
  const columnas = extra ? `, ${extra.columna}` : '';
  const valores = extra ? ', $2' : '';
  const [r] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       precision_gps_m, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
       severidad_calculada, severidad_puntaje${columnas})
     VALUES (ST_SetSRID(ST_MakePoint(-63.1821, -17.7833), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', 'gps', 12.5, 'via_publica', $1, 'rodilla', 'ocasional', 'media', 6${valores})
     RETURNING id::text`,
    extra ? [descripcion, extra.valor] : [descripcion],
  );
  return r!.id;
}

async function restriccionesDeLaColumna(ex: Ejecutor) {
  return ex.consultar<{ conname: string; definicion: string; validada: boolean }>(
    `SELECT c.conname, pg_get_constraintdef(c.oid) AS definicion, c.convalidated AS validada
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'public.reporte_inundacion'::regclass AND c.contype = 'c'
        AND a.attname = 'distancia_dispositivo_m'`,
  );
}

/** Restricción tal como queda en la base migrada desde 0012, para compararla con la de cero. */
let restriccionDesde0012: Awaited<ReturnType<typeof restriccionesDeLaColumna>> = [];

describe('migración 0013 sobre una base en uso (desde 0012, con filas)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let hasta0012: ResultadoMigracion;
  let resto: ResultadoMigracion;
  let reporteViejo: string;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    hasta0012 = await aplicarMigraciones(ex, { hasta: '0012' });
    reporteViejo = await insertarReporte(ex, 'Reporte creado antes de la migración 0013');
    // El reporte queda en «nuevo», y sin la bandera la 0015 se niega a publicarlo (su freno se
    // prueba en migracion-0015-publicacion.test.ts); aquí interesa la 0013. Hasta la 0015: estas
    // pruebas insertan como el api-core anterior, sin publicar_en, y la 0016 le quita el DEFAULT.
    resto = await aplicarMigraciones(ex, { hasta: '0015', publicarNuevosExistentes: true });
    restriccionDesde0012 = await restriccionesDeLaColumna(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0013_*.sql y se llama 0013_distancia_dispositivo.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0013')).toEqual([ARCHIVO_0013]);
  });

  it('hasta 0012 dejó la 0013 pendiente y el resto la aplicó', () => {
    const todas = listarMigraciones();
    expect(hasta0012.aplicadas).toEqual(todas.filter((f) => numero(f) <= '0012'));
    expect(hasta0012.pendientes).toContain(ARCHIVO_0013);
    expect(resto.aplicadas).toEqual(todas.filter((f) => numero(f) > '0012' && numero(f) <= '0015'));
    expect(resto.aplicadas).toContain(ARCHIVO_0013);
  });

  it('añade distancia_dispositivo_m smallint, que admite NULL y no tiene DEFAULT', async () => {
    const [c] = await ex.consultar<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'
          AND column_name = 'distancia_dispositivo_m'`,
    );
    expect(c).toEqual({ data_type: 'smallint', is_nullable: 'YES', column_default: null });
  });

  it('el reporte de antes de 0013 conserva sus datos y queda con la distancia en NULL', async () => {
    const [r] = await ex.consultar<Record<string, unknown>>(
      `SELECT descripcion, ubicacion_metodo::text, precision_gps_m::text, estado::text,
              distancia_dispositivo_m
         FROM reporte_inundacion WHERE id = $1`,
      [reporteViejo],
    );
    expect(r).toEqual({
      descripcion: 'Reporte creado antes de la migración 0013',
      ubicacion_metodo: 'gps',
      precision_gps_m: '12.5',
      estado: 'nuevo',
      distancia_dispositivo_m: null,
    });
  });

  it('un INSERT que no nombra la columna (api-core anterior, durante el despliegue) sigue funcionando', async () => {
    const id = await insertarReporte(ex, 'Insert sin la columna nueva, como el api-core anterior');
    const [r] = await ex.consultar<{ d: number | null }>(
      'SELECT distancia_dispositivo_m AS d FROM reporte_inundacion WHERE id = $1',
      [id],
    );
    expect(r).toEqual({ d: null });
  });

  it('el CHECK acepta 0, 60 y 1000 y rechaza -1 y 1001 (23514)', async () => {
    for (const valor of [0, 60, 1000]) {
      const id = await insertarReporte(ex, `Distancia válida de ${valor} m`, {
        columna: 'distancia_dispositivo_m',
        valor,
      });
      const [r] = await ex.consultar<{ d: number }>(
        'SELECT distancia_dispositivo_m AS d FROM reporte_inundacion WHERE id = $1',
        [id],
      );
      expect(r!.d).toBe(valor);
    }
    for (const valor of [-1, 1001])
      await expect(
        insertarReporte(ex, `Distancia inválida de ${valor} m`, {
          columna: 'distancia_dispositivo_m',
          valor,
        }),
      ).rejects.toMatchObject({ code: '23514' });

    await expect(
      ex.consultar('UPDATE reporte_inundacion SET distancia_dispositivo_m = 1001 WHERE id = $1', [
        reporteViejo,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('hay una sola restricción sobre la columna, con nombre fijo y validada', () => {
    expect(restriccionDesde0012).toHaveLength(1);
    expect(restriccionDesde0012[0]!.conname).toBe('distancia_dispositivo_rango');
    expect(restriccionDesde0012[0]!.validada).toBe(true);
  });

  it('documenta en la base que la posición del dispositivo no se guarda', async () => {
    const [c] = await ex.consultar<{ comentario: string | null }>(
      `SELECT col_description('public.reporte_inundacion'::regclass, a.attnum) AS comentario
         FROM pg_attribute a
        WHERE a.attrelid = 'public.reporte_inundacion'::regclass
          AND a.attname = 'distancia_dispositivo_m'`,
    );
    expect(c!.comentario).toMatch(/dispositivo/);
    expect(c!.comentario).toMatch(/no se guarda/);
  });

  it('volver a ejecutar el archivo a mano no falla ni cambia nada (idempotente)', async () => {
    const leer = () =>
      ex.consultar(
        'SELECT id::text, distancia_dispositivo_m FROM reporte_inundacion ORDER BY id::text',
      );
    const antes = await leer();
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0013), 'utf8')),
    );
    expect(await leer()).toStrictEqual(antes);
    expect(await restriccionesDeLaColumna(ex)).toStrictEqual(restriccionDesde0012);
  });

  it('volver a migrar no aplica nada', async () => {
    const otra = await aplicarMigraciones(ex, { hasta: '0015' });
    expect(otra.aplicadas).toEqual([]);
    expect(otra.omitidas).toContain(ARCHIVO_0013);
  });
});

describe('migración 0013 desde cero', () => {
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

  it('deja la misma restricción que la base migrada desde 0012', async () => {
    const desdeCero = await restriccionesDeLaColumna(ex);
    expect(desdeCero).toHaveLength(1);
    expect(desdeCero).toStrictEqual(restriccionDesde0012);
  });
});

describe('alineación con contracts 0.9.0', () => {
  it('el CHECK de la base y ReporteTecnicoSchema aceptan y rechazan los mismos bordes', () => {
    const campo = ReporteTecnicoSchema.shape.distancia_dispositivo_m;
    for (const valor of [0, 1000, null]) expect(campo.safeParse(valor).success).toBe(true);
    for (const valor of [-1, 1001]) expect(campo.safeParse(valor).success).toBe(false);
  });

  it('toda distancia que api-core acepta (radio + 0,5 m, redondeada) entra en el CHECK', () => {
    expect(Math.round(CONFIG_DOMINIO.REPORTE_RADIO_DISPOSITIVO_M + 0.5)).toBeLessThanOrEqual(1000);
  });

  it('el esquema Drizzle declara distancia_dispositivo_m como smallint que admite NULL', () => {
    const c = getTableColumns(esquema.reporteInundacion) as Record<
      string,
      { name: string; notNull: boolean; getSQLType(): string }
    >;
    const columna = Object.values(c).find((x) => x.name === 'distancia_dispositivo_m');
    expect(columna?.getSQLType()).toBe('smallint');
    expect(columna?.notNull).toBe(false);
  });
});
