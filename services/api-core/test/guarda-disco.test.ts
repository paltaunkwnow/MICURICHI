/**
 * Guarda de espacio en disco de las fotos (contracts 0.13.0, plan S35). En la VPS las fotos van al
 * mismo disco que PostgreSQL: si se llena, cae la base. Por debajo de `FOTOS_MIN_LIBRE_BYTES`,
 * `POST /fotos` responde 507 SIN_ESPACIO antes de leer la imagen y sin gastar cupo, y `/ready` sale
 * degradado con `fotos: 'poco_espacio'`. Las métricas alimentan las alertas `DiscoDeFotos*`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadyApiCoreSchema } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenDisco, type LectorStatfs } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  multipart,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const GIB = 1024 ** 3;
const UMBRAL = 2 * GIB;

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let dir: string;
let cookie: string;
let JPEG: Buffer;
/** Bytes libres que informa el statfs simulado; cada prueba lo fija. */
let libre = 10 * GIB;
let llamadasStatfs = 0;

const statfsSimulado: LectorStatfs = async () => {
  llamadasStatfs++;
  return { bsize: 4096, bavail: Math.floor(libre / 4096), blocks: Math.floor((50 * GIB) / 4096) };
};

beforeAll(async () => {
  JPEG = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#0D6189' } })
    .jpeg()
    .toBuffer();
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  dir = mkdtempSync(join(tmpdir(), 'curichi-guarda-disco-'));
  app = await crearApp({
    pool,
    cfg: {
      ...configDePrueba({
        DATABASE_URL: base.url,
        GEO_SERVICE_URL: 'http://127.0.0.1:59999',
        FOTOS_MIN_LIBRE_BYTES: String(UMBRAL),
      }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
      tokenMetricas: '',
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenDisco(dir, { statfs: statfsSimulado }),
  });
  cookie = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  libre = 10 * GIB;
  llamadasStatfs = 0;
  await pool.query('DELETE FROM cuota_reporte_diaria');
});

function subir(datos: Buffer = JPEG) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/fotos',
    cookies: sesion(cookie),
    ...multipart('archivo', 'f.jpg', 'image/jpeg', datos),
  });
}

async function fotosGastadas(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    'SELECT COALESCE(sum(fotos_n), 0)::int AS n FROM cuota_reporte_diaria',
  );
  return r.rows[0]!.n;
}

describe('FOTOS_MIN_LIBRE_BYTES', () => {
  it('por defecto 2 GiB; se cambia con la variable; 0 apaga la guarda', () => {
    expect(leerConfig({}).fotosMinLibreBytes).toBe(2 * GIB);
    expect(leerConfig({ FOTOS_MIN_LIBRE_BYTES: '1048576' }).fotosMinLibreBytes).toBe(1_048_576);
    expect(leerConfig({ FOTOS_MIN_LIBRE_BYTES: '0' }).fotosMinLibreBytes).toBe(0);
    expect(() => leerConfig({ FOTOS_MIN_LIBRE_BYTES: 'dos gigas' })).toThrow(
      /FOTOS_MIN_LIBRE_BYTES/,
    );
    expect(() => leerConfig({ FOTOS_MIN_LIBRE_BYTES: '-1' })).toThrow(/FOTOS_MIN_LIBRE_BYTES/);
  });
});

describe('AlmacenDisco.espacioLibre()', () => {
  it('lee statfs del directorio de fotos: libre = bavail × bsize, total = blocks × bsize', async () => {
    const vistos: string[] = [];
    const almacen = new AlmacenDisco(dir, {
      statfs: async (ruta) => {
        vistos.push(ruta);
        return { bsize: 4096, bavail: 10, blocks: 100 };
      },
    });
    await expect(almacen.espacioLibre()).resolves.toEqual({ libre: 40_960, total: 409_600 });
    expect(vistos).toEqual([dir]);
  });

  it('sin statfs simulado usa el de Node y da cifras positivas', async () => {
    const e = await new AlmacenDisco(dir).espacioLibre();
    expect(e.total).toBeGreaterThan(0);
    expect(e.libre).toBeGreaterThanOrEqual(0);
    expect(e.libre).toBeLessThanOrEqual(e.total);
  });
});

describe('POST /fotos con poco espacio', () => {
  it('507 SIN_ESPACIO antes de leer la imagen y sin reservar cupo', async () => {
    libre = UMBRAL - 1;
    // Un archivo que no es imagen daría 415 si se llegara a mirar: el 507 va antes.
    const r = await subir(Buffer.from('<html>esto no es una foto</html>'));
    expect(r.statusCode).toBe(507);
    expect(r.json().codigo).toBe('SIN_ESPACIO');
    expect(r.json().mensaje).toMatch(/sin foto/);
    expect(await fotosGastadas()).toBe(0);
    expect(llamadasStatfs).toBeGreaterThan(0);
  });

  it('con una foto de verdad tampoco se procesa ni se guarda', async () => {
    libre = 100;
    const r = await subir();
    expect(r.statusCode).toBe(507);
    const filas = await pool.query('SELECT 1 FROM reporte_foto');
    expect(filas.rowCount).toBe(0);
    expect(await fotosGastadas()).toBe(0);
  });

  it('con espacio suficiente la foto entra', async () => {
    libre = UMBRAL + 1;
    const r = await subir();
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    expect(await fotosGastadas()).toBe(1);
  });
});

describe('/ready y métricas', () => {
  it("/ready: 200, fotos 'poco_espacio' y degradado bajo el umbral", async () => {
    libre = UMBRAL - 1;
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(200);
    const cuerpo = ReadyApiCoreSchema.parse(r.json());
    expect(cuerpo).toMatchObject({ ok: true, db: 'ok', fotos: 'poco_espacio', degradado: true });
  });

  it("/ready: fotos 'ok' con espacio suficiente", async () => {
    libre = UMBRAL * 3;
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.json().fotos).toBe('ok');
  });

  it('/metrics expone libre, total y el umbral configurado, con los nombres de las alertas', async () => {
    libre = 5 * GIB;
    const r = await app.inject({ method: 'GET', url: '/metrics' });
    expect(r.statusCode).toBe(200);
    const valor = (nombre: string) => {
      const linea = r.body.split('\n').find((l) => l.startsWith(`${nombre}{`));
      return linea ? Number(linea.split(' ').pop()) : undefined;
    };
    expect(r.body).toContain('# TYPE curichi_fotos_disco_libre_bytes gauge');
    expect(valor('curichi_fotos_disco_libre_bytes')).toBe(Math.floor((5 * GIB) / 4096) * 4096);
    expect(valor('curichi_fotos_disco_total_bytes')).toBe(50 * GIB);
    expect(valor('curichi_fotos_disco_min_libre_bytes')).toBe(UMBRAL);
    // Se lee en cada scrape, no queda congelado en el valor del arranque.
    libre = 3 * GIB;
    const otra = await app.inject({ method: 'GET', url: '/metrics' });
    expect(otra.body).toContain(`curichi_fotos_disco_libre_bytes{} ${3 * GIB}`);
  });
});
