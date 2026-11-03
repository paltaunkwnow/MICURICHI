/** M10.1: lectura canónica y convivencia HTTP, solo PGlite y fixtures sintéticos. */
import { Writable } from 'node:stream';
import { ejecutorPg } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import * as consultas from '../src/consultas.js';
import { claveDeCuenta } from '../src/idempotencia.js';
import { opcionesLogger } from '../src/registro.js';
import {
  type FilaReporte,
  SELECT_REPORTE,
  vistaMiReporte,
  vistaPublica,
  vistaTecnica,
} from '../src/vistas.js';
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
import { espiarPool } from './espia-pool.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let cookie: string;
let idFixture: string;
const logs: string[] = [];
const campos = [
  'profundidad_estimada',
  'frecuencia',
  'causa_presunta',
  'sumidero_cercano',
  'sumidero_estado',
  'agua_brota_sumidero',
] as const;
const dominio = {
  profundidad_estimada: 'muslo',
  frecuencia: 'permanente',
  causa_presunta: 'colector_saturado',
};

async function aplicacion() {
  const cfg = {
    ...configDePrueba({
      DATABASE_URL: base.url,
      REPORTE_DEMORA_PRIMERO_S: '60',
      REPORTE_DEMORA_SIGUIENTES_S: '240',
    }),
    rutaOpenApi: '/no-existe.yaml',
    rateLimitMax: 1000,
  };
  return crearApp({
    pool,
    cfg,
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
    logger: {
      ...opcionesLogger({ salIp: cfg.salIp, produccion: true }),
      stream: new Writable({
        write(chunk, _encoding, done) {
          logs.push(String(chunk));
          done();
        },
      }),
    },
  });
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  const ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  idFixture = await insertarReporte(ex, -63.195, -17.79);
  app = await aplicacion();
  cookie = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

/**
 * Sustituye SOLO la fila leída mediante un CTE: permite discrepar del espejo físico sin
 * desactivar triggers, cambiar el esquema ni escribir JSON inválido en la base de prueba.
 */
async function leerDetalle(detalle: Record<string, unknown>, categoria = 'inundacion') {
  const r = await pool.query<FilaReporte>(
    `WITH reporte AS (
       SELECT p.* FROM public.reporte original
       CROSS JOIN LATERAL jsonb_populate_record(NULL::public.reporte,
         to_jsonb(original) || jsonb_build_object('detalle', $2::jsonb, 'categoria', $3::text)) p
       WHERE original.id = $1
     ) ${SELECT_REPORTE} WHERE r.id = $1`,
    [idFixture, JSON.stringify(detalle), categoria],
  );
  return r.rows[0]!;
}

describe('M10.1: el SELECT toma los seis alias de detalle', () => {
  it('no lee ninguna de las seis columnas físicas ni restringe la tabla a inundación', () => {
    for (const campo of campos) expect(SELECT_REPORTE).not.toContain(`r.${campo}`);
    expect(SELECT_REPORTE).toContain('FROM reporte r');
    expect(SELECT_REPORTE).not.toMatch(/WHERE\s+r\.categoria/);
  });

  it.each([false, true, null, undefined])('conserva booleano/null/ausente: %s', async (agua) => {
    const opcionales =
      agua === undefined
        ? {}
        : { sumidero_cercano: 'si', sumidero_estado: 'tapado', agua_brota_sumidero: agua };
    const detalle = { ...dominio, ...opcionales, reservado: 'solo técnico y autor' };
    const f = await leerDetalle(detalle);
    const esperado = { ...dominio, ...opcionales } as Record<string, unknown>;
    for (const campo of campos) expect(f[campo], campo).toBe(esperado[campo] ?? null);
    const publico = vistaPublica(f, '', 'sal-sintetica');
    const tecnico = vistaTecnica(f, '');
    const propio = vistaMiReporte(f, '');
    expect(publico.props.detalle).toEqual(dominio);
    expect(publico.props.profundidad_estimada).toBe('muslo');
    expect(tecnico.props.detalle).toEqual(detalle);
    expect(propio.props.detalle).toEqual(detalle);
    expect(tecnico.props.agua_brota_sumidero).toBe(agua ?? null);
    for (const vista of [publico, propio]) {
      expect(vista.props).not.toHaveProperty('agua_brota_sumidero');
      expect(vista.props).not.toHaveProperty('autor_id');
    }
  });

  it('NULL explícito y ausencia producen alias NULL sin alterar el detalle', async () => {
    for (const detalle of [{}, Object.fromEntries(campos.map((c) => [c, null]))]) {
      const f = await leerDetalle(detalle);
      for (const campo of campos) expect(f[campo], campo).toBeNull();
      expect(vistaTecnica(f, '').props.detalle).toEqual(detalle);
    }
  });

  it.each(['bache', 'basura', 'area_verde'])(
    '%s no fabrica campos planos de agua aunque el JSON contenga claves homónimas',
    async (categoria) => {
      const f = await leerDetalle({ ...dominio, agua_brota_sumidero: 'no es booleano' }, categoria);
      for (const campo of campos) expect(f[campo], campo).toBeNull();
      expect(vistaTecnica(f, '').props.detalle).toEqual(f.detalle);
    },
  );
});

function porDetalle() {
  const { profundidad_estimada, frecuencia, causa_presunta, ...nucleo } = reporteValido;
  return {
    ...nucleo,
    categoria: 'inundacion',
    detalle: { profundidad_estimada, frecuencia, causa_presunta },
  };
}

function eventos() {
  return logs
    .flatMap((linea) =>
      linea
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l)),
    )
    .filter((l) => l.evento === 'compatibilidad_reporte') as Array<Record<string, unknown>>;
}

