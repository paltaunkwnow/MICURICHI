/**
 * Corrida SDD 2026-09-25 «quitar campos del reporte» (spec.md, CA-A1 … CA-A5).
 *
 * El reporte deja de tener `manzana_id`, `direccion_aprox`, `duracion_estimada` y `afectacion`, y
 * la severidad pasa a la v2: `puntaje = 2·T + F` (3 … 12), bandas 3–4 baja, 5–7 media, 8–10 alta,
 * 11–12 crítica, E1 (T = 4 → crítica) y E3; E2 desaparece; `severidad_version = 2`.
 *
 * Los valores esperados de severidad están escritos a mano a partir de la tabla de CA-C5, a
 * propósito: si se comparara contra `calcularSeveridad` del paquete, un error en contracts
 * pasaría desapercibido aquí.
 *
 * geo-service NO cambia (D2): sigue devolviendo `manzana` en `/geo/v1/resolver`. Por eso el
 * resolver de esta suite devuelve siempre una manzana: es api-core quien tiene que ignorarla.
 */
import { ReportePublicoSchema, ReporteTecnicoSchema, type ResolverRespuesta } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import type { ResolverGeo } from '../src/resolver.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

/** Los cuatro campos que salen del reporte en todo el sistema. */
const CUATRO_CAMPOS = ['manzana_id', 'direccion_aprox', 'duracion_estimada', 'afectacion'] as const;

const MANZANA = { id: 'manzana:A-1', codigo: 'A-1' };

/**
 * Payload del formulario nuevo: sin duración ni afectación. Se construye aquí y no con
 * `reporteValido` de `ayudas.ts`, que todavía lleva los campos viejos.
 */
const PAYLOAD_NUEVO = {
  lat: -17.79,
  lon: -63.195,
  ubicacion_metodo: 'manual',
  ubicacion_tipo: 'via_publica',
  descripcion: 'Se junta agua hasta la rodilla cada vez que llueve fuerte y tarda horas en irse.',
  profundidad_estimada: 'rodilla',
  frecuencia: 'cada_lluvia_fuerte',
  causa_presunta: 'sumidero_tapado',
} as const;

/** Lo que manda una PWA con el formulario viejo en caché: duración y afectación. */
const PAYLOAD_PWA_VIEJA = {
  ...PAYLOAD_NUEVO,
  duracion_estimada: '2h_12h',
  afectacion: 'ingreso_viviendas',
} as const;

/** El viejo más las cuatro claves quitadas, con valores reconocibles para buscarlos en el cuerpo. */
const PAYLOAD_CON_LOS_CUATRO = {
  ...PAYLOAD_PWA_VIEJA,
  direccion_aprox: 'Calle Falsa 123',
  manzana_id: MANZANA.id,
} as const;

/** El resolver de prueba de siempre, pero informando una manzana como hace el geo-service real. */
const resolverConManzana: ResolverGeo = {
  async resolver(lat, lon): Promise<ResolverRespuesta> {
    const r = await resolverDePrueba.resolver(lat, lon);
    return { ...r, manzana: r.dentro_cobertura ? MANZANA : null };
  },
  async invalidarCapas() {},
};

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieTecnico: string;
let cookieVecina: string;
let ex: ReturnType<typeof ejecutorPg>;

async function crear(payload: Record<string, unknown>) {
  await liberarCuota(ex);
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookieVecina),
  });
}

