/**
 * Privacidad de la ubicación (CLAUDE.md §0.8 y §13).
 *
 * La regla es una sola: **de un reporte de vivienda o predio, el público nunca puede deducir la
 * coordenada exacta**. La vista pública desplaza el punto con un jitter determinista, pero eso
 * solo sirve si TODO lo que el público puede observar depende únicamente de la coordenada
 * publicada. Estos tests fijan esa invariante en los dos sitios donde se rompía:
 *
 *  1. El filtro `bbox` del listado público filtraba por la geometría EXACTA y devolvía la
 *     desplazada. Encogiendo el bbox y mirando si el reporte sigue apareciendo se recupera la
 *     coordenada exacta con la precisión que uno quiera: el jitter no servía de nada.
 *  2. El punto crítico publicaba el centroide de sus miembros sin degradar. Como DBSCAN corre
 *     con `minpoints = 1`, un reporte aislado forma su propio punto crítico y ese centroide
 *     ES su coordenada exacta, publicada por `GET /geo/v1/puntos-criticos`.
 *  3. La vista pública publicaba `manzana_id` junto al punto desplazado. La manzana es un
 *     polígono de unos 100 m de lado y el desplazamiento llega a 30 m: cruzar las dos cosas
 *     recorta la zona posible mucho más que el jitter solo.
 */
import { CONFIG_DOMINIO } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieTecnico: string;
let cookieVecina: string;
let ex: ReturnType<typeof ejecutorPg>;

/** Coordenada exacta que se envía; cae dentro de la UV A de las capas de prueba. */
const LAT = -17.7912345;
const LON = -63.1934567;

