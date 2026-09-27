/**
 * Exportación del técnico (`GET /api/v1/exportar`): que el CSV no se pueda partir desde la
 * descripción de un vecino, que nunca recorte la selección en silencio y que `desde`/`hasta`
 * sean días del calendario de la ciudad.
 *
 * La sesión de la base se pone en UTC, como en el contenedor de Docker. PGlite hereda la zona de
 * la máquina, y en una máquina de La Paz el defecto de la zona horaria no se veía.
 */
import { CONFIG_DOMINIO, ExportacionGeoJsonSchema } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { type ConfigApi, leerConfig } from '../src/config.js';
import { TOPE_CONTEO } from '../src/consultas.js';
import {
  CUENTAS,
  configDePrueba,
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
let ex: ReturnType<typeof ejecutorPg>;
let cookieTecnico: string;
let cookieVecina: string;

const configuracion = (extra: Partial<ConfigApi> = {}): ConfigApi => ({
  ...configDePrueba({ DATABASE_URL: base.url }),
  rutaOpenApi: '/no-existe.yaml',
  rateLimitMax: 1000,
  ...extra,
});

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  pool.on('connect', (c) => {
    void c.query("SET TIME ZONE 'UTC'");
  });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: configuracion(),
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

const exportar = (query: string, a: FastifyInstance = app) =>
  a.inject({
    method: 'GET',
    url: `/api/v1/exportar?${query}`,
    cookies: sesion(cookieTecnico),
  });

/** Reportes sembrados en la base, con la UV, el estado y la fecha de creación que haga falta. */
async function sembrar(o: { uv: string; estado?: string; creado?: string; cuantos?: number }) {
  const filas = await ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id, version_capa,
       ubicacion_metodo, ubicacion_tipo, descripcion, profundidad_estimada, frecuencia,
       severidad_calculada, severidad_puntaje, severidad_version, estado, creado_en, publicar_en)
     SELECT ST_SetSRID(ST_MakePoint(-63.175, -17.79), 4326), ST_SetSRID(ST_MakePoint(-63.175, -17.79), 4326),
       'distrito_municipal:01', $1, 'test', 'manual', 'via_publica', 'Reporte sembrado número ' || g,
       'rodilla', 'ocasional', 'media', 6, 2, $2::estado_reporte, COALESCE($3::timestamptz, now()), COALESCE($3::timestamptz, now())
     FROM generate_series(1, $4::int) g
     RETURNING id::text`,
    [o.uv, o.estado ?? 'nuevo', o.creado ?? null, o.cuantos ?? 1],
  );
  return filas.map((f) => f.id);
}

/**
 * Lector de CSV como el de una hoja de cálculo: RFC 4180 más lo que hacen Excel y LibreOffice,
 * que cortan el registro en CR, LF o CRLF cuando no están entre comillas.
 */
function leerCsv(texto: string): string[][] {
  const registros: string[][] = [];
  let registro: string[] = [];
  let celda = '';
  let entreComillas = false;
  const cerrarCelda = () => {
    registro.push(celda);
    celda = '';
  };
  const cerrarRegistro = () => {
    cerrarCelda();
    registros.push(registro);
    registro = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (entreComillas) {
      if (c !== '"') celda += c;
      else if (texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else entreComillas = false;
    } else if (c === '"' && celda === '') entreComillas = true;
    else if (c === ',') cerrarCelda();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      cerrarRegistro();
    } else celda += c;
  }
  if (celda !== '' || registro.length) cerrarRegistro();
  return registros;
}

describe('CSV: un registro por reporte aunque el vecino escriba saltos de línea', () => {
  it('el \\r de una descripción no parte la fila ni deja una celda que empiece por =', async () => {
    const descripciones = [
      "Agua hasta el tobillo en la esquina\r=cmd|' /C calc'!A0",
      'Se junta frente a la escuela\n@SUM(1+1) y no baja',
      'Dice "hola", y; se inunda la cuadra\r\n+49 llamar al vecino',
      '=HYPERLINK("http://malicioso.test","Cobrar") agua en la puerta',
    ];
    const ids: string[] = [];
    for (const descripcion of descripciones) {
      await liberarCuota(ex);
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        payload: { ...reporteValido, descripcion },
        cookies: sesion(cookieVecina),
      });
      expect(r.statusCode, r.body).toBe(201);
      ids.push(r.json().id);
    }

    const csv = await exportar('formato=csv&unidad_vecinal_id=unidad_vecinal:A');
    expect(csv.statusCode).toBe(200);
    const registros = leerCsv(csv.body.replace(/^﻿/, '')).filter((r) => !r[0]?.startsWith('#'));
    const [cabecera, ...filas] = registros;
    expect(cabecera?.[0]).toBe('id');
    // Un registro por reporte: antes, el CR suelto abría una fila nueva que empezaba por `=cmd`.
    expect(filas.map((f) => f[0]).sort()).toEqual([...ids].sort());
    for (const f of filas) {
      expect(f).toHaveLength(cabecera!.length);
      for (const celda of f)
        if (celda !== '' && !Number.isFinite(Number(celda)))
          expect(celda, `celda de ${f[0]}`).not.toMatch(/^[=+\-@\t\r\n]/);
    }
    const descripcion = cabecera!.indexOf('descripcion');
    expect(filas.map((f) => f[descripcion])).toContain(
      "Agua hasta el tobillo en la esquina\r=cmd|' /C calc'!A0",
    );
    expect(filas.map((f) => f[descripcion])).toContain(
      `'=HYPERLINK("http://malicioso.test","Cobrar") agua en la puerta`,
    );
  });
});

