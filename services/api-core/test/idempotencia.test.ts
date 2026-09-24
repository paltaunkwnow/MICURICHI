/**
 * Idempotencia de POST /reportes. El caso que motiva todo esto: el vecino envía, se corta la red
 * antes de que llegue la respuesta y vuelve a darle. Sin clave se creaban dos reportes del mismo
 * charco y el técnico tenía que fusionarlos a mano.
 */
import { ejecutorPg } from 'db';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { huellaDePayload } from '../src/idempotencia.js';
import {
  CUENTAS,
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
let cookieVecina: string;
let ex: ReturnType<typeof ejecutorPg>;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 4 });
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
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  cookieVecina = await iniciarSesion(app, CUENTAS.vecina);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await pool.query('DELETE FROM idempotencia');
  await pool.query('DELETE FROM reporte_inundacion');
});

/**
 * Envía un reporte como vecina, devolviéndole antes el turno.
 *
 * Lo que se prueba en este archivo es la idempotencia, no la cuota de un reporte por hora: sin
 * este `liberarCuota`, el segundo envío de cada prueba chocaría contra la cuota y nunca se
 * llegaría a ejercitar la clave. La cuota tiene sus propias pruebas —incluida la de concurrencia
 * con 50 envíos— en `cuentas-y-cuota.test.ts`.
 */
async function crear(clave: string | undefined, extra: Record<string, unknown> = {}) {
  await liberarCuota(ex);
  return enviar(clave, extra);
}

/**
 * Igual, pero sin tocar la cuota. Es lo que usan las pruebas de concurrencia: ahí todos los
 * envíos llevan la MISMA clave, así que solo el primero llega a consumir turno y el resto se
 * queda en la rama de idempotencia. Meter un UPDATE por envío añadiría al montón consultas que
 * no tienen nada que ver con lo que se prueba.
 */
function enviar(clave: string | undefined, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/reportes',
    payload: { ...reporteValido, ...extra },
    cookies: sesion(cookieVecina),
    headers: clave ? { 'idempotency-key': clave } : {},
  });
}

async function cuantosReportes(): Promise<number> {
  const r = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM reporte_inundacion');
  return Number(r.rows[0]!.n);
}

