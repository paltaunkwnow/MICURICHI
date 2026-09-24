/**
 * Resiliencia ante una base que no está (Fase 4, §24).
 *
 * Lo que se comprobó en la pila real parando el contenedor de PostgreSQL:
 *  · `/health` seguía en 200 (correcto: el proceso está vivo);
 *  · `/ready` pasaba a 503 (correcto);
 *  · el listado devolvía **500 ERROR_INTERNO**, y eso estaba mal. "La base no está ahora mismo"
 *    es transitorio y se arregla esperando; un 500 le dice al cliente, al balanceador y a quien
 *    mira el panel de errores que hay un fallo que investigar. La respuesta honesta es 503 con
 *    `Retry-After`.
 *
 * Y una comprobación relacionada que salió de la misma prueba: con **geo-service caído**,
 * `/ready` devolvía 503. Como todas las réplicas hablan con el mismo geo-service, eso las sacaba
 * a TODAS de rotación a la vez y convertía "no se pueden crear reportes" en "el sitio no existe".
 *
 * Aquí no hace falta base de datos: basta un pool de mentira que lance los errores que lanza
 * `pg` de verdad. Los mensajes y códigos están copiados de lo que se vio en los logs.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AlmacenMemoria } from '../src/almacen.js';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { GeoNoDisponible } from '../src/resolver.js';
import { resolverDePrueba } from './ayudas.js';

/** Pool que siempre falla con el error indicado, como si la base no estuviera. */
function poolQueFalla(error: Error) {
  return {
    query: async () => {
      throw error;
    },
    connect: async () => {
      throw error;
    },
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
    options: { max: 8 },
  };
}