describe('exportación: cuenta sin tope y avisa cuando el archivo no trae todo', () => {
  const MASIVOS = TOPE_CONTEO + 5;
  const VALIDADOS = 3;
  const TOTAL_C = MASIVOS + VALIDADOS;

  beforeAll(async () => {
    await sembrar({ uv: 'unidad_vecinal:C', cuantos: MASIVOS });
    await sembrar({ uv: 'unidad_vecinal:C', estado: 'validado', cuantos: VALIDADOS });
  }, 120_000);

  it('GeoJSON: total sin el tope del listado, exportados y truncado', async () => {
    const r = await exportar('formato=geojson&unidad_vecinal_id=unidad_vecinal:C&limite=10');
    expect(r.statusCode).toBe(200);
    const c = ExportacionGeoJsonSchema.parse(r.json());
    // Con el conteo del listado decía 10 000: la selección real tiene más.
    expect(c.total).toBe(TOTAL_C);
    expect(c.exportados).toBe(10);
    expect(c.features).toHaveLength(10);
    expect(c.truncado).toBe(true);
    expect(c.nota_metodologica).toContain('percepción');
    expect(r.headers['x-curichi-truncado']).toBe('1');
  });

  it('CSV: «N de M reportes» en el encabezado y la cabecera HTTP cuando faltan filas', async () => {
    const r = await exportar('formato=csv&unidad_vecinal_id=unidad_vecinal:C&limite=10');
    expect(r.statusCode).toBe(200);
    expect(r.headers['x-curichi-truncado']).toBe('1');
    const lineas = r.body.replace(/^﻿/, '').split('\n');
    expect(lineas[1]).toContain(`10 de ${TOTAL_C} reportes`);
    const datos = lineas.filter((l) => l !== '' && !l.startsWith('#') && !l.startsWith('id,'));
    expect(datos).toHaveLength(10);
  });

  it('si entra todo: exportados = total, truncado false y sin la cabecera', async () => {
    const q = 'unidad_vecinal_id=unidad_vecinal:C&estado=validado';
    const geo = await exportar(`formato=geojson&${q}`);
    const c = ExportacionGeoJsonSchema.parse(geo.json());
    expect([c.total, c.exportados, c.truncado]).toEqual([VALIDADOS, VALIDADOS, false]);
    expect(geo.headers['x-curichi-truncado']).toBeUndefined();
    const csv = await exportar(`formato=csv&${q}`);
    expect(csv.body.split('\n')[1]).toContain(`${VALIDADOS} de ${VALIDADOS} reportes`);
    expect(csv.headers['x-curichi-truncado']).toBeUndefined();
  });

  it('el límite por defecto es EXPORTAR_MAX_FILAS, no el de una página del listado', async () => {
    const r = await exportar('formato=geojson&unidad_vecinal_id=unidad_vecinal:C&estado=nuevo');
    const c = ExportacionGeoJsonSchema.parse(r.json());
    expect(MASIVOS).toBeLessThan(CONFIG_DOMINIO.EXPORTAR_MAX_FILAS);
    expect([c.total, c.exportados, c.truncado]).toEqual([MASIVOS, MASIVOS, false]);
  });
});

