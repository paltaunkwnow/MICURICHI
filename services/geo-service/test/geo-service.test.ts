import { createHash } from 'node:crypto';
import {
  type AgregadoUv,
  AgregadoUvSchema,
  CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES,
  CapaInfoSchema,
  rutaCapaConHuella,
} from 'contracts';
import { ejecutorPg, recalcularPuntosCriticos } from 'db';
import {
  type BaseEfimera,
  cargarCapasDePrueba,
  insertarReporte,
  levantarBaseEfimera,
} from 'db/test-utils';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { crearApp } from '../src/app.js';
import { leerConfig } from '../src/config.js';
import { resolverPunto } from '../src/resolver.js';

let base: BaseEfimera;
let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 3 });
  await cargarCapasDePrueba(ejecutorPg(pool));
  app = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  await base?.cerrar();
});

async function resolver(lat: number, lon: number) {
  const r = await app.inject({ method: 'POST', url: '/geo/v1/resolver', payload: { lat, lon } });
  expect(r.statusCode).toBe(200);
  return r.json();
}

describe('POST /geo/v1/resolver (§7.4)', () => {
  it('punto interior → UV y distrito correctos, sin banderas', async () => {
    const r = await resolver(-17.79, -63.195);
    expect(r.dentro_cobertura).toBe(true);
    expect(r.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(r.distrito.id).toBe('distrito_municipal:01');
    expect(r.en_limite).toBe(false);
    expect(r.asignado_por_proximidad).toBe(false);
    expect(r.version_capa).toBe('test');
  });
  it('punto dentro de una manzana: manzana null (0.17.0: ya no se calcula)', async () => {
    const r = await resolver(-17.797, -63.197);
    expect(r.manzana).toBeNull();
  });
  it('punto sobre el borde A|B → determinista (menor id) y en_limite', async () => {
    const r = await resolver(-17.79, -63.19);
    expect(r.unidad_vecinal.id).toBe('unidad_vecinal:A');
    expect(r.en_limite).toBe(true);
  });
  it('punto en el hueco entre B y C → UV más cercana por proximidad con distancia', async () => {
    const r = await resolver(-17.79, -63.17985); // ~16 m de B (que termina en −63.18)
    expect(r.dentro_cobertura).toBe(true);
    expect(r.asignado_por_proximidad).toBe(true);
    expect(r.distancia_m).toBeGreaterThan(0);
    expect(r.distancia_m).toBeLessThanOrEqual(20);
  });
  it('punto en el hueco pero MÁS ALLÁ de la tolerancia → fuera de cobertura', async () => {
    // El hueco entre B (termina en −63,18) y C (empieza en −63,1795) mide unos 53 m. Este punto
    // está a ~25 m de B: dentro del prefiltro por índice que usa el resolver (que trabaja en
    // grados y es a propósito más ancho, ~40 m) pero fuera de los 20 m de tolerancia real.
    // Si alguien quitara la comprobación exacta en metros por «simplificar», este caso pasaría a
    // asignarse a B y el reporte quedaría en una unidad vecinal que no le toca.
    const r = await resolver(-17.79, -63.179764);
    expect(r.asignado_por_proximidad).toBe(false);
    expect(r.dentro_cobertura).toBe(false);
    expect(r.unidad_vecinal).toBeNull();
  });
  it('punto lejos → fuera de cobertura', async () => {
    const r = await resolver(-17.5, -63.0);
    expect(r.dentro_cobertura).toBe(false);
    expect(r.unidad_vecinal).toBeNull();
  });
  it('rechaza coordenadas inválidas', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/geo/v1/resolver',
      payload: { lat: 95, lon: 0 },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('capas, teselas y agregados', () => {
  it('informa versiones vigentes y sirve GeoJSON con ETag', async () => {
    const v = await app.inject({ method: 'GET', url: '/geo/v1/capas/vigentes' });
    expect(v.json().unidad_vecinal).toBe('test');
    const c = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
    expect(c.statusCode).toBe(200);
    expect(c.headers.etag).toMatch(/^"unidad_vecinal-[0-9a-f]{16}"$/);
    expect(c.json().features).toHaveLength(3);
    const info = await app.inject({ method: 'GET', url: '/geo/v1/capas' });
    expect(info.json().map((x: { capa: string }) => x.capa)).toEqual([
      'distrito_municipal',
      'unidad_vecinal',
      'manzana',
    ]);
  });
  it('genera teselas MVT al vuelo y 204 en vacías', async () => {
    // tesela z=14 que contiene −63.19,−17.79
    const z = 14;
    const x = Math.floor(((-63.19 + 180) / 360) * 2 ** z);
    const latRad = (-17.79 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    const t = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${z}/${x}/${y}.mvt`,
    });
    expect(t.statusCode).toBe(200);
    expect(t.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
    expect(t.rawPayload.length).toBeGreaterThan(20);
    const vacia = await app.inject({
      method: 'GET',
      url: `/geo/v1/teselas/unidad_vecinal/${z}/0/0.mvt`,
    });
    expect(vacia.statusCode).toBe(204);
  });
  it('agrega los reportes publicados por UV y lista puntos críticos solo con verificados', async () => {
    const ex = ejecutorPg(pool);
    await insertarReporte(ex, -63.195, -17.79, 'validado', 'alta');
    await insertarReporte(ex, -63.19502, -17.79001, 'validado', 'baja');
    await insertarReporte(ex, -63.195, -17.795, 'nuevo', 'critica');
    await recalcularPuntosCriticos(ex);
    const a = await app.inject({ method: 'GET', url: '/geo/v1/agregados/unidades-vecinales' });
    const uvA = a
      .json()
      .find((u: { unidad_vecinal_id: string }) => u.unidad_vecinal_id === 'unidad_vecinal:A');
    expect(uvA.n_reportes).toBe(3);
    expect(uvA.n_verificados).toBe(2);
    expect(uvA.severidad_max).toBe('critica');
    expect(uvA.severidad_max_verificada).toBe('alta');
    const pc = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    expect(pc.statusCode).toBe(200);
    expect(pc.json()[0].n_reportes).toBe(2);
    const malo = await app.inject({ method: 'GET', url: '/geo/v1/puntos-criticos?bbox=1,2,3' });
    expect(malo.statusCode).toBe(400);
  });

  /**
   * `radio_m`, `diametro_m` y `advertencia_diametro` se calculan sobre las coordenadas EXACTAS de
   * los miembros del grupo: `diametro_m` es la distancia entre los dos más separados, redondeada a
   * 0,1 m. Esta ruta es pública y publica el centroide ya degradado, así que soltar además una
   * medida exacta sobre las posiciones reales es dar una ecuación que acota dónde están de verdad
   * (CLAUDE.md §13, dato mínimo). Siguen en la tabla para el análisis del técnico (§9.2).
   */
  it('no publica ninguna medida derivada de la geometría exacta', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    expect(r.statusCode).toBe(200);
    const puntos = r.json() as Array<Record<string, unknown>>;
    expect(puntos.length).toBeGreaterThan(0);
    for (const p of puntos)
      for (const campo of CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES)
        expect(p, `«${campo}» no puede salir por una ruta pública`).not.toHaveProperty(campo);
    // Y el cuerpo entero, por si algún día vuelven con otro nombre en un objeto anidado.
    for (const campo of CAMPOS_PUNTO_CRITICO_NO_PUBLICABLES) expect(r.body).not.toContain(campo);
  });

  it('sigue publicando lo que el mapa necesita', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/geo/v1/puntos-criticos?bbox=-63.3,-17.9,-63.1,-17.7',
    });
    const [p] = r.json() as Array<Record<string, unknown>>;
    for (const campo of [
      'id',
      'lat',
      'lon',
      'n_reportes',
      'severidad_max',
      'unidad_vecinal_id',
      'calculado_en',
    ])
      expect(p).toHaveProperty(campo);
  });
});

/**
 * S21 (contrato 0.11.0): la coropleta cuenta lo publicado (nuevo, validado y resuelto con
 * publicar_en <= now()), pero el color público sale solo de lo verificado. Cada prueba mira la
 * diferencia antes/después en una UV, para no depender del orden ni de los datos de otras pruebas.
 */
describe('agregados por UV: publicados con y sin verificar (S21)', () => {
  const coordenadas = {
    'unidad_vecinal:B': [-63.185, -17.79],
    'unidad_vecinal:C': [-63.175, -17.79],
  };

  async function reporteEn(
    uv: keyof typeof coordenadas,
    estado: string,
    severidad: string,
    { enEspera = false } = {},
  ) {
    const [lon, lat] = coordenadas[uv];
    const id = await insertarReporte(ejecutorPg(pool), lon!, lat!, estado, severidad);
    // insertarReporte deja todo en la UV A; publicar_en cae por defecto en now() (ya publicado).
    await pool.query(
      `UPDATE reporte_inundacion SET unidad_vecinal_id = $2
         ${enEspera ? ", publicar_en = creado_en + interval '10 minutes'" : ''}
       WHERE id = $1`,
      [id, uv],
    );
  }

  async function agregadoDe(uv: string): Promise<AgregadoUv> {
    app.agregados.invalidar();
    const r = await app.inject({ method: 'GET', url: '/geo/v1/agregados/unidades-vecinales' });
    expect(r.statusCode).toBe(200);
    const lista = z.array(AgregadoUvSchema).parse(r.json());
    const fila = lista.find((u) => u.unidad_vecinal_id === uv);
    expect(fila, `falta ${uv} en los agregados`).toBeDefined();
    return fila!;
  }

  it('la respuesta cumple AgregadoUvSchema y una UV sin reportes da ceros y null', async () => {
    const c = await agregadoDe('unidad_vecinal:C');
    expect(c).toMatchObject({
      n_reportes: 0,
      n_verificados: 0,
      n_puntos_criticos: 0,
      severidad_max: null,
      severidad_max_verificada: null,
    });
  });

  it('un nuevo publicado suma a n_reportes y no a n_verificados', async () => {
    const antes = await agregadoDe('unidad_vecinal:C');
    await reporteEn('unidad_vecinal:C', 'nuevo', 'media');
    const despues = await agregadoDe('unidad_vecinal:C');
    expect(despues.n_reportes - antes.n_reportes).toBe(1);
    expect(despues.n_verificados).toBe(antes.n_verificados);
  });

  it('un nuevo de más de 70 cm pinta severidad_max pero no severidad_max_verificada', async () => {
    await reporteEn('unidad_vecinal:B', 'validado', 'baja');
    await reporteEn('unidad_vecinal:B', 'nuevo', 'critica');
    const b = await agregadoDe('unidad_vecinal:B');
    expect(b.n_reportes).toBe(2);
    expect(b.n_verificados).toBe(1);
    expect(b.severidad_max).toBe('critica');
    expect(b.severidad_max_verificada).toBe('baja');
  });

  it('un reporte que todavía espera su publicar_en no suma', async () => {
    const antes = await agregadoDe('unidad_vecinal:C');
    await reporteEn('unidad_vecinal:C', 'nuevo', 'critica', { enEspera: true });
    await reporteEn('unidad_vecinal:C', 'validado', 'critica', { enEspera: true });
    const despues = await agregadoDe('unidad_vecinal:C');
    expect(despues).toEqual(antes);
  });

  it('rechazado y duplicado no suman', async () => {
    const antes = await agregadoDe('unidad_vecinal:C');
    await reporteEn('unidad_vecinal:C', 'rechazado', 'critica');
    await reporteEn('unidad_vecinal:C', 'duplicado', 'critica');
    const despues = await agregadoDe('unidad_vecinal:C');
    expect(despues).toEqual(antes);
  });

  it('resuelto cuenta como verificado', async () => {
    const antes = await agregadoDe('unidad_vecinal:C');
    await reporteEn('unidad_vecinal:C', 'resuelto', 'alta');
    const despues = await agregadoDe('unidad_vecinal:C');
    expect(despues.n_reportes - antes.n_reportes).toBe(1);
    expect(despues.n_verificados - antes.n_verificados).toBe(1);
    expect(despues.severidad_max_verificada).toBe('alta');
  });
});

describe('cupo del resolver: exención con token interno (hallazgo 1)', () => {
  it('sin token comparte el cupo público; con el token interno válido queda fuera del cupo', async () => {
    // Cupo de 1 por minuto para que la segunda petición pública ya caiga en 429, como pasaría en
    // una tormenta real con el cupo de producción agotado por el propio tráfico de api-core.
    const cfg = {
      ...leerConfig({ DATABASE_URL: base.url }),
      rateLimitConsultasPorMinuto: 1,
      tokenInterno: 'secreto-resolver-test',
    };
    const appLimitado = await crearApp({ pool, cfg });
    try {
      const payload = { lat: -17.79, lon: -63.195 };
      const primero = await appLimitado.inject({
        method: 'POST',
        url: '/geo/v1/resolver',
        payload,
      });
      expect(primero.statusCode).toBe(200);
      // Cupo agotado: la siguiente petición pública (sin cabecera) cae en 429.
      const segundo = await appLimitado.inject({
        method: 'POST',
        url: '/geo/v1/resolver',
        payload,
      });
      expect(segundo.statusCode).toBe(429);
      // api-core manda el token interno: no cuenta contra el cupo ya agotado.
      const conToken = await appLimitado.inject({
        method: 'POST',
        url: '/geo/v1/resolver',
        payload,
        headers: { 'x-token-interno': 'secreto-resolver-test' },
      });
      expect(conToken.statusCode).toBe(200);
      // Un token incorrecto no exime a nadie: sigue tratándose como tráfico público agotado.
      const tokenMalo = await appLimitado.inject({
        method: 'POST',
        url: '/geo/v1/resolver',
        payload,
        headers: { 'x-token-interno': 'otro' },
      });
      expect(tokenMalo.statusCode).toBe(429);
    } finally {
      await appLimitado.close();
    }
  });
});

describe('timeout de consultas: 503 con Retry-After, no 500 (hallazgo 2)', () => {
  it('si la consulta del resolver se cancela por statement_timeout (57014), responde 503 con Retry-After', async () => {
    // Pool falso: sin abrir una conexión real, reproduce lo que hace `pg` cuando PostGIS cancela
    // la consulta por `statement_timeout` (SQLSTATE 57014 / query_canceled).
    const poolQueExpira = {
      query: async () => {
        throw Object.assign(new Error('canceling statement due to statement timeout'), {
          code: '57014',
        });
      },
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    } as unknown as pg.Pool;
    const appConTimeout = await crearApp({
      pool: poolQueExpira,
      cfg: leerConfig({ DATABASE_URL: base.url }),
    });
    try {
      const r = await appConTimeout.inject({
        method: 'POST',
        url: '/geo/v1/resolver',
        payload: { lat: -17.79, lon: -63.195 },
      });
      expect(r.statusCode).toBe(503);
      expect(r.headers['retry-after']).toBeDefined();
      expect(r.json().codigo).toBe('NO_DISPONIBLE');
    } finally {
      await appConTimeout.close();
    }
  });
});

describe('ETag / If-None-Match: 304 sin cuerpo (hallazgo 3)', () => {
  it('/geo/v1/capas/:capa responde 304 sin cuerpo cuando If-None-Match coincide', async () => {
    const primero = await app.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' });
    expect(primero.statusCode).toBe(200);
    const etag = primero.headers.etag as string;
    const segundo = await app.inject({
      method: 'GET',
      url: '/geo/v1/capas/unidad_vecinal',
      headers: { 'if-none-match': etag },
    });
    expect(segundo.statusCode).toBe(304);
    expect(segundo.body).toBe('');
    expect(segundo.headers.etag).toBe(etag);
    expect(segundo.headers['cache-control']).toBe('public, no-cache');
  });

  it('una tesela responde 304 sin cuerpo cuando If-None-Match coincide', async () => {
    const z = 14;
    const x = Math.floor(((-63.19 + 180) / 360) * 2 ** z);
    const latRad = (-17.79 * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    const url = `/geo/v1/teselas/unidad_vecinal/${z}/${x}/${y}.mvt`;
    const primero = await app.inject({ method: 'GET', url });
    expect(primero.statusCode).toBe(200);
    const etag = primero.headers.etag as string;
    const segundo = await app.inject({ method: 'GET', url, headers: { 'if-none-match': etag } });
    expect(segundo.statusCode).toBe(304);
    expect(segundo.rawPayload.length).toBe(0);
    expect(segundo.headers.etag).toBe(etag);
  });
});

describe('ruta interna /geo/v1/capas/invalidar', () => {
  it('sin token configurado solo la acepta desde loopback', async () => {
    const r = await app.inject({ method: 'POST', url: '/geo/v1/capas/invalidar' });
    expect(r.statusCode).toBe(200);
    // remoteAddress falsificado: una petición que no venga de la propia máquina se rechaza.
    const fuera = await app.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      remoteAddress: '203.0.113.7',
    });
    expect(fuera.statusCode).toBe(403);
  });

  it('con token configurado exige la cabecera correcta', async () => {
    const conToken = await crearApp({
      pool,
      cfg: { ...leerConfig({ DATABASE_URL: base.url }), tokenInterno: 'secreto-compartido' },
    });
    const sin = await conToken.inject({ method: 'POST', url: '/geo/v1/capas/invalidar' });
    expect(sin.statusCode).toBe(403);
    const malo = await conToken.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      headers: { 'x-token-interno': 'otro' },
    });
    expect(malo.statusCode).toBe(403);
    const bueno = await conToken.inject({
      method: 'POST',
      url: '/geo/v1/capas/invalidar',
      headers: { 'x-token-interno': 'secreto-compartido' },
    });
    expect(bueno.statusCode).toBe(200);
    await conToken.close();
  });
});

describe('caché de capas', () => {
  it('varias peticiones simultáneas de una capa fría hacen UNA sola carga', async () => {
    app.capas.invalidar();
    const antes = (await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM geo.manzana'))
      .rows[0]!.n;
    expect(Number(antes)).toBeGreaterThan(0);
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => app.capas.obtener('unidad_vecinal')),
    );
    // Todas comparten exactamente el mismo objeto: una sola carga de la capa.
    for (const r of respuestas) expect(r).toBe(respuestas[0]);
  });
});

describe('resolver: manzana ya no se consulta (M-1.1, contrato 0.17.0)', () => {
  it('ninguna consulta del resolver menciona geo.manzana, y devuelve manzana null', async () => {
    const consultas: string[] = [];
    // Espía: registra el SQL de cada consulta y delega en el pool real.
    const espia = {
      query: (texto: unknown, params?: unknown) => {
        const sql =
          typeof texto === 'string' ? texto : String((texto as { text?: string })?.text ?? '');
        consultas.push(sql);
        return (pool.query as (t: unknown, p?: unknown) => Promise<unknown>)(texto, params);
      },
    } as unknown as pg.Pool;
    // Punto dentro de la manzana sintética A-1 (antes el resolver devolvía manzana:A-1).
    const r = await resolverPunto(espia, -17.797, -63.197);
    expect(r.manzana).toBeNull();
    expect(consultas.length).toBeGreaterThan(0);
    for (const sql of consultas) expect(sql.toLowerCase()).not.toContain('manzana');
  });
});

describe('capas: índice de teselas perezoso y sin GeoJSON retenido (M-1.2, M-1.3)', () => {
  function teselaDe(lon: number, lat: number, z: number) {
    const x = Math.floor(((lon + 180) / 360) * 2 ** z);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
    );
    return { z, x, y };
  }

  it('GET /capas no arma índices; la primera tesela lo arma y la segunda lo reutiliza', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    try {
      const info = await propia.inject({ method: 'GET', url: '/geo/v1/capas' });
      expect(info.statusCode).toBe(200);
      // Tras /capas, la entrada de caché existe pero SIN índice de teselas.
      const antes = await propia.capas.obtener('unidad_vecinal');
      expect(antes).not.toBeNull();
      expect(antes!.indice).toBeUndefined();

      const { z: tz, x, y } = teselaDe(-63.19, -17.79, 14);
      const t1 = await propia.inject({
        method: 'GET',
        url: `/geo/v1/teselas/unidad_vecinal/${tz}/${x}/${y}.mvt`,
      });
      expect(t1.statusCode).toBe(200);
      const conIndice = await propia.capas.obtener('unidad_vecinal');
      const indice1 = conIndice!.indice;
      expect(indice1).toBeDefined();

      // Segunda tesela de la misma capa: el mismo índice, no se reconstruye.
      const t2 = await propia.inject({
        method: 'GET',
        url: `/geo/v1/teselas/unidad_vecinal/${tz}/${x}/${y + 1}.mvt`,
      });
      expect([200, 204]).toContain(t2.statusCode);
      const reusado = await propia.capas.obtener('unidad_vecinal');
      expect(reusado!.indice).toBe(indice1);
    } finally {
      await propia.close();
    }
  });

  it('la caché guarda texto/bytes/n_features/bbox pero no el GeoJSON parseado', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    try {
      await propia.inject({ method: 'GET', url: '/geo/v1/capas' });
      const c = await propia.capas.obtener('unidad_vecinal');
      expect(c).not.toBeNull();
      expect(c).not.toHaveProperty('geojson');
      expect(typeof c!.texto).toBe('string');
      expect(typeof c!.bytes).toBe('number');
      expect(typeof c!.n_features).toBe('number');
      expect(c!.n_features).toBeGreaterThan(0);
    } finally {
      await propia.close();
    }
  });

  it('M-1.3: /capas conserva huella, bytes, n_features, bbox, modo y url del contenido servido', async () => {
    const propia = await crearApp({ pool, cfg: leerConfig({ DATABASE_URL: base.url }) });
    try {
      const cuerpo = (await propia.inject({ method: 'GET', url: '/geo/v1/capas/unidad_vecinal' }))
        .body;
      const fc = JSON.parse(cuerpo) as { features: unknown[] };
      const huella = createHash('sha256').update(cuerpo).digest('hex').slice(0, 16);
      const info = z
        .array(CapaInfoSchema)
        .parse((await propia.inject({ method: 'GET', url: '/geo/v1/capas' })).json());
      const uv = info.find((c) => c.capa === 'unidad_vecinal')!;
      expect(uv.modo).toBe('geojson');
      expect(uv.url).toBe(rutaCapaConHuella('unidad_vecinal', huella));
      expect(uv.bytes_web).toBe(Buffer.byteLength(cuerpo));
      expect(uv.n_features).toBe(fc.features.length);
      expect(uv.bbox).toEqual(bboxDe(cuerpo));
    } finally {
      await propia.close();
    }
  });
});

/** Mismo cálculo que `calcularBbox` de capas.ts, para comprobar que el bbox de /capas no cambió. */
function bboxDe(texto: string): [number, number, number, number] | null {
  const fc = JSON.parse(texto) as {
    features: Array<{ geometry?: { coordinates?: unknown } }>;
  };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const rec = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x! < minX) minX = x!;
      if (x! > maxX) maxX = x!;
      if (y! < minY) minY = y!;
      if (y! > maxY) maxY = y!;
    } else for (const s of c) rec(s);
  };
  for (const f of fc.features) if (f.geometry) rec(f.geometry.coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
