/**
 * `GET /api/v1/indicadores` (§4.4): qué cuenta, cómo agrupa y cuánto le cuesta a la base.
 *
 * - Rechazados y duplicados solo cuentan en `por_estado`: no son anegamientos distintos, y
 *   contarlos dejaba que el spam subiera un distrito en el ranking.
 * - Un distrito o una UV son una fila por id aunque su nombre cambie entre versiones de capa.
 * - Caché de 30 s con una sola consulta en vuelo, y como mucho dos conexiones del pool.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { CUENTAS, crearUsuarios, iniciarSesion, resolverDePrueba, sesion } from './ayudas.js';
import { espiarPool } from './espia-pool.js';

let base: BaseEfimera;
let pool: pg.Pool;
let ex: ReturnType<typeof ejecutorPg>;
let espia: ReturnType<typeof espiarPool>;
let cookieTecnico: string;
const apps: FastifyInstance[] = [];

/** App nueva, con la caché vacía. */
async function appNueva() {
  const app = await crearApp({
    pool,
    cfg: {
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  apps.push(app);
  return app;
}

async function sembrar(o: {
  estado: string;
  severidad: string;
  manual?: string;
  uv?: string;
  version?: string;
  cuantos?: number;
}) {
  const filas = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id, version_capa,
       ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
       severidad_calculada, severidad_puntaje, severidad_version, severidad_manual, severidad_motivo, estado)
     SELECT ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326), ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326),
       'distrito_municipal:01', $1, $2, 'manual', 'via_publica', 'Reporte sembrado para indicadores',
       'rodilla', 'ocasional', $3::severidad, 6, 2, $4::severidad, $5, $6::estado_reporte
     FROM generate_series(1, $7::int)
     RETURNING id::text`,
    [
      o.uv ?? 'unidad_vecinal:A',
      o.version ?? 'test',
      o.severidad,
      o.manual ?? null,
      o.manual ? 'Reclasificado en prueba' : null,
      o.estado,
      o.cuantos ?? 1,
    ],
  );
  return filas.map((f) => f.id);
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  // Pool del tamaño del de producción: con uno chico el propio pool escondería el abanico.
  pool = new pg.Pool({ connectionString: base.url, max: 8 });
  espia = espiarPool(pool);
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  // Entrega anterior de las mismas capas, con otros nombres y sin estar vigente.
  const cuadrado = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [-63.2, -17.8],
        [-63.19, -17.8],
        [-63.19, -17.78],
        [-63.2, -17.78],
        [-63.2, -17.8],
      ],
    ],
  });
  await ex.consultar(
    `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa)
     VALUES ('distrito_municipal:01', '01', 'Distrito Uno (nombre viejo)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 'vieja')`,
    [cuadrado],
  );
  await ex.consultar(
    `INSERT INTO geo.unidad_vecinal (id, codigo, nombre, geom, version_capa, distrito_id)
     VALUES ('unidad_vecinal:A', 'A', 'UV A (nombre viejo)', ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)), 'vieja', 'distrito_municipal:01')`,
    [cuadrado],
  );
  for (const capa of ['distrito_municipal', 'unidad_vecinal'])
    await ex.consultar(
      `INSERT INTO geo.capa_version (capa, version, n_features, vigente, cargado_en)
       VALUES ($1, 'vieja', 1, false, now() - interval '1 year')`,
      [capa],
    );

  // Cuatro reportes que cuentan; uno resuelto con la versión vieja de las capas.
  await sembrar({ estado: 'nuevo', severidad: 'baja' });
  await sembrar({ estado: 'validado', severidad: 'media' });
  await sembrar({ estado: 'validado', severidad: 'media', manual: 'critica', version: 'vieja' });
  await sembrar({ estado: 'resuelto', severidad: 'alta' });
  // Spam en la UV B: rechazado o duplicado, no es un anegamiento más.
  await sembrar({ estado: 'rechazado', severidad: 'alta', uv: 'unidad_vecinal:B', cuantos: 3 });
  await sembrar({ estado: 'duplicado', severidad: 'baja', uv: 'unidad_vecinal:B', cuantos: 2 });

  const app = await appNueva();
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
}, 120_000);

afterAll(async () => {
  for (const app of apps) await app.close();
  await pool?.end();
  await base?.cerrar();
});

const indicadores = (app: FastifyInstance) =>
  app.inject({ method: 'GET', url: '/api/v1/indicadores', cookies: sesion(cookieTecnico) });

/** Consultas del cálculo: las que leen la tabla de reportes (la sesión no la toca). */
const consultasDeReportes = () => espia.contar(/FROM\s+reporte_inundacion/i);

