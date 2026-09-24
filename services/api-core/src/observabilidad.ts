import { timingSafeEqual } from 'node:crypto';
/**
 * Observabilidad mínima y útil (CLAUDE.md §8.2), no un tablero lleno de métricas que nadie mira.
 *
 * Dos piezas:
 *  1. `X-Request-Id` de ida y vuelta: el id que trae (o genera) api-core viaja a geo-service y
 *     vuelve al cliente en la respuesta. Con un solo id se sigue una petición por los dos
 *     servicios y por sus logs.
 *  2. Un puñado de contadores e histogramas en formato Prometheus, elegidos por lo que uno
 *     querría mirar a las 3 de la mañana: ¿responde?, ¿con qué latencia?, ¿cuántos 5xx?,
 *     ¿estamos rechazando por rate limit?, ¿se están creando y validando reportes?
 */
import type { FastifyInstance } from 'fastify';

/** Cotas de latencia en segundos. Pensadas para una API que debería responder en decenas de ms. */
const CUBETAS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

class Histograma {
  private cuentas = new Array(CUBETAS.length + 1).fill(0);
  private suma = 0;
  private total = 0;
  observar(segundos: number) {
    this.suma += segundos;
    this.total++;
    let i = CUBETAS.findIndex((c) => segundos <= c);
    if (i < 0) i = CUBETAS.length;
    this.cuentas[i]!++;
  }
  exponer(nombre: string, etiquetas: string): string[] {
    const lineas: string[] = [];
    let acumulado = 0;
    for (let i = 0; i < CUBETAS.length; i++) {
      acumulado += this.cuentas[i]!;
      const coma = etiquetas ? `${etiquetas},` : '';
      lineas.push(`${nombre}_bucket{${coma}le="${CUBETAS[i]}"} ${acumulado}`);
    }
    acumulado += this.cuentas[CUBETAS.length]!;
    const coma = etiquetas ? `${etiquetas},` : '';
    lineas.push(`${nombre}_bucket{${coma}le="+Inf"} ${acumulado}`);
    lineas.push(`${nombre}_sum{${etiquetas}} ${this.suma}`);
    lineas.push(`${nombre}_count{${etiquetas}} ${this.total}`);
    return lineas;
  }
}

/** Registro en memoria. Suficiente para un proceso; con varias réplicas, Prometheus los suma. */
export class Metricas {
  private contadores = new Map<string, number>();
  private histogramas = new Map<string, Histograma>();
  /**
   * Medidores: valores que se LEEN en el momento del scrape en vez de acumularse. El tamaño del
   * pool o la cola de espera no son sumas históricas; guardarlos como contador daría un número
   * sin sentido. La función se invoca al exponer, así que debe ser barata y no bloquear.
   */
  private medidores = new Map<string, { etiquetas: string; leer: () => number }>();

  medidor(nombre: string, leer: () => number, etiquetas: Record<string, string> = {}) {
    this.medidores.set(`${nombre}|${serializar(etiquetas)}`, {
      etiquetas: serializar(etiquetas),
      leer,
    });
  }

  contar(nombre: string, etiquetas: Record<string, string> = {}, cuanto = 1) {
    const clave = `${nombre}|${serializar(etiquetas)}`;
    this.contadores.set(clave, (this.contadores.get(clave) ?? 0) + cuanto);
  }

  observar(nombre: string, etiquetas: Record<string, string>, segundos: number) {
    const clave = `${nombre}|${serializar(etiquetas)}`;
    let h = this.histogramas.get(clave);
    if (!h) {
      h = new Histograma();
      this.histogramas.set(clave, h);
    }
    h.observar(segundos);
  }

