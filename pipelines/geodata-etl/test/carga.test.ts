/**
 * Carga a PostGIS (CLAUDE.md §6.9) contra un PostGIS efímero (PGlite) por el driver `pg`, igual que
 * el CLI. Nunca contra la base del usuario: `levantarBaseEfimera` abre un puerto libre en memoria.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TipoCapa } from 'contracts';
import { type Ejecutor, ejecutorPg } from 'db';
import { type BaseEfimera, levantarBaseEfimera } from 'db/test-utils';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerArgumentos } from '../src/argumentos.js';
import { cargarVersion } from '../src/pasos/cargar.js';

const CAPAS: TipoCapa[] = ['distrito_municipal', 'unidad_vecinal', 'manzana'];

const cuadrado = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'MultiPolygon' as const,
  coordinates: [
    [
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
    ],
  ],
});

/** Escribe la salida de `etl:run` de una versión (solo lo que lee la carga) en `dir/<capa>/`. */
function escribirVersion(dir: string, version: string, o: { manzanaRota?: boolean } = {}) {
  const comun = { version_capa: version, fuente: 'sintético (test)', fecha_vigencia: null };
  const feature = (props: Record<string, unknown>, geom: ReturnType<typeof cuadrado>) => ({
    type: 'Feature' as const,
    id: props.id as string,
    properties: { ...comun, ...props },
    geometry: geom,
  });
  const manzana = (codigo: string) =>
    feature(
      {
        id: `manzana:${codigo}`,
        codigo,
        nombre: `Manzana ${codigo}`,
        tipo: 'manzana',
        distrito_id: 'distrito_municipal:D1',
        unidad_vecinal_id: 'unidad_vecinal:A',
      },
      cuadrado(-63.199, -17.799, -63.198, -17.798),
    );
  const capas: Record<TipoCapa, ReturnType<typeof feature>[]> = {
    distrito_municipal: [
      feature(
        {
          id: 'distrito_municipal:D1',
          codigo: 'D1',
          nombre: 'Distrito D1',
          tipo: 'distrito_municipal',
        },
        cuadrado(-63.2, -17.8, -63.17, -17.78),
      ),
    ],
    unidad_vecinal: [
      feature(
        {
          id: 'unidad_vecinal:A',
          codigo: 'A',
          nombre: 'Unidad Vecinal A',
          tipo: 'unidad_vecinal',
          distrito_id: 'distrito_municipal:D1',
          distrito_inferido: false,
        },
        cuadrado(-63.2, -17.8, -63.19, -17.78),
      ),
    ],
    // La versión «rota» repite el id de manzana: la clave primaria revienta en la TERCERA capa,
    // cuando las dos primeras ya están escritas.
    manzana: o.manzanaRota ? [manzana('1'), manzana('1')] : [manzana('1'), manzana('2')],
  };
  for (const capa of CAPAS) {
    mkdirSync(join(dir, capa), { recursive: true });
    writeFileSync(
      join(dir, capa, `${capa}.full.geojson`),
      JSON.stringify({ type: 'FeatureCollection', features: capas[capa] }),
    );
  }
  return dir;
}

async function contar(ex: Ejecutor, sql: string, params: unknown[] = []) {
  const [f] = await ex.consultar<{ n: string }>(sql, params);
  return Number(f?.n);
}

interface FilaCapaVersion {
  id: string;
  capa: string;
  vigente: boolean;
  activado_por: string | null;
  activado_en: string | null;
}

async function capaVersion(ex: Ejecutor, version: string) {
  return ex.consultar<FilaCapaVersion>(
    `SELECT id::text, capa, vigente, activado_por::text, activado_en::text
       FROM geo.capa_version WHERE version = $1 ORDER BY capa`,
    [version],
  );
}

async function auditoriaDeCapas(ex: Ejecutor) {
  return ex.consultar<{
    entidad_id: string;
    accion: string;
    actor_id: string | null;
    despues: { capa: string; version: string; motivo: string };
  }>(
    `SELECT entidad_id, accion, actor_id::text, despues FROM auditoria
      WHERE entidad = 'capa_version' ORDER BY despues->>'capa'`,
  );
}

/**
 * Cargar una versión de tres capas en una PostGIS en memoria es trabajo real: solo, cada caso tarda
 * pocos segundos, pero con la máquina ocupada (turbo corre todos los paquetes a la vez) pasa de los
 * 5 s por defecto y el caso falla por tiempo, no por comportamiento. Ya pasó en la corrida completa.
 */