async function validar(id: string) {
  const r = await app.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${id}/estado`,
    payload: { estado: 'validado' },
    cookies: sesion(cookieTecnico),
  });
  expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
}

const get = (url: string, tecnico = false) =>
  app.inject({ method: 'GET', url, ...(tecnico ? { cookies: sesion(cookieTecnico) } : {}) });

type Feature = {
  id: string;
  geometry: { coordinates: [number, number] };
  properties: Record<string, unknown>;
};

function sinLosCuatro(props: Record<string, unknown>, donde: string) {
  for (const campo of CUATRO_CAMPOS) expect(props, `${donde}: ${campo}`).not.toHaveProperty(campo);
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
    resolver: resolverConManzana,
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

describe('CA-A1: camino crítico con el payload nuevo', () => {
  // T y F elegidos para que v1 y v2 den resultados distintos (y uno de ellos dispare E1).
  const casos = [
    { profundidad: 'rodilla', frecuencia: 'cada_lluvia_fuerte', puntaje: 7, banda: 'media' },
    { profundidad: 'tobillo', frecuencia: 'ocasional', puntaje: 4, banda: 'baja' },
    { profundidad: 'muslo', frecuencia: 'permanente', puntaje: 10, banda: 'alta' },
    { profundidad: 'mas_70', frecuencia: 'primera_vez', puntaje: 9, banda: 'critica' },
  ] as const;

  for (const c of casos) {
    it(`CA-A1: ${c.profundidad} + ${c.frecuencia} sin duración ni afectación → 201, nuevo, UV resuelta, severidad v2 ${c.puntaje}/${c.banda}`, async () => {
      const r = await crear({
        ...PAYLOAD_NUEVO,
        profundidad_estimada: c.profundidad,
        frecuencia: c.frecuencia,
      });
      expect(r.statusCode, r.body.slice(0, 400)).toBe(201);
      const id = r.json().id as string;
      const { rows } = await pool.query<{
        estado: string;
        unidad_vecinal_id: string;
        distrito_id: string;
        severidad_version: number;
        severidad_calculada: string;
        severidad_puntaje: number;
      }>(
        `SELECT estado::text, unidad_vecinal_id, distrito_id, severidad_version,
                severidad_calculada::text, severidad_puntaje
           FROM reporte_inundacion WHERE id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        estado: 'nuevo',
        unidad_vecinal_id: 'unidad_vecinal:A',
        distrito_id: 'distrito_municipal:01',
        severidad_version: 2,
        severidad_calculada: c.banda,
        severidad_puntaje: c.puntaje,
      });
    });
  }
});

describe('CA-A2: un cliente viejo (PWA en caché) no rompe la creación', () => {
  it('CA-A2: con los cuatro campos responde 201 y ni la respuesta ni la vista técnica los traen', async () => {
    const r = await crear(PAYLOAD_CON_LOS_CUATRO);
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201);
    const creado = r.json() as Feature;
    sinLosCuatro(creado.properties, 'respuesta de POST');
    expect(r.body).not.toContain('Calle Falsa 123');

    const tec = await get(`/api/v1/tecnico/reportes/${creado.id}`, true);
    expect(tec.statusCode).toBe(200);
    sinLosCuatro((tec.json() as Feature).properties, 'vista técnica');
    expect(tec.body).not.toContain('Calle Falsa 123');
    expect(tec.body).not.toContain(MANZANA.id);
  });
});

describe('CA-A3: la manzana que devuelve geo-service no se guarda ni se publica', () => {
  it('CA-A3: ni la ruta pública, ni la técnica, ni la exportación traen manzana_id ni manzana:A-1', async () => {
    const r = await crear({ ...PAYLOAD_PWA_VIEJA, ubicacion_tipo: 'via_publica' });
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201);
    const id = r.json().id as string;
    await validar(id);

    const respuestas = {
      'POST (respuesta)': r,
      'GET público lista': await get('/api/v1/reportes?limite=500'),
      'GET público detalle': await get(`/api/v1/reportes/${id}`),
      'GET técnico lista': await get('/api/v1/tecnico/reportes?limite=500', true),
      'GET técnico detalle': await get(`/api/v1/tecnico/reportes/${id}`, true),
      'exportar csv': await get('/api/v1/exportar?formato=csv', true),
      'exportar geojson': await get('/api/v1/exportar?formato=geojson', true),
    };
    for (const [donde, res] of Object.entries(respuestas)) {
      expect(res.statusCode, donde).toBeLessThan(300);
      expect(res.body, `${donde} contiene la clave manzana_id`).not.toContain('manzana_id');
      expect(res.body, `${donde} contiene la manzana resuelta`).not.toContain(MANZANA.id);
    }
    // Precondición: el reporte está de verdad en las respuestas de lista y exportación.
    expect(respuestas['GET público lista'].body).toContain(id);
    expect(respuestas['exportar csv'].body).toContain(id);
    expect(respuestas['exportar geojson'].body).toContain(id);
  });
});