  /** Texto en formato de exposición de Prometheus. */
  exponer(): string {
    const lineas: string[] = [];
    const tipos = new Set<string>();
    for (const [clave, valor] of this.contadores) {
      const [nombre, etiquetas] = clave.split('|') as [string, string];
      if (!tipos.has(nombre)) {
        lineas.push(`# TYPE ${nombre} counter`);
        tipos.add(nombre);
      }
      lineas.push(`${nombre}{${etiquetas}} ${valor}`);
    }
    for (const [clave, h] of this.histogramas) {
      const [nombre, etiquetas] = clave.split('|') as [string, string];
      if (!tipos.has(nombre)) {
        lineas.push(`# TYPE ${nombre} histogram`);
        tipos.add(nombre);
      }
      lineas.push(...h.exponer(nombre, etiquetas));
    }
    for (const [clave, m] of this.medidores) {
      const nombre = clave.split('|')[0] as string;
      if (!tipos.has(nombre)) {
        lineas.push(`# TYPE ${nombre} gauge`);
        tipos.add(nombre);
      }
      let valor: number;
      try {
        valor = m.leer();
      } catch {
        // Un medidor que falla no puede tumbar /metrics: es el endpoint al que se acude
        // justamente cuando algo va mal.
        continue;
      }
      if (Number.isFinite(valor)) lineas.push(`${nombre}{${m.etiquetas}} ${valor}`);
    }
    return `${lineas.join('\n')}\n`;
  }
}

/** Palabra clave inicial de una consulta, para etiquetar sin explotar la cardinalidad. */
function operacionSql(sql: string): string {
  const m = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*([a-z]+)/i.exec(sql);
  const verbo = (m?.[1] ?? 'otra').toLowerCase();
  return ['select', 'insert', 'update', 'delete', 'begin', 'commit', 'rollback'].includes(verbo)
    ? verbo
    : 'otra';
}

/** Lo mínimo que hace falta de un pool para instrumentarlo, sin arrastrar el tipo de `pg`. */
export interface PoolObservable {
  query: (...args: never[]) => Promise<unknown>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options?: { max?: number };
}

/**
 * Instrumenta el pool: duración de consultas por tipo de operación y estado de las conexiones.
 *
 * Por qué hace falta. Cuando la API va lenta hay dos respuestas posibles —la base tarda, o no
 * hay conexiones libres— y son problemas opuestos: la primera se arregla con un índice y la
 * segunda subiendo el pool o bajando la concurrencia. Sin `db_pool_esperando` no se distinguen
 * y se acaba adivinando.
 *
 * La etiqueta es solo el verbo SQL (siete valores posibles). Poner la consulta entera, o peor,
 * un id, multiplicaría las series por cada valor distinto y tumbaría el almacenamiento de
 * métricas, que es el modo clásico de romper Prometheus desde la aplicación.
 */
export function instrumentarPool(pool: PoolObservable, metricas: Metricas): void {
  /** Mide una llamada a `query`, venga del pool o de un cliente dedicado. */
  const medir = (fn: (...a: never[]) => unknown, args: never[]) => {
    const primero = args[0] as unknown;
    const sql =
      typeof primero === 'string'
        ? primero
        : ((primero as { text?: string } | undefined)?.text ?? '');
    const operacion = operacionSql(sql);
    const inicio = process.hrtime.bigint();
    const fin = (estado: 'ok' | 'error') => {
      metricas.observar(
        'curichi_db_consulta_segundos',
        { operacion },
        Number(process.hrtime.bigint() - inicio) / 1e9,
      );
      if (estado === 'error') metricas.contar('curichi_db_errores_total', { operacion });
    };
    let r: unknown;
    try {
      r = fn(...args);
    } catch (e) {
      fin('error');
      throw e;
    }
    // `query` admite callback además de promesa; si no devuelve un thenable no hay nada que
    // medir y se devuelve tal cual en vez de romper esa forma de llamada.
    if (!r || typeof (r as Promise<unknown>).then !== 'function') return r;
    return (r as Promise<unknown>).then(
      (v) => {
        fin('ok');
        return v;
      },
      (e) => {
        fin('error');
        throw e;
      },
    );
  };

  const original = pool.query.bind(pool) as (...args: never[]) => Promise<unknown>;
  const envuelta = (...args: never[]) => medir(original, args);
  (pool as { query: unknown }).query = envuelta;

  // `pool.connect()` devuelve un cliente cuyo `query` NO pasa por el de arriba: sin envolverlo
  // también, el histograma se quedaría solo con las lecturas y **todas las escrituras quedarían
  // fuera**, que es justo la mitad interesante. Se envuelve el cliente al entregarlo y se le quita
  // la envoltura al soltarlo, porque el pool reutiliza el mismo objeto.
  const conectar = (pool as unknown as { connect?: (...a: never[]) => Promise<unknown> }).connect;
  if (typeof conectar === 'function') {
    (pool as unknown as { connect: unknown }).connect = async function (
      this: unknown,
      ...a: never[]
    ) {
      const cliente = (await conectar.apply(pool, a)) as {
        query: (...q: never[]) => unknown;
        release?: (...r: never[]) => unknown;
        __curichiEnvuelto?: boolean;
      };
      if (cliente && !cliente.__curichiEnvuelto) {
        cliente.__curichiEnvuelto = true;
        const originalCliente = cliente.query.bind(cliente);
        cliente.query = (...q: never[]) => medir(originalCliente, q);
      }
      return cliente;
    };
  }

  metricas.medidor('curichi_db_pool_conexiones', () => pool.totalCount, { estado: 'total' });
  metricas.medidor('curichi_db_pool_conexiones', () => pool.idleCount, { estado: 'libre' });
  metricas.medidor('curichi_db_pool_conexiones', () => pool.totalCount - pool.idleCount, {
    estado: 'en_uso',
  });
  // La cola: peticiones que ya pidieron conexión y están esperando. Si esto no es cero de forma
  // sostenida, el pool es el cuello de botella y no la base.
  metricas.medidor('curichi_db_pool_esperando', () => pool.waitingCount);
  metricas.medidor('curichi_db_pool_max', () => pool.options?.max ?? 0);
}

