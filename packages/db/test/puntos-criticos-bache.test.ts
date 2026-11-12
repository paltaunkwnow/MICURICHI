/** M6.3 / CA7: radios reales, motores equivalentes y advertencia por radio del grupo. */
import { DEFINICION_BACHE, REGISTRO_CATEGORIAS } from 'contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPg } from '../src/ejecutor.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from '../src/puntos-criticos-entorno.js';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from '../src/test-utils.js';

type Categoria = 'bache' | 'inundacion';
type Estado = 'validado' | 'resuelto' | 'nuevo' | 'rechazado' | 'duplicado';
type Eje = 'este-oeste' | 'norte-sur';
type Particion = Record<Categoria, string[][]>;
interface PuntoAgrupado {
  categoria: Categoria;
  radio_m: number;
  diametro_m: number;
  advertencia_diametro: boolean;
  n_reportes: number;
  miembros: number;
  coherente: boolean;
  severidad_max: string;
}

const BASE = { lon: -63.195, lat: -17.79 };
const CRS = 32720;
const RADIOS = { bache: 10, inundacion: 25 } as const;
let base: BaseEfimera;
let pool: pg.Pool;
let ex: Ejecutor;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  pool = new pg.Pool({ connectionString: base.url, max: 2 });
  ex = ejecutorPg(pool);
  await cargarCapasDePrueba(ex);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await base?.cerrar();
});

beforeEach(async () => {
  await ex.ejecutar('DELETE FROM reporte; DELETE FROM punto_critico');
});

/** Fixtures propios, en metros UTM; no alteran helpers, seeds ni el catálogo persistente. */
async function crear(categoria: Categoria, dx: number, dy: number, estado: Estado = 'validado') {
  const geom = `ST_Transform(ST_Translate(ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),${CRS}),$3,$4),4326)`;
  const publico = `ST_SetSRID(ST_MakePoint(round(ST_X(g)::numeric,5)::float8, round(ST_Y(g)::numeric,5)::float8),4326)`;
  const detalle = DEFINICION_BACHE.esquemaDetalle.parse({
    gravedad_declarada: 'hay_que_esquivar',
    tamano: 'rueda',
  });
  const sql =
    categoria === 'inundacion'
      ? `WITH p AS (SELECT ${geom} AS g)
         INSERT INTO reporte (geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo,
           ubicacion_tipo, descripcion, detalle, detalle_version,
           severidad_calculada, severidad_puntaje, severidad_version, estado, estado_motivo, publicar_en)
         SELECT g, ${publico}, 'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica',
           'Fixture M6.3 Inundación', '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1, 'media', 6, 2,
           $5::estado_reporte, 'Estado sintético de prueba', now()
         FROM p RETURNING id::text`
      : `WITH p AS (SELECT ${geom} AS g)
         INSERT INTO reporte (geom, geom_publico, categoria, subtipo, detalle, detalle_version,
           distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
           descripcion, severidad_calculada, severidad_puntaje, severidad_version, estado,
           estado_motivo, publicar_en)
         SELECT g, ${publico}, 'bache', 'bache', $6::jsonb, 1,
           'distrito_municipal:01', 'unidad_vecinal:A',
           'manual', 'via_publica', 'Fixture M6.3 Bache', 'media', 4, 1, $5::estado_reporte,
           'Estado sintético de prueba', now()
         FROM p RETURNING id::text`;
  const params: unknown[] = [BASE.lon, BASE.lat, dx, dy, estado];
  if (categoria === 'bache') params.push(JSON.stringify(detalle));
  const [fila] = await ex.consultar<{ id: string }>(sql, params);
  return fila!.id;
}