/** Crea un reporte como vecina devolviéndole antes el turno: aquí se prueba otra cosa. */
async function crear(payload: Record<string, unknown> = reporteValido) {
  await liberarCuota(ex);
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookieVecina),
  });
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: {
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Crea un reporte de vivienda y lo valida (solo lo validado se publica). */
async function crearViviendaValidada(lat = LAT, lon = LON): Promise<string> {
  const creado = await crear({
    ...reporteValido,
    lat,
    lon,
    ubicacion_tipo: 'vivienda_o_predio',
  });
  expect(creado.statusCode).toBe(201);
  const id = creado.json().id as string;
  const val = await app.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${id}/estado`,
    cookies: { curichi_sesion: cookieTecnico },
    payload: { estado: 'validado' },
  });
  expect(val.statusCode).toBe(200);
  return id;
}

async function listaPublica(query: string) {
  const r = await app.inject({ method: 'GET', url: `/api/v1/reportes?${query}` });
  expect(r.statusCode).toBe(200);
  return r.json().features as Array<{
    id: string;
    geometry: { coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

describe('la vista pública degrada la ubicación de una vivienda', () => {
  it('publica una coordenada distinta de la exacta y lo declara', async () => {
    const id = await crearViviendaValidada();
    const [f] = await listaPublica('limite=500');
    expect(f?.id).toBe(id);
    const [lon, lat] = f!.geometry.coordinates;
    expect(lat).not.toBe(LAT);
    expect(lon).not.toBe(LON);

    const detalle = await app.inject({ method: 'GET', url: `/api/v1/reportes/${id}` });
    expect(detalle.json().properties.precision_degradada).toBe(true);
    // El técnico sí ve la exacta: es quien tiene que ir al sitio.
    const tec = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${id}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(tec.json().geometry.coordinates).toEqual([LON, LAT]);
  });
});

describe('la manzana no se publica junto a una coordenada desplazada', () => {
  it('el público no recibe manzana_id de una vivienda; el técnico sí', async () => {
    const id = await crearViviendaValidada();
    // La manzana de las capas de prueba contiene (-17.797, -63.197); se mueve el reporte ahí
    // para que el resolver le asigne una y el caso no dependa de dónde caiga el punto por azar.
    await pool.query(`UPDATE reporte_inundacion SET manzana_id = 'manzana:A-1' WHERE id = $1`, [
      id,
    ]);
    const detalle = await app.inject({ method: 'GET', url: `/api/v1/reportes/${id}` });
    expect(detalle.json().properties.precision_degradada).toBe(true);
    expect(detalle.json().properties.manzana_id).toBeNull();

    const [f] = await listaPublica('limite=500');
    expect(f?.properties.manzana_id ?? null).toBeNull();

    const tec = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${id}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(tec.json().properties.manzana_id).toBe('manzana:A-1');
  });

  it('en vía pública sí se publica: ahí el punto ya sale en su sitio', async () => {
    const r = await crear({
      ...reporteValido,
      lat: LAT,
      lon: LON,
      ubicacion_tipo: 'via_publica',
    });
    expect(r.statusCode).toBe(201);
    const id = r.json().id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'validado' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    await pool.query(`UPDATE reporte_inundacion SET manzana_id = 'manzana:A-1' WHERE id = $1`, [
      id,
    ]);
    const detalle = await app.inject({ method: 'GET', url: `/api/v1/reportes/${id}` });
    expect(detalle.json().properties.precision_degradada).toBe(false);
    expect(detalle.json().properties.manzana_id).toBe('manzana:A-1');
  });
});

describe('el bbox público no puede usarse como oráculo de la coordenada exacta', () => {
  // Se insertan con el punto exacto y el publicable FIJADOS a mano y separados ~22 m. Dejar que
  // los eligiera el jitter haría el test no determinista: el desplazamiento es aleatorio por
  // reporte y de vez en cuando cae dentro de la caja de prueba. Lo que se comprueba aquí es la
  // consulta —por qué columna filtra—, no el jitter, que se prueba aparte.
  const EXACTO = { lon: -63.1912345, lat: -17.7898765 };
  const PUBLICADO = { lon: -63.1914345, lat: -17.7899765 };

  async function insertarConPuntoPublicable(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO reporte_inundacion
         (geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
          descripcion, tirante_estimado, duracion_estimada, frecuencia, afectacion,
          severidad_calculada, severidad_puntaje, estado)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), ST_SetSRID(ST_MakePoint($3, $4), 4326),
          'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'vivienda_o_predio',
          'Reporte con punto publicable fijado para la prueba', 'rodilla', '2h_12h', 'ocasional',
          'vehicular', 'media', 10, 'validado')
       RETURNING id::text`,
      [EXACTO.lon, EXACTO.lat, PUBLICADO.lon, PUBLICADO.lat],
    );
    return rows[0]!.id;
  }

  /** Caja de ~2 m de lado alrededor de un punto. */
  const caja = (p: { lon: number; lat: number }, d = 0.00001) =>
    `${p.lon - d},${p.lat - d},${p.lon + d},${p.lat + d}`;

  it('un bbox sobre la coordenada exacta no devuelve el reporte', async () => {
    const id = await insertarConPuntoPublicable();
    expect(
      (await listaPublica('limite=500&bbox=-63.2,-17.8,-63.17,-17.78')).some((x) => x.id === id),
      'precondición: el reporte sale en el listado amplio',
    ).toBe(true);
    expect(
      (await listaPublica(`limite=500&bbox=${caja(EXACTO)}`)).some((x) => x.id === id),
      'filtrar por la geometría exacta y devolver la desplazada revela la vivienda por bisección',
    ).toBe(false);
  });

  it('un bbox sobre la coordenada publicada sí lo devuelve', async () => {
    const id = await insertarConPuntoPublicable();
    const encontrados = await listaPublica(`limite=500&bbox=${caja(PUBLICADO)}`);
    const f = encontrados.find((x) => x.id === id);
    expect(f, 'lo publicado y lo filtrado tienen que ser el mismo punto').toBeTruthy();
    expect(f!.geometry.coordinates).toEqual([PUBLICADO.lon, PUBLICADO.lat]);
  });

  it('el técnico sigue filtrando por la coordenada exacta: es la que necesita en campo', async () => {
    const id = await insertarConPuntoPublicable();
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes?limite=500&bbox=${caja(EXACTO)}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode).toBe(200);
    const fs = r.json().features as Array<{ id: string; geometry: { coordinates: number[] } }>;
    const f = fs.find((x) => x.id === id);
    expect(f).toBeTruthy();
    expect(f!.geometry.coordinates).toEqual([EXACTO.lon, EXACTO.lat]);
  });

  /**
   * El mismo bbox sobre la coordenada exacta, pero contra la ruta PÚBLICA y con la cookie de
   * técnico puesta. Antes esta petición filtraba por `geom` y devolvía el punto exacto: era el
   * oráculo por bisección descrito arriba, alcanzable desde el navegador de cualquier técnico con
   * el mapa público abierto. Ahora la ruta pública no mira la sesión, así que filtra por
   * `geom_publico` y no encuentra nada en la caja del punto real.
   */
  it('la ruta pública con cookie de técnico NO filtra por la exacta', async () => {
    const id = await insertarConPuntoPublicable();
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/reportes?limite=500&bbox=${caja(EXACTO)}`,
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode).toBe(200);
    const fs = r.json().features as Array<{ id: string }>;
    expect(fs.map((x) => x.id)).not.toContain(id);
  });
});

describe('el punto crítico no publica la coordenada exacta de un reporte aislado', () => {
  it('con minpoints=1 un reporte solo forma su punto crítico: el centroide va degradado', async () => {
    const lat = -17.7955;
    const lon = -63.1975;
    const id = await crearViviendaValidada(lat, lon);
    const { rows } = await pool.query<{
      lat: number;
      lon: number;
      lat_pub: number | null;
      lon_pub: number | null;
      n: number;
    }>(
      `SELECT ST_Y(pc.geom) AS lat, ST_X(pc.geom) AS lon,
              ST_Y(pc.geom_publico) AS lat_pub, ST_X(pc.geom_publico) AS lon_pub, pc.n_reportes AS n
       FROM punto_critico pc
       JOIN reporte_inundacion r ON r.punto_critico_id = pc.id
       WHERE r.id = $1`,
      [id],
    );
    const pc = rows[0]!;
    expect(pc.n, 'el reporte está solo en su grupo').toBe(1);
    // El centroide exacto es, por construcción, la coordenada exacta del único miembro: por eso
    // publicarlo equivalía a publicar la vivienda.
    expect(pc.lat).toBeCloseTo(lat, 9);
    expect(pc.lon).toBeCloseTo(lon, 9);

    // La invariante que arregla el fallo: el centroide PUBLICABLE sale del punto publicable del
    // miembro, no del exacto. Se compara contra el del propio reporte porque es determinista;
    // exigir que cada componente difiera del original no lo es, ya que el redondeo a 5 decimales
    // (≈ 1 m) devuelve a veces la latitud o la longitud a su valor de partida.
    const { rows: rep } = await pool.query<{ lon_pub: number; lat_pub: number }>(
      'SELECT ST_X(geom_publico) AS lon_pub, ST_Y(geom_publico) AS lat_pub FROM reporte_inundacion WHERE id = $1',
      [id],
    );
    expect(pc.lon_pub).not.toBeNull();
    expect([pc.lon_pub, pc.lat_pub]).toEqual([rep[0]!.lon_pub, rep[0]!.lat_pub]);

    // Y el desplazamiento se mantiene dentro del radio declarado (§13), con margen de redondeo.
    const desplazamientoM = Math.hypot(
      ((pc.lat_pub as number) - lat) * 111_320,
      ((pc.lon_pub as number) - lon) * 111_320 * Math.cos((lat * Math.PI) / 180),
    );
    expect(desplazamientoM).toBeLessThanOrEqual(CONFIG_DOMINIO.JITTER_PUBLICO_M + 2);
  });
});
