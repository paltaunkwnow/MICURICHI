/** Cuatro categorías reales: aislamiento y radios en incremental, PostGIS DBSCAN y fallback. */
import { randomUUID } from 'node:crypto';
import {
  crearRegistroCategorias,
  DEFINICION_AREA_VERDE,
  DEFINICION_BACHE,
  DEFINICION_BASURA,
  DEFINICION_INUNDACION,
  REGISTRO_CATEGORIAS,
} from 'contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPg } from '../src/ejecutor.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { recalcularEntornoDeReporte } from '../src/puntos-criticos-entorno.js';
import { type BaseEfimera, cargarCapasDePrueba, levantarBaseEfimera } from '../src/test-utils.js';

const CATEGORIAS = ['inundacion', 'bache', 'basura', 'area_verde'] as const;
type Categoria = (typeof CATEGORIAS)[number];
type Estado = 'validado' | 'resuelto' | 'nuevo' | 'rechazado' | 'duplicado';
type Particion = Record<Categoria, string[][]>;
const DEFINICIONES = {
  inundacion: DEFINICION_INUNDACION,
  bache: DEFINICION_BACHE,
  basura: DEFINICION_BASURA,
  area_verde: DEFINICION_AREA_VERDE,
};
const RADIOS = { inundacion: 25, bache: 10, basura: 10, area_verde: 10 } as const;
const SUBTIPOS = {
  inundacion: null,
  bache: 'bache',
  basura: 'microbasural',
  area_verde: 'parque_plaza_descuidada',
};
const DETALLES = {
  inundacion: {
    profundidad_estimada: 'rodilla',
    frecuencia: 'ocasional',
    causa_presunta: 'desconocida',
  },
  bache: { gravedad_declarada: 'hay_que_esquivar', tamano: 'rueda' },
  basura: { gravedad_declarada: 'acumulada_dias', tamano: 'bolsas' },
  area_verde: { gravedad_declarada: 'uso_limitado', tamano: 'rincon' },
};
const CRS = 32720;
let base: BaseEfimera;
let pool: pg.Pool;
let ex: Ejecutor;

beforeAll(async () => {
  base = await levantarBaseEfimera();
  const destino = new URL(base.url);
  expect(destino.hostname).toBe('127.0.0.1');
  expect(Number(destino.port)).toBe(base.puerto);
  expect(base.puerto).toBeGreaterThan(0);
  expect(base.puerto).not.toBe(5432);
  const marca = randomUUID();
  await base.ejecutor.ejecutar('CREATE TABLE p4_identidad_efimera (marca uuid PRIMARY KEY)');
  await base.ejecutor.consultar('INSERT INTO p4_identidad_efimera VALUES ($1::uuid)', [marca]);
  pool = new pg.Pool({ connectionString: base.url, max: 2, connectionTimeoutMillis: 5000 });
  ex = ejecutorPg(pool);
  expect(await ex.consultar('SELECT marca::text FROM p4_identidad_efimera')).toEqual([{ marca }]);
  await cargarCapasDePrueba(ex);
}, 120_000);

afterAll(async () => {
  try {
    await pool?.end();
  } finally {
    await base?.cerrar();
  }
});

beforeEach(async () => {
  await ex.ejecutar('DELETE FROM reporte; DELETE FROM punto_critico');
});