describe('qué cuenta', () => {
  it('rechazados y duplicados solo en por_estado; el resto sobre nuevo, validado y resuelto', async () => {
    const r = await indicadores(await appNueva());
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    const d = r.json();
    expect(d.por_estado).toEqual({
      nuevo: 1,
      validado: 2,
      resuelto: 1,
      rechazado: 3,
      duplicado: 2,
    });
    expect(d.total).toBe(4);
    expect(d.por_severidad).toEqual({ critica: 1, alta: 1, media: 1, baja: 1 });
    expect(
      d.por_unidad_vecinal.map((u: { unidad_vecinal_id: string }) => u.unidad_vecinal_id),
    ).toEqual(['unidad_vecinal:A']);
  });

  it('una fila por distrito y por UV aunque el nombre cambie entre versiones de capa', async () => {
    const d = (await indicadores(await appNueva())).json();
    // Antes: dos filas para el distrito 01, una por nombre.
    expect(d.por_distrito).toEqual([
      { distrito_id: 'distrito_municipal:01', nombre: 'Distrito Uno (test)', n: 4 },
    ]);
    expect(d.por_unidad_vecinal).toEqual([
      {
        unidad_vecinal_id: 'unidad_vecinal:A',
        nombre: 'UV A (test)',
        distrito_id: 'distrito_municipal:01',
        n: 4,
      },
    ]);
  });
});

