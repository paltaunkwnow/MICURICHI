/**
 * No contaminación entre categorías en las cifras públicas de geo-service (M3.4, ADR 0012, 0013).
 *
 * Reportes verificados de DOS categorías reales (Inundaciones y Baches) en la MISMA UV y en
 * las MISMAS coordenadas. Sin parámetro `categoria`, los agregados y los puntos críticos devuelven
 * SOLO inundación. Con la categoría Bache ACTIVA (catálogo + definición real), devuelven
 * solo las suyas. Una categoría inactiva, desconocida o `todas` da 400 CATEGORIA_NO_DISPONIBLE. Y
 * las cachés de cifras no mezclan valores entre categorías.
 *
 * La ausencia de definición se inyecta con un registro de solo Inundaciones. El registro real y
 * los radios 10/25 no se sustituyen por fixtures de categorías ni por un radio común.
 */
import {
  type AgregadoUv,
  CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES,
  CODIGO_CATEGORIA_NO_DISPONIBLE,
  CONFIG_DOMINIO,
  coordenadaPublica,
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  type PuntoCritico,
  REGISTRO_CATEGORIAS,
} from 'contracts';
import { ejecutorPg, recalcularPuntosCriticos } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';

const REGISTRO_SOLO_INUNDACION = crearRegistroCategorias([DEFINICION_INUNDACION]);

const P = { lon: -63.19512345, lat: -17.79012345 }; // dentro de la UV A, sin redondeo previo
const UV_A = 'unidad_vecinal:A';
const N_INUNDACION = 2;
const N_BACHE = 3;
type Categoria = 'bache' | 'inundacion';

let base: BaseEfimera;
let pool: pg.Pool;
let ex: ReturnType<typeof ejecutorPg>;
let app: FastifyInstance;
let actividadPrevia: boolean;
let ids: Record<Categoria, string[]>;

/** Datos reales de categoría; la coordenada pública se construye con el jitter de contracts. */
async function crearReporteReal(categoria: Categoria): Promise<string> {
  let id: string;
  if (categoria === 'inundacion') {
    id = await insertarReporte(ex, P.lon, P.lat, 'validado', 'media', categoria);
  } else {
    const detalle = DEFINICION_BACHE.esquemaDetalle.parse({
      gravedad_declarada: 'hay_que_esquivar',
      tamano: 'rueda',
    });
    const [fila] = await ex.consultar<{ id: string }>(
      `INSERT INTO reporte (geom, categoria, subtipo, detalle, detalle_version,
         distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
         descripcion, severidad_calculada, severidad_puntaje, severidad_version, estado, publicar_en)
       VALUES (ST_SetSRID(ST_MakePoint($1,$2),4326), 'bache', 'bache', $3::jsonb, 1,
         'distrito_municipal:01', 'unidad_vecinal:A',
         'manual', 'vivienda_o_predio', 'Fixture M6.3 Bache real', 'media', 4, 1, 'validado', now())
       RETURNING id::text`,
      [P.lon, P.lat, JSON.stringify(detalle)],
    );
    id = fila!.id;
  }
  const publico = coordenadaPublica(
    P.lat,
    P.lon,
    id,
    'sal-sintetica-m6-3-geo',
    'vivienda_o_predio',
    CONFIG_DOMINIO.JITTER_PUBLICO_M,
    CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
  );
  await ex.consultar(
    `UPDATE reporte SET geom_publico = ST_SetSRID(ST_MakePoint($2,$3),4326),
       ubicacion_tipo = 'vivienda_o_predio' WHERE id = $1`,
    [id, publico.lon, publico.lat],
  );
  return id;
}

/** `n_reportes` de la UV A en una respuesta de agregados. */
function nA(filas: AgregadoUv[]): number {
  return filas.find((u) => u.unidad_vecinal_id === UV_A)!.n_reportes;
}

/** La fila de la UV A (para mirar su `categoria`). */
function filaA(filas: AgregadoUv[]): AgregadoUv {
  return filas.find((u) => u.unidad_vecinal_id === UV_A)!;
}

const getAgregados = (a: FastifyInstance, categoria?: string) =>
  a.inject({
    method: 'GET',
    url: `/geo/v1/agregados/unidades-vecinales${categoria ? `?categoria=${categoria}` : ''}`,
  });

