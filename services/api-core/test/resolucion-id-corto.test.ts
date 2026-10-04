/**
 * Resolución del ID corto (8 hex) en las rutas de reporte (T2, plan 2026-10-04).
 *
 * Dos cosas se prueban aquí:
 *  - M-2.3: el detalle público resuelve SOLO reportes públicos, así que un ID corto de un reporte
 *    oculto (en espera, rechazado o duplicado) da el MISMO 404 que uno inexistente. Antes el
 *    reporte oculto se resolvía igual y el 404 llevaba otro mensaje: un oráculo de existencia.
 *  - M-2.4: sin regresión — el ID corto de un público resuelve, un prefijo ambiguo da 404, las
 *    mayúsculas funcionan, la moderación resuelve publicados en cualquier estado y la fusión
 *    acepta el canónico por ID corto.
 *
 * Los reportes se insertan con ids FIJOS para controlar los prefijos de 8 hex (ambigüedad incluida).
 * Se les da `estado_motivo` y `fusionado_en_id` cuando el estado lo pediría, para que el INSERT
 * directo valga tanto con el esquema actual como con restricciones de integridad más estrictas.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  resolverDePrueba,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookieTecnico: string;

/** Ids fijos: el prefijo de 8 hex es lo que se resuelve. `cccccccc` lo comparten dos públicos. */
const IDS = {
  publico: 'abababab-0000-4000-8000-000000000001',
  espera: '22222222-0000-4000-8000-000000000002',
  rechazado: '33333333-0000-4000-8000-000000000003',
  duplicado: '44444444-0000-4000-8000-000000000004',
  ambiguoA: 'cccccccc-0000-4000-8000-000000000001',
  ambiguoB: 'cccccccc-0000-4000-8000-000000000002',
  moderable: '55555555-0000-4000-8000-000000000005',
  canonico: 'dddddddd-0000-4000-8000-00000000000a',
  duplicable: 'eeeeeeee-0000-4000-8000-00000000000b',
} as const;

async function insertar(
  id: string,
  opts: {
    estado?: string;
    publicado?: boolean;
    motivo?: string | null;
    canonico?: string | null;
    lon?: number;
    lat?: number;
  } = {},
) {
  const {
    estado = 'nuevo',
    publicado = true,
    motivo = null,
    canonico = null,
    lon = -63.195,
    lat = -17.79,
  } = opts;
  await ex.consultar(
    `INSERT INTO reporte_inundacion
       (id, geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
        descripcion, profundidad_estimada, frecuencia, severidad_calculada, severidad_puntaje,
        severidad_version, estado, estado_motivo, fusionado_en_id, publicar_en)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326),
        ST_SetSRID(ST_MakePoint(round($2::numeric, 5)::float8, round($3::numeric, 5)::float8), 4326),
        'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica',
        'Reporte de prueba para la resolución del ID corto', 'rodilla', 'ocasional',
        'media', 6, 2, $4::estado_reporte, $5, $6,
        CASE WHEN $7 THEN now() ELSE now() + interval '30 minutes' END)`,
    [id, lon, lat, estado, motivo, canonico, publicado],
  );
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: { ...configDePrueba({ DATABASE_URL: base.url }), rutaOpenApi: '/no-existe.yaml' },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);

  await insertar(IDS.publico, { estado: 'nuevo', publicado: true });
  await insertar(IDS.espera, { estado: 'nuevo', publicado: false });
  await insertar(IDS.rechazado, {
    estado: 'rechazado',
    publicado: true,
    motivo: 'No es un anegamiento',
  });
  await insertar(IDS.duplicado, {
    estado: 'duplicado',
    publicado: true,
    motivo: 'Mismo charco',
    canonico: IDS.publico,
  });
  await insertar(IDS.ambiguoA, { estado: 'nuevo', publicado: true });
  await insertar(IDS.ambiguoB, { estado: 'nuevo', publicado: true });
  await insertar(IDS.moderable, { estado: 'nuevo', publicado: true });
  await insertar(IDS.canonico, { estado: 'validado', publicado: true });
  await insertar(IDS.duplicable, { estado: 'validado', publicado: true });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

const detalle = (id: string) => app.inject({ method: 'GET', url: `/api/v1/reportes/${id}` });
const corto = (id: string) => id.slice(0, 8);

describe('M-2.3: el detalle público no delata reportes ocultos (oráculo de existencia)', () => {
  const CUERPO_INEXISTENTE = { codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' };

  it('un ID corto inexistente da 404 con el cuerpo esperado', async () => {
    const r = await detalle('99999999');
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual(CUERPO_INEXISTENTE);
  });

  it('el ID corto de un reporte EN ESPERA da el mismo 404 que uno inexistente', async () => {
    const r = await detalle(corto(IDS.espera));
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual(CUERPO_INEXISTENTE);
  });

  it('el ID corto de un reporte RECHAZADO da el mismo 404 que uno inexistente', async () => {
    const r = await detalle(corto(IDS.rechazado));
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual(CUERPO_INEXISTENTE);
  });

  it('el ID corto de un reporte DUPLICADO da el mismo 404 que uno inexistente', async () => {
    const r = await detalle(corto(IDS.duplicado));
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual(CUERPO_INEXISTENTE);
  });
});

describe('M-2.4: sin regresión en la resolución del ID corto', () => {
  it('el ID corto de un reporte público resuelve', async () => {
    const r = await detalle(corto(IDS.publico));
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe(IDS.publico);
  });

  it('un prefijo que coincide con dos públicos da 404 (ambiguo)', async () => {
    const r = await detalle(corto(IDS.ambiguoA)); // 'cccccccc' lo comparten A y B
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ codigo: 'NO_EXISTE', mensaje: 'Reporte no encontrado.' });
  });

  it('las mayúsculas en el ID corto resuelven igual', async () => {
    const r = await detalle(corto(IDS.publico).toUpperCase());
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe(IDS.publico);
  });

  it('la moderación resuelve un publicado por ID corto en cualquier estado (nuevo publicado)', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${corto(IDS.moderable)}/estado`,
      payload: { estado: 'validado' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    expect(r.json().properties.estado).toBe('validado');
    expect(r.json().id).toBe(IDS.moderable);
  });

  it('la fusión acepta el canónico por ID corto', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${corto(IDS.duplicable)}/fusionar`,
      payload: { canonico_id: corto(IDS.canonico), motivo: 'Mismo charco' },
      cookies: { curichi_sesion: cookieTecnico },
    });
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    expect(r.json().properties.estado).toBe('duplicado');
    expect(r.json().properties.fusionado_en_id).toBe(IDS.canonico);
  });
});
