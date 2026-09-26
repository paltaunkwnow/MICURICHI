/**
 * Cuota de fotos por cuenta y autoría de la foto (revisión de producción, CLAUDE.md §13).
 *
 * Dos agujeros de `POST /api/v1/fotos`, que ya exigía sesión pero no anotaba de quién era cada
 * foto (migración 0012):
 *  - cualquier cuenta subía sin tope: solo había el límite por IP, que una IP dinámica reinicia
 *    con poner el teléfono en modo avión, y cada subida es lo más caro que hace el servicio;
 *  - al crear el reporte no se miraba de quién era la foto: con la `objeto_key` recién subida por
 *    otra cuenta se la podía reclamar para un reporte propio.
 */
import { randomUUID } from 'node:crypto';
import { CONFIG_DOMINIO } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { Metricas } from '../src/observabilidad.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  multipart,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const LIMITE = CONFIG_DOMINIO.FOTOS_POR_HORA_POR_CUENTA;

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookieVecina: string;
let cookieVecino: string;
let idVecina: string;
let idVecino: string;
const metricas = new Metricas();
/**
 * La foto de prueba se genera una sola vez y aquí: la primera operación de sharp del proceso
 * inicializa libvips, y con la suite en paralelo eso solo ya se comía el plazo del primer `it`.
 */
let JPEG: Buffer;

beforeAll(async () => {
  JPEG = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#28934D' } })
    .jpeg()
    .toBuffer();
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    // El límite por IP bien alto: aquí se prueba el de la CUENTA, que es el que no se esquiva
    // cambiando de conexión.
    cfg: {
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
    metricas,
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
  const ids = await pool.query<{ email: string; id: string }>(
    'SELECT email, id FROM usuario WHERE email = ANY($1::text[])',
    [[CUENTAS.vecina, CUENTAS.vecino]],
  );
  idVecina = ids.rows.find((f) => f.email === CUENTAS.vecina)!.id;
  idVecino = ids.rows.find((f) => f.email === CUENTAS.vecino)!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

// Cada prueba parte de cero fotos: la cuota mira la última hora de cada cuenta.
beforeEach(async () => {
  await pool.query('DELETE FROM reporte_foto');
});

function subir(cookie: string, datos: Buffer = JPEG) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/fotos',
    cookies: sesion(cookie),
    ...multipart('archivo', 'f.jpg', 'image/jpeg', datos),
  });
}

/**
 * Cada subida decodifica y re-codifica la imagen con sharp, y la suite corre en paralelo con
 * las demás: el plazo por defecto de 5 s se queda corto sin que falle nada de lo que se prueba.
 */
const PLAZO = { timeout: 30_000 };

