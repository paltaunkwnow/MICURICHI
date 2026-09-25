/**
 * Cuentas ciudadanas, autorización de la creación y cuota de un reporte por hora.
 *
 * EL PROBLEMA QUE CIERRA TODO ESTO. Hasta la Fase 5, crear un reporte era anónimo y el único
 * freno era por IP. Una IP doméstica o móvil cambia sola —modo avión y de vuelta— así que el
 * freno se reiniciaba a voluntad: mil reportes basura eran cuestión de paciencia. Ahora reportar
 * exige cuenta y el límite es de la cuenta, no de la conexión.
 *
 * Lo que NO cambia, y hay pruebas explícitas de ello más abajo: **ver el mapa sigue sin
 * necesitar cuenta**, y tener cuenta de ciudadano **no** acerca ni un milímetro a la vista
 * técnica (esto último es el hallazgo A-01 de la auditoría, que no se puede reabrir por la
 * puerta de atrás al añadir sesiones a la app pública).
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { type ConfigApi, leerConfig } from '../src/config.js';
import {
  CUENTAS,
  crearUsuarios,
  iniciarSesion,
  liberarCuota,
  PASSWORD_PRUEBA,
  reporteValido,
  resolverDePrueba,
  sesion,
} from './ayudas.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;
let ex: ReturnType<typeof ejecutorPg>;
let cookieVecina: string;
let cookieVecino: string;
let cookieTecnico: string;

async function levantar(extra: Partial<ConfigApi> = {}): Promise<FastifyInstance> {
  return crearApp({
    pool,
    cfg: {
      ...leerConfig({ DATABASE_URL: base.url }),
      rutaOpenApi: '/no-existe.yaml',
      // Alto a propósito: lo que se prueba acá es la cuota POR CUENTA. El límite por IP existe y
      // tiene su propia prueba en reportes.test.ts; si saltara aquí, los 429 no dirían cuál de
      // los dos frenos actuó y la prueba no probaría nada.
      rateLimitMax: 10_000,
      // Lo mismo con los frenos del alta: los sube esta base para que no salten en las pruebas
      // que no van de eso. Los dos tienen pruebas propias, con una instancia dedicada y el
      // valor que toque, más abajo.
      registroPeticionesPorVentana: 1000,
      registroPorIp: 1000,
      ...extra,
    },
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
}

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
  await crearUsuarios(ex);
  app = await levantar();
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
  cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
  cookieTecnico = await iniciarSesion(app, CUENTAS.tecnico);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

function enviar(cookie: string | null, payload: unknown = reporteValido, extra = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: payload as Record<string, unknown>,
    ...(cookie ? { cookies: sesion(cookie) } : {}),
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('crear un reporte exige sesión; ver el mapa no', () => {
  it('sin sesión, POST /reportes responde 401 y no crea nada', async () => {
    const antes = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion',
    );
    const r = await enviar(null);
    expect(r.statusCode).toBe(401);
    expect(r.json().codigo).toBe('SIN_SESION');
    const despues = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion',
    );
    expect(despues.rows[0]?.n).toBe(antes.rows[0]?.n);
  });

  it('el mapa público sigue abierto sin cuenta', async () => {
    for (const url of ['/api/v1/reportes', '/api/v1/reportes?limite=5']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(200);
      expect(r.json().type).toBe('FeatureCollection');
    }
  });

  it('con sesión de ciudadano, se crea y el autor sale de la sesión', async () => {
    await liberarCuota(ex);
    const r = await enviar(cookieVecina);
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    const id = r.json().id as string;
    const { rows } = await pool.query<{ autor_id: string; email: string }>(
      `SELECT r.autor_id::text, u.email FROM reporte_inundacion r
       JOIN usuario u ON u.id = r.autor_id WHERE r.id = $1`,
      [id],
    );
    expect(rows[0]?.email).toBe(CUENTAS.vecina);
  });

  it('cerrar sesión deja de permitir reportar', async () => {
    const cookie = await iniciarSesion(app, CUENTAS.vecino);
    const salir = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: sesion(cookie),
    });
    expect(salir.statusCode).toBe(204);
    await liberarCuota(ex, CUENTAS.vecino);
    expect((await enviar(cookie)).statusCode).toBe(401);
    // Y la de después sigue valiendo: cerrar una sesión no invalida la cuenta.
    cookieVecino = await iniciarSesion(app, CUENTAS.vecino);
    expect((await enviar(cookieVecino)).statusCode).toBe(201);
  });

  /**
   * Fijación de sesión: quien consigue plantar una cookie en el navegador de otra persona no
   * puede quedarse con ella después de que esa persona entre. El identificador anterior se borra
   * al abrir la sesión nueva.
   */
  it('iniciar sesión invalida la cookie que traía la petición', async () => {
    const vieja = await iniciarSesion(app, CUENTAS.vecina);
    const nueva = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: CUENTAS.vecina, password: PASSWORD_PRUEBA },
      cookies: sesion(vieja),
    });
    expect(nueva.statusCode).toBe(200);
    const cookieNueva = nueva.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    expect(cookieNueva).not.toBe(vieja);
    const conLaVieja = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: sesion(vieja),
    });
    expect(conLaVieja.statusCode).toBe(401);
    cookieVecina = cookieNueva;
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('el autor lo decide el servidor: no hay forma de reportar en nombre de otro', () => {
  /**
   * Todos los nombres que se le ocurrirían a alguien que prueba a mano, más los que usan los
   * generadores de payloads. `ReporteCrearSchema` no tiene ningún campo de autor, así que Zod
   * los descarta al validar y jamás llegan al INSERT; esta prueba fija que siga siendo así.
   */
  const NOMBRES_DE_AUTOR = [
    'autor_id',
    'autorId',
    'usuario_id',
    'usuarioId',
    'user_id',
    'userId',
    'owner_id',
    'ownerId',
    'created_by',
    'actor_id',
  ];

  it('ningún alias de «autor» en el cuerpo cambia a quién se le atribuye el reporte', async () => {
    const otro = await pool.query<{ id: string }>('SELECT id::text FROM usuario WHERE email = $1', [
      CUENTAS.tecnico,
    ]);
    const idAjeno = otro.rows[0]!.id;
    for (const campo of NOMBRES_DE_AUTOR) {
      await liberarCuota(ex);
      const r = await enviar(cookieVecina, { ...reporteValido, [campo]: idAjeno });
      expect(r.statusCode, `${campo}: ${r.body.slice(0, 160)}`).toBe(201);
      const { rows } = await pool.query<{ email: string }>(
        `SELECT u.email FROM reporte_inundacion r JOIN usuario u ON u.id = r.autor_id WHERE r.id = $1`,
        [r.json().id],
      );
      expect(rows[0]?.email, `con ${campo} se atribuyó a otra cuenta`).toBe(CUENTAS.vecina);
    }
  });

  it('los campos que decide el servidor no se pueden fijar desde el cuerpo', async () => {
    await liberarCuota(ex);
    const r = await enviar(cookieVecina, {
      ...reporteValido,
      id: '99999999-9999-4999-8999-999999999999',
      estado: 'validado',
      severidad_calculada: 'baja',
      severidad_manual: 'baja',
      severidad_puntaje: 1,
      punto_critico_id: '99999999-9999-4999-8999-999999999999',
      creado_en: '2000-01-01T00:00:00.000Z',
      created_at: '2000-01-01T00:00:00.000Z',
      actualizado_en: '2000-01-01T00:00:00.000Z',
      validado_por: '99999999-9999-4999-8999-999999999999',
      ip_hash: 'inventado',
      rol: 'admin',
    });
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    const id = r.json().id as string;
    expect(id).not.toBe('99999999-9999-4999-8999-999999999999');
    const { rows } = await pool.query<{
      estado: string;
      severidad_calculada: string;
      creado_en: string;
      validado_por: string | null;
    }>(
      `SELECT estado, severidad_calculada, creado_en::text, validado_por::text
         FROM reporte_inundacion WHERE id = $1`,
      [id],
    );
    const f = rows[0]!;
    expect(f.estado).toBe('nuevo');
    // La severidad la calcula el servidor con la tabla del contrato: rodilla + 2h_12h +
    // cada_lluvia_fuerte + ingreso_viviendas = 13 puntos = alta.
    expect(f.severidad_calculada).toBe('alta');
    expect(new Date(f.creado_en).getFullYear()).toBeGreaterThan(2020);
    expect(f.validado_por).toBeNull();
  });

  it('un prototipo contaminado en el cuerpo no cambia el comportamiento', async () => {
    await liberarCuota(ex);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      cookies: sesion(cookieVecina),
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        ...reporteValido,
        __proto__: { rol: 'admin', autor_id: 'x' },
        constructor: { prototype: { rol: 'admin' } },
      }),
    });
    expect([201, 400]).toContain(r.statusCode);
    // Lo que no puede pasar bajo ningún concepto es que Object.prototype quede tocado.
    expect(({} as Record<string, unknown>).rol).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('un reporte por cuenta y por hora', () => {
  beforeEach(async () => {
    await liberarCuota(ex, CUENTAS.vecina);
    await liberarCuota(ex, CUENTAS.vecino);
  });

  it('el segundo envío dentro de la ventana se rechaza con 429 y Retry-After', async () => {
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
    const segundo = await enviar(cookieVecina);
    expect(segundo.statusCode).toBe(429);
    expect(segundo.json().codigo).toBe('CUOTA_DE_REPORTES');
    const retry = Number(segundo.headers['retry-after']);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(60 * 60);
    // Y se le dice cuándo, no solo que no.
    const disponible = new Date(segundo.json().detalles.disponible_en).getTime();
    expect(disponible).toBeGreaterThan(Date.now());
  });

  it('cada cuenta tiene su propio turno: la de al lado no queda bloqueada', async () => {
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
    expect((await enviar(cookieVecina)).statusCode).toBe(429);
    expect((await enviar(cookieVecino)).statusCode).toBe(201);
  });

  it('pasada la ventana vuelve a haber turno', async () => {
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
    expect((await enviar(cookieVecina)).statusCode).toBe(429);
    // Atrasar la marca 61 minutos equivale a que pase el tiempo; la lógica que se comprueba es
    // la del UPDATE condicional, no la del reloj.
    await pool.query(
      `UPDATE usuario SET ultimo_reporte_en = now() - interval '61 minutes' WHERE email = $1`,
      [CUENTAS.vecina],
    );
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
  });

  /**
   * LA PRUEBA QUE IMPORTA: cambiar de IP no devuelve el turno.
   *
   * Es exactamente el ataque que motivó todo esto. Con `TRUST_PROXY=1` el servicio se cree el
   * `X-Forwarded-For`, así que cada petición parece venir de una máquina distinta y el límite
   * por IP se reinicia en cada una. El de la cuenta no se mueve.
   */
  it('una IP distinta en cada intento no da más turnos', async () => {
    const conProxy = await levantar({ confiarEnProxy: 1, rateLimitMax: 2 });
    try {
      const cookie = await iniciarSesion(conProxy, CUENTAS.vecina);
      await liberarCuota(ex, CUENTAS.vecina);
      const codigos: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await conProxy.inject({
          method: 'POST',
          url: '/api/v1/reportes',
          payload: reporteValido,
          cookies: sesion(cookie),
          headers: { 'x-forwarded-for': `203.0.113.${i + 10}` },
        });
        codigos.push(r.statusCode);
      }
      // Uno pasa y los cinco restantes chocan con la cuota de la cuenta. Con `rateLimitMax: 2`
      // y una IP fija habrían sido 429 «de rate limit» a partir del tercero; que todos digan
      // CUOTA_DE_REPORTES es lo que demuestra que el freno que actúa es el de la cuenta.
      expect(codigos.filter((c) => c === 201)).toHaveLength(1);
      expect(codigos.filter((c) => c === 429)).toHaveLength(5);
    } finally {
      await conProxy.close();
    }
  });

  it('el reintento idempotente no gasta un segundo turno', async () => {
    const clave = 'cuota-reintento-0001';
    const primera = await enviar(cookieVecina, reporteValido, {
      headers: { 'idempotency-key': clave },
    });
    expect(primera.statusCode).toBe(201);
    const repeticion = await enviar(cookieVecina, reporteValido, {
      headers: { 'idempotency-key': clave },
    });
    expect(repeticion.statusCode).toBe(200);
    expect(repeticion.headers['idempotent-replay']).toBe('true');
    expect(repeticion.json().id).toBe(primera.json().id);
  });

  /**
   * Si la transacción se deshace, el turno se devuelve. Aquí se fuerza con una foto que no
   * existe, que es el caso real: el vecino adjunta una foto cuyo vale caducó y el reporte no
   * llega a guardarse. Sería injusto que además perdiera su turno de la hora.
   */
  it('un envío que falla no consume el turno', async () => {
    const fallido = await enviar(cookieVecina, {
      ...reporteValido,
      fotos: ['00000000-0000-0000-0000-000000000000.jpg'],
    });
    expect(fallido.statusCode).toBe(400);
    expect(fallido.json().codigo).toBe('FOTOS_INVALIDAS');
    expect((await enviar(cookieVecina)).statusCode).toBe(201);
  });

  /**
   * CINCO ENVÍOS A LA VEZ, cada uno con su clave.
   *
   * Es el caso que un SELECT-y-después-INSERT no aguanta: todas las transacciones leerían el
   * mismo estado anterior, todas concluirían que hay turno y todas insertarían. Con el UPDATE
   * condicional, PostgreSQL serializa por la fila del usuario y solo la primera lo cumple.
   *
   * Cinco y no cincuenta porque esta suite corre sobre PGlite, que es de una sola conexión: una
   * transacción esperando un bloqueo de fila deja al motor entero esperando, y por encima de
   * unos pocos envíos a la vez la prueba se cuelga en lugar de fallar (ADR 0003). La prueba de
   * verdad —50 simultáneos, con el reparto exacto de códigos— está en
   * `cuota-concurrencia-pg.test.ts`, que se ejecuta contra PostgreSQL real.
   */
  it('varios envíos simultáneos con claves distintas dejan un solo reporte', async () => {
    const { rows: antes } = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion WHERE autor_id = (SELECT id FROM usuario WHERE email = $1)',
      [CUENTAS.vecina],
    );
    const resultados = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        enviar(cookieVecina, reporteValido, {
          headers: { 'idempotency-key': `avalancha-distintas-${i}` },
        }),
      ),
    );
    const { rows: despues } = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM reporte_inundacion WHERE autor_id = (SELECT id FROM usuario WHERE email = $1)',
      [CUENTAS.vecina],
    );
    // LA INVARIANTE, que es la que importa: pase lo que pase con los códigos, de cinco envíos
    // simultáneos sale UN reporte.
    expect(Number(despues[0]!.n) - Number(antes[0]!.n)).toBe(1);
    // Los códigos NO se afirman aquí. Sobre PGlite, la transacción que gana el turno confirma
    // bien —por eso el reporte existe— pero la respuesta de su petición puede perderse en el
    // multiplexado y volver como 500. Afirmarlo aquí sería afirmar el comportamiento del
    // entorno de pruebas, no el del código. El reparto exacto (1 × 201, 49 × 429, ni un 5xx)
    // está medido contra PostgreSQL 18 real en `cuota-concurrencia-pg.test.ts`.
    expect(resultados.filter((r) => r.statusCode === 201).length).toBeLessThanOrEqual(1);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('alta de cuenta ciudadana', () => {
  beforeEach(async () => {
    // El freno por IP se cuenta en la base y `inject` siempre llega desde la misma IP: sin esta
    // limpieza, la segunda prueba de este bloque ya arrancaría frenada.
    await pool.query("DELETE FROM intento_login WHERE clave LIKE 'registro:%'");
  });

  const nuevo = (extra: Record<string, unknown> = {}) => ({
    email: `alta-${Math.random().toString(36).slice(2, 10)}@test.local`,
    nombre: 'Vecina Nueva',
    password: 'contrasena-larga-de-prueba',
    ...extra,
  });

  function registrar(a: FastifyInstance, payload: unknown) {
    return a.inject({
      method: 'POST',
      url: '/api/v1/auth/registro',
      payload: payload as Record<string, unknown>,
    });
  }

  it('crea la cuenta y permite entrar con ella', async () => {
    const datos = nuevo();
    const r = await registrar(app, datos);
    expect(r.statusCode, r.body.slice(0, 200)).toBe(201);
    expect(r.json().codigo).toBe('CUENTA_LISTA');
    // No inicia sesión sola: devolver cookie solo cuando la cuenta es nueva delataría cuáles
    // existen, que es justo lo que la respuesta uniforme oculta.
    expect(r.cookies.find((c) => c.name === 'curichi_sesion')).toBeUndefined();
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: datos.email, password: datos.password },
    });
    expect(entrada.statusCode).toBe(200);
    expect(entrada.json().rol).toBe('ciudadano');
  });

  it('la cuenta nueva SIEMPRE es de ciudadano, aunque el cuerpo pida otra cosa', async () => {
    for (const intento of [
      { rol: 'admin' },
      { rol: 'tecnico' },
      { role: 'admin' },
      { rol: ['admin'] },
      { activo: false, rol: 'admin' },
    ]) {
      const datos = nuevo(intento);
      const r = await registrar(app, datos);
      expect(r.statusCode, JSON.stringify(intento)).toBe(201);
      const { rows } = await pool.query<{ rol: string; activo: boolean }>(
        'SELECT rol, activo FROM usuario WHERE email = $1',
        [datos.email],
      );
      expect(rows[0]?.rol, JSON.stringify(intento)).toBe('ciudadano');
      expect(rows[0]?.activo).toBe(true);
    }
  });

  it('una cuenta ciudadana nueva no abre ninguna puerta técnica', async () => {
    const datos = nuevo();
    expect((await registrar(app, datos)).statusCode).toBe(201);
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: datos.email, password: datos.password },
    });
    const cookie = entrada.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    for (const url of [
      '/api/v1/tecnico/reportes',
      '/api/v1/exportar?formato=csv',
      '/api/v1/indicadores',
      '/api/v1/admin/capas',
    ]) {
      const r = await app.inject({ method: 'GET', url, cookies: sesion(cookie) });
      expect(r.statusCode, url).toBe(403);
    }
  });

  it('no dice si el correo ya existía: la respuesta es la misma', async () => {
    const datos = nuevo();
    const primera = await registrar(app, datos);
    const segunda = await registrar(app, { ...datos, password: 'otra-contrasena-larga' });
    expect(segunda.statusCode).toBe(primera.statusCode);
    expect(segunda.json()).toEqual(primera.json());
    // Y la contraseña del segundo intento NO sirve: la cuenta existente no se pisó.
    const conLaNueva = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: datos.email, password: 'otra-contrasena-larga' },
    });
    expect(conLaNueva.statusCode).toBe(401);
  });

  it('tampoco delata las cuentas técnicas que ya existen', async () => {
    const contraTecnico = await registrar(app, {
      email: CUENTAS.tecnico,
      nombre: 'Intruso',
      password: 'contrasena-larga-de-prueba',
    });
    const contraNueva = await registrar(app, nuevo());
    expect(contraTecnico.statusCode).toBe(contraNueva.statusCode);
    expect(contraTecnico.json()).toEqual(contraNueva.json());
    // Y el rol del técnico sigue intacto.
    const { rows } = await pool.query<{ rol: string }>('SELECT rol FROM usuario WHERE email = $1', [
      CUENTAS.tecnico,
    ]);
    expect(rows[0]?.rol).toBe('tecnico');
  });

  it('normaliza el correo: mayúsculas y espacios no son una cuenta distinta', async () => {
    const datos = nuevo();
    expect((await registrar(app, datos)).statusCode).toBe(201);
    const disfrazado = `  ${datos.email.toUpperCase()}  `;
    expect((await registrar(app, { ...datos, email: disfrazado })).statusCode).toBe(201);
    const { rows } = await pool.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM usuario WHERE lower(email) = lower($1)',
      [datos.email.trim()],
    );
    expect(rows[0]?.n).toBe('1');
    // Y se puede entrar escribiéndolo como salga.
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: disfrazado, password: datos.password },
    });
    expect(entrada.statusCode).toBe(200);
  });

  it('rechaza contraseñas cortas, correos imposibles y nombres vacíos', async () => {
    const casos = [
      { ...nuevo(), password: 'corta1' },
      { ...nuevo(), email: 'esto-no-es-un-correo' },
      { ...nuevo(), nombre: ' ' },
      { ...nuevo(), email: `${'a'.repeat(300)}@test.local` },
      { ...nuevo(), password: 'a'.repeat(5000) },
      { nombre: 'Sin correo', password: 'contrasena-larga-de-prueba' },
    ];
    for (const caso of casos) {
      const r = await registrar(app, caso);
      expect(r.statusCode, JSON.stringify(caso).slice(0, 120)).toBe(400);
      expect(r.json().codigo).toBe('PAYLOAD_INVALIDO');
    }
  });

  it('acepta un nombre con tildes, ñ y emoji sin romperse', async () => {
    const datos = nuevo({ nombre: 'Ñandú Peña 🌧️' });
    expect((await registrar(app, datos)).statusCode).toBe(201);
    const { rows } = await pool.query<{ nombre: string }>(
      'SELECT nombre FROM usuario WHERE email = $1',
      [datos.email],
    );
    expect(rows[0]?.nombre).toBe('Ñandú Peña 🌧️');
  });

  /**
   * Crear cuentas en masa es el siguiente escalón del abuso una vez que reportar exige cuenta.
   * El freno se cuenta en la base y no en memoria: así sobrevive a un reinicio del proceso y
   * vale igual con varias réplicas detrás de un balanceador.
   */
  it('frena la creación en masa desde la misma IP', async () => {
    const limitada = await levantar({ registroPorIp: 3, registroPeticionesPorVentana: 100 });
    try {
      const codigos: number[] = [];
      for (let i = 0; i < 5; i++) codigos.push((await registrar(limitada, nuevo())).statusCode);
      expect(codigos.slice(0, 3)).toEqual([201, 201, 201]);
      expect(codigos.slice(3)).toEqual([429, 429]);
      const ultima = await registrar(limitada, nuevo());
      expect(ultima.json().codigo).toBe('DEMASIADAS_CUENTAS');
      expect(Number(ultima.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limitada.close();
    }
  });

  it('probar correos existentes también consume el cupo de la IP', async () => {
    const limitada = await levantar({ registroPorIp: 2, registroPeticionesPorVentana: 100 });
    try {
      // Las dos van contra correos que YA existen: no crean nada, pero gastan cupo igual. Si no
      // fuera así, sondear qué cuentas existen saldría gratis.
      await registrar(limitada, {
        email: CUENTAS.tecnico,
        nombre: 'Sondeo Uno',
        password: 'contrasena-larga-de-prueba',
      });
      await registrar(limitada, {
        email: CUENTAS.admin,
        nombre: 'Sondeo Dos',
        password: 'contrasena-larga-de-prueba',
      });
      const tercera = await registrar(limitada, nuevo());
      expect(tercera.statusCode).toBe(429);
    } finally {
      await limitada.close();
    }
  });

  it('el tope de ráfaga por IP actúa antes incluso de mirar el cuerpo', async () => {
    const limitada = await levantar({ registroPeticionesPorVentana: 2, registroPorIp: 1000 });
    try {
      const codigos: number[] = [];
      for (let i = 0; i < 4; i++) codigos.push((await registrar(limitada, nuevo())).statusCode);
      expect(codigos.slice(0, 2)).toEqual([201, 201]);
      expect(codigos.slice(2)).toEqual([429, 429]);
    } finally {
      await limitada.close();
    }
  });

  it('la cuenta recién creada arranca con su turno de reporte disponible', async () => {
    const datos = nuevo();
    expect((await registrar(app, datos)).statusCode).toBe(201);
    const entrada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: datos.email, password: datos.password },
    });
    const cookie = entrada.cookies.find((c) => c.name === 'curichi_sesion')!.value;
    const yo = await app.inject({ method: 'GET', url: '/api/v1/auth/yo', cookies: sesion(cookie) });
    expect(yo.json().puede_reportar_desde).toBeNull();
    expect((await enviar(cookie)).statusCode).toBe(201);
    // Y tras usarlo, /auth/yo dice cuándo vuelve a tenerlo.
    const yo2 = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: sesion(cookie),
    });
    expect(new Date(yo2.json().puede_reportar_desde).getTime()).toBeGreaterThan(Date.now());
  });

  it('/auth/yo no devuelve la contraseña ni nada que no sea de quien pregunta', async () => {
    const yo = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/yo',
      cookies: sesion(cookieVecina),
    });
    expect(yo.statusCode).toBe(200);
    expect(Object.keys(yo.json()).sort()).toEqual([
      'email',
      'id',
      'nombre',
      'puede_reportar_desde',
      'rol',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('tener cuenta de ciudadano no acerca a la vista técnica (A-01)', () => {
  it('el listado público es idéntico con cookie de ciudadano y sin ella', async () => {
    const sinCuenta = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=50' });
    const conCuenta = await app.inject({
      method: 'GET',
      url: '/api/v1/reportes?limite=50',
      cookies: sesion(cookieVecina),
    });
    expect(conCuenta.statusCode).toBe(200);
    expect(conCuenta.body).toBe(sinCuenta.body);
  });

  it('ni siquiera los reportes propios salen con coordenada exacta en la ruta pública', async () => {
    await liberarCuota(ex);
    const creado = await enviar(cookieVecina, {
      ...reporteValido,
      ubicacion_tipo: 'vivienda_o_predio',
      lat: -17.7912345,
      lon: -63.1934567,
    });
    expect(creado.statusCode).toBe(201);
    const id = creado.json().id as string;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/reportes/${id}/estado`,
      payload: { estado: 'validado' },
      cookies: sesion(cookieTecnico),
    });
    const publico = await app.inject({
      method: 'GET',
      url: `/api/v1/reportes/${id}`,
      cookies: sesion(cookieVecina),
    });
    expect(publico.statusCode).toBe(200);
    const props = publico.json().properties as Record<string, unknown>;
    expect(props.precision_degradada).toBe(true);
    expect(publico.json().geometry.coordinates).not.toEqual([-63.1934567, -17.7912345]);
    // Y ninguna seña de la vista técnica, empezando por el autor.
    for (const campo of ['autor_id', 'ubicacion_metodo', 'estado_motivo', 'ip_hash', 'email'])
      expect(props, campo).not.toHaveProperty(campo);
  });

  it('el listado público no revela quién reportó, ni por id ni por correo', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/reportes?limite=50' });
    const cuerpo = r.body;
    // El correo entero: buscar solo la parte local daría un falso positivo con «unidad_vecinal».
    for (const correo of Object.values(CUENTAS)) expect(cuerpo, correo).not.toContain(correo);
    const { rows } = await pool.query<{ id: string }>('SELECT id::text FROM usuario');
    for (const { id } of rows) expect(cuerpo, id).not.toContain(id);
    for (const f of r.json().features as Array<{ properties: Record<string, unknown> }>) {
      expect(f.properties).not.toHaveProperty('autor_id');
      expect(f.properties).not.toHaveProperty('autor');
    }
  });
});