async function crear(categoria: Categoria, dx: number, dy: number, estado: Estado = 'validado') {
  // El registro heterogéneo conserva la definición concreta; no se clona ni se fuerza su radio.
  const def = REGISTRO_CATEGORIAS.obtener(categoria)!;
  const detalle = def.esquemaDetalle.parse(DETALLES[categoria]);
  const severidad = def.severidad.calcular(detalle);
  const [fila] = await ex.consultar<{ id: string }>(
    `WITH p AS (
       SELECT ST_Transform(ST_Translate(ST_Transform(
         ST_SetSRID(ST_MakePoint(-63.195,-17.79),4326),32720),$1,$2),4326) AS g
     ) INSERT INTO reporte (
       geom, geom_publico, categoria, subtipo, detalle, detalle_version,
       distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo,
       descripcion, severidad_calculada, severidad_puntaje, severidad_version, estado,
       estado_motivo, publicar_en)
     SELECT g, ST_SetSRID(ST_MakePoint(round(ST_X(g)::numeric,5)::float8,
              round(ST_Y(g)::numeric,5)::float8),4326), $3, $4, $5::jsonb, $6,
       'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica',
       'Fixture sintético cuatro categorías', $7::severidad, $8, $9,
       $10::estado_reporte, 'Estado sintético de prueba', now()
     FROM p RETURNING id::text`,
    [
      dx,
      dy,
      categoria,
      SUBTIPOS[categoria],
      JSON.stringify(detalle),
      def.detalleVersion,
      severidad.banda,
      severidad.puntaje,
      def.severidad.version,
      estado,
    ],
  );
  return fila!.id;
}