/** Fotos que la cuenta ya subió hace `minutos` minutos, sin pasar por sharp ni por la ruta. */
async function fotosPrevias(usuarioId: string | null, n: number, minutos: number) {
  const claves: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${randomUUID()}.jpg`;
    claves.push(key);
    await pool.query(
      `INSERT INTO reporte_foto (objeto_key, mime, bytes, ancho, alto, exif_sanitizado, subido_por, creado_en)
       VALUES ($1, 'image/jpeg', 1, 1, 1, true, $2, now() - ($3 || ' minutes')::interval)`,
      [key, usuarioId, String(minutos)],
    );
  }
  return claves;
}

async function fotosDe(usuarioId: string): Promise<number> {
  const r = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM reporte_foto WHERE subido_por = $1',
    [usuarioId],
  );
  return r.rows[0]!.n;
}

describe('autoría de la foto', PLAZO, () => {
  it('guarda qué cuenta subió cada foto', async () => {
    const r = await subir(cookieVecina);
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    const fila = await pool.query<{ subido_por: string | null }>(
      'SELECT subido_por FROM reporte_foto WHERE objeto_key = $1',
      [r.json().objeto_key],
    );
    expect(fila.rows[0]?.subido_por).toBe(idVecina);
  });

  it('un reporte no puede reclamar la foto que subió otra cuenta', async () => {
    const deVecina = (await subir(cookieVecina)).json().objeto_key as string;
    await liberarCuota(ex, CUENTAS.vecino);
    const ajeno = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, fotos: [deVecina] },
      cookies: sesion(cookieVecino),
    });
    expect(ajeno.statusCode).toBe(400);
    expect(ajeno.json().codigo).toBe('FOTOS_INVALIDAS');
    // La foto sigue libre para su dueña, que sí puede adjuntarla.
    const fila = await pool.query<{ reporte_id: string | null }>(
      'SELECT reporte_id FROM reporte_foto WHERE objeto_key = $1',
      [deVecina],
    );
    expect(fila.rows[0]?.reporte_id).toBeNull();
    await liberarCuota(ex, CUENTAS.vecina);
    const propio = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, fotos: [deVecina] },
      cookies: sesion(cookieVecina),
    });
    expect(propio.statusCode, propio.body.slice(0, 200)).toBe(201);
  });

  it('una foto sin autor registrado (anterior a la 0012) no se adjunta a ningún reporte', async () => {
    const [huerfana] = await fotosPrevias(null, 1, 5);
    await liberarCuota(ex, CUENTAS.vecina);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: { ...reporteValido, fotos: [huerfana] },
      cookies: sesion(cookieVecina),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('FOTOS_INVALIDAS');
  });
});

describe(`cuota de ${LIMITE} fotos por hora y por cuenta`, PLAZO, () => {
  it('la foto que supera el tope es 429 CUOTA_DE_FOTOS con Retry-After hasta que se libera cupo', async () => {
    await fotosPrevias(idVecina, LIMITE - 1, 50);
    const ultima = await subir(cookieVecina);
    expect(ultima.statusCode, 'la foto número LIMITE todavía entra').toBe(201);

    const sobra = await subir(cookieVecina);
    expect(sobra.statusCode).toBe(429);
    expect(sobra.json().codigo).toBe('CUOTA_DE_FOTOS');
    // Revisión de producción, §13: contador nuevo por resultado, junto a la métrica de la alerta
    // CuotaDeFotosRechazando (curichi_cuota_fotos_rechazos_total, sin tocar).
    expect(metricas.exponer()).toContain(
      'curichi_fotos_subidas_total{resultado="rechazada_cuota"}',
    );
    // El cupo vuelve cuando la más vieja de la ventana (hace 50 min) cumple la hora: ~10 min.
    const espera = Number(sobra.headers['retry-after']);
    expect(espera).toBeGreaterThanOrEqual(590);
    expect(espera).toBeLessThanOrEqual(601);
    expect(sobra.json().mensaje).toMatch(/10 minutos/);
    expect(new Date(sobra.json().detalles.disponible_en).getTime()).toBeGreaterThan(Date.now());
    expect(await fotosDe(idVecina)).toBe(LIMITE);
  });

  it('las fotos de hace más de una hora ya no cuentan', async () => {
    await fotosPrevias(idVecina, LIMITE, 61);
    expect((await subir(cookieVecina)).statusCode).toBe(201);
  });

  it('el tope es de la cuenta: otra cuenta sigue subiendo', async () => {
    await fotosPrevias(idVecina, LIMITE, 5);
    expect((await subir(cookieVecina)).statusCode).toBe(429);
    expect((await subir(cookieVecino)).statusCode).toBe(201);
    expect(await fotosDe(idVecino)).toBe(1);
  });

  it('sin cupo no se llega a leer ni a procesar el archivo', async () => {
    await fotosPrevias(idVecina, LIMITE, 5);
    // Un archivo que no es imagen daría 415 si se procesara: la cuota se mira antes, y así una
    // cuenta sin cupo no puede seguir haciendo trabajar a sharp.
    const r = await subir(cookieVecina, Buffer.from('<html>esto no es una foto</html>'));
    expect(r.statusCode).toBe(429);
    expect(await fotosDe(idVecina)).toBe(LIMITE);
  });

  it('varias subidas simultáneas de la misma cuenta no pasan del tope', async () => {
    await fotosPrevias(idVecina, LIMITE - 2, 5);
    // Cuatro a la vez y no más: esta suite corre sobre PGlite, que serializa las transacciones
    // de todas las conexiones (ADR 0003).
    const codigos = (await Promise.all(Array.from({ length: 4 }, () => subir(cookieVecina)))).map(
      (r) => r.statusCode,
    );
    expect(codigos.filter((c) => c === 201)).toHaveLength(2);
    expect(codigos.filter((c) => c === 429)).toHaveLength(2);
    expect(await fotosDe(idVecina)).toBe(LIMITE);
  });
});