const PLAZO_CARGA = { timeout: 60_000 };

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'curichi-carga-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('carga de una versión: todo o nada', PLAZO_CARGA, () => {
  let base: BaseEfimera;
  let pool: pg.Pool;
  let ex: Ejecutor;

  beforeAll(async () => {
    base = await levantarBaseEfimera();
    pool = new pg.Pool({ connectionString: base.url, max: 3 });
    ex = ejecutorPg(pool);
  }, 120_000);
  afterAll(async () => {
    await pool?.end();
    await base?.cerrar();
  });

  it('una falla en la tercera capa no deja filas de las dos primeras', async () => {
    const dir = escribirVersion(join(tmp, 'ROTA'), 'ROTA', { manzanaRota: true });
    await expect(cargarVersion(ex, 'ROTA', CAPAS, { dirProcesado: dir })).rejects.toThrow();
    for (const capa of CAPAS)
      expect(
        await contar(ex, `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1`, [
          'ROTA',
        ]),
        capa,
      ).toBe(0);
    expect(
      await contar(ex, 'SELECT count(*)::text AS n FROM geo.capa_version WHERE version = $1', [
        'ROTA',
      ]),
    ).toBe(0);
    expect(await contar(ex, 'SELECT count(*)::text AS n FROM auditoria')).toBe(0);
  });

  it('agrupa la versión con Ejecutor.transaccion y no emite nada por fuera de ella', async () => {
    // Emitir BEGIN/COMMIT con `ejecutar` sobre un Pool no abre ninguna transacción: cada sentencia
    // puede salir por otra conexión (packages/db/src/ejecutor.ts). Solo funcionaba porque el CLI
    // creaba el pool con UNA conexión. PGlite no distingue conexiones, así que se mira el uso.
    const dir = escribirVersion(join(tmp, 'ESPIADA'), 'ESPIADA');
    const fuera: string[] = [];
    let transacciones = 0;
    const espia: Ejecutor = {
      ejecutar: async (sql) => {
        fuera.push(sql);
        await ex.ejecutar(sql);
      },
      consultar: async <T>(sql: string, params?: unknown[]) => {
        fuera.push(sql);
        return ex.consultar<T>(sql, params);
      },
      transaccion: async (fn) => {
        transacciones++;
        return ex.transaccion(fn);
      },
    };
    const r = await cargarVersion(espia, 'ESPIADA', CAPAS, { dirProcesado: dir });
    expect(r.map((x) => x.capa)).toEqual(CAPAS);
    expect(transacciones).toBe(1);
    expect(fuera).toEqual([]);
  });
});

describe(
  'activación de versiones de capas (§6.9: activar es acción del admin)',
  PLAZO_CARGA,
  () => {
    let base: BaseEfimera;
    let pool: pg.Pool;
    let ex: Ejecutor;

    beforeAll(async () => {
      base = await levantarBaseEfimera();
      pool = new pg.Pool({ connectionString: base.url, max: 3 });
      ex = ejecutorPg(pool);
    }, 120_000);
    afterAll(async () => {
      await pool?.end();
      await base?.cerrar();
    });

    it('en una base sin capas vigentes activa la versión en el arranque y lo deja en auditoria', async () => {
      const dir = escribirVersion(join(tmp, 'V1'), 'V1');
      const r = await cargarVersion(ex, 'V1', CAPAS, { dirProcesado: dir });
      expect(r.every((x) => x.vigente)).toBe(true);

      const filas = await capaVersion(ex, 'V1');
      expect(filas).toHaveLength(3);
      for (const f of filas) {
        expect(f.vigente, f.capa).toBe(true);
        expect(f.activado_en, f.capa).not.toBeNull();
        expect(f.activado_por, f.capa).toBeNull(); // no la activó ninguna persona
      }
      const auditoria = await auditoriaDeCapas(ex);
      expect(auditoria).toHaveLength(3);
      for (const a of auditoria) {
        expect(a.accion).toBe('activar');
        expect(a.actor_id).toBeNull();
        expect(a.despues.version).toBe('V1');
        expect(a.despues.motivo).toMatch(/arranque del ETL/);
        expect(a.entidad_id).toBe(filas.find((f) => f.capa === a.despues.capa)?.id);
      }
    });

    it('una versión posterior se carga sin activar: la activa el admin desde el panel', async () => {
      const dir = escribirVersion(join(tmp, 'V2'), 'V2');
      const r = await cargarVersion(ex, 'V2', CAPAS, { dirProcesado: dir });
      expect(r.some((x) => x.vigente)).toBe(false);
      expect((await capaVersion(ex, 'V2')).every((f) => !f.vigente && !f.activado_en)).toBe(true);
      expect((await capaVersion(ex, 'V1')).every((f) => f.vigente)).toBe(true);
      expect(await auditoriaDeCapas(ex)).toHaveLength(3);
    });

    it('recargar la versión vigente la deja vigente, con el mismo id, y no inventa otra activación', async () => {
      const antes = await capaVersion(ex, 'V1');
      await cargarVersion(ex, 'V1', CAPAS, { dirProcesado: join(tmp, 'V1') });
      // El id de capa_version es el que referencia auditoria.entidad_id: borrarlo y recrearlo
      // dejaba huérfana la activación del admin y perdía activado_por / activado_en.
      expect(await capaVersion(ex, 'V1')).toEqual(antes);
      expect(await auditoriaDeCapas(ex)).toHaveLength(3);
    });
  },
);

describe('argumentos del CLI', () => {
  it('--activar ya no existe: activar una versión se hace desde el panel', () => {
    expect(() => leerArgumentos(['load', '--', '--version', 'V1', '--activar'])).toThrow(/panel/i);
    expect(leerArgumentos(['load', '--', '--', '--version', 'V1'])).toMatchObject({
      comando: 'load',
      version: 'V1',
      forzar: false,
    });
  });
});