function serializar(etiquetas: Record<string, string>): string {
  return Object.entries(etiquetas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/["\\\n]/g, '_')}"`)
    .join(',');
}

/** Solo se aceptan ids con pinta de id: llegan de fuera y acaban en los logs. */
const RE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Comparación de secretos sin filtrar por tiempo. Con `!==` el bucle sale en el primer byte
 * distinto, así que el tiempo de respuesta dice cuántos caracteres del token se acertaron y el
 * secreto se puede reconstruir carácter a carácter.
 */
export function igualEnTiempoConstante(recibido: unknown, esperado: string): boolean {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige la misma longitud; comparar contra un buffer del tamaño correcto
  // mantiene el coste constante y la longitud se descarta aparte.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface OpcionesObservabilidad {
  metricas: Metricas;
  /** Ruta de /metrics; si está vacía, no se expone. */
  exponerEn: string;
  /** Token opcional para proteger /metrics cuando el endpoint es alcanzable desde fuera. */
  token: string;
}

export function instalarObservabilidad(app: FastifyInstance, o: OpcionesObservabilidad) {
  // El id viaja al cliente para que pueda citarlo al reportar un problema.
  app.addHook('onRequest', async (req, res) => {
    const entrante = req.headers['x-request-id'];
    const id = typeof entrante === 'string' && RE_REQUEST_ID.test(entrante) ? entrante : req.id;
    req.requestId = String(id);
    res.header('X-Request-Id', req.requestId);
  });

  app.addHook('onResponse', async (req, res) => {
    // `routeOptions.url` es la plantilla (/api/v1/reportes/:id), no la URL concreta: sin eso
    // cada id crearía su propia serie temporal y la métrica sería inservible.
    const ruta = req.routeOptions?.url ?? 'desconocida';
    if (ruta === o.exponerEn) return;
    const etiquetas = { ruta, metodo: req.method, codigo: String(res.statusCode) };
    o.metricas.contar('curichi_http_peticiones_total', etiquetas);
    o.metricas.observar(
      'curichi_http_duracion_segundos',
      { ruta, metodo: req.method },
      res.elapsedTime / 1000,
    );
    if (res.statusCode === 429) o.metricas.contar('curichi_rate_limit_total', { ruta });
    if (res.statusCode >= 500) o.metricas.contar('curichi_errores_5xx_total', { ruta });
  });

  if (!o.exponerEn) return;
  app.get(o.exponerEn, async (req, res) => {
    if (o.token && !igualEnTiempoConstante(req.headers['x-token-metricas'], o.token))
      return res.status(403).send('prohibido');
    res.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    // Nunca cacheado: son valores del instante.
    res.header('Cache-Control', 'no-store');
    return o.metricas.exponer();
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}
