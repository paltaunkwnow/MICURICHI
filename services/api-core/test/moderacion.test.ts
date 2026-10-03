/**
 * Fusión de duplicados y recálculo de puntos críticos en la moderación (§7.3 y §9.2).
 *
 * El recálculo del entorno se puede forzar a fallar: es lo que pasa en producción cuando la
 * petición espera el advisory lock del recálculo completo del mantenimiento y vence el
 * `statement_timeout`.
 */
import { ejecutorPg, recalcularPuntosCriticos } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import {
  CUENTAS,
  configDePrueba,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  reporteEn,
  resolverDePrueba,
  sesion,
} from './ayudas.js';
import { espiarPool } from './espia-pool.js';

const control = vi.hoisted(() => ({ fallar: false }));

vi.mock('db', async (importOriginal) => {
  const real = await importOriginal<typeof import('db')>();
  return {
    ...real,
    recalcularEntornoDeReporte: (...args: Parameters<typeof real.recalcularEntornoDeReporte>) =>
      control.fallar
        ? Promise.reject(
            Object.assign(new Error('canceling statement due to statement timeout'), {
              code: '57014',
            }),
          )
        : real.recalcularEntornoDeReporte(...args),
  };
});

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let espia: ReturnType<typeof espiarPool>;
let cookieTecnico: string;
let cookieVecina: string;
let idTecnico: string;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  espia = espiarPool(pool);
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await crearApp({
    pool,
    cfg: {
      ...configDePrueba({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      rateLimitMax: 1000,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  const [t] = await ex.consultar<{ id: string }>('SELECT id::text FROM usuario WHERE email = $1', [
    CUENTAS.tecnico,
  ]);
  idTecnico = t!.id;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/** Cada escenario en su propio sitio de la UV A, a más de 25 m del resto (§9.2). */
let sitios = 0;
function sitioNuevo() {
  const i = sitios++;
  return { lon: -63.1995 + 0.0008 * (i % 9), lat: -17.7985 + 0.0015 * Math.floor(i / 9) };
}

async function crear(sitio = sitioNuevo()): Promise<string> {
  await liberarCuota(ex);
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: reporteEn(sitio.lat, sitio.lon),
    cookies: sesion(cookieVecina),
  });
  expect(r.statusCode, r.body.slice(0, 300)).toBe(201);
  return r.json().id;
}

const cambiarEstado = (id: string, payload: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH',
    url: `/api/v1/reportes/${id}/estado`,
    payload,
    cookies: sesion(cookieTecnico),
  });

async function validado(sitio = sitioNuevo()): Promise<string> {
  const id = await crear(sitio);
  const r = await cambiarEstado(id, { estado: 'validado' });
  expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
  return id;
}

const duplicadoDe = (canonico: string) => ({
  estado: 'duplicado',
  estado_motivo: 'Es el mismo charco',
  fusionado_en_id: canonico,
});

async function fila(id: string) {
  const [f] = await ex.consultar<{
    estado: string;
    fusionado_en_id: string | null;
    punto_critico_id: string | null;
  }>(
    'SELECT estado::text, fusionado_en_id::text, punto_critico_id::text FROM reporte_inundacion WHERE id = $1',
    [id],
  );
  return f!;
}

describe('fusión: un reporte nunca queda duplicado de sí mismo', () => {
  it('con el id de la URL en mayúsculas y el canónico en minúsculas → 409 FUSION_CONSIGO_MISMO', async () => {
    const a = await validado();
    const r = await cambiarEstado(a.toUpperCase(), duplicadoDe(a));
    // Antes: 200. La comparación era de texto y «ABC…» no es «abc…».
    expect(r.statusCode, r.body.slice(0, 300)).toBe(409);
    expect(r.json().codigo).toBe('FUSION_CONSIGO_MISMO');
    expect(await fila(a)).toMatchObject({ estado: 'validado', fusionado_en_id: null });
  });

  it('POST /fusionar tampoco lo permite, en mayúsculas o no', async () => {
    const a = await validado();
    for (const url of [a.toUpperCase(), a]) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/v1/reportes/${url}/fusionar`,
        payload: { canonico_id: a, motivo: 'Mismo charco' },
        cookies: sesion(cookieTecnico),
      });
      expect(r.statusCode, url).toBe(409);
      expect(r.json().codigo).toBe('FUSION_CONSIGO_MISMO');
    }
    expect(await fila(a)).toMatchObject({ estado: 'validado', fusionado_en_id: null });
  });

  it('la auditoría guarda el id normalizado aunque la URL venga en mayúsculas', async () => {
    const n = await crear();
    const r = await cambiarEstado(n.toUpperCase(), { estado: 'validado' });
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe(n);
    // `auditoria.entidad_id` es texto: con el id tal cual llegaba, el historial de un mismo
    // reporte quedaba repartido entre dos claves.
    const audit = await ex.consultar<{ entidad_id: string }>(
      `SELECT entidad_id FROM auditoria WHERE lower(entidad_id) = $1 AND accion = 'estado:nuevo->validado'`,
      [n],
    );
    expect(audit.map((x) => x.entidad_id)).toEqual([n]);
  });
});

describe('fusión: el canónico se bloquea y tiene que seguir validado', () => {
  it('A→B y después B→A: la segunda se rechaza y no queda un ciclo', async () => {
    // Forma secuencial de la carrera. PGlite serializa las transacciones de todas las
    // conexiones, así que la simultánea real no se puede provocar aquí: la cubre el bloqueo que
    // comprueba la prueba siguiente.
    const a = await validado();
    const b = await validado();
    expect((await cambiarEstado(a, duplicadoDe(b))).statusCode).toBe(200);
    const vuelta = await cambiarEstado(b, duplicadoDe(a));
    expect(vuelta.statusCode).toBe(409);
    expect(vuelta.json().codigo).toBe('TRANSICION_NO_PERMITIDA');
    expect(await fila(a)).toMatchObject({ estado: 'duplicado', fusionado_en_id: b });
    expect(await fila(b)).toMatchObject({ estado: 'validado', fusionado_en_id: null });
  });

  it('bloquea el reporte y su canónico en la misma sentencia, en orden de id', async () => {
    // Sin bloquear el canónico, dos fusiones cruzadas simultáneas (A→B y B→A) leían cada una al
    // otro todavía validado y las dos se guardaban: un ciclo. Bloqueando en orden de id, la
    // segunda espera a la primera y al despertar ve el canónico ya duplicado.
    const c = await validado();
    const d = await validado();
    espia.reiniciar();
    expect((await cambiarEstado(c, duplicadoDe(d))).statusCode).toBe(200);
    const bloqueo = espia.consultas.find(
      (q) =>
        /FOR UPDATE/i.test(q.sql) &&
        q.params.flat().map(String).includes(c) &&
        q.params.flat().map(String).includes(d),
    );
    expect(bloqueo, 'una sentencia FOR UPDATE con los dos ids').toBeTruthy();
    expect(bloqueo!.sql).toMatch(/ORDER BY id/i);
  });

  it('un canónico resuelto no sirve: tiene que estar validado', async () => {
    const e = await validado();
    const resuelto = await cambiarEstado(e, {
      estado: 'resuelto',
      estado_motivo: 'Se destapó el sumidero',
    });
    expect(resuelto.statusCode).toBe(200);
    const f = await validado();
    const r = await cambiarEstado(f, duplicadoDe(e));
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe('TRANSICION_NO_PERMITIDA');
    expect(await fila(f)).toMatchObject({ estado: 'validado', fusionado_en_id: null });
  });
});

describe('fusión en cadena: X→B y después B→C', () => {
  it('lo que apuntaba a B pasa a apuntar a C en la misma transacción, con su auditoría', async () => {
    const x = await crear();
    const b = await validado();
    const c = await validado();
    expect((await cambiarEstado(x, duplicadoDe(b))).statusCode).toBe(200);
    expect((await cambiarEstado(b, duplicadoDe(c))).statusCode).toBe(200);
    // Antes X quedaba apuntando a B, que ya es un duplicado.
    expect(await fila(x)).toMatchObject({ estado: 'duplicado', fusionado_en_id: c });
    expect(await fila(b)).toMatchObject({ estado: 'duplicado', fusionado_en_id: c });
    const audit = await ex.consultar<{
      actor_id: string;
      antes: Record<string, unknown>;
      despues: Record<string, unknown>;
    }>(
      `SELECT actor_id::text, antes, despues FROM auditoria
        WHERE entidad = 'reporte' AND entidad_id = $1 AND accion = 'fusion:reapuntar'`,
      [x],
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_id: idTecnico,
      antes: { fusionado_en_id: b },
      despues: { fusionado_en_id: c },
    });
  });

  it('fusionar con ID corto de 8 caracteres resuelve el UUID canónico correctamente', async () => {
    const sitio = sitioNuevo();
    const can = await validado(sitio);
    const dup = await validado({ lon: sitio.lon + 0.00005, lat: sitio.lat });
    const corto = can.slice(0, 8);
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/reportes/${dup}/fusionar`,
      payload: { canonico_id: corto, motivo: 'Duplicado con ID corto' },
      cookies: sesion(cookieTecnico),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().properties.estado).toBe('duplicado');
    expect(r.json().properties.fusionado_en_id).toBe(can);
  });
});

describe('si el recálculo de puntos críticos falla, la moderación no', () => {
  afterEach(() => {
    control.fallar = false;
  });

  /** El mismo criterio con el que el mantenimiento busca trabajo pendiente (mantenimiento.ts). */
  async function pendienteParaMantenimiento(id: string) {
    const [f] = await ex.consultar<{ pendiente: boolean }>(
      `SELECT (estado IN ('validado','resuelto') AND punto_critico_id IS NULL) AS pendiente
         FROM reporte_inundacion WHERE id = $1`,
      [id],
    );
    return f!.pendiente;
  }

  const fallosContados = () =>
    Number(
      /curichi_puntos_criticos_fallos_total\{[^}]*\} (\d+)/.exec(app.metricas.exponer())?.[1] ?? 0,
    );

  it('validar responde 200, se registra y el reporte queda pendiente para el mantenimiento', async () => {
    const n = await crear();
    const antes = fallosContados();
    control.fallar = true;
    const r = await cambiarEstado(n, { estado: 'validado' });
    // Antes: 500, con el cambio ya guardado.
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    expect(r.json().properties.estado).toBe('validado');
    expect(await pendienteParaMantenimiento(n)).toBe(true);
    expect(fallosContados()).toBe(antes + 1);
  });

  it('sacar un reporte de su punto crítico: el punto se disuelve y el compañero queda pendiente', async () => {
    const sitio = sitioNuevo();
    const p = await validado(sitio);
    const q = await validado({ lon: sitio.lon + 0.00005, lat: sitio.lat });
    const pc = (await fila(p)).punto_critico_id;
    expect(pc).toBeTruthy();
    expect((await fila(q)).punto_critico_id).toBe(pc);

    control.fallar = true;
    const r = await cambiarEstado(q, duplicadoDe(p));
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    // El punto de dos reportes ya no existe tal cual: se retira en vez de quedar con datos viejos.
    expect(await ex.consultar('SELECT 1 FROM punto_critico WHERE id = $1', [pc])).toHaveLength(0);
    expect(await pendienteParaMantenimiento(p)).toBe(true);

    // Lo que hace el mantenimiento cuando lo encuentra: reconstruir, ya sin Q.
    control.fallar = false;
    await recalcularPuntosCriticos(ejecutorPg(pool));
    const [despues] = await ex.consultar<{ n_reportes: number }>(
      `SELECT pc.n_reportes FROM reporte_inundacion r JOIN punto_critico pc ON pc.id = r.punto_critico_id
        WHERE r.id = $1`,
      [p],
    );
    expect(despues?.n_reportes).toBe(1);
  });

  it('reclasificar la severidad: 200 y el punto del reporte queda para el mantenimiento', async () => {
    const s = await validado();
    expect((await fila(s)).punto_critico_id).toBeTruthy();
    control.fallar = true;
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${s}/severidad`,
      payload: { severidad_manual: 'critica', severidad_motivo: 'Inspección en campo' },
      cookies: sesion(cookieTecnico),
    });
    expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    expect(r.json().properties.severidad).toBe('critica');
    expect(await pendienteParaMantenimiento(s)).toBe(true);
  });
});
