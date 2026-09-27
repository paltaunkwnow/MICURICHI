/**
 * Paso S09 del plan de producción (contracts 0.9.0): el punto del reporte tiene que estar a 60 m
 * o menos de la posición del teléfono, con una precisión de 50 m o menos y una lectura de 10 min
 * o menos. api-core lo comprueba después de Zod y antes de resolver la ubicación, con 422 propios
 * que no gastan cupo.
 *
 * La posición del teléfono sirve solo para esa comprobación: no queda en la fila, ni en la
 * auditoría, ni en la huella de idempotencia, ni en los logs (§0 regla 8 y §13). Lo único que se
 * guarda es la distancia redondeada y la precisión declarada.
 */
import { Writable } from 'node:stream';
import { CONFIG_DOMINIO, distanciaMetros, ReporteTecnicoSchema } from 'contracts';
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import Fastify, { type FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { opcionesLogger } from '../src/registro.js';
import { revisarDispositivo, TOLERANCIA_RADIO_M } from '../src/ubicacion-dispositivo.js';
import {
  alNorte,
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

const PUNTO = { lat: reporteValido.lat, lon: reporteValido.lon };

/**
 * Una posición del teléfono con cifras que no aparecen en ningún otro lado de la suite: a unos
 * 38 m del punto. Si alguna de estas dos cadenas sale en la base, en una respuesta o en el log,
 * la posición se filtró.
 */
const TELEFONO = { lat: -17.7903217, lon: -63.1951234 };
const RASTROS = ['7903217', '1951234'];

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookieVecina: string;
let cookieTecnico: string;
let ex: ReturnType<typeof ejecutorPg>;
const lineasDeLog: string[] = [];

function dispositivo(extra: Partial<typeof reporteValido.dispositivo> = {}) {
  return { ...reporteValido.dispositivo, ...extra };
}

/** Envía como vecina SIN devolverle el turno: así se ve si un rechazo gastó cupo. */
function enviar(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload,
    cookies: sesion(cookieVecina),
    headers,
  });
}

async function crear(payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  await liberarCuota(ex);
  return enviar(payload, headers);
}

async function cuantosReportes(): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM reporte_inundacion');
  return Number(r.rows[0]!.n);
}

async function turnoGastado(): Promise<boolean> {
  const r = await pool.query<{ gastado: boolean }>(
    'SELECT ultimo_reporte_en IS NOT NULL AS gastado FROM usuario WHERE email = $1',
    [CUENTAS.vecina],
  );
  return r.rows[0]!.gastado;
}