describe('M10.1: instrumentación finita y compatibilidad de creación', () => {
  it('plana → replay por detalle mantiene demora, cupo y auditoría; no filtra datos', async () => {
    await liberarCuota(ejecutorPg(pool));
    logs.length = 0;
    const contar = vi.spyOn(app.metricas, 'contar');
    try {
      const headers = {
        'idempotency-key': 'm10-clave-sintetica',
        'x-curichi-origen': 'sintetico',
        'x-curichi-sintetico': '1',
        authorization: 'Bearer secreto-que-no-debe-registrarse',
      };
      const a = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        cookies: sesion(cookie),
        headers,
        payload: reporteValido,
      });
      const b = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        cookies: sesion(cookie),
        headers,
        payload: porDetalle(),
      });
      expect(a.statusCode, a.body).toBe(201);
      expect(b.statusCode, b.body).toBe(200);
      expect(b.headers['idempotent-replay']).toBe('true');
      expect(b.json().id).toBe(a.json().id);
      expect(b.json().properties.publicar_en).toBe(a.json().properties.publicar_en);
      expect(a.json().properties.segundos_para_publicar).toBeGreaterThan(0);
      expect(a.json().properties.segundos_para_publicar).toBeLessThanOrEqual(60);
      expect(b.json().properties.segundos_para_publicar).toBeLessThanOrEqual(
        a.json().properties.segundos_para_publicar,
      );
      const { rows: auditoria } = await pool.query(
        'SELECT despues FROM auditoria WHERE entidad_id = $1 AND accion = $2',
        [a.json().id, 'crear'],
      );
      expect(auditoria).toHaveLength(1);
      expect(auditoria[0].despues.publicar_en).toBe(a.json().properties.publicar_en);
      const { rows: cupo } = await pool.query(
        "SELECT n FROM cupo_contador WHERE clave = 'reportes:inundacion'",
      );
      expect(cupo.map((c) => c.n)).toEqual([1]);
      expect(eventos()).toHaveLength(2);
      const etiquetas = [
        { forma: 'plana', resultado: 'aceptado', origen: 'entorno_prueba' },
        { forma: 'categoria', resultado: 'replay', origen: 'entorno_prueba' },
      ];
      expect(
        contar.mock.calls.filter(([nombre]) => nombre === 'curichi_reportes_forma_total'),
      ).toEqual(etiquetas.map((e) => ['curichi_reportes_forma_total', e]));
      for (let i = 0; i < eventos().length; i++) {
        const { level, time, pid, hostname, reqId, msg, ...evento } = eventos()[i]!;
        expect(evento).toEqual({ evento: 'compatibilidad_reporte', ...etiquetas[i] });
        expect(msg).toBe('compatibilidad de creación de reportes');
        expect(typeof reqId).toBe('string');
        expect([level, time, pid].every((v) => typeof v === 'number')).toBe(true);
        expect(typeof hostname).toBe('string');
      }
      const instrumentacion = JSON.stringify(eventos());
      for (const sensible of [
        a.json().id,
        reporteValido.descripcion,
        '-17.79',
        '-63.195',
        CUENTAS.vecina,
        cookie,
        headers.authorization,
        headers['idempotency-key'],
      ])
        expect(instrumentacion).not.toContain(sensible);
      expect(instrumentacion).not.toMatch(
        /dispositivo|precision_m|antiguedad_s|autor|correo|email|ipHash|remoteAddress|payload|body/,
      );
    } finally {
      contar.mockRestore();
    }
  });

  it('rechazos y conflictos no se registran como aceptado ni replay', async () => {
    logs.length = 0;
    const contar = vi.spyOn(app.metricas, 'contar');
    try {
      const invalido = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        cookies: sesion(cookie),
        payload: {},
      });
      expect(invalido.statusCode).toBe(400);
      const conflicto = await app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        cookies: sesion(cookie),
        headers: { 'idempotency-key': 'm10-clave-sintetica' },
        payload: {
          ...reporteValido,
          descripcion: 'Otra descripción sintética para producir conflicto.',
        },
      });
      expect(conflicto.statusCode).toBe(409);
      expect(eventos()).toEqual([]);
      expect(
        contar.mock.calls.filter(([nombre]) => nombre === 'curichi_reportes_forma_total'),
      ).toEqual([]);
    } finally {
      contar.mockRestore();
    }
  });

  it.each(['development', 'production'])(
    '%s queda sin clasificar aunque el cliente envíe headers de supuesto tráfico sintético',
    async (entorno) => {
      let otra: FastifyInstance | undefined;
      vi.stubEnv('NODE_ENV', entorno);
      try {
        otra = await aplicacion();
      } finally {
        vi.unstubAllEnvs();
      }
      try {
        await liberarCuota(ejecutorPg(pool));
        logs.length = 0;
        const r = await otra.inject({
          method: 'POST',
          url: '/api/v1/reportes',
          cookies: sesion(cookie),
          headers: { 'x-curichi-origen': 'sintetico', 'x-curichi-sintetico': '1' },
          payload: porDetalle(),
        });
        expect(r.statusCode, r.body).toBe(201);
        expect(eventos()).toHaveLength(1);
        expect(eventos()[0]).toMatchObject({
          forma: 'categoria',
          resultado: 'aceptado',
          origen: 'no_clasificado',
        });
      } finally {
        await otra.close();
      }
    },
  );
});

