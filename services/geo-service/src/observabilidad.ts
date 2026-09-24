/**
 * Observabilidad de geo-service (Parte 4).
 *
 * Existe aparte de la de api-core porque la Parte 4 no puede importar código de la Parte 3
 * (CLAUDE.md §5.3), igual que `proxy.ts` y `comparar.ts`. Lo que se mide aquí no es lo mismo,
 * además: este servicio no escribe nada, y sus dos formas de ir lento son propias —consultas
 * espaciales a PostGIS, y fallos de caché que obligan a reconstruir una capa entera con su
 * índice de teselas, que son decenas de MB y varios segundos.
 *
 * Cardinalidad: las etiquetas son plantilla de ruta, método, código, verbo SQL y nombre de
 * caché. Ninguna lleva identificadores, coordenadas ni bbox; un bbox como etiqueta crearía una
 * serie nueva por cada movimiento del mapa de cada usuario.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

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
    const coma = etiquetas ? `${etiquetas},` : '';
    let acumulado = 0;
    for (let i = 0; i < CUBETAS.length; i++) {
      acumulado += this.cuentas[i]!;
      lineas.push(`${nombre}_bucket{${coma}le="${CUBETAS[i]}"} ${acumulado}`);
    }
    acumulado += this.cuentas[CUBETAS.length]!;
    lineas.push(`${nombre}_bucket{${coma}le="+Inf"} ${acumulado}`);
    lineas.push(`${nombre}_sum{${etiquetas}} ${this.suma}`);
    lineas.push(`${nombre}_count{${etiquetas}} ${this.total}`);
    return lineas;
  }
}

function serializar(etiquetas: Record<string, string>): string {
  return Object.entries(etiquetas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/["\\\n]/g, '_')}"`)
    .join(',');
}

export class MetricasGeo {
  private contadores = new Map<string, number>();
  private histogramas = new Map<string, Histograma>();
  private medidores = new Map<string, { etiquetas: string; leer: () => number }>();

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

  /** Valor leído en el momento del scrape (tamaño del pool, bytes en caché…). */
  medidor(nombre: string, leer: () => number, etiquetas: Record<string, string> = {}) {
    this.medidores.set(`${nombre}|${serializar(etiquetas)}`, {
      etiquetas: serializar(etiquetas),
      leer,
    });
  }

  exponer(): string {
    const lineas: string[] = [];
    const tipos = new Set<string>();
    const tipo = (nombre: string, clase: string) => {
      if (tipos.has(nombre)) return;
      lineas.push(`# TYPE ${nombre} ${clase}`);
      tipos.add(nombre);
    };
    for (const [clave, valor] of this.contadores) {
      const [nombre, etiquetas] = clave.split('|') as [string, string];
      tipo(nombre, 'counter');
      lineas.push(`${nombre}{${etiquetas}} ${valor}`);
    }
    for (const [clave, h] of this.histogramas) {
      const [nombre, etiquetas] = clave.split('|') as [string, string];
      tipo(nombre, 'histogram');
      lineas.push(...h.exponer(nombre, etiquetas));
    }
    for (const [clave, m] of this.medidores) {
      const nombre = clave.split('|')[0] as string;
      tipo(nombre, 'gauge');
      let valor: number;
      try {
        valor = m.leer();
      } catch {
        continue; // un medidor roto no puede tumbar el endpoint al que se acude cuando algo falla
      }
      if (Number.isFinite(valor)) lineas.push(`${nombre}{${m.etiquetas}} ${valor}`);
    }
    return `${lineas.join('\n')}\n`;
  }
}

/** Comparación sin filtrar por tiempo (igual que en api-core; ver `comparar.ts`). */
function igualEnTiempoConstante(recibido: unknown, esperado: string): boolean {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function operacionSql(sql: string): string {
  const m = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*([a-z]+)/i.exec(sql);
  const verbo = (m?.[1] ?? 'otra').toLowerCase();
  return ['select', 'insert', 'update', 'delete', 'begin', 'commit', 'rollback'].includes(verbo)
    ? verbo
    : 'otra';
}

export interface PoolObservable {
  query: (...args: never[]) => Promise<unknown>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  options?: { max?: number };
}

/** Duración de consultas por verbo y estado del pool. Mismo razonamiento que en api-core. */
export function instrumentarPool(pool: PoolObservable, metricas: MetricasGeo): void {
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
        'curichi_geo_db_consulta_segundos',
        { operacion },
        Number(process.hrtime.bigint() - inicio) / 1e9,
      );
      if (estado === 'error') metricas.contar('curichi_geo_db_errores_total', { operacion });
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

  metricas.medidor('curichi_geo_db_pool_conexiones', () => pool.totalCount, { estado: 'total' });
  metricas.medidor('curichi_geo_db_pool_conexiones', () => pool.idleCount, { estado: 'libre' });
  metricas.medidor('curichi_geo_db_pool_esperando', () => pool.waitingCount);
}

const RE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

export interface OpcionesObservabilidadGeo {
  metricas: MetricasGeo;
  /** Ruta de /metrics; vacía = no se expone. */
  exponerEn: string;
  token: string;
}

export function instalarObservabilidad(app: FastifyInstance, o: OpcionesObservabilidadGeo): void {
  app.addHook('onResponse', async (req, res) => {
    // Plantilla de ruta, nunca la URL concreta: `/geo/v1/teselas/:capa/:z/:x/:y` es UNA serie;
    // la URL concreta serían millones, una por tesela pedida.
    const ruta = req.routeOptions?.url ?? 'desconocida';
    if (ruta === o.exponerEn) return;
    o.metricas.contar('curichi_geo_http_peticiones_total', {
      ruta,
      metodo: req.method,
      codigo: String(res.statusCode),
    });
    o.metricas.observar(
      'curichi_geo_http_duracion_segundos',
      { ruta, metodo: req.method },
      res.elapsedTime / 1000,
    );
    if (res.statusCode === 429) o.metricas.contar('curichi_geo_rate_limit_total', { ruta });
    if (res.statusCode >= 500) o.metricas.contar('curichi_geo_errores_5xx_total', { ruta });
  });

  if (!o.exponerEn) return;
  app.get(o.exponerEn, async (req, res) => {
    if (o.token && !igualEnTiempoConstante(req.headers['x-token-metricas'], o.token))
      return res.status(403).send('prohibido');
    res.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.header('Cache-Control', 'no-store');
    return o.metricas.exponer();
  });
}

export { RE_REQUEST_ID };