describe('idempotencia de la creación de reportes', () => {
  it('sin clave sigue funcionando como antes (dos envíos, dos reportes)', async () => {
    expect((await crear(undefined)).statusCode).toBe(201);
    expect((await crear(undefined)).statusCode).toBe(201);
    expect(await cuantosReportes()).toBe(2);
  });

  it('el reintento con la misma clave devuelve el mismo reporte y no crea otro', async () => {
    const primera = await crear('envio-aaaaaaaa-1111');
    expect(primera.statusCode).toBe(201);
    const id = primera.json().properties.id;

    const reintento = await crear('envio-aaaaaaaa-1111');
    expect(reintento.statusCode).toBe(200);
    expect(reintento.headers['idempotent-replay']).toBe('true');
    expect(reintento.json().properties.id).toBe(id);
    expect(await cuantosReportes()).toBe(1);
  });

  it('dos envíos SIMULTÁNEOS con la misma clave crean un solo reporte', async () => {
    // Es el caso difícil: sin la reclamación dentro de la transacción, ambos pasarían la
    // comprobación y se insertarían dos filas.
    await liberarCuota(ex);
    // Una petición suelta antes del estallido. No es adorno: el PRIMER grupo de peticiones
    // concurrentes de un proceso sobre PGlite devuelve un 401 espurio de forma reproducible
    // —la consulta que resuelve la sesión vuelve vacía porque las sesiones se multiplexan sobre
    // una única conexión (ADR 0003)— y ese 401 no tiene nada que ver con lo que se prueba aquí.
    // Contra PostgreSQL real no aparece nunca, y `cuota-concurrencia-pg.test.ts` lo afirma
    // explícitamente con 50 peticiones simultáneas.
    await Promise.all(
      Array.from({ length: 3 }, () =>
        app.inject({ method: 'GET', url: '/api/v1/auth/yo', cookies: sesion(cookieVecina) }),
      ),
    );
    const resultados = await Promise.all([
      enviar('envio-simultaneo-01'),
      enviar('envio-simultaneo-01'),
      enviar('envio-simultaneo-01'),
    ]);
    const codigos = resultados.map((r) => r.statusCode).sort();
    expect(await cuantosReportes()).toBe(1);
    // Uno crea (201); los otros o bien ven el resultado (200) o bien avisan de que está en curso (409).
    expect(codigos.filter((c) => c === 201)).toHaveLength(1);
    for (const c of codigos) expect([200, 201, 409]).toContain(c);
  });

  /**
   * Cincuenta envíos a la vez con la misma clave. Tres no prueban gran cosa: la ventana en la que
   * dos transacciones pueden pisarse es de milisegundos, y con poca concurrencia casi siempre se
   * serializan solas. Con cincuenta, el que reclama la clave y los que llegan detrás compiten de
   * verdad.
   *
   * QUÉ SE AFIRMA AQUÍ Y QUÉ NO. Las invariantes del dominio —un solo reporte, un solo id
   * devuelto, exactamente un 201— se comprueban siempre. Los códigos de estado del resto NO, y el
   * motivo importa: estas pruebas corren sobre PGlite, que es de una sola conexión y multiplexa
   * varias sesiones sobre el mismo motor (ADR 0003). Por encima de unas pocas peticiones a la vez
   * se pisan el portal sin nombre del protocolo extendido y devuelve `34000 portal "" does not
   * exist` o `26000 unnamed prepared statement does not exist`, que se traducen en 500. Es un
   * límite del entorno de pruebas, no del código.
   *
   * Comprobado contra PostgreSQL 18.6 real, con base temporal y el mismo código:
   *   concurrencia  3 -> {"200":2,"201":1}  | 1 reporte | 1 id
   *   concurrencia 10 -> {"200":9,"201":1}  | 1 reporte | 1 id
   *   concurrencia 50 -> {"200":49,"201":1} | 1 reporte | 1 id
   * Ni un 5xx ni un 409. El caso de tres simultáneos de arriba SÍ afirma los códigos, porque a esa
   * concurrencia PGlite todavía se comporta.
   */
  it('cincuenta envíos simultáneos con la misma clave siguen creando un solo reporte', async () => {
    await liberarCuota(ex);
    const resultados = await Promise.all(
      Array.from({ length: 50 }, () => enviar('avalancha-de-reintentos')),
    );
    expect(await cuantosReportes()).toBe(1);
    expect(resultados.filter((r) => r.statusCode === 201)).toHaveLength(1);
    // Todo el que recibe una respuesta buena recibe EL MISMO reporte, nunca uno distinto.
    const ids = new Set(
      resultados.filter((r) => r.statusCode < 300).map((r) => r.json().id as string),
    );
    expect(ids.size).toBe(1);
  });

  it('la misma clave con otro contenido se rechaza en vez de devolver algo que no es', async () => {
    expect((await crear('envio-bbbbbbbb-2222')).statusCode).toBe(201);
    const distinto = await crear('envio-bbbbbbbb-2222', {
      descripcion: 'Un texto completamente distinto para el mismo envío, que no corresponde.',
    });
    expect(distinto.statusCode).toBe(409);
    expect(distinto.json().codigo).toBe('CLAVE_IDEMPOTENCIA_REUSADA');
    expect(await cuantosReportes()).toBe(1);
  });

  it('claves distintas crean reportes distintos', async () => {
    expect((await crear('envio-cccccccc-3333')).statusCode).toBe(201);
    expect((await crear('envio-dddddddd-4444')).statusCode).toBe(201);
    expect(await cuantosReportes()).toBe(2);
  });

  it('una clave caducada vuelve a crear', async () => {
    expect((await crear('envio-eeeeeeee-5555')).statusCode).toBe(201);
    await pool.query(`UPDATE idempotencia SET creado_en = now() - interval '48 hours'`);
    expect((await crear('envio-eeeeeeee-5555')).statusCode).toBe(201);
    expect(await cuantosReportes()).toBe(2);
  });

  it('rechaza una clave con formato inaceptable', async () => {
    const r = await crear('x');
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe('CLAVE_IDEMPOTENCIA_INVALIDA');
    expect(await cuantosReportes()).toBe(0);
  });

  it('un envío rechazado no deja la clave ocupada', async () => {
    // Fuera de cobertura: el reporte no se crea, así que la clave debe quedar libre.
    const fuera = await crear('envio-ffffffff-6666', { lat: -10, lon: -60 });
    expect(fuera.statusCode).toBe(422);
    const dentro = await crear('envio-ffffffff-6666');
    expect(dentro.statusCode).toBe(201);
  });
});

describe('huella del payload', () => {
  it('no depende del orden de las claves', () => {
    expect(huellaDePayload({ a: 1, b: { c: 2, d: 3 } })).toBe(
      huellaDePayload({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('cambia si cambia cualquier valor', () => {
    expect(huellaDePayload({ a: 1 })).not.toBe(huellaDePayload({ a: 2 }));
    expect(huellaDePayload({ a: [1, 2] })).not.toBe(huellaDePayload({ a: [2, 1] }));
  });
});