describe('RF-01: huella validada y compatibilidad histórica de causa desconocida', () => {
  type Forma = 'plana' | 'categoria';
  // Capturadas del runtime previo al fix: dos POST 201 reales en PGlite, no hashes del código nuevo.
  // Evidencia: .turbo/m10-2026-10-26/rf01/implementador/huellas-historicas-reales.json.
  const huellasHistoricas = {
    plana: '406b16ad855c797889584883e6e94eeabe14ab5c2e9b425d6261b3489d0c0f47',
    categoria: '4f10c53aa89255e70e095f3ed69db4c3ae795406b40aa464196fa461fbff059e',
  };
  const formas: Forma[] = ['plana', 'categoria'];
  const combinaciones = formas.flatMap((primera) =>
    [false, true].flatMap((causaPrimera) =>
      [false, true].map((causaSegunda) => ({ primera, causaPrimera, causaSegunda })),
    ),
  );
  let autorId: string;
  let vecinoId: string;
  let cookieVecino: string;
  let secuencia = 0;
  let espia: ReturnType<typeof espiarPool>;
  let inicio: Awaited<ReturnType<typeof conteos>>;

  beforeAll(async () => {
    const usuarios = await pool.query<{ id: string; email: string }>(
      'SELECT id::text, email FROM usuario WHERE email = ANY($1::text[])',
      [[CUENTAS.vecina, CUENTAS.vecino]],
    );
    autorId = usuarios.rows.find((u) => u.email === CUENTAS.vecina)!.id;
    vecinoId = usuarios.rows.find((u) => u.email === CUENTAS.vecino)!.id;
    cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
    await pool.query("UPDATE categoria SET activa = true WHERE slug = 'bache'");
    app.categorias.invalidar();
    espia = espiarPool(pool);
  });

  beforeEach(async () => {
    await liberarCuota(ejecutorPg(pool));
    await liberarCuota(ejecutorPg(pool), CUENTAS.vecino);
    inicio = await conteos();
    logs.length = 0;
  });

  function cuerpo(forma: Forma, causaExplicita: boolean): Record<string, unknown> {
    const { causa_presunta: _causa, profundidad_estimada, frecuencia, ...nucleo } = reporteValido;
    const causa = causaExplicita ? { causa_presunta: 'desconocida' } : {};
    return forma === 'plana'
      ? { ...nucleo, profundidad_estimada, frecuencia, ...causa }
      : {
          ...nucleo,
          categoria: 'inundacion',
          detalle: { profundidad_estimada, frecuencia, ...causa },
        };
  }

  function nuevaClave() {
    return `rf01-sintetica-${++secuencia}`;
  }

  function enviar(payload: Record<string, unknown>, clave?: string, otraCookie = cookie) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(otraCookie),
      headers: clave ? { 'idempotency-key': clave } : {},
      payload,
    });
  }

  async function conteos() {
    const r = await pool.query<{ reportes: number; auditoria: number; claves: number }>(`SELECT
      (SELECT count(*)::int FROM reporte) AS reportes,
      (SELECT count(*)::int FROM auditoria WHERE entidad = 'reporte' AND accion = 'crear') AS auditoria,
      (SELECT count(*)::int FROM idempotencia) AS claves`);
    return r.rows[0]!;
  }

  async function leerClave(clave: string, usuarioId = autorId) {
    const r = await pool.query<{
      huella: string;
      reporte_id: string | null;
      creado_en: string;
    }>('SELECT huella, reporte_id::text, creado_en::text FROM idempotencia WHERE clave = $1', [
      claveDeCuenta(usuarioId, clave),
    ]);
    return r.rows[0]!;
  }

  async function sembrarAnterior(clave: string, forma: Forma, horas = 2, deVecino = false) {
    const a = await enviar(cuerpo(forma, false), undefined, deVecino ? cookieVecino : cookie);
    expect(a.statusCode, a.body).toBe(201);
    // Fila sintética PREEXISTENTE con la huella real antigua y su antigüedad: se inserta una vez.
    // Ningún UPDATE/DELETE transforma una clave vigente para conseguir el replay.
    await pool.query(
      `INSERT INTO idempotencia (clave, huella, reporte_id, creado_en)
       VALUES ($1, $2, $3, now() - ($4::text || ' hours')::interval)`,
      [
        claveDeCuenta(deVecino ? vecinoId : autorId, clave),
        huellasHistoricas[forma],
        a.json().id,
        horas,
      ],
    );
    return a;
  }

  async function comprobarUnaCreacion() {
    expect(await conteos()).toEqual({
      reportes: inicio.reportes + 1,
      auditoria: inicio.auditoria + 1,
      claves: inicio.claves + 1,
    });
    const cupos = await pool.query(
      "SELECT clave, n FROM cupo_contador WHERE usuario_id = $1 AND clave LIKE 'reportes:%'",
      [autorId],
    );
    expect(cupos.rows).toEqual([{ clave: 'reportes:inundacion', n: 1 }]);
  }

  async function comprobarReplay(caso: (typeof combinaciones)[number], historica: boolean) {
    const clave = nuevaClave();
    const segunda: Forma = caso.primera === 'plana' ? 'categoria' : 'plana';
    const contar = vi.spyOn(app.metricas, 'contar');
    try {
      const a = historica
        ? await sembrarAnterior(clave, caso.primera)
        : await enviar(cuerpo(caso.primera, caso.causaPrimera), clave);
      expect(a.statusCode, a.body).toBe(201);
      const previa = await leerClave(clave);
      const payload = {
        ...cuerpo(segunda, caso.causaSegunda),
        dispositivo: { lat: -17.79001, lon: -63.19501, precision_m: 9, antiguedad_s: 4 },
      };
      espia.reiniciar();
      const b = await enviar(payload, clave);
      expect(b.statusCode, b.body).toBe(200);
      expect(b.headers['idempotent-replay']).toBe('true');
      expect(b.json().id).toBe(a.json().id);
      expect(b.json().properties.detalle.causa_presunta).toBe('desconocida');
      expect(b.json().properties.publicar_en).toBe(a.json().properties.publicar_en);
      expect(b.json().properties.segundos_para_publicar).toBeLessThanOrEqual(
        a.json().properties.segundos_para_publicar,
      );
      // Una sola conexión y transacción; solo la variante antigua sin causa necesita el 2.º intento.
      const consultasTx = espia.consultas.map((c) => c.sql);
      const inicioTx = consultasTx.indexOf('BEGIN');
      const finTx = consultasTx.indexOf('ROLLBACK');
      expect(inicioTx).toBeGreaterThanOrEqual(0);
      expect(finTx).toBeGreaterThan(inicioTx);
      const tx = consultasTx.slice(inicioTx, finTx + 1);
      expect(tx.filter((s) => /FOR UPDATE/.test(s))).toHaveLength(
        historica && caso.primera === 'categoria' ? 2 : 1,
      );
      expect(tx.filter((s) => /^(?:BEGIN|ROLLBACK)$/.test(s))).toEqual(['BEGIN', 'ROLLBACK']);
      expect(
        tx.some((s) => /(?:UPDATE|DELETE FROM) idempotencia|INSERT INTO cupo_contador/.test(s)),
      ).toBe(false);
      expect(espia.maxEnUso).toBe(1);
      expect(await leerClave(clave)).toEqual(previa);
      if (!historica) expect(previa.huella).toBe(huellasHistoricas.plana);
      await comprobarUnaCreacion();
      const etiquetas = [
        { forma: caso.primera, resultado: 'aceptado', origen: 'entorno_prueba' },
        { forma: segunda, resultado: 'replay', origen: 'entorno_prueba' },
      ];
      expect(contar.mock.calls.filter(([n]) => n === 'curichi_reportes_forma_total')).toEqual(
        etiquetas.map((e) => ['curichi_reportes_forma_total', e]),
      );
      expect(
        eventos().map(({ forma, resultado, origen }) => ({ forma, resultado, origen })),
      ).toEqual(etiquetas);
    } finally {
      contar.mockRestore();
    }
  }

  it.each(combinaciones)(
    'nueva $primera → opuesta, causa explícita $causaPrimera/$causaSegunda',
    async (caso) => comprobarReplay(caso, false),
  );

  it.each(
    formas.flatMap((primera) =>
      [false, true].map((causaSegunda) => ({ primera, causaPrimera: false, causaSegunda })),
    ),
  )('preexistente $primera → opuesta, causa explícita de reintento $causaSegunda', async (caso) =>
    comprobarReplay(caso, true),
  );

  const cambios = [
    {
      campo: 'causa real',
      cambio: {
        detalle: {
          profundidad_estimada: 'rodilla',
          frecuencia: 'cada_lluvia_fuerte',
          causa_presunta: 'sumidero_tapado',
        },
      },
    },
    {
      campo: 'descripción',
      cambio: { descripcion: 'Una descripción sintética diferente para rechazar el replay.' },
    },
    { campo: 'coordenada', cambio: { lat: -17.79001 } },
    {
      campo: 'categoría',
      cambio: {
        categoria: 'bache',
        subtipo: 'bache',
        detalle: { gravedad_declarada: 'se_puede_pasar', tamano: 'plato' },
      },
    },
  ];
  it.each(formas.flatMap((historia) => cambios.map((c) => ({ historia, ...c }))))(
    'preexistente $historia rechaza cambio de $campo',
    async ({ historia, cambio }) => {
      const clave = nuevaClave();
      await sembrarAnterior(clave, historia);
      const previa = await leerClave(clave);
      logs.length = 0;
      const contar = vi.spyOn(app.metricas, 'contar');
      try {
        const r = await enviar({ ...cuerpo('categoria', false), ...cambio }, clave);
        expect(r.statusCode, r.body).toBe(409);
        expect(r.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
        expect(r.headers['idempotent-replay']).toBeUndefined();
        expect(await leerClave(clave)).toEqual(previa);
        await comprobarUnaCreacion();
        expect(eventos()).toEqual([]);
        expect(contar.mock.calls.filter(([n]) => n === 'curichi_reportes_forma_total')).toEqual([]);
      } finally {
        contar.mockRestore();
      }
    },
  );

  it.each(['sumidero_tapado', 'colector_saturado'])(
    'una causa real previa %s no equivale a desconocida',
    async (causa_presunta) => {
      const clave = nuevaClave();
      const a = await enviar({ ...cuerpo('plana', true), causa_presunta }, clave);
      expect(a.statusCode).toBe(201);
      const previa = await leerClave(clave);
      const b = await enviar(cuerpo('categoria', false), clave);
      expect(b.statusCode, b.body).toBe(409);
      expect(b.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
      expect(await leerClave(clave)).toEqual(previa);
      await comprobarUnaCreacion();
    },
  );

  it('no acepta una huella arbitraria aunque la causa sea desconocida', async () => {
    const clave = nuevaClave();
    const a = await enviar(cuerpo('categoria', false));
    expect(a.statusCode).toBe(201);
    await pool.query('INSERT INTO idempotencia (clave, huella, reporte_id) VALUES ($1, $2, $3)', [
      claveDeCuenta(autorId, clave),
      '0'.repeat(64),
      a.json().id,
    ]);
    const previa = await leerClave(clave);
    const r = await enviar(cuerpo('plana', true), clave);
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
    expect(await leerClave(clave)).toEqual(previa);
    await comprobarUnaCreacion();
  });

  it('una clave histórica caducada a las 25 h crea otro reporte y usa la huella validada', async () => {
    const clave = nuevaClave();
    const a = await sembrarAnterior(clave, 'categoria', 25);
    const previa = await leerClave(clave);
    const b = await enviar(cuerpo('categoria', false), clave);
    expect(b.statusCode, b.body).toBe(201);
    expect(b.json().id).not.toBe(a.json().id);
    const actual = await leerClave(clave);
    expect(actual.huella).toBe(huellasHistoricas.plana);
    expect(actual.creado_en).not.toBe(previa.creado_en);
    expect(actual.reporte_id).toBe(b.json().id);
    expect(await conteos()).toEqual({
      reportes: inicio.reportes + 2,
      auditoria: inicio.auditoria + 2,
      claves: inicio.claves + 1,
    });
    const cupo = await pool.query(
      "SELECT n FROM cupo_contador WHERE usuario_id = $1 AND clave = 'reportes:inundacion'",
      [autorId],
    );
    expect(cupo.rows).toEqual([{ n: 2 }]);
  });

  it('la misma clave histórica de otra cuenta no se recupera ni se modifica', async () => {
    const clave = nuevaClave();
    const a = await sembrarAnterior(clave, 'categoria', 2, true);
    const previa = await leerClave(clave, vecinoId);
    const b = await enviar(cuerpo('plana', false), clave);
    expect(b.statusCode, b.body).toBe(201);
    expect(b.json().id).not.toBe(a.json().id);
    expect(await leerClave(clave, vecinoId)).toEqual(previa);
    expect(await conteos()).toEqual({
      reportes: inicio.reportes + 2,
      auditoria: inicio.auditoria + 2,
      claves: inicio.claves + 2,
    });
    const cupos = await pool.query(
      "SELECT n FROM cupo_contador WHERE usuario_id = ANY($1::uuid[]) AND clave = 'reportes:inundacion'",
      [[autorId, vecinoId]],
    );
    expect(cupos.rows).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it.each(['ENVIO_EN_CURSO', 'CLAVE_IDEMPOTENCIA_HUERFANA'])(
    'la huella antigua conserva %s sin crear, gastar cupo ni contar replay',
    async (codigo) => {
      const clave = nuevaClave();
      if (codigo === 'ENVIO_EN_CURSO') {
        await pool.query('INSERT INTO idempotencia (clave, huella) VALUES ($1, $2)', [
          claveDeCuenta(autorId, clave),
          huellasHistoricas.categoria,
        ]);
      } else {
        await sembrarAnterior(clave, 'categoria');
      }
      const previa = await leerClave(clave);
      const conteosPrevios = await conteos();
      logs.length = 0;
      // La FK impide fabricar huérfanas en SQL: se simula únicamente la lectura ausente.
      const lectura =
        codigo === 'CLAVE_IDEMPOTENCIA_HUERFANA'
          ? vi.spyOn(consultas, 'obtenerReporte').mockResolvedValueOnce(null)
          : undefined;
      const contar = vi.spyOn(app.metricas, 'contar');
      try {
        const r = await enviar(cuerpo('plana', true), clave);
        expect(r.statusCode, r.body).toBe(409);
        expect(r.json().codigo).toBe(codigo);
        expect(r.headers['idempotent-replay']).toBeUndefined();
        expect(await leerClave(clave)).toEqual(previa);
        expect(await conteos()).toEqual(conteosPrevios);
        const cupo = await pool.query(
          "SELECT n FROM cupo_contador WHERE usuario_id = $1 AND clave = 'reportes:inundacion'",
          [autorId],
        );
        expect(cupo.rows).toEqual(codigo === 'ENVIO_EN_CURSO' ? [] : [{ n: 1 }]);
        expect(eventos()).toEqual([]);
        expect(contar.mock.calls.filter(([n]) => n === 'curichi_reportes_forma_total')).toEqual([]);
      } finally {
        lectura?.mockRestore();
        contar.mockRestore();
      }
    },
  );
});

describe('M10 final: INSERT JSON conserva el almacenamiento y los 25 parámetros', () => {
  const opcionales = [
    { nombre: 'ausentes', entrada: {}, persistido: {} },
    {
      nombre: 'NULL omitidos',
      entrada: { sumidero_cercano: null, sumidero_estado: null, agua_brota_sumidero: null },
      persistido: {},
    },
    {
      nombre: 'false conservado',
      entrada: { sumidero_cercano: 'si', sumidero_estado: 'tapado', agua_brota_sumidero: false },
      persistido: { sumidero_cercano: 'si', sumidero_estado: 'tapado', agua_brota_sumidero: false },
    },
    {
      nombre: 'true conservado',
      entrada: { sumidero_cercano: 'si', sumidero_estado: 'no_tapado', agua_brota_sumidero: true },
      persistido: {
        sumidero_cercano: 'si',
        sumidero_estado: 'no_tapado',
        agua_brota_sumidero: true,
      },
    },
  ];
  const casos = ['plana', 'categoria'].flatMap((forma) =>
    opcionales.map((opcional) => ({ forma, ...opcional })),
  );
  let espiaWriter: ReturnType<typeof espiarPool>;

  beforeAll(() => {
    espiaWriter = espiarPool(pool);
  });

  it.each(casos)('$forma: $nombre', async ({ forma, entrada, persistido }) => {
    await liberarCuota(ejecutorPg(pool));
    const detalle = {
      profundidad_estimada: reporteValido.profundidad_estimada,
      frecuencia: reporteValido.frecuencia,
      causa_presunta: reporteValido.causa_presunta,
      ...persistido,
    };
    const payload =
      forma === 'plana'
        ? { ...reporteValido, ...entrada }
        : { ...porDetalle(), detalle: { ...porDetalle().detalle, ...entrada } };
    espiaWriter.reiniciar();
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(cookie),
      payload,
    });
    expect(respuesta.statusCode, respuesta.body).toBe(201);
    const id = respuesta.json().id as string;
    const inserciones = espiaWriter.consultas.filter(({ sql }) =>
      /^INSERT INTO reporte\s*\(/.test(sql),
    );
    expect(inserciones).toHaveLength(1);
    const insercion = inserciones[0]!;
    expect(insercion.params).toHaveLength(25);
    const columnas = insercion.sql.match(/^INSERT INTO reporte\s*\(([\s\S]*?)\)\s*VALUES/)!;
    expect(columnas).not.toBeNull();
    for (const campo of campos) expect(columnas[1]).not.toMatch(new RegExp(`\\b${campo}\\b`));

    const { rows } = await pool.query<{
      autor_id: string;
      ip_hash: string;
      detalle: Record<string, unknown>;
      detalle_version: number;
      lon: number;
      lat: number;
      lon_publico: number;
      lat_publico: number;
      demora_s: number;
    }>(
      `SELECT autor_id::text, ip_hash, detalle, detalle_version,
              ST_X(geom) AS lon, ST_Y(geom) AS lat,
              ST_X(geom_publico) AS lon_publico, ST_Y(geom_publico) AS lat_publico,
              extract(epoch FROM publicar_en - creado_en)::int AS demora_s
         FROM reporte WHERE id = $1 AND categoria = 'inundacion'`,
      [id],
    );
    const fila = rows[0]!;
    expect(fila.detalle).toEqual(detalle);
    expect(fila.detalle_version).toBe(1);
    expect([fila.lon, fila.lat, fila.lon_publico, fila.lat_publico]).toEqual([
      reporteValido.lon,
      reporteValido.lat,
      reporteValido.lon,
      reporteValido.lat,
    ]);
    expect(fila.demora_s).toBe(60);
    expect(insercion.params).toEqual([
      reporteValido.lon,
      reporteValido.lat,
      null,
      fila.autor_id,
      'distrito_municipal:01',
      'unidad_vecinal:A',
      'test',
      JSON.stringify({
        en_limite: false,
        asignado_por_proximidad: false,
        distancia_m: null,
        distrito_discrepante: false,
      }),
      'gps',
      reporteValido.dispositivo.precision_m,
      reporteValido.ubicacion_tipo,
      reporteValido.descripcion,
      'inundacion',
      null,
      expect.any(String),
      1,
      'media',
      7,
      2,
      fila.ip_hash,
      reporteValido.lon,
      reporteValido.lat,
      id,
      0,
      60,
    ]);
    expect(JSON.parse(insercion.params[14] as string)).toEqual(detalle);
    expect(respuesta.json().properties.detalle).toEqual(detalle);
    const tecnico = vistaTecnica(await leerDetalle(detalle), '');
    expect(tecnico.props.agua_brota_sumidero).toBe(persistido.agua_brota_sumidero ?? null);
  });

  it('omitir NULL del almacenamiento no transforma la huella ni equipara payloads distintos', async () => {
    await liberarCuota(ejecutorPg(pool));
    const headers = { 'idempotency-key': 'm10-json-opcionales-null' };
    const payload = {
      ...reporteValido,
      sumidero_cercano: null,
      sumidero_estado: null,
      agua_brota_sumidero: null,
    };
    const crear = (cuerpo: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/reportes',
        cookies: sesion(cookie),
        headers,
        payload: cuerpo,
      });
    const primera = await crear(payload);
    expect(primera.statusCode, primera.body).toBe(201);
    const id = primera.json().id;
    const clave = await pool.query(
      'SELECT clave, huella, reporte_id::text, creado_en FROM idempotencia WHERE reporte_id = $1',
      [id],
    );
    expect(clave.rows).toHaveLength(1);
    const replay = await crear(payload);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.json().id).toBe(id);
    const distinto = await crear(reporteValido);
    expect(distinto.statusCode, distinto.body).toBe(409);
    expect(distinto.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
    const despues = await pool.query(
      'SELECT clave, huella, reporte_id::text, creado_en FROM idempotencia WHERE reporte_id = $1',
      [id],
    );
    expect(despues.rows).toEqual(clave.rows);
    const fila = await pool.query('SELECT detalle FROM reporte WHERE id = $1', [id]);
    for (const campo of ['sumidero_cercano', 'sumidero_estado', 'agua_brota_sumidero']) {
      expect(fila.rows[0].detalle).not.toHaveProperty(campo);
    }
    expect(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM auditoria WHERE entidad_id = $1 AND accion = $2',
          [id, 'crear'],
        )
      ).rows[0].n,
    ).toBe(1);
  });
});