const getPuntos = (a: FastifyInstance, categoria?: string) =>
  a.inject({
    method: 'GET',
    url: `/geo/v1/puntos-criticos${categoria ? `?categoria=${categoria}` : ''}`,
  });

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
}, 180_000);

beforeEach(async () => {
  const [previa] = await ex.consultar<{ activa: boolean }>(
    `SELECT activa FROM categoria WHERE slug = 'bache'`,
  );
  actividadPrevia = previa!.activa;
  await ex.ejecutar(
    `DELETE FROM reporte; DELETE FROM punto_critico;
     UPDATE categoria SET activa = false WHERE slug = 'bache'`,
  );
  ids = { inundacion: [], bache: [] };
  for (let k = 0; k < N_INUNDACION; k++) ids.inundacion.push(await crearReporteReal('inundacion'));
  for (let k = 0; k < N_BACHE; k++) ids.bache.push(await crearReporteReal('bache'));
  // El catálogo Bache aún inactivo no gobierna el agrupamiento de su historial registrado.
  await recalcularPuntosCriticos(ex);
  app = await crearApp({
    pool,
    cfg: leerConfig({ DATABASE_URL: base.url }),
    registro: REGISTRO_CATEGORIAS,
  });
}, 60_000);

afterEach(async () => {
  try {
    await app?.close();
  } finally {
    await ex.consultar(`UPDATE categoria SET activa = $1 WHERE slug = 'bache'`, [actividadPrevia]);
  }
});

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

describe('sin parámetro, las cifras son SOLO de inundación', () => {
  it('agregados: la UV A cuenta solo las inundaciones, con categoria = inundacion', async () => {
    const r = await getAgregados(app);
    expect(r.statusCode).toBe(200);
    const filas = r.json() as AgregadoUv[];
    expect(nA(filas)).toBe(N_INUNDACION);
    expect(filaA(filas).categoria).toBe('inundacion');
  });

  it('puntos críticos: solo el de inundación (n_reportes = 2), ninguno de bache', async () => {
    const r = await getPuntos(app);
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as PuntoCritico[];
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos) expect(p.categoria).toBe('inundacion');
    expect(puntos.some((p) => p.n_reportes === N_INUNDACION)).toBe(true);
    expect(puntos.some((p) => p.n_reportes === N_BACHE)).toBe(false);
  });
});

