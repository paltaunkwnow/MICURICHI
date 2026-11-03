/**
 * La matriz de privilegios de `pnpm privilegios` (src/cli/verificar-privilegios.mjs) tiene que
 * nombrar TODAS las tablas del esquema, para los dos roles de aplicación.
 *
 * El script corre contra PostgreSQL real, porque PGlite no tiene roles, así que una tabla nueva
 * que nadie agregó a la matriz solo se notaba al ejecutarlo contra Docker. Esta prueba lo adelanta:
 * cada tabla de una base migrada desde cero tiene que tener una decisión escrita (aunque sea «nada»)
 * para curichi_api y para curichi_geo.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COLUMNAS_ESPERADAS, ESPERADO } from '../src/cli/matriz-privilegios.mjs';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import { aplicarMigraciones } from '../src/migrar.js';

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

let db: Awaited<ReturnType<typeof crearPglite>>;
let ex: Ejecutor;

beforeAll(async () => {
  db = await crearPglite();
  ex = ejecutorPglite(db);
  await ex.ejecutar('CREATE ROLE curichi_api NOLOGIN; CREATE ROLE curichi_geo NOLOGIN;');
  await aplicarMigraciones(ex, { autorizarContraccionCompatible: true });
}, 240_000);

afterAll(async () => {
  await db?.close();
});

describe('matriz de privilegios', () => {
  it('importar el verificador no lee DATABASE_URL ni abre conexiones ni termina el proceso', () => {
    const url = new URL('../src/cli/verificar-privilegios.mjs', import.meta.url);
    const hijo = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(url.href)}); console.log('IMPORTADO_SIN_CONEXION');`,
      ],
      { env: process.env, encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) },
    );
    expect(hijo.status, hijo.stderr).toBe(0);
    expect(hijo.stdout.trim()).toBe('IMPORTADO_SIN_CONEXION');
    expect(hijo.stderr).toBe('');
  });
  it('cada tabla de public y geo tiene una decisión para curichi_api y para curichi_geo', async () => {
    const tablas = (
      await ex.consultar<{ t: string }>(
        `SELECT schemaname || '.' || tablename AS t FROM pg_tables
          WHERE schemaname IN ('public', 'geo', 'resguardo_m10') ORDER BY 1`,
      )
    ).map((f) => f.t);
    for (const rol of ['curichi_api', 'curichi_geo'] as const) {
      const faltan = tablas.filter((t) => ESPERADO[rol][t] === undefined);
      expect(faltan, `tablas sin decisión para ${rol}`).toEqual([]);
    }
  });

  it('cuota_reporte_diaria (0014): api-core cuenta, reserva, libera y limpia; geo-service nada', () => {
    // Nombre histórico conservado; desde0022 se prueba el archivo restringido sin uso operativo.
    expect(ESPERADO.curichi_api['resguardo_m10.cuota_reporte_diaria']).toEqual([]);
    expect(ESPERADO.curichi_geo['resguardo_m10.cuota_reporte_diaria']).toEqual([]);
    expect(ESPERADO.curichi_api['public.cuota_reporte_diaria']).toBeUndefined();
  });

  it('los privilegios por columna de usuario: api-core no escribe rol, y desde la 0016 tampoco ultimo_reporte_en', () => {
    expect(COLUMNAS_ESPERADAS.curichi_api['public.usuario']).toEqual({
      INSERT: ['email', 'nombre', 'password_hash'],
      UPDATE: ['password_hash'],
    });
  });

  it('cada columna de la matriz existe en la base migrada desde cero', async () => {
    // Una columna borrada por una migración que siguiera en la matriz haría fallar `pnpm privilegios`
    // con un FALTA que no se puede arreglar concediendo nada.
    for (const [rol, tablas] of Object.entries(COLUMNAS_ESPERADAS))
      for (const [tabla, ops] of Object.entries(
        tablas as Record<string, Record<string, string[]>>,
      )) {
        const existentes = (
          await ex.consultar<{ c: string }>(
            `SELECT column_name AS c FROM information_schema.columns
              WHERE table_schema = split_part($1, '.', 1) AND table_name = split_part($1, '.', 2)`,
            [tabla],
          )
        ).map((f) => f.c);
        for (const [op, columnas] of Object.entries(ops))
          expect(
            columnas.filter((c) => !existentes.includes(c)),
            `${rol} · ${tabla} · ${op}`,
          ).toEqual([]);
      }
  });
});

// Importación ESM por URL, como consumidor Node del CLI. Contrato local tipado, sin cambiar
// configuración TS ni crear declaraciones fuera del inventario; el módulo real se prueba aquí.
async function verificarFixture() {
  const url = new URL('../src/cli/verificar-privilegios.mjs', import.meta.url).href;
  const modulo = (await import(url)) as {
    verificarMatrizPrivilegios(pool: {
      query(
        sql: string,
        params?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
    }): Promise<{ fallos: string[]; avisos: string[] }>;
  };
  return modulo.verificarMatrizPrivilegios({
    query: async (sql, params) => {
      const rows = await ex.consultar(sql, params);
      return { rows, rowCount: rows.length };
    },
  });
}
describe('verificador importable: catálogo y ACL efectivos en fixture', () => {
  it('esquema22 completo respeta la matriz y el archivo exclusivo del dueño', async () => {
    expect((await verificarFixture()).fallos).toEqual([]);
  });
  it.each([
    [
      'GRANT SELECT ON resguardo_m10.cuota_reporte_diaria TO curichi_api',
      'REVOKE SELECT ON resguardo_m10.cuota_reporte_diaria FROM curichi_api',
      /archivo|cuota_reporte_diaria/,
    ],
    [
      'GRANT USAGE ON SCHEMA resguardo_m10 TO curichi_geo',
      'REVOKE USAGE ON SCHEMA resguardo_m10 FROM curichi_geo',
      /USAGE/,
    ],
    [
      'GRANT CREATE ON SCHEMA resguardo_m10 TO curichi_api',
      'REVOKE CREATE ON SCHEMA resguardo_m10 FROM curichi_api',
      /CREATE/,
    ],
    [
      'GRANT SELECT ON resguardo_m10.cuota_reporte_diaria TO PUBLIC',
      'REVOKE SELECT ON resguardo_m10.cuota_reporte_diaria FROM PUBLIC',
      /PUBLIC/,
    ],
    [
      'ALTER TABLE resguardo_m10.cuota_reporte_diaria OWNER TO curichi_api',
      'ALTER TABLE resguardo_m10.cuota_reporte_diaria OWNER TO postgres; REVOKE ALL ON resguardo_m10.cuota_reporte_diaria FROM curichi_api',
      /dueño/,
    ],
  ] as const)('detecta privilegio/owner indebido: %s', async (sql, revertir, patron) => {
    // Solo roles de este PGlite memory://, nunca cambios globales de una instalación.
    const [dueno] = await ex.consultar<{ rol: string }>('SELECT current_user AS rol');
    await ex.ejecutar(sql);
    try {
      expect((await verificarFixture()).fallos.join('\n')).toMatch(patron);
    } finally {
      await ex.ejecutar(
        revertir.replace('OWNER TO postgres', `OWNER TO "${dueno!.rol.replaceAll('"', '""')}"`),
      );
    }
    expect((await verificarFixture()).fallos).toEqual([]);
  });
});

describe('DDL-05: verificador de ACL de columnas del archivo', () => {
  it.each(['curichi_geo', 'PUBLIC'])(
    'DDL-05: detecta concesión de columna a %s sin privilegio de tabla ni USAGE',
    async (rol) => {
      await ex.ejecutar(`GRANT SELECT(usuario_id) ON resguardo_m10.cuota_reporte_diaria TO ${rol}`);
      try {
        expect(
          await ex.consultar(`SELECT has_column_privilege('curichi_geo','resguardo_m10.cuota_reporte_diaria','usuario_id','SELECT') AS columna,
          has_table_privilege('curichi_geo','resguardo_m10.cuota_reporte_diaria','SELECT') AS tabla,
          has_schema_privilege('curichi_geo','resguardo_m10','USAGE') AS esquema`),
        ).toEqual([{ columna: true, tabla: false, esquema: false }]);
        expect((await verificarFixture()).fallos.join('\n')).toMatch(/ACL de columna.*PUBLIC/);
      } finally {
        await ex.ejecutar(
          `REVOKE SELECT(usuario_id) ON resguardo_m10.cuota_reporte_diaria FROM ${rol}`,
        );
      }
      expect((await verificarFixture()).fallos).toEqual([]);
    },
  );
});