function ordenar(grupos: string[][]): string[][] {
  return grupos.map((grupo) => [...grupo].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function esperada(bache: string[][] = [], inundacion: string[][] = []): Particion {
  return { bache: ordenar(bache), inundacion: ordenar(inundacion) };
}

async function capturar() {
  const filas = await ex.consultar<{ id: string; categoria: Categoria; pc: string | null }>(
    `SELECT id::text, categoria, punto_critico_id::text AS pc FROM reporte
     WHERE estado IN ('validado','resuelto') ORDER BY id`,
  );
  const porCategoria = {
    bache: new Map<string, string[]>(),
    inundacion: new Map<string, string[]>(),
  };
  for (const fila of filas) {
    // Un NULL no puede pasar por un singleton válido cuando se comparan particiones.
    expect(fila.pc, `reporte verificado sin agrupar: ${fila.id}`).not.toBeNull();
    const grupos = porCategoria[fila.categoria];
    const miembros = grupos.get(fila.pc!) ?? [];
    miembros.push(fila.id);
    grupos.set(fila.pc!, miembros);
  }
  const puntos = await ex.consultar<PuntoAgrupado>(
    `SELECT p.categoria, p.radio_m::float8, p.diametro_m::float8, p.advertencia_diametro,
            p.n_reportes, p.severidad_max, count(r.id)::int AS miembros,
            bool_and(r.categoria = p.categoria AND r.estado IN ('validado','resuelto')) AS coherente
     FROM punto_critico p LEFT JOIN reporte r ON r.punto_critico_id = p.id
     GROUP BY p.id ORDER BY p.categoria, p.diametro_m, p.n_reportes`,
  );
  for (const punto of puntos) {
    expect(punto.radio_m).toBe(RADIOS[punto.categoria]);
    expect(punto.n_reportes).toBe(punto.miembros);
    expect(punto.coherente).toBe(true);
  }
  return {
    miembros: esperada([...porCategoria.bache.values()], [...porCategoria.inundacion.values()]),
    puntos,
  };
}

/** Solo sustituye el error de la función; los otros SQL siguen llegando al PostGIS efímero. */
function falloDbscan(e: Ejecutor, error: Error, alFallback: () => void = () => {}): Ejecutor {
  return {
    ejecutar: (sql) => e.ejecutar(sql),
    async consultar<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (/ST_ClusterDBSCAN/i.test(sql)) throw error;
      if (/ST_X\(geom_m\)/i.test(sql)) alFallback();
      return e.consultar<T>(sql, params);
    },
    transaccion: (fn) => e.transaccion((tx) => fn(falloDbscan(tx, error, alFallback))),
  };
}

/** Captura el incremental antes de que un recálculo completo pueda ocultar su resultado. */
async function comprobarMotores(ids: string[], esperado: Particion) {
  for (const id of ids) await recalcularEntornoDeReporte(ex, id, undefined, CRS);
  const incremental = await capturar();
  expect(incremental.miembros).toEqual(esperado);

  const completo = await recalcularPuntosCriticos(ex, undefined, CRS);
  expect(completo.motor).toBe('postgis');
  expect(completo.categoriasSinDefinicion).toBeUndefined();
  const postgis = await capturar();
  expect(postgis.miembros).toEqual(incremental.miembros);

  let consultasFallback = 0;
  const sinFuncion = Object.assign(new Error('ST_ClusterDBSCAN ausente'), { code: '42883' });
  const alternativo = await recalcularPuntosCriticos(
    falloDbscan(ex, sinFuncion, () => consultasFallback++),
    undefined,
    CRS,
  );
  expect(alternativo.motor).toBe('node');
  expect(consultasFallback).toBeGreaterThan(0);
  const node = await capturar();
  expect(node.miembros).toEqual(incremental.miembros);
  return [incremental, postgis, node];
}

async function medir(a: string, b: string, distancia: number) {
  const [fila] = await ex.consultar<{ distancia: number }>(
    `SELECT ST_Distance(ST_Transform(a.geom,$3::int),ST_Transform(b.geom,$3::int)) AS distancia
     FROM reporte a, reporte b WHERE a.id = $1 AND b.id = $2`,
    [a, b, CRS],
  );
  expect(Number(fila!.distancia)).toBeCloseTo(distancia, 6);
}

describe('M6.3: radios reales y equivalencia de miembros entre motores', () => {
  it('el registro real conserva Inundación 25 m y define Bache 10 m', () => {
    expect(REGISTRO_CATEGORIAS.obtener('bache')).toBe(DEFINICION_BACHE);
    expect(REGISTRO_CATEGORIAS.obtener('bache')?.recurrenciaRadioM).toBe(10);
    expect(REGISTRO_CATEGORIAS.obtener('inundacion')?.recurrenciaRadioM).toBe(25);
  });

  const casos: Array<{ categoria: Categoria; d: number; eje: Eje; juntos: boolean }> = [];
  for (const eje of ['este-oeste', 'norte-sur'] as const) {
    casos.push(
      { categoria: 'bache', d: 9.9, eje, juntos: true },
      { categoria: 'bache', d: 10.1, eje, juntos: false },
      { categoria: 'inundacion', d: 24.9, eje, juntos: true },
      { categoria: 'inundacion', d: 25.1, eje, juntos: false },
    );
  }
  it.each(casos)(
    '$categoria a $d m en $eje: juntos=$juntos en los tres motores',
    async (caso) => {
      const a = await crear(caso.categoria, 0, 0);
      const b = await crear(
        caso.categoria,
        caso.eje === 'este-oeste' ? caso.d : 0,
        caso.eje === 'norte-sur' ? caso.d : 0,
      );
      await medir(a, b, caso.d);
      const grupos = caso.juntos ? [[a, b]] : [[a], [b]];
      const esperado = caso.categoria === 'bache' ? esperada(grupos) : esperada([], grupos);
      await comprobarMotores([a, b], esperado);
    },
    60_000,
  );

  it.each(['este-oeste', 'norte-sur'] as const)(
    'a 20 m en %s, Baches separados e Inundaciones juntas aunque se superpongan',
    async (eje) => {
      const dx = eje === 'este-oeste' ? 20 : 0;
      const dy = eje === 'norte-sur' ? 20 : 0;
      const b1 = await crear('bache', 0, 0);
      const b2 = await crear('bache', dx, dy);
      const i1 = await crear('inundacion', 0, 0);
      const i2 = await crear('inundacion', dx, dy);
      await medir(b1, b2, 20);
      await medir(i1, i2, 20);
      await comprobarMotores([b1, b2, i1, i2], esperada([[b1], [b2]], [[i1, i2]]));
    },
    60_000,
  );

  it('un Bache y una Inundación exactamente superpuestos conservan grupos propios', async () => {
    const b = await crear('bache', 0, 0);
    const i = await crear('inundacion', 0, 0);
    await medir(b, i, 0);
    await comprobarMotores([b, i], esperada([[b]], [[i]]));
  });

  it('el incremental real conserva el punto crítico de la otra categoría', async () => {
    const i = await crear('inundacion', 0, 0);
    await recalcularEntornoDeReporte(ex, i, undefined, CRS);
    const pertenencia = (id: string) =>
      ex.consultar<{ pc: string | null }>(
        'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
        [id],
      );
    const [antesI] = await pertenencia(i);
    expect(antesI!.pc).not.toBeNull();
    const b = await crear('bache', 0, 0);
    await recalcularEntornoDeReporte(ex, b, undefined, CRS);
    expect(await pertenencia(i)).toEqual([antesI]);
    const [antesB] = await pertenencia(b);
    expect(antesB!.pc).not.toBeNull();
    await recalcularEntornoDeReporte(ex, i, undefined, CRS);
    expect(await pertenencia(b)).toEqual([antesB]);
    expect((await capturar()).miembros).toEqual(esperada([[b]], [[i]]));
  });

  it('cadena 0/9/18: resuelto conserva el puente y retirarlo parte los Baches', async () => {
    const a = await crear('bache', 0, 0);
    const puente = await crear('bache', 9, 0);
    const c = await crear('bache', 18, 0);
    await medir(a, c, 18);
    await comprobarMotores([a, puente, c], esperada([[a, puente, c]]));

    await ex.consultar(`UPDATE reporte SET estado = 'resuelto' WHERE id = $1`, [puente]);
    await comprobarMotores([puente], esperada([[a, puente, c]]));

    await ex.consultar(`UPDATE reporte SET estado = 'rechazado' WHERE id = $1`, [puente]);
    await comprobarMotores([puente], esperada([[a], [c]]));
    const [retirado] = await ex.consultar<{ pc: string | null }>(
      'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
      [puente],
    );
    expect(retirado!.pc).toBeNull();
  }, 60_000);

  const excluidos: Array<{ categoria: Categoria; estado: Estado; paso: number }> = [];
  for (const categoria of ['bache', 'inundacion'] as const)
    for (const estado of ['nuevo', 'rechazado', 'duplicado'] as const)
      excluidos.push({ categoria, estado, paso: categoria === 'bache' ? 9 : 20 });
  it.each(excluidos)(
    '$categoria: $estado no forma un puente ni eleva la severidad verificada',
    async ({ categoria, estado, paso }) => {
      const a = await crear(categoria, 0, 0);
      const c = await crear(categoria, 2 * paso, 0);
      const excluido = await crear(categoria, paso, 0, estado);
      await ex.consultar(
        `UPDATE reporte SET severidad_manual = 'critica', severidad_motivo = 'Fixture excluido'
         WHERE id = $1`,
        [excluido],
      );
      const esperado = categoria === 'bache' ? esperada([[a], [c]]) : esperada([], [[a], [c]]);
      for (const captura of await comprobarMotores([a, c, excluido], esperado))
        for (const punto of captura.puntos) {
          expect(punto.n_reportes).toBe(1);
          expect(punto.severidad_max).toBe('media');
        }
      const [fila] = await ex.consultar<{ pc: string | null }>(
        'SELECT punto_critico_id::text AS pc FROM reporte WHERE id = $1',
        [excluido],
      );
      expect(fila!.pc).toBeNull();
    },
    60_000,
  );

  it('desactivar el catálogo conserva el agrupamiento del historial registrado', async () => {
    const [previa] = await ex.consultar<{ activa: boolean }>(
      `SELECT activa FROM categoria WHERE slug = 'bache'`,
    );
    try {
      await ex.ejecutar(`UPDATE categoria SET activa = true WHERE slug = 'bache'`);
      const a = await crear('bache', 0, 0);
      const b = await crear('bache', 9, 0);
      await comprobarMotores([a, b], esperada([[a, b]]));
      await ex.ejecutar(`UPDATE categoria SET activa = false WHERE slug = 'bache'`);
      await comprobarMotores([a], esperada([[a, b]]));
    } finally {
      await ex.consultar(`UPDATE categoria SET activa = $1 WHERE slug = 'bache'`, [previa!.activa]);
    }
  }, 60_000);
});

describe('M6.3: aviso de diámetro según radio del grupo', () => {
  const casos: Array<{
    categoria: Categoria;
    paso: number;
    longitud: number;
    umbral: number;
    aviso: boolean;
  }> = [
    { categoria: 'bache', paso: 9, longitud: 36, umbral: 40, aviso: false },
    { categoria: 'bache', paso: 9, longitud: 45, umbral: 40, aviso: true },
    { categoria: 'inundacion', paso: 20, longitud: 80, umbral: 100, aviso: false },
    { categoria: 'inundacion', paso: 20, longitud: 120, umbral: 100, aviso: true },
  ];
  it.each(casos)(
    '$categoria: cadena de $longitud m, umbral $umbral m, aviso=$aviso en tres motores',
    async ({ categoria, paso, longitud, umbral, aviso }) => {
      const ids: string[] = [];
      for (let dx = 0; dx <= longitud; dx += paso) ids.push(await crear(categoria, dx, 0));
      const esperado = categoria === 'bache' ? esperada([ids]) : esperada([], [ids]);
      for (const captura of await comprobarMotores(ids, esperado)) {
        expect(captura.puntos).toHaveLength(1);
        const punto = captura.puntos[0]!;
        // El diámetro aproximado y el UTM no son idénticos; los casos tienen margen holgado.
        if (aviso) expect(punto.diametro_m).toBeGreaterThan(umbral);
        else expect(punto.diametro_m).toBeLessThan(umbral);
        expect(punto.advertencia_diametro).toBe(aviso);
      }
    },
    60_000,
  );
});

describe('M6.3: errores de DBSCAN que no autorizan el fallback', () => {
  it.each(['42501', '57014', '42P01'])(
    'propaga %s sin escanear en Node y conserva el agrupamiento previo',
    async (code) => {
      const a = await crear('bache', 0, 0);
      await recalcularPuntosCriticos(ex, undefined, CRS);
      const antes = await capturar();
      let consultasFallback = 0;
      const error = Object.assign(new Error('Fallo SQL simulado'), { code });
      await expect(
        recalcularPuntosCriticos(
          falloDbscan(ex, error, () => consultasFallback++),
          undefined,
          CRS,
        ),
      ).rejects.toBe(error);
      expect(consultasFallback).toBe(0);
      expect(await capturar()).toEqual(antes);
      expect(antes.miembros).toEqual(esperada([[a]]));
    },
  );
});