function contadorFueraDeRadio(codigo: string): number {
  const linea = app.metricas
    .exponer()
    .split('\n')
    .find((l) => l.startsWith(`curichi_reportes_fuera_de_radio_total{codigo="${codigo}"}`));
  return linea ? Number(linea.split(' ').pop()) : 0;
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  const cfg = {
    ...leerConfig({ DATABASE_URL: base.url }),
    rutaOpenApi: '/no-existe.yaml',
    rateLimitMax: 1000,
  };
  // El logger de producción, con todo lo que escribe, capturado línea por línea.
  const destino = new Writable({
    write(trozo, _codificacion, listo) {
      lineasDeLog.push(String(trozo));
      listo();
    },
  });
  app = await crearApp({
    pool,
    cfg,
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
    logger: {
      ...opcionesLogger({ salIp: cfg.salIp, produccion: true }),
      level: 'trace',
      stream: destino,
    },
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM auditoria');
  await pool.query('DELETE FROM idempotencia');
  await pool.query('DELETE FROM reporte_inundacion');
  await liberarCuota(ex);
});

describe('revisarDispositivo (función pura)', () => {
  it('en el mismo punto: gps, a 0 m, con la precisión declarada', () => {
    expect(revisarDispositivo(PUNTO, dispositivo({ precision_m: 12.5 }))).toEqual({
      ok: true,
      metodo: 'gps',
      distanciaM: 0,
      precisionM: 12.5,
    });
  });

  it('dentro del margen de error del teléfono es gps; más lejos, manual', () => {
    // Nadie movió el punto: el GPS lo puso en el paso 1 y al enviar la relectura dio 8 m más al
    // norte, dentro de los 10 m que declara el teléfono. Con un corte fijo de 2 m salía manual.
    const conRuido = revisarDispositivo(alNorte(PUNTO, 8), dispositivo({ precision_m: 10 }));
    expect(conRuido).toMatchObject({ ok: true, metodo: 'gps', distanciaM: 8, precisionM: 10 });
    expect(revisarDispositivo(alNorte(PUNTO, 10), dispositivo({ precision_m: 10 }))).toMatchObject({
      ok: true,
      metodo: 'gps',
    });
    expect(revisarDispositivo(alNorte(PUNTO, 12), dispositivo({ precision_m: 10 }))).toMatchObject({
      ok: true,
      metodo: 'manual',
      distanciaM: 12,
    });
  });

  it('con un teléfono muy preciso el margen no baja de 2 m', () => {
    const preciso = dispositivo({ precision_m: 0.5 });
    expect(revisarDispositivo(alNorte(PUNTO, 2), preciso)).toMatchObject({
      ok: true,
      metodo: 'gps',
    });
    expect(revisarDispositivo(alNorte(PUNTO, 3), preciso)).toMatchObject({
      ok: true,
      metodo: 'manual',
      distanciaM: 3,
    });
  });

  it('la tolerancia del radio es la del contrato', () => {
    expect(TOLERANCIA_RADIO_M).toBe(CONFIG_DOMINIO.REPORTE_RADIO_TOLERANCIA_M);
  });

  it('el borde de 60 m entra, con medio metro de tolerancia; 61 m no', () => {
    expect(revisarDispositivo(alNorte(PUNTO, 60), dispositivo())).toMatchObject({
      ok: true,
      distanciaM: 60,
    });
    // Dentro de la tolerancia se guarda el radio, no 61: el punto se acepta como puesto en el borde.
    expect(revisarDispositivo(alNorte(PUNTO, 60.5), dispositivo())).toMatchObject({
      ok: true,
      distanciaM: 60,
    });
    expect(revisarDispositivo(alNorte(PUNTO, 60.6), dispositivo())).toMatchObject({
      ok: false,
      codigo: 'UBICACION_FUERA_DE_RADIO',
    });
    expect(revisarDispositivo(alNorte(PUNTO, 61), dispositivo())).toMatchObject({
      ok: false,
      codigo: 'UBICACION_FUERA_DE_RADIO',
      detalles: { distancia_m: 61, maximo_m: 60 },
    });
  });

  it('precisión: 50 m entra y 50,1 m no', () => {
    expect(revisarDispositivo(PUNTO, dispositivo({ precision_m: 50 })).ok).toBe(true);
    expect(revisarDispositivo(PUNTO, dispositivo({ precision_m: 50.1 }))).toMatchObject({
      ok: false,
      codigo: 'PRECISION_INSUFICIENTE',
    });
  });

  it('antigüedad: 600 s entra y 600,5 s no', () => {
    expect(revisarDispositivo(PUNTO, dispositivo({ antiguedad_s: 600 })).ok).toBe(true);
    expect(revisarDispositivo(PUNTO, dispositivo({ antiguedad_s: 600.5 }))).toMatchObject({
      ok: false,
      codigo: 'POSICION_VENCIDA',
    });
  });

  it('se comprueba en el orden del contrato: precisión, antigüedad y radio', () => {
    const lejos = alNorte(PUNTO, 500);
    expect(
      revisarDispositivo(lejos, dispositivo({ precision_m: 80, antiguedad_s: 900 })),
    ).toMatchObject({ ok: false, codigo: 'PRECISION_INSUFICIENTE' });
    expect(revisarDispositivo(lejos, dispositivo({ antiguedad_s: 900 }))).toMatchObject({
      ok: false,
      codigo: 'POSICION_VENCIDA',
    });
  });

  it('ningún rechazo devuelve la posición del teléfono', () => {
    const r = revisarDispositivo(alNorte(TELEFONO, 70), { ...dispositivo(), ...TELEFONO });
    expect(r.ok).toBe(false);
    const texto = JSON.stringify(r);
    for (const rastro of RASTROS) expect(texto).not.toContain(rastro);
  });
});

describe('POST /reportes: radio, precisión y antigüedad', () => {
  it('a 61 m: 422 UBICACION_FUERA_DE_RADIO, sin reporte, sin cupo gastado y con métrica', async () => {
    const antes = contadorFueraDeRadio('UBICACION_FUERA_DE_RADIO');
    const punto = alNorte(PUNTO, 61);
    const r = await enviar({ ...reporteValido, ...punto });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('UBICACION_FUERA_DE_RADIO');
    expect(r.json().mensaje).toContain('60 m');
    expect(await cuantosReportes()).toBe(0);
    expect(await turnoGastado()).toBe(false);
    expect(contadorFueraDeRadio('UBICACION_FUERA_DE_RADIO')).toBe(antes + 1);
    // El turno sigue ahí: el envío corregido entra sin esperar.
    const bien = await enviar(reporteValido);
    expect(bien.statusCode, bien.body).toBe(201);
  });

  it('a 60 m: se crea, como manual, con la distancia y la precisión guardadas', async () => {
    const punto = alNorte(PUNTO, 60);
    const r = await crear({ ...reporteValido, ...punto, dispositivo: dispositivo() });
    expect(r.statusCode, r.body).toBe(201);
    const fila = await pool.query(
      `SELECT ubicacion_metodo::text, precision_gps_m::float8 AS precision, distancia_dispositivo_m
         FROM reporte_inundacion WHERE id = $1`,
      [r.json().id],
    );
    expect(fila.rows[0]).toEqual({
      ubicacion_metodo: 'manual',
      precision: reporteValido.dispositivo.precision_m,
      distancia_dispositivo_m: 60,
    });
  });

  it('en la posición del teléfono: gps a 0 m, y la vista técnica lo muestra', async () => {
    const r = await crear({ ...reporteValido, dispositivo: dispositivo({ precision_m: 4.5 }) });
    expect(r.statusCode, r.body).toBe(201);
    const tec = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${r.json().id}`,
      cookies: sesion(cookieTecnico),
    });
    expect(tec.statusCode).toBe(200);
    const props = tec.json().properties;
    expect(props.ubicacion_metodo).toBe('gps');
    expect(props.precision_gps_m).toBe(4.5);
    expect(props.distancia_dispositivo_m).toBe(0);
    const estricto = ReporteTecnicoSchema.strict().safeParse(props);
    expect(estricto.success, JSON.stringify(estricto.error?.issues)).toBe(true);
    // La vista pública no lo lleva.
    expect(r.json().properties).not.toHaveProperty('distancia_dispositivo_m');
  });

  it('con precisión de 80 m: 422 PRECISION_INSUFICIENTE (no 400) y sin cupo gastado', async () => {
    const antes = contadorFueraDeRadio('PRECISION_INSUFICIENTE');
    const r = await enviar({ ...reporteValido, dispositivo: dispositivo({ precision_m: 80 }) });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('PRECISION_INSUFICIENTE');
    expect(r.json().mensaje).toContain(`${CONFIG_DOMINIO.PRECISION_DISPOSITIVO_MAX_M} m`);
    expect(await cuantosReportes()).toBe(0);
    expect(await turnoGastado()).toBe(false);
    expect(contadorFueraDeRadio('PRECISION_INSUFICIENTE')).toBe(antes + 1);
  });

  it('con una lectura de hace 11 min: 422 POSICION_VENCIDA y sin cupo gastado', async () => {
    const antes = contadorFueraDeRadio('POSICION_VENCIDA');
    const r = await enviar({ ...reporteValido, dispositivo: dispositivo({ antiguedad_s: 660 }) });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().codigo).toBe('POSICION_VENCIDA');
    expect(await cuantosReportes()).toBe(0);
    expect(await turnoGastado()).toBe(false);
    expect(contadorFueraDeRadio('POSICION_VENCIDA')).toBe(antes + 1);
  });

  it('se comprueba antes de resolver: lejos del teléfono y fuera de cobertura da el 422 del radio', async () => {
    const r = await enviar({ ...reporteValido, lat: -10, lon: -60 });
    expect(r.statusCode).toBe(422);
    expect(r.json().codigo).toBe('UBICACION_FUERA_DE_RADIO');
  });

  it('sin dispositivo: 400 PAYLOAD_INVALIDO que señala el campo', async () => {
    const { dispositivo: _sin, ...sinDispositivo } = reporteValido;
    const r = await enviar(sinDispositivo);
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    expect(r.json().detalles.map((d: { campo: string }) => d.campo)).toContain('dispositivo');
  });

  it('un cliente que todavía manda ubicacion_metodo no decide el método', async () => {
    const r = await crear({
      ...reporteValido,
      ...alNorte(PUNTO, 30),
      ubicacion_metodo: 'gps',
      precision_gps_m: 1,
    });
    expect(r.statusCode, r.body).toBe(201);
    const fila = await pool.query(
      `SELECT ubicacion_metodo::text, precision_gps_m::float8 AS precision
         FROM reporte_inundacion WHERE id = $1`,
      [r.json().id],
    );
    expect(fila.rows[0]).toEqual({
      ubicacion_metodo: 'manual',
      precision: reporteValido.dispositivo.precision_m,
    });
  });
});

describe('idempotencia: dispositivo no entra en la huella', () => {
  it('el reintento con otra antigüedad y otra lectura devuelve el mismo reporte', async () => {
    const clave = 'envio-dispositivo-0001';
    const primera = await crear(reporteValido, { 'idempotency-key': clave });
    expect(primera.statusCode, primera.body).toBe(201);
    const reintento = await enviar(
      {
        ...reporteValido,
        dispositivo: { ...alNorte(PUNTO, 5), precision_m: 20, antiguedad_s: 47 },
      },
      { 'idempotency-key': clave },
    );
    expect(reintento.statusCode, reintento.body).toBe(200);
    expect(reintento.headers['idempotent-replay']).toBe('true');
    expect(reintento.json().id).toBe(primera.json().id);
    expect(await cuantosReportes()).toBe(1);
  });
});

describe('la posición del teléfono no queda en ningún lado', () => {
  it('ni en la fila, ni en la auditoría, ni en la idempotencia, ni en las respuestas, ni en el log', async () => {
    const d = distanciaMetros(PUNTO, TELEFONO);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(60);
    lineasDeLog.length = 0;
    const r = await crear(
      { ...reporteValido, dispositivo: dispositivo(TELEFONO) },
      { 'idempotency-key': 'envio-rastro-000001' },
    );
    expect(r.statusCode, r.body).toBe(201);
    const id = r.json().id as string;
    // Un rechazo también pasa por el log.
    const rechazo = await enviar({
      ...reporteValido,
      ...alNorte(TELEFONO, 70),
      dispositivo: dispositivo(TELEFONO),
    });
    expect(rechazo.statusCode).toBe(422);

    const fila = await pool.query<{ t: string }>(
      'SELECT row_to_json(r)::text AS t FROM reporte_inundacion r WHERE id = $1',
      [id],
    );
    const auditoria = await pool.query<{ t: string }>(
      `SELECT coalesce(json_agg(a), '[]')::text AS t FROM auditoria a WHERE entidad_id = $1`,
      [id],
    );
    const idempotencia = await pool.query<{ t: string }>(
      `SELECT coalesce(json_agg(i), '[]')::text AS t FROM idempotencia i`,
    );
    const tecnico = await app.inject({
      method: 'GET',
      url: `/api/v1/tecnico/reportes/${id}`,
      cookies: sesion(cookieTecnico),
    });
    const exportado = await app.inject({
      method: 'GET',
      url: '/api/v1/exportar?formato=csv',
      cookies: sesion(cookieTecnico),
    });
    expect(tecnico.statusCode).toBe(200);
    expect(exportado.statusCode).toBe(200);
    expect(exportado.body).toContain(id);

    const lugares: Record<string, string> = {
      fila: fila.rows[0]!.t,
      auditoria: auditoria.rows[0]!.t,
      idempotencia: idempotencia.rows[0]!.t,
      'respuesta del POST': r.body,
      'respuesta del 422': rechazo.body,
      'vista técnica': tecnico.body,
      'exportación CSV': exportado.body,
      log: lineasDeLog.join(''),
    };
    // Precondición: el log capturó las dos peticiones, rechazo incluido.
    expect(lineasDeLog.join('')).toContain('reporte rechazado por la ubicación del dispositivo');
    for (const [donde, texto] of Object.entries(lugares))
      for (const rastro of RASTROS)
        expect(texto, `${donde} contiene ${rastro}`).not.toContain(rastro);
    // Lo que sí se guarda: la distancia redondeada.
    expect(tecnico.json().properties.distancia_dispositivo_m).toBe(Math.round(d));
  });

  it('pino oculta body.dispositivo si alguien registra el cuerpo', async () => {
    const lineas: string[] = [];
    const otra = Fastify({
      logger: {
        ...opcionesLogger({ salIp: 'sal', produccion: true }),
        level: 'info',
        stream: new Writable({
          write(trozo, _c, listo) {
            lineas.push(String(trozo));
            listo();
          },
        }),
      },
    });
    await otra.ready();
    const log = otra.log;
    log.info({ body: { ...reporteValido, dispositivo: { ...dispositivo(), ...TELEFONO } } }, 'a');
    log.info({ req: { body: { dispositivo: TELEFONO } } }, 'b');
    log.info({ dispositivo: TELEFONO }, 'c');
    log.info({ payload: { dispositivo: TELEFONO } }, 'd');
    expect(lineas).toHaveLength(4);
    const texto = lineas.join('');
    for (const rastro of RASTROS) expect(texto).not.toContain(rastro);
    // Lo demás del cuerpo sigue ahí para diagnosticar.
    expect(texto).toContain('sumidero_tapado');
    await otra.close();
  });
});