describe('una categoría inactiva, desconocida o `todas` da 400 CATEGORIA_NO_DISPONIBLE', () => {
  it('agregados: bache (conocida pero inactiva en el catálogo)', async () => {
    const r = await getAgregados(app, 'bache');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });

  it('agregados: una categoría desconocida', async () => {
    const r = await getAgregados(app, 'noexiste');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
    const puntos = await getPuntos(app, 'noexiste');
    expect(puntos.statusCode).toBe(400);
    expect(puntos.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });

  it('agregados y puntos: `todas` no se admite en una ruta pública', async () => {
    for (const respuesta of [await getAgregados(app, 'todas'), await getPuntos(app, 'todas')]) {
      expect(respuesta.statusCode).toBe(400);
      expect(respuesta.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
    }
  });

  it('puntos críticos: bache inactiva', async () => {
    const r = await getPuntos(app, 'bache');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
  });
});

describe('doble puerta catálogo y definición real (M6.3)', () => {
  it.each([
    { activa: false, definida: false, status: 400 },
    { activa: false, definida: true, status: 400 },
    { activa: true, definida: false, status: 400 },
    { activa: true, definida: true, status: 200 },
  ])(
    'catálogo=$activa, definición=$definida: ambas rutas responden $status',
    async ({ activa, definida, status }) => {
      await ex.consultar(`UPDATE categoria SET activa = $1 WHERE slug = 'bache'`, [activa]);
      const propia = await crearApp({
        pool,
        cfg: leerConfig({ DATABASE_URL: base.url }),
        registro: definida ? REGISTRO_CATEGORIAS : REGISTRO_SOLO_INUNDACION,
      });
      try {
        const agregados = await getAgregados(propia, 'bache');
        const puntos = await getPuntos(propia, 'bache');
        for (const respuesta of [agregados, puntos]) {
          expect(respuesta.statusCode).toBe(status);
          if (status === 400) {
            expect(respuesta.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
            expect(respuesta.headers['x-cache']).toBeUndefined();
          } else {
            expect(respuesta.headers['cache-control']).toBe('public, no-cache');
            for (const fila of respuesta.json() as Array<{ categoria: string }>)
              expect(fila.categoria).toBe('bache');
          }
        }
        if (status === 200) {
          expect(nA(agregados.json())).toBe(N_BACHE);
          expect(puntos.json()).toHaveLength(1);
          expect(puntos.json()[0].n_reportes).toBe(N_BACHE);
        }
        // Ausencia/inactividad de Bache no altera la categoría por defecto.
        const inundaciones = await getAgregados(propia);
        expect(inundaciones.statusCode).toBe(200);
        expect(nA(inundaciones.json())).toBe(N_INUNDACION);
        const puntosInundacion = await getPuntos(propia);
        expect(puntosInundacion.statusCode).toBe(200);
        expect(puntosInundacion.json()).toHaveLength(1);
        expect(puntosInundacion.json()[0]).toMatchObject({
          categoria: 'inundacion',
          n_reportes: N_INUNDACION,
        });
      } finally {
        await propia.close();
      }
    },
  );

  it('el historial Bache inactivo ya usa radio 10 y no altera el radio 25 de Inundaciones', async () => {
    const [catalogo] = await ex.consultar<{ activa: boolean }>(
      `SELECT activa FROM categoria WHERE slug = 'bache'`,
    );
    expect(catalogo!.activa).toBe(false);
    const puntos = await ex.consultar<{ categoria: string; radio: number; n: number }>(
      `SELECT categoria, radio_m::float8 AS radio, n_reportes AS n
       FROM punto_critico ORDER BY categoria`,
    );
    expect(puntos).toEqual([
      { categoria: 'bache', radio: 10, n: N_BACHE },
      { categoria: 'inundacion', radio: 25, n: N_INUNDACION },
    ]);
  });
});

describe('con la categoría real ACTIVA (catálogo + registro), las cifras son solo las suyas', () => {
  beforeEach(async () => {
    await ex.consultar(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
    app.categorias.invalidar(); // el catálogo cambió: que la caché corta del proveedor lo vea ya.
  });

  it('agregados ?categoria=bache: la UV A cuenta solo los baches, con categoria = bache', async () => {
    const r = await getAgregados(app, 'bache');
    expect(r.statusCode).toBe(200);
    const filas = r.json() as AgregadoUv[];
    expect(nA(filas)).toBe(N_BACHE);
    expect(filaA(filas).categoria).toBe('bache');
  });

  it('puntos críticos ?categoria=bache: solo el de bache (n_reportes = 3)', async () => {
    const r = await getPuntos(app, 'bache');
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as PuntoCritico[];
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos) expect(p.categoria).toBe('bache');
    expect(puntos.some((p) => p.n_reportes === N_BACHE)).toBe(true);
    expect(puntos.some((p) => p.n_reportes === N_INUNDACION)).toBe(false);
  });

  it('las cachés de agregados no se mezclan entre categorías', async () => {
    // App propia para aislar el estado de caché de las demás pruebas del archivo.
    const propia = await crearApp({
      pool,
      cfg: leerConfig({ DATABASE_URL: base.url }),
      registro: REGISTRO_CATEGORIAS,
    });
    try {
      const i1 = await getAgregados(propia, 'inundacion');
      expect(i1.headers['x-cache']).toBe('miss');
      expect(nA(i1.json())).toBe(N_INUNDACION);
      const i2 = await getAgregados(propia, 'inundacion');
      expect(i2.headers['x-cache']).toBe('hit');
      expect(nA(i2.json())).toBe(N_INUNDACION);

      // Con inundación ya cacheada, bache es un MISS (celda propia) y trae SU cifra, no la de inundación.
      const b1 = await getAgregados(propia, 'bache');
      expect(b1.headers['x-cache']).toBe('miss');
      expect(nA(b1.json())).toBe(N_BACHE);
      const b2 = await getAgregados(propia, 'bache');
      expect(b2.headers['x-cache']).toBe('hit');
      expect(nA(b2.json())).toBe(N_BACHE);

      // Y la de inundación sigue valiendo lo suyo: ninguna celda pisó a la otra.
      const i3 = await getAgregados(propia, 'inundacion');
      expect(i3.headers['x-cache']).toBe('hit');
      expect(nA(i3.json())).toBe(N_INUNDACION);
      const b3 = await getAgregados(propia, 'bache');
      expect(b3.headers['x-cache']).toBe('hit');
      expect(nA(b3.json())).toBe(N_BACHE);
      for (const respuesta of [i1, i2, b1, b2, i3, b3]) {
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.headers['cache-control']).toBe('public, no-cache');
      }
    } finally {
      await propia.close();
    }
  });

  it('las cachés de puntos críticos no se mezclan entre categorías', async () => {
    const propia = await crearApp({
      pool,
      cfg: leerConfig({ DATABASE_URL: base.url }),
      registro: REGISTRO_CATEGORIAS,
    });
    try {
      const i1 = await getPuntos(propia, 'inundacion');
      expect(i1.headers['x-cache']).toBe('miss');
      const puntosI = i1.json() as PuntoCritico[];
      expect(puntosI).toHaveLength(1);
      expect(puntosI[0]!.n_reportes).toBe(N_INUNDACION);
      for (const p of puntosI) expect(p.categoria).toBe('inundacion');

      const b1 = await getPuntos(propia, 'bache');
      // Celda propia: MISS aunque inundación ya esté cacheada, y solo baches.
      expect(b1.headers['x-cache']).toBe('miss');
      const puntosB = b1.json() as PuntoCritico[];
      expect(puntosB.length).toBeGreaterThan(0);
      expect(puntosB).toHaveLength(1);
      expect(puntosB[0]!.n_reportes).toBe(N_BACHE);
      for (const p of puntosB) expect(p.categoria).toBe('bache');

      const b2 = await getPuntos(propia, 'bache');
      expect(b2.headers['x-cache']).toBe('hit');
      expect(b2.json()).toEqual(puntosB);

      const i2 = await getPuntos(propia, 'inundacion');
      expect(i2.headers['x-cache']).toBe('hit');
      expect(i2.json()).toEqual(puntosI);
      for (const p of i2.json() as PuntoCritico[]) expect(p.categoria).toBe('inundacion');
      const b3 = await getPuntos(propia, 'bache');
      expect(b3.headers['x-cache']).toBe('hit');
      expect(b3.json()).toEqual(puntosB);
      for (const respuesta of [i1, b1, b2, i2, b3]) {
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.headers['cache-control']).toBe('public, no-cache');
      }
    } finally {
      await propia.close();
    }
  });

  it.each(['agregados', 'puntos'] as const)(
    '%s: desactivar Bache bloquea una cifra cacheada sin eliminar su historial',
    async (ruta) => {
      const propia = await crearApp({
        pool,
        cfg: leerConfig({ DATABASE_URL: base.url }),
        registro: REGISTRO_CATEGORIAS,
      });
      const consultar = ruta === 'agregados' ? getAgregados : getPuntos;
      try {
        const inicialB = await consultar(propia, 'bache');
        const inicialI = await consultar(propia, 'inundacion');
        expect(inicialB.statusCode).toBe(200);
        expect(inicialI.statusCode).toBe(200);
        expect(inicialB.headers['x-cache']).toBe('miss');
        expect(inicialI.headers['x-cache']).toBe('miss');
        expect((await consultar(propia, 'bache')).headers['x-cache']).toBe('hit');

        await ex.ejecutar(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
        propia.categorias.invalidar();
        const bloqueada = await consultar(propia, 'bache');
        expect(bloqueada.statusCode).toBe(400);
        expect(bloqueada.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
        expect(bloqueada.headers['x-cache']).toBeUndefined();
        const sigueI = await consultar(propia, 'inundacion');
        expect(sigueI.statusCode).toBe(200);
        expect(sigueI.headers['x-cache']).toBe('hit');
        expect(sigueI.json()).toEqual(inicialI.json());
        const [historial] = await ex.consultar<{ reportes: number; puntos: number }>(
          `SELECT (SELECT count(*)::int FROM reporte WHERE categoria = 'bache') AS reportes,
                  (SELECT count(*)::int FROM punto_critico WHERE categoria = 'bache') AS puntos`,
        );
        expect(historial).toEqual({ reportes: N_BACHE, puntos: 1 });

        await ex.ejecutar(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
        propia.categorias.invalidar();
        const recuperada = await consultar(propia, 'bache');
        expect(recuperada.statusCode).toBe(200);
        expect(recuperada.headers['x-cache']).toBe('hit');
        expect(recuperada.json()).toEqual(inicialB.json());
      } finally {
        await propia.close();
      }
    },
  );

  it.each(['bache', 'inundacion'] as const)(
    '%s: publica y filtra solo el centroide degradado, sin métricas exactas ni identidad',
    async (categoria) => {
      const [publico] = await ex.consultar<{ lon: number; lat: number }>(
        `SELECT avg(ST_X(geom_publico)) AS lon, avg(ST_Y(geom_publico)) AS lat
         FROM reporte WHERE categoria = $1 AND estado IN ('validado','resuelto')`,
        [categoria],
      );
      const [exacto] = await ex.consultar<{ lon: number; lat: number }>(
        `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat FROM punto_critico WHERE categoria = $1`,
        [categoria],
      );
      expect(publico).not.toEqual(exacto);
      const respuesta = await getPuntos(app, categoria);
      expect(respuesta.statusCode).toBe(200);
      const puntos = respuesta.json() as PuntoCritico[];
      expect(puntos).toHaveLength(1);
      const puntoPublico = puntos[0]!;
      expect(puntoPublico.categoria).toBe(categoria);
      // El centroide se publica a cinco decimales; no exigir el mismo desempate de coma flotante.
      expect(Math.abs(puntoPublico.lat - publico!.lat)).toBeLessThanOrEqual(0.00000501);
      expect(Math.abs(puntoPublico.lon - publico!.lon)).toBeLessThanOrEqual(0.00000501);
      expect(puntoPublico.lat).toBe(Number(puntoPublico.lat.toFixed(5)));
      expect(puntoPublico.lon).toBe(Number(puntoPublico.lon.toFixed(5)));
      expect({ lon: puntoPublico.lon, lat: puntoPublico.lat }).not.toEqual(exacto);
      const privados = [
        ...CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES,
        'geom',
        'geom_publico',
        'autor_id',
        'ip_hash',
        'dispositivo',
        'precision_gps_m',
        'distancia_dispositivo_m',
      ];
      for (const campo of privados) {
        expect(puntos[0]).not.toHaveProperty(campo);
        expect(respuesta.body).not.toContain(`"${campo}"`);
      }
      const margen = 0.00000001;
      const sobreExacto = await app.inject({
        method: 'GET',
        url: `/geo/v1/puntos-criticos?categoria=${categoria}&bbox=${exacto!.lon - margen},${exacto!.lat - margen},${exacto!.lon + margen},${exacto!.lat + margen}`,
      });
      expect(sobreExacto.statusCode).toBe(200);
      expect(sobreExacto.json()).toEqual([]);
      const sobrePublico = await app.inject({
        method: 'GET',
        url: `/geo/v1/puntos-criticos?categoria=${categoria}&bbox=${puntoPublico.lon - margen},${puntoPublico.lat - margen},${puntoPublico.lon + margen},${puntoPublico.lat + margen}`,
      });
      expect(sobrePublico.statusCode).toBe(200);
      expect(sobrePublico.json()).toEqual(puntos);
    },
  );

  it.each(['bache', 'inundacion'] as const)(
    '%s: un miembro sin geom_publico impide publicar el grupo entero',
    async (categoria) => {
      await ex.consultar('UPDATE reporte SET geom_publico = NULL WHERE id = $1', [
        ids[categoria][0],
      ]);
      await recalcularPuntosCriticos(ex);
      app.puntosCriticos.invalidar();
      const [punto] = await ex.consultar<{ sin_publico: boolean }>(
        'SELECT geom_publico IS NULL AS sin_publico FROM punto_critico WHERE categoria = $1',
        [categoria],
      );
      expect(punto!.sin_publico).toBe(true);
      const respuesta = await getPuntos(app, categoria);
      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json()).toEqual([]);
      const otra = await getPuntos(app, categoria === 'bache' ? 'inundacion' : 'bache');
      expect(otra.statusCode).toBe(200);
      expect(otra.json()).toHaveLength(1);
    },
  );
});

const CUATRO_CATEGORIAS = ['inundacion', 'bache', 'basura', 'area_verde'] as const;
type CategoriaCuatro = (typeof CUATRO_CATEGORIAS)[number];
const CANTIDADES_CUATRO = {
  inundacion: N_INUNDACION,
  bache: N_BACHE,
  basura: 4,
  area_verde: 5,
} as const;
const NUEVAS_REALES = {
  basura: {
    definicion: DEFINICION_BASURA,
    subtipo: 'microbasural',
    detalle: { gravedad_declarada: 'acumulada_dias', tamano: 'bolsas' },
  },
  area_verde: {
    definicion: DEFINICION_AREA_VERDE,
    subtipo: 'parque_plaza_descuidada',
    detalle: { gravedad_declarada: 'uso_limitado', tamano: 'rincon' },
  },
};

/** Solo fixtures de las dos categorías nuevas; todas las políticas vienen del registro real. */
async function crearReporteNuevoReal(categoria: 'basura' | 'area_verde') {
  const datos = NUEVAS_REALES[categoria];
  const def = REGISTRO_CATEGORIAS.obtener(categoria)!;
  expect(def).toBe(datos.definicion);
  const detalle = def.esquemaDetalle.parse(datos.detalle);
  const severidad = def.severidad.calcular(detalle);
  const [fila] = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte (geom, categoria, subtipo, detalle, detalle_version,
       distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
       descripcion, severidad_calculada, severidad_puntaje, severidad_version, estado, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint($1,$2),4326), $3, $4, $5::jsonb, $6,
       'distrito_municipal:01', 'unidad_vecinal:A',
       'manual', 'vivienda_o_predio', 'Fixture sintético cuatro categorías',
       $7::severidad, $8, $9, 'validado', now()) RETURNING id::text`,
    [
      P.lon,
      P.lat,
      categoria,
      datos.subtipo,
      JSON.stringify(detalle),
      def.detalleVersion,
      severidad.banda,
      severidad.puntaje,
      def.severidad.version,
    ],
  );
  const id = fila!.id;
  const publico = coordenadaPublica(
    P.lat,
    P.lon,
    id,
    'sal-sintetica-cuatro-geo',
    'vivienda_o_predio',
    CONFIG_DOMINIO.JITTER_PUBLICO_M,
    CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
  );
  await ex.consultar(
    'UPDATE reporte SET geom_publico = ST_SetSRID(ST_MakePoint($2,$3),4326) WHERE id = $1',
    [id, publico.lon, publico.lat],
  );
  return id;
}

function comprobarCifraCuatro(
  ruta: 'agregados' | 'puntos',
  contenido: unknown,
  categoria: CategoriaCuatro,
) {
  if (ruta === 'agregados') {
    const filas = contenido as AgregadoUv[];
    expect(nA(filas)).toBe(CANTIDADES_CUATRO[categoria]);
    expect(filaA(filas).categoria).toBe(categoria);
    for (const fila of filas) expect(fila.categoria).toBe(categoria);
  } else {
    const puntos = contenido as PuntoCritico[];
    expect(puntos).toHaveLength(1);
    expect(puntos[0]).toMatchObject({ categoria, n_reportes: CANTIDADES_CUATRO[categoria] });
  }
}

describe('cuatro definiciones reales: cifras públicas y cachés separadas', () => {
  let actividadCuatroPrevia: Array<{ slug: string; activa: boolean }>;
  let idsNuevos: Record<'basura' | 'area_verde', string[]>;

  beforeEach(async () => {
    // El beforeEach exterior conserva sus fixtures/historial M6 y su restauración de Baches.
    actividadCuatroPrevia = await ex.consultar<{ slug: string; activa: boolean }>(
      "SELECT slug, activa FROM categoria WHERE slug IN ('inundacion','basura','area_verde')",
    );
    idsNuevos = { basura: [], area_verde: [] };
    for (const categoria of ['basura', 'area_verde'] as const)
      for (let n = 0; n < CANTIDADES_CUATRO[categoria]; n++)
        idsNuevos[categoria].push(await crearReporteNuevoReal(categoria));
    await ex.ejecutar(
      "UPDATE categoria SET activa = true WHERE slug IN ('inundacion','bache','basura','area_verde')",
    );
    await recalcularPuntosCriticos(ex);
    app.categorias.invalidar();
    app.agregados.invalidar();
    app.puntosCriticos.invalidar();
  }, 60_000);

  afterEach(async () => {
    for (const anterior of actividadCuatroPrevia ?? [])
      await ex.consultar('UPDATE categoria SET activa = $1 WHERE slug = $2', [
        anterior.activa,
        anterior.slug,
      ]);
  });

  it.each(['agregados', 'puntos'] as const)(
    '%s: cuatro MISS propios, HIT en orden inverso y default igual a Inundaciones',
    async (ruta) => {
      const consultar = ruta === 'agregados' ? getAgregados : getPuntos;
      const propias = new Map<CategoriaCuatro, unknown>();
      for (const categoria of ['area_verde', 'basura', 'bache', 'inundacion'] as const) {
        const respuesta = await consultar(app, categoria);
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.headers['x-cache']).toBe('miss');
        expect(respuesta.headers['cache-control']).toBe('public, no-cache');
        comprobarCifraCuatro(ruta, respuesta.json(), categoria);
        propias.set(categoria, respuesta.json());
      }
      for (const categoria of CUATRO_CATEGORIAS) {
        const respuesta = await consultar(app, categoria);
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.headers['x-cache']).toBe('hit');
        expect(respuesta.json()).toEqual(propias.get(categoria));
        comprobarCifraCuatro(ruta, respuesta.json(), categoria);
      }
      const porDefecto = await consultar(app);
      expect(porDefecto.statusCode).toBe(200);
      expect(porDefecto.headers['x-cache']).toBe('hit');
      expect(porDefecto.json()).toEqual(propias.get('inundacion'));
    },
  );

  const puertas = CUATRO_CATEGORIAS.flatMap((categoria) => [
    { categoria, activa: false, definida: false, status: 400 },
    { categoria, activa: false, definida: true, status: 400 },
    { categoria, activa: true, definida: false, status: 400 },
    { categoria, activa: true, definida: true, status: 200 },
  ]);
  it.each(puertas)(
    '$categoria: catálogo=$activa y registro=$definida dan $status sin afectar las otras tres',
    async ({ categoria, activa, definida, status }) => {
      await ex.consultar('UPDATE categoria SET activa = $1 WHERE slug = $2', [activa, categoria]);
      const registro = definida
        ? REGISTRO_CATEGORIAS
        : crearRegistroCategorias(
            REGISTRO_CATEGORIAS.definiciones.filter((d) => d.slug !== categoria),
          );
      const propia = await crearApp({
        pool,
        cfg: leerConfig({ DATABASE_URL: base.url }),
        registro,
      });
      try {
        for (const ruta of ['agregados', 'puntos'] as const) {
          const consultar = ruta === 'agregados' ? getAgregados : getPuntos;
          const respuesta = await consultar(propia, categoria);
          expect(respuesta.statusCode).toBe(status);
          if (status === 400) {
            expect(respuesta.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
            expect(respuesta.headers['x-cache']).toBeUndefined();
          } else comprobarCifraCuatro(ruta, respuesta.json(), categoria);
          for (const otra of CUATRO_CATEGORIAS.filter((c) => c !== categoria)) {
            const ajena = await consultar(propia, otra);
            expect(ajena.statusCode).toBe(200);
            comprobarCifraCuatro(ruta, ajena.json(), otra);
          }
        }
      } finally {
        await propia.close();
      }
    },
  );

  const desactivaciones = CUATRO_CATEGORIAS.flatMap((categoria) =>
    (['agregados', 'puntos'] as const).map((ruta) => ({ categoria, ruta })),
  );
  it.each(desactivaciones)(
    '$ruta/$categoria: desactivar bloquea un HIT y reactivar conserva el historial',
    async ({ categoria, ruta }) => {
      const consultar = ruta === 'agregados' ? getAgregados : getPuntos;
      const iniciales = new Map<CategoriaCuatro, unknown>();
      for (const actual of CUATRO_CATEGORIAS) {
        const inicial = await consultar(app, actual);
        expect(inicial.statusCode).toBe(200);
        comprobarCifraCuatro(ruta, inicial.json(), actual);
        iniciales.set(actual, inicial.json());
      }
      expect((await consultar(app, categoria)).headers['x-cache']).toBe('hit');
      await ex.consultar('UPDATE categoria SET activa = false WHERE slug = $1', [categoria]);
      app.categorias.invalidar();
      const rechazada = await consultar(app, categoria);
      expect(rechazada.statusCode).toBe(400);
      expect(rechazada.json().codigo).toBe(CODIGO_CATEGORIA_NO_DISPONIBLE);
      expect(rechazada.headers['x-cache']).toBeUndefined();
      for (const otra of CUATRO_CATEGORIAS.filter((c) => c !== categoria)) {
        const respuesta = await consultar(app, otra);
        expect(respuesta.statusCode).toBe(200);
        expect(respuesta.headers['x-cache']).toBe('hit');
        expect(respuesta.json()).toEqual(iniciales.get(otra));
      }
      expect(
        await ex.consultar(
          `SELECT
      (SELECT count(*)::int FROM reporte WHERE categoria = $1) AS reportes,
      (SELECT count(*)::int FROM punto_critico WHERE categoria = $1) AS puntos`,
          [categoria],
        ),
      ).toEqual([{ reportes: CANTIDADES_CUATRO[categoria], puntos: 1 }]);
      await ex.consultar('UPDATE categoria SET activa = true WHERE slug = $1', [categoria]);
      app.categorias.invalidar();
      const recuperada = await consultar(app, categoria);
      expect(recuperada.statusCode).toBe(200);
      expect(recuperada.headers['x-cache']).toBe('hit');
      expect(recuperada.json()).toEqual(iniciales.get(categoria));
    },
  );

  it.each(['basura', 'area_verde'] as const)(
    '%s: publica centroide degradado sin campos privados y falla cerrado si falta geom_publico',
    async (categoria) => {
      const [centro] = await ex.consultar<{
        lon: number;
        lat: number;
        publico_lon: number;
        publico_lat: number;
      }>(
        `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat,
       ST_X(geom_publico) AS publico_lon, ST_Y(geom_publico) AS publico_lat
       FROM punto_critico WHERE categoria = $1`,
        [categoria],
      );
      const respuesta = await getPuntos(app, categoria);
      expect(respuesta.statusCode).toBe(200);
      comprobarCifraCuatro('puntos', respuesta.json(), categoria);
      const publicado = (respuesta.json() as PuntoCritico[])[0]!;
      expect(publicado.lon).toBeCloseTo(centro!.publico_lon, 5);
      expect(publicado.lat).toBeCloseTo(centro!.publico_lat, 5);
      expect({ lon: publicado.lon, lat: publicado.lat }).not.toEqual({
        lon: centro!.lon,
        lat: centro!.lat,
      });
      for (const campo of [
        ...CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES,
        'geom',
        'geom_publico',
        'autor_id',
        'ip_hash',
        'dispositivo',
        'precision_gps_m',
        'distancia_dispositivo_m',
      ]) {
        expect(publicado).not.toHaveProperty(campo);
        expect(respuesta.body).not.toContain(`"${campo}"`);
      }
      await ex.consultar('UPDATE reporte SET geom_publico = NULL WHERE id = $1', [
        idsNuevos[categoria][0],
      ]);
      await recalcularPuntosCriticos(ex);
      app.puntosCriticos.invalidar();
      const oculto = await getPuntos(app, categoria);
      expect(oculto.statusCode).toBe(200);
      expect(oculto.json()).toEqual([]);
      for (const otra of CUATRO_CATEGORIAS.filter((c) => c !== categoria)) {
        const ajena = await getPuntos(app, otra);
        expect(ajena.statusCode).toBe(200);
        comprobarCifraCuatro('puntos', ajena.json(), otra);
      }
    },
  );
});