describe('cuánto le cuesta a la base', () => {
  it('la segunda petición sale de la caché, sin tocar la base', async () => {
    const app = await appNueva();
    espia.reiniciar();
    const primera = await indicadores(app);
    expect(primera.headers['x-cache']).toBe('miss');
    const hechas = consultasDeReportes();
    expect(hechas).toBeGreaterThan(0);
    const segunda = await indicadores(app);
    expect(segunda.headers['x-cache']).toBe('hit');
    expect(segunda.json()).toEqual(primera.json());
    expect(consultasDeReportes()).toBe(hechas);
  });

  it('dos peticiones a la vez hacen un solo cálculo', async () => {
    const referencia = await appNueva();
    espia.reiniciar();
    await indicadores(referencia);
    const unCalculo = consultasDeReportes();

    const app = await appNueva();
    espia.reiniciar();
    const [a, b] = await Promise.all([indicadores(app), indicadores(app)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(consultasDeReportes()).toBe(unCalculo);
  });

  it('como mucho dos conexiones del pool a la vez', async () => {
    const app = await appNueva();
    espia.reiniciar();
    const r = await indicadores(app);
    expect(r.statusCode).toBe(200);
    // Antes lanzaba siete consultas en paralelo: siete de las ocho conexiones del pool.
    expect(espia.maxEnUso).toBeLessThanOrEqual(2);
  });
});

describe('moderar invalida los agregados de este proceso (indicadores y resumen ejecutivo)', () => {
  const resumen = (app: FastifyInstance) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/ejecutivo/resumen?ventana=todo',
      cookies: sesion(cookieTecnico),
    });

  const moderar = (app: FastifyInstance, id: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload,
      cookies: sesion(cookieTecnico),
    });

  /** Llena las dos cachés y comprueba que la segunda petición ya sale de ellas. */
  async function cebar(app: FastifyInstance) {
    const ind = await indicadores(app);
    const res = await resumen(app);
    expect((await indicadores(app)).headers['x-cache']).toBe('hit');
    expect((await resumen(app)).headers['x-cache']).toBe('hit');
    return { ind: ind.json(), res: res.json() };
  }

  /** Lo que ve el técnico justo después de moderar: recalculado, no la copia de antes. */
  async function recalculados(app: FastifyInstance) {
    const ind = await indicadores(app);
    const res = await resumen(app);
    expect(ind.headers['x-cache'], 'indicadores').toBe('miss');
    expect(res.headers['x-cache'], 'resumen ejecutivo').toBe('miss');
    return { ind: ind.json(), res: res.json() };
  }

  it('validar', async () => {
    const app = await appNueva();
    const [id] = await sembrar({ estado: 'nuevo', severidad: 'baja' });
    const antes = await cebar(app);
    expect((await moderar(app, id!, { estado: 'validado' })).statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.por_estado.nuevo).toBe(antes.ind.por_estado.nuevo - 1);
    expect(despues.ind.por_estado.validado).toBe(antes.ind.por_estado.validado + 1);
    expect(despues.res.activas.en_revision).toBe(antes.res.activas.en_revision - 1);
    expect(despues.res.activas.verificadas).toBe(antes.res.activas.verificadas + 1);
  });

  it('rechazar', async () => {
    const app = await appNueva();
    const [id] = await sembrar({ estado: 'nuevo', severidad: 'baja' });
    const antes = await cebar(app);
    const r = await moderar(app, id!, {
      estado: 'rechazado',
      estado_motivo: 'No es un anegamiento',
    });
    expect(r.statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.total).toBe(antes.ind.total - 1);
    expect(despues.res.activas.total).toBe(antes.res.activas.total - 1);
  });

  it('fusionar', async () => {
    const app = await appNueva();
    const [canonico] = await sembrar({ estado: 'validado', severidad: 'media' });
    const [duplicado] = await sembrar({ estado: 'nuevo', severidad: 'media' });
    const antes = await cebar(app);
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${duplicado}/fusionar`,
      payload: { canonico_id: canonico, motivo: 'Mismo charco' },
      cookies: sesion(cookieTecnico),
    });
    expect(r.statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.por_estado.duplicado).toBe(antes.ind.por_estado.duplicado + 1);
    expect(despues.res.activas.en_revision).toBe(antes.res.activas.en_revision - 1);
  });

  it('resolver', async () => {
    const app = await appNueva();
    const [id] = await sembrar({ estado: 'validado', severidad: 'media' });
    const antes = await cebar(app);
    const r = await moderar(app, id!, {
      estado: 'resuelto',
      estado_motivo: 'Se limpió la rejilla',
    });
    expect(r.statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.por_estado.resuelto).toBe(antes.ind.por_estado.resuelto + 1);
    expect(despues.res.resueltas).toBe(antes.res.resueltas + 1);
  });

  it('reclasificar la severidad', async () => {
    const app = await appNueva();
    const [id] = await sembrar({ estado: 'validado', severidad: 'media' });
    const antes = await cebar(app);
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/severidad`,
      payload: { severidad_manual: 'critica', severidad_motivo: 'Inspección en campo' },
      cookies: sesion(cookieTecnico),
    });
    expect(r.statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.por_severidad.critica).toBe(antes.ind.por_severidad.critica + 1);
    expect(despues.res.activas.por_severidad.critica).toBe(
      antes.res.activas.por_severidad.critica + 1,
    );
  });

  /**
   * Retiene el RESULTADO de la primera consulta que case con `patron` (ya leyó la base) hasta
   * `soltar()`: así hay un cálculo en vuelo con la cifra de antes mientras se modera.
   */
  function retenerResultado(patron: RegExp) {
    const original = pool.query.bind(pool) as (...a: unknown[]) => Promise<unknown>;
    let soltar!: () => void;
    const suelta = new Promise<void>((r) => {
      soltar = r;
    });
    let avisar!: () => void;
    const alcanzada = new Promise<void>((r) => {
      avisar = r;
    });
    let pendiente = true;
    const espiaQuery = vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : '';
      if (!pendiente || !patron.test(sql)) return original(...args);
      pendiente = false;
      return original(...args).then(async (r) => {
        avisar();
        await suelta;
        return r;
      });
    }) as unknown as typeof pool.query);
    return {
      alcanzada,
      soltar,
      restaurar() {
        soltar();
        espiaQuery.mockRestore();
      },
    };
  }

  /** Falla en vez de colgarse: sin el arreglo, la petición se subía al cálculo retenido. */
  async function conPlazo<T>(promesa: Promise<T>, ms = 4_000): Promise<T> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const plazo = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(
        () => rechazar(new Error(`sin respuesta en ${ms} ms: esperó al cálculo de antes`)),
        ms,
      );
    });
    try {
      return await Promise.race([promesa, plazo]);
    } finally {
      clearTimeout(temporizador);
    }
  }

  for (const [nombre, pedir, patron, contar] of [
    [
      'indicadores',
      indicadores,
      /GROUP BY 1, 2/,
      (d: { por_estado: Record<string, number> }) => d.por_estado.nuevo ?? 0,
    ],
    [
      'resumen ejecutivo',
      resumen,
      /FULL JOIN agg/,
      (d: { activas: { en_revision: number } }) => d.activas.en_revision,
    ],
  ] as const)
    it(`${nombre}: un cálculo que empezó antes de moderar no vuelve a llenar la caché`, async () => {
      const app = await appNueva();
      const [id] = await sembrar({ estado: 'nuevo', severidad: 'baja' });
      const retenida = retenerResultado(patron);
      try {
        const vieja = pedir(app);
        await retenida.alcanzada;
        expect((await moderar(app, id!, { estado: 'validado' })).statusCode).toBe(200);
        // No se sube al cálculo en vuelo: ese ya leyó la base antes de la moderación.
        const nueva = await conPlazo(pedir(app));
        expect(nueva.headers['x-cache']).toBe('miss');
        retenida.soltar();
        const deAntes = (await vieja).json();
        expect(contar(nueva.json())).toBe(contar(deAntes) - 1);
        // Y al terminar tarde, el cálculo viejo no pisa la caché con su cifra.
        const luego = await pedir(app);
        expect(luego.headers['x-cache']).toBe('hit');
        expect(luego.json()).toEqual(nueva.json());
      } finally {
        retenida.restaurar();
      }
    }, 20_000);

  // Última del archivo: cambia la versión vigente de las UV.
  it('activar una versión de capa también invalida', async () => {
    const app = await appNueva();
    const cookieAdmin = await iniciarSesion(app, CUENTAS.admin);
    const antes = await cebar(app);
    expect(antes.ind.capas_vigentes.unidad_vecinal).toBe('test');
    const [v] = await ex.consultar<{ id: string }>(
      `SELECT id::text FROM geo.capa_version WHERE capa = 'unidad_vecinal' AND version = 'vieja'`,
    );
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/capas/${v!.id}/activar`,
      cookies: sesion(cookieAdmin),
    });
    expect(r.statusCode).toBe(200);
    const despues = await recalculados(app);
    expect(despues.ind.capas_vigentes.unidad_vecinal).toBe('vieja');
  });
});
