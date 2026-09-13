/**
 * Utilidades para tests de cualquier parte (se importa desde 'db/test-utils'):
 * - levantarBaseEfimera(): PostGIS efímero (PGlite + postgis) por socket en un puerto libre, con migraciones.
 * - cargarCapasDePrueba(): 1 distrito, 3 UV (con un hueco entre B y C) y 1 manzana.
 * - insertarReporte(): reporte mínimo válido.
 */
import { type Ejecutor, ejecutorPglite } from './ejecutor.js';
import { aplicarMigraciones } from './migrar.js';

export interface BaseEfimera {
  url: string;
  puerto: number;
  cerrar(): Promise<void>;
  /** Ejecutor directo sobre PGlite (sin pasar por el socket). */
  ejecutor: Ejecutor;
}

export async function levantarBaseEfimera(): Promise<BaseEfimera> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const db = await PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
  const ejecutor = ejecutorPglite(db);
  await aplicarMigraciones(ejecutor);
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 8 });
  await server.start();
  const puerto = (server as unknown as { port?: number }).port ?? 0;
  return {
    url: `postgresql://curichi:curichi@127.0.0.1:${puerto}/curichi`,
    puerto,
    ejecutor,
    async cerrar() {
      await server.stop();
      await db.close();
    },
  };
}

export const VERSION_TEST = 'test';

/** Tres UV cuadradas (A, B, C) en el distrito 01, con un HUECO (~50 m) entre B y C, y una manzana dentro de A. */
export async function cargarCapasDePrueba(ex: Ejecutor) {
  const v = VERSION_TEST;
  const poly = (x0: number, y0: number, x1: number, y1: number) =>
    JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ],
      ],
    });
  await ex.consultar(
    `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa) VALUES ('distrito_municipal:01', '01', 'Distrito Uno (test)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), $2)`,
    [poly(-63.2, -17.8, -63.17, -17.78), v],
  );
  const uvs = [
    ['A', -63.2, -63.19],
    ['B', -63.19, -63.18],
    ['C', -63.1795, -63.17],
  ] as const;
  for (const [cod, x0, x1] of uvs) {
    await ex.consultar(
      `INSERT INTO geo.unidad_vecinal (id, codigo, nombre, geom, version_capa, distrito_id) VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, 'distrito_municipal:01')`,
      [`unidad_vecinal:${cod}`, cod, `UV ${cod} (test)`, poly(x0, -17.8, x1, -17.78), v],
    );
  }
  await ex.consultar(
    `INSERT INTO geo.manzana (id, codigo, nombre, geom, version_capa, distrito_id, unidad_vecinal_id) VALUES ('manzana:A-1', 'A-1', '', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), $2, 'distrito_municipal:01', 'unidad_vecinal:A')`,
    [poly(-63.198, -17.798, -63.196, -17.796), v],
  );
  for (const capa of ['distrito_municipal', 'unidad_vecinal', 'manzana']) {
    await ex.consultar(
      `INSERT INTO geo.capa_version (capa, version, n_features, vigente) VALUES ($1, $2, 1, true)`,
      [capa, v],
    );
  }
}

export async function insertarReporte(
  ex: Ejecutor,
  lon: number,
  lat: number,
  estado = 'validado',
  severidad = 'media',
) {
  const [r] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion,
       tirante_estimado, duracion_estimada, frecuencia, afectacion, severidad_calculada, severidad_puntaje, estado)
     VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), 'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte de prueba automatizada',
       'rodilla', '2h_12h', 'ocasional', 'vehicular', $3::severidad, 10, $4::estado_reporte) RETURNING id::text`,
    [lon, lat, severidad, estado],
  );
  return r!.id;
}