function ordenar(grupos: string[][]) {
  return grupos.map((grupo) => [...grupo].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function esperada(grupos: Partial<Particion> = {}): Particion {
  return {
    inundacion: ordenar(grupos.inundacion ?? []),
    bache: ordenar(grupos.bache ?? []),
    basura: ordenar(grupos.basura ?? []),
    area_verde: ordenar(grupos.area_verde ?? []),
  };
}

async function capturar() {
  const filas = await ex.consultar<{ id: string; categoria: Categoria; pc: string | null }>(
    `SELECT id::text, categoria, punto_critico_id::text AS pc FROM reporte
     WHERE estado IN ('validado','resuelto') ORDER BY id`,
  );
  const particion = esperada();
  for (const categoria of CATEGORIAS) {
    const grupos = new Map<string, string[]>();
    for (const fila of filas.filter((r) => r.categoria === categoria)) {
      expect(fila.pc, `verificado sin agrupar: ${fila.id}`).not.toBeNull();
      grupos.set(fila.pc!, [...(grupos.get(fila.pc!) ?? []), fila.id]);
    }
    particion[categoria] = ordenar([...grupos.values()]);
  }
  const puntos = await ex.consultar<{
    categoria: Categoria;
    radio: number;
    n: number;
    miembros: number;
    coherente: boolean;
  }>(
    `SELECT p.categoria, p.radio_m::float8 AS radio, p.n_reportes AS n,
       count(r.id)::int AS miembros,
       bool_and(r.categoria = p.categoria AND r.estado IN ('validado','resuelto')) AS coherente
     FROM punto_critico p LEFT JOIN reporte r ON r.punto_critico_id = p.id
     GROUP BY p.id ORDER BY p.categoria, p.n_reportes`,
  );
  for (const p of puntos) {
    expect(p.radio).toBe(RADIOS[p.categoria]);
    expect(p.n).toBe(p.miembros);
    expect(p.coherente).toBe(true);
  }
  expect(puntos.reduce((n, p) => n + p.n, 0)).toBe(filas.length);
  return { particion, puntos };
}

function sinDbscan(e: Ejecutor, contar: () => void): Ejecutor {
  return {
    ejecutar: (sql) => e.ejecutar(sql),
    async consultar<T>(sql: string, params?: unknown[]): Promise<T[]> {
      if (/ST_ClusterDBSCAN/i.test(sql))
        throw Object.assign(new Error('ST_ClusterDBSCAN ausente'), { code: '42883' });
      if (/ST_X\(geom_m\)/i.test(sql)) contar();
      return e.consultar<T>(sql, params);
    },
    transaccion: (fn) => e.transaccion((tx) => fn(sinDbscan(tx, contar))),
  };
}

async function comprobarMotores(ids: string[], esperado: Particion) {
  for (const id of ids) await recalcularEntornoDeReporte(ex, id, undefined, CRS);
  const incremental = await capturar();
  expect(incremental.particion).toEqual(esperado);
  const completo = await recalcularPuntosCriticos(ex, undefined, CRS);
  expect(completo.motor).toBe('postgis');
  expect(completo.categoriasSinDefinicion).toBeUndefined();
  expect((await capturar()).particion).toEqual(esperado);
  let consultasFallback = 0;
  const fallback = await recalcularPuntosCriticos(
    sinDbscan(ex, () => consultasFallback++),
    undefined,
    CRS,
  );
  expect(fallback.motor).toBe('node');
  expect(consultasFallback).toBeGreaterThan(0);
  expect((await capturar()).particion).toEqual(esperado);
}

async function medir(a: string, b: string, distancia: number) {
  const [fila] = await ex.consultar<{ distancia: number }>(
    `SELECT ST_Distance(ST_Transform(a.geom,$3::int),ST_Transform(b.geom,$3::int)) AS distancia
     FROM reporte a, reporte b WHERE a.id = $1 AND b.id = $2`,
    [a, b, CRS],
  );
  expect(Number(fila!.distancia)).toBeCloseTo(distancia, 6);
}

describe('cuatro categorías reales: DBSCAN y radios propios', () => {
  it('usa las cuatro definiciones concretas y radios 25/10/10/10', () => {
    expect([...REGISTRO_CATEGORIAS.slugs].sort()).toEqual([...CATEGORIAS].sort());
    for (const categoria of CATEGORIAS) {
      expect(REGISTRO_CATEGORIAS.obtener(categoria)).toBe(DEFINICIONES[categoria]);
      expect(DEFINICIONES[categoria].recurrenciaRadioM).toBe(RADIOS[categoria]);
    }
  });

  it('cuatro grupos superpuestos conservan miembros y contadores distintos sin mezcla', async () => {
    const grupos = esperada();
    const ids: string[] = [];
    for (const [indice, categoria] of CATEGORIAS.entries()) {
      const miembros: string[] = [];
      for (let n = 0; n < indice + 2; n++) miembros.push(await crear(categoria, 0, 0));
      grupos[categoria] = [miembros];
      ids.push(...miembros);
    }
    await comprobarMotores(ids, esperada(grupos));
    expect((await capturar()).puntos).toHaveLength(4);
  }, 60_000);

  const umbrales = CATEGORIAS.flatMap((categoria) =>
    (['este-oeste', 'norte-sur'] as const).flatMap((eje) =>
      [-0.1, 0.1].map((margen) => ({
        categoria,
        eje,
        distancia: RADIOS[categoria] + margen,
        juntos: margen < 0,
      })),
    ),
  );
  it.each(umbrales)(
    '$categoria a $distancia m en $eje: juntos=$juntos',
    async ({ categoria, eje, distancia, juntos }) => {
      const a = await crear(categoria, 0, 0);
      const b = await crear(
        categoria,
        eje === 'este-oeste' ? distancia : 0,
        eje === 'norte-sur' ? distancia : 0,
      );
      await medir(a, b, distancia);
      await comprobarMotores([a, b], esperada({ [categoria]: juntos ? [[a, b]] : [[a], [b]] }));
    },
    60_000,
  );

  it('a 20 m une Inundaciones y separa las otras tres aun con puntos superpuestos', async () => {
    const grupos = esperada();
    const ids: string[] = [];
    for (const categoria of CATEGORIAS) {
      const a = await crear(categoria, 0, 0);
      const b = await crear(categoria, 20, 0);
      await medir(a, b, 20);
      grupos[categoria] = categoria === 'inundacion' ? [[a, b]] : [[a], [b]];
      ids.push(a, b);
    }
    await comprobarMotores(ids, esperada(grupos));
  }, 60_000);

  it('el incremental de cada categoría conserva los IDs de los puntos de las otras tres', async () => {
    const ids = new Map<Categoria, string>();
    for (const categoria of CATEGORIAS) ids.set(categoria, await crear(categoria, 0, 0));
    await recalcularPuntosCriticos(ex, undefined, CRS);
    for (const categoria of CATEGORIAS) {
      const ajenos = () =>
        ex.consultar(
          'SELECT id::text, categoria, punto_critico_id::text FROM reporte WHERE categoria <> $1 ORDER BY id',
          [categoria],
        );
      const antes = await ajenos();
      await recalcularEntornoDeReporte(ex, ids.get(categoria)!, undefined, CRS);
      expect(await ajenos()).toEqual(antes);
    }
    expect((await capturar()).puntos).toHaveLength(4);
  });

  it.each(CATEGORIAS)(
    '%s: una cadena verificada se parte al retirar su puente sin afectar otras categorías',
    async (categoria) => {
      const paso = RADIOS[categoria] - 1;
      const a = await crear(categoria, 0, 0);
      const puente = await crear(categoria, paso, 0, 'resuelto');
      const b = await crear(categoria, paso * 2, 0);
      const grupos = esperada({ [categoria]: [[a, puente, b]] });
      const ajenos: string[] = [];
      for (const otra of CATEGORIAS.filter((c) => c !== categoria)) {
        const id = await crear(otra, paso, 0);
        grupos[otra] = [[id]];
        ajenos.push(id);
      }
      await comprobarMotores([a, puente, b, ...ajenos], esperada(grupos));
      await ex.consultar("UPDATE reporte SET estado = 'rechazado' WHERE id = $1", [puente]);
      grupos[categoria] = [[a], [b]];
      await comprobarMotores([puente], esperada(grupos));
      expect(
        await ex.consultar('SELECT punto_critico_id FROM reporte WHERE id = $1', [puente]),
      ).toEqual([{ punto_critico_id: null }]);
    },
    60_000,
  );

  it.each(CATEGORIAS)(
    '%s: sin definición inyectada el incremental no agrupa y el completo limpia solo esa categoría',
    async (ausente) => {
      const ids = new Map<Categoria, string>();
      const registro = crearRegistroCategorias(
        REGISTRO_CATEGORIAS.definiciones.filter((d) => d.slug !== ausente),
      );
      for (const categoria of CATEGORIAS) ids.set(categoria, await crear(categoria, 0, 0));
      await recalcularPuntosCriticos(ex, undefined, CRS);
      const ajenos = () =>
        ex.consultar(
          'SELECT id::text, categoria, punto_critico_id::text FROM reporte WHERE categoria <> $1 ORDER BY id',
          [ausente],
        );
      const antes = await ajenos();
      const incremental = await recalcularEntornoDeReporte(
        ex,
        ids.get(ausente)!,
        undefined,
        CRS,
        registro,
      );
      expect(incremental.puntos).toBe(0);
      expect(incremental.disueltos).toBe(1);
      expect(await ajenos()).toEqual(antes);
      expect(
        await ex.consultar('SELECT punto_critico_id FROM reporte WHERE id = $1', [
          ids.get(ausente),
        ]),
      ).toEqual([{ punto_critico_id: null }]);
      await recalcularPuntosCriticos(ex, undefined, CRS);
      const resultado = await recalcularPuntosCriticos(ex, undefined, CRS, registro);
      expect(resultado.categoriasSinDefinicion).toEqual([ausente]);
      const filas = await ex.consultar<{ categoria: Categoria; pc: string | null }>(
        'SELECT categoria, punto_critico_id::text AS pc FROM reporte',
      );
      for (const fila of filas) {
        if (fila.categoria === ausente) expect(fila.pc).toBeNull();
        else expect(fila.pc).not.toBeNull();
      }
      expect(
        await ex.consultar('SELECT categoria FROM punto_critico WHERE categoria = $1', [ausente]),
      ).toEqual([]);
      expect(resultado.puntos).toBe(3);
      expect(resultado.reportes).toBe(3);
    },
  );
});