describe('zona horaria: desde y hasta son días de la ciudad, no de la sesión de PostgreSQL', () => {
  // Dos instantes que caen en días distintos según la zona:
  //   21:00 del 20 en La Paz = 01:00 UTC del 21 = 10:00 del 21 en Tokio;
  //   12:00 del 21 en La Paz = 16:00 UTC del 21 = 01:00 del 22 en Tokio.
  let delVeinte: string;
  let delVeintiuno: string;

  beforeAll(async () => {
    [delVeinte] = (await sembrar({
      uv: 'unidad_vecinal:B',
      estado: 'validado',
      creado: '2026-09-20T21:00:00-04:00',
    })) as [string];
    [delVeintiuno] = (await sembrar({
      uv: 'unidad_vecinal:B',
      estado: 'validado',
      creado: '2026-09-21T12:00:00-04:00',
    })) as [string];
  });

  const idsEntre = async (desde: string, hasta: string, a?: FastifyInstance) => {
    const r = await exportar(
      `formato=geojson&unidad_vecinal_id=unidad_vecinal:B&desde=${desde}&hasta=${hasta}`,
      a,
    );
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    return (r.json().features as { id: string }[]).map((f) => f.id).sort();
  };

  it('la sesión de la base está en UTC, como en Docker', async () => {
    const r = await pool.query<{ TimeZone: string }>('SHOW TimeZone');
    expect(r.rows[0]?.TimeZone).toBe('UTC');
  });

  it('con la zona por defecto (La Paz), el reporte de las 21:00 del 20 cae en el día 20', async () => {
    expect(await idsEntre('2026-09-20', '2026-09-20')).toEqual([delVeinte]);
    expect(await idsEntre('2026-09-21', '2026-09-21')).toEqual([delVeintiuno]);
    expect(await idsEntre('2026-09-22', '2026-09-22')).toEqual([]);
    expect(await idsEntre('2026-09-20', '2026-09-21')).toEqual([delVeinte, delVeintiuno].sort());
  });

  it('otra ciudad, otra zona: manda ZONA_HORARIA de la instalación', async () => {
    const tokio = await crearApp({
      pool,
      cfg: configuracion({ zonaHoraria: 'Asia/Tokyo' }),
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    try {
      expect(await idsEntre('2026-09-20', '2026-09-20', tokio)).toEqual([]);
      expect(await idsEntre('2026-09-21', '2026-09-21', tokio)).toEqual([delVeinte]);
      expect(await idsEntre('2026-09-22', '2026-09-22', tokio)).toEqual([delVeintiuno]);
    } finally {
      await tokio.close();
    }
  });
});

describe('ZONA_HORARIA en la configuración', () => {
  it('por defecto la del contrato, se cambia con la variable y vacía cuenta como ausente', () => {
    expect(leerConfig({}).zonaHoraria).toBe(CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO);
    expect(leerConfig({ ZONA_HORARIA: 'America/Sao_Paulo' }).zonaHoraria).toBe('America/Sao_Paulo');
    expect(leerConfig({ ZONA_HORARIA: '' }).zonaHoraria).toBe(
      CONFIG_DOMINIO.ZONA_HORARIA_POR_DEFECTO,
    );
  });

  it('un nombre que no es IANA no arranca: cada filtro por fecha fallaría en la base', () => {
    expect(() => leerConfig({ ZONA_HORARIA: 'Marte/Olympus_Mons' })).toThrow(/ZONA_HORARIA/);
    // PostgreSQL lee «-04:00» con el signo POSIX (al revés que ISO 8601): mejor no aceptarlo.
    expect(() => leerConfig({ ZONA_HORARIA: '-04:00' })).toThrow(/ZONA_HORARIA/);
  });
});