function conCodigo(mensaje: string, code?: string): Error {
  const e = new Error(mensaje) as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

let app: FastifyInstance | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

/**
 * Una instancia de usar y tirar antes de empezar a medir.
 *
 * `crearApp` registra media docena de plugins de Fastify y compila los esquemas: la PRIMERA vez
 * en el proceso eso cuesta segundos, y como cada caso de aquí levanta su propia app, ese coste
 * se lo comía entero el primer `it` y lo sacaba del plazo de 5 s —solo cuando la suite corre
 * en paralelo con los demás paquetes y la máquina va justa—. Los cinco casos siguientes, ya con
 * todo caliente, tardaban menos de un segundo. Pagarlo en el `beforeAll` no cambia lo que se
 * prueba y quita un fallo intermitente que no era del código de producción.
 */
beforeAll(async () => {
  const calentar = await levantar(conCodigo('calentamiento'));
  await calentar.inject({ method: 'GET', url: '/health' });
  await calentar.close();
  app = null;
}, 60_000);

async function levantar(error: Error, geoUrl = 'http://127.0.0.1:59999') {
  const cfg = leerConfig({ NODE_ENV: 'test', GEO_SERVICE_URL: geoUrl, METRICAS_RUTA: '' });
  app = await crearApp({
    // biome-ignore lint/suspicious/noExplicitAny: pool de mentira, solo necesita la forma mínima
    pool: poolQueFalla(error) as any,
    cfg,
    resolver: resolverDePrueba,
    almacen: new AlmacenMemoria(),
  });
  return app;
}

/** Los errores exactos que lanza `pg` cuando la base no está; vistos en los logs de la Fase 4. */
const ERRORES_TRANSITORIOS: Array<[string, Error]> = [
  // Docker paró el contenedor y su DNS interno dejó de resolver el nombre del servicio.
  ['DNS no resuelve el host', conCodigo('getaddrinfo ENOTFOUND postgis', 'ENOTFOUND')],
  // El pool agotado: 106 de 1000 peticiones acabaron así en la prueba de carga.
  ['pool agotado', conCodigo('timeout exceeded when trying to connect')],
  ['conexión rechazada', conCodigo('connect ECONNREFUSED 10.0.0.5:5432', 'ECONNREFUSED')],
  ['conexión cortada', conCodigo('Connection terminated unexpectedly')],
  ['servidor arrancando', conCodigo('the database system is starting up', '57P03')],
  ['sin cupo de conexiones', conCodigo('too many connections for role', '53300')],
];

describe('la base no está disponible (§24)', () => {
  for (const [nombre, error] of ERRORES_TRANSITORIOS) {
    it(`${nombre} → 503 con Retry-After, no 500`, async () => {
      const a = await levantar(error);
      const r = await a.inject({ method: 'GET', url: '/api/v1/reportes?limite=1' });
      expect(r.statusCode, `respondió ${r.statusCode}: ${r.body.slice(0, 120)}`).toBe(503);
      expect(r.json().codigo).toBe('NO_DISPONIBLE');
      expect(r.headers['retry-after']).toBeDefined();
    });
  }

  it('un error de verdad del servicio sigue siendo 500', async () => {
    // El 503 es para lo transitorio. Un fallo real no puede disfrazarse de saturación, porque
    // entonces nadie lo investiga: un bug quedaría escondido detrás de "probá más tarde".
    const a = await levantar(conCodigo('column "inventada" does not exist', '42703'));
    const r = await a.inject({ method: 'GET', url: '/api/v1/reportes?limite=1' });
    expect(r.statusCode).toBe(500);
    expect(r.json().codigo).toBe('ERROR_INTERNO');
  });

  it('/health responde aunque la base no esté: es liveness, no readiness', async () => {
    const a = await levantar(conCodigo('getaddrinfo ENOTFOUND postgis', 'ENOTFOUND'));
    const r = await a.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
  });

  it('/ready responde 503 cuando la base no está', async () => {
    const a = await levantar(conCodigo('getaddrinfo ENOTFOUND postgis', 'ENOTFOUND'));
    const r = await a.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(503);
    expect(r.json().db).toBe('error');
  });
});

describe('geo-service caído: crear un reporte es 503, no 500', () => {
  /** Cookie con el formato que exige `usuarioDeSesion` (64 hexadecimales). */
  const COOKIE = 'a'.repeat(64);

  /**
   * Pool que funciona; lo que falla es el resolver. Resuelve la sesión porque en este escenario
   * la base SÍ está: crear un reporte exige sesión, y sin esto la petición moriría en un 401 que
   * no tiene nada que ver con lo que se quiere comprobar.
   */
  const poolQueVa = {
    query: async (sql: string) => {
      if (/FROM sesion/.test(sql))
        return {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              email: 'vecina@test.local',
              nombre: 'Vecina',
              rol: 'ciudadano',
              refrescar: false,
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    options: { max: 8 },
  };

  async function conResolverRoto(error: Error) {
    const cfg = leerConfig({
      NODE_ENV: 'test',
      METRICAS_RUTA: '',
      RATE_LIMIT_REPORTES_POR_HORA: '1000',
    });
    app = await crearApp({
      // biome-ignore lint/suspicious/noExplicitAny: pool de mentira, solo la forma mínima
      pool: poolQueVa as any,
      cfg,
      resolver: {
        resolver: async () => {
          throw error;
        },
        invalidarCapas: async () => {},
      },
      almacen: new AlmacenMemoria(),
    });
    return app;
  }

  const reporte = {
    lat: -17.7833,
    lon: -63.1815,
    ubicacion_metodo: 'manual',
    ubicacion_tipo: 'via_publica',
    descripcion: 'Se junta agua en la esquina cada vez que llueve fuerte.',
    tirante_estimado: 'rodilla',
    duracion_estimada: '2h_12h',
    frecuencia: 'ocasional',
    afectacion: 'peatonal',
    causa_presunta: 'desconocida',
    sitio_web: '',
  };

  it('geo-service no responde → 503 con Retry-After y un mensaje que se entiende', async () => {
    const a = await conResolverRoto(new GeoNoDisponible('TypeError'));
    const r = await a.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: reporte,
      cookies: { curichi_sesion: COOKIE },
    });
    expect(r.statusCode, `respondió ${r.statusCode}: ${r.body.slice(0, 160)}`).toBe(503);
    expect(r.json().codigo).toBe('NO_DISPONIBLE');
    expect(r.headers['retry-after']).toBeDefined();
    // Al vecino no se le dice «error interno»: se le dice que reintente y que no se duplica.
    expect(r.json().mensaje).not.toMatch(/interno/i);
    expect(r.json().mensaje).toMatch(/de nuevo/i);
  }, 20_000);

  it('un fallo de verdad del resolver sigue siendo 500', async () => {
    // Un 4xx de geo-service significa que le mandamos algo mal: es un defecto nuestro y tiene
    // que verse como tal, no esconderse detrás de «probá más tarde».
    const a = await conResolverRoto(new Error('geo-service respondió 400'));
    const r = await a.inject({
      method: 'POST',
      url: '/api/v1/reportes',
      payload: reporte,
      cookies: { curichi_sesion: COOKIE },
    });
    expect(r.statusCode).toBe(500);
    expect(r.json().codigo).toBe('ERROR_INTERNO');
  }, 20_000);
});

describe('almacén de fotos caído: degradado, no fuera de rotación', () => {
  it('/ready sigue en 200, marca fotos=error y degradado', async () => {
    // Con S3/MinIO caído esta réplica sirve el mapa y los reportes, pero ni guarda ni devuelve
    // fotos. Antes la readiness decía "ok" sin más y el fallo solo se veía cuando un vecino
    // intentaba adjuntar una foto y recibía un 500.
    const cfg = leerConfig({
      NODE_ENV: 'test',
      GEO_SERVICE_URL: 'http://127.0.0.1:59999',
      METRICAS_RUTA: '',
    });
    const almacen = new AlmacenMemoria();
    (almacen as unknown as { comprobar: () => Promise<void> }).comprobar = async () => {
      throw new Error('No se pudo hablar con el almacén S3 (HTTP 500)');
    };
    app = await crearApp({
      pool: {
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0,
        options: { max: 8 },
        // biome-ignore lint/suspicious/noExplicitAny: pool de mentira, solo la forma mínima
      } as any,
      cfg,
      resolver: resolverDePrueba,
      almacen,
    });
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.statusCode).toBe(200);
    const cuerpo = r.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.fotos).toBe('error');
    expect(cuerpo.degradado).toBe(true);
  }, 20_000);

  it('sin sonda (disco o memoria) la readiness no inventa un fallo', async () => {
    const cfg = leerConfig({
      NODE_ENV: 'test',
      GEO_SERVICE_URL: 'http://127.0.0.1:59999',
      METRICAS_RUTA: '',
    });
    app = await crearApp({
      pool: {
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0,
        options: { max: 8 },
        // biome-ignore lint/suspicious/noExplicitAny: pool de mentira, solo la forma mínima
      } as any,
      cfg,
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    const r = await app.inject({ method: 'GET', url: '/ready' });
    expect(r.json().fotos).toBe('ok');
  }, 20_000);
});

describe('geo-service caído no saca a la réplica de rotación (§24)', () => {
  it('/ready sigue en 200 y marca degradado cuando solo falla geo-service', async () => {
    // Pool que SÍ funciona; geo-service apuntando a un puerto donde no hay nadie.
    const cfg = leerConfig({
      NODE_ENV: 'test',
      GEO_SERVICE_URL: 'http://127.0.0.1:59999',
      METRICAS_RUTA: '',
    });
    app = await crearApp({
      pool: {
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => ({ query: async () => ({ rows: [] }), release() {} }),
        totalCount: 1,
        idleCount: 1,
        waitingCount: 0,
        options: { max: 8 },
        // biome-ignore lint/suspicious/noExplicitAny: pool de mentira, solo la forma mínima
      } as any,
      cfg,
      resolver: resolverDePrueba,
      almacen: new AlmacenMemoria(),
    });
    const r = await app.inject({ method: 'GET', url: '/ready' });
    // 200: esta réplica puede servir todo el camino de lectura, que es la mayor parte del tráfico.
    expect(r.statusCode).toBe(200);
    const cuerpo = r.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.db).toBe('ok');
    expect(cuerpo.geo).toBe('error');
    // …pero lo dice, para que se vea en el panel y en los healthchecks del orquestador.
    expect(cuerpo.degradado).toBe(true);
  }, 20_000);
});