describe('CA-A4: vistas pública y técnica sin los cuatro campos', () => {
  const LAT = -17.7912345;
  const LON = -63.1934567;
  let idVivienda: string;
  let idVia: string;

  beforeAll(async () => {
    const v = await crear({
      ...PAYLOAD_CON_LOS_CUATRO,
      lat: LAT,
      lon: LON,
      ubicacion_tipo: 'vivienda_o_predio',
    });
    expect(v.statusCode, v.body.slice(0, 400)).toBe(201);
    idVivienda = v.json().id as string;
    await validar(idVivienda);
    const p = await crear({ ...PAYLOAD_CON_LOS_CUATRO, ubicacion_tipo: 'via_publica' });
    expect(p.statusCode, p.body.slice(0, 400)).toBe(201);
    idVia = p.json().id as string;
    await validar(idVia);
  });

  it('CA-A4: listado y detalle públicos no traen los cuatro campos y pasan ReportePublicoSchema.strict()', async () => {
    const lista = await get('/api/v1/reportes?limite=500');
    expect(lista.statusCode).toBe(200);
    const fs = lista.json().features as Feature[];
    for (const id of [idVivienda, idVia]) {
      const f = fs.find((x) => x.id === id);
      expect(f, `el reporte ${id} está publicado`).toBeTruthy();
      sinLosCuatro(f!.properties, `lista pública ${id}`);
      const strict = ReportePublicoSchema.strict().safeParse(f!.properties);
      expect(strict.success, JSON.stringify(strict.error?.issues)).toBe(true);

      const det = await get(`/api/v1/reportes/${id}`);
      expect(det.statusCode).toBe(200);
      sinLosCuatro((det.json() as Feature).properties, `detalle público ${id}`);
      const strictDet = ReportePublicoSchema.strict().safeParse((det.json() as Feature).properties);
      expect(strictDet.success, JSON.stringify(strictDet.error?.issues)).toBe(true);
    }
  });

  it('CA-A4: listado y detalle técnicos no traen los cuatro campos y pasan ReporteTecnicoSchema.strict()', async () => {
    const lista = await get('/api/v1/tecnico/reportes?limite=500', true);
    expect(lista.statusCode).toBe(200);
    const fs = lista.json().features as Feature[];
    for (const id of [idVivienda, idVia]) {
      const f = fs.find((x) => x.id === id);
      expect(f).toBeTruthy();
      sinLosCuatro(f!.properties, `lista técnica ${id}`);
      const strict = ReporteTecnicoSchema.strict().safeParse(f!.properties);
      expect(strict.success, JSON.stringify(strict.error?.issues)).toBe(true);

      const det = await get(`/api/v1/tecnico/reportes/${id}`, true);
      expect(det.statusCode).toBe(200);
      sinLosCuatro((det.json() as Feature).properties, `detalle técnico ${id}`);
      const strictDet = ReporteTecnicoSchema.strict().safeParse((det.json() as Feature).properties);
      expect(strictDet.success, JSON.stringify(strictDet.error?.issues)).toBe(true);
    }
  });

  it('CA-A4: la vivienda sigue degradada en público y exacta para el técnico', async () => {
    const det = await get(`/api/v1/reportes/${idVivienda}`);
    const f = det.json() as Feature;
    expect(f.properties.precision_degradada).toBe(true);
    expect(f.geometry.coordinates).not.toEqual([LON, LAT]);
    const tec = await get(`/api/v1/tecnico/reportes/${idVivienda}`, true);
    expect((tec.json() as Feature).geometry.coordinates).toEqual([LON, LAT]);
    const via = await get(`/api/v1/reportes/${idVia}`);
    expect((via.json() as Feature).properties.precision_degradada).toBe(false);
  });
});

describe('CA-A5: exportación sin las columnas', () => {
  beforeAll(async () => {
    const r = await crear(PAYLOAD_CON_LOS_CUATRO);
    expect(r.statusCode, r.body.slice(0, 400)).toBe(201);
    await validar(r.json().id as string);
  });

  it('CA-A5: el encabezado del CSV no nombra los cuatro campos y conserva la nota metodológica', async () => {
    const csv = await get('/api/v1/exportar?formato=csv', true);
    expect(csv.statusCode).toBe(200);
    const lineas = csv.body.split('\n');
    expect(lineas[0]).toContain('inventario de reportes ciudadanos');
    const encabezado = lineas.find((l) => l.startsWith('id,'));
    expect(encabezado, 'hay una fila de encabezado').toBeTruthy();
    const columnas = encabezado!.split(',');
    for (const campo of CUATRO_CAMPOS) expect(columnas, campo).not.toContain(campo);
    // Siguen las que no se quitan.
    for (const campo of ['profundidad_estimada', 'frecuencia', 'severidad', 'unidad_vecinal'])
      expect(columnas, campo).toContain(campo);
  });

  it('CA-A5: las properties del GeoJSON exportado no traen los cuatro campos y hay nota metodológica', async () => {
    const geo = await get('/api/v1/exportar?formato=geojson', true);
    expect(geo.statusCode).toBe(200);
    const cuerpo = geo.json() as { nota_metodologica: string; features: Feature[] };
    expect(cuerpo.nota_metodologica).toContain('percepción');
    expect(cuerpo.features.length).toBeGreaterThan(0);
    for (const f of cuerpo.features) sinLosCuatro(f.properties, `export ${f.id}`);
  });
});
