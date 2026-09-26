/**
 * Migración 0011 (contrato 0.5.0): tirante → profundidad, sumidero con dos respuestas y rol
 * `ejecutivo`.
 *
 * Misma técnica que migracion-0010: una base con las migraciones ANTERIORES a 0011 recibe filas
 * con los valores viejos y después se le aplica el directorio real. Es el único archivo de
 * packages/db que nombra `tirante_estimado` y los valores viejos del sumidero en código, porque
 * tiene que crearlos antes de la 0011 para probar el mapeo.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';
import { cargarCapasDePrueba } from '../src/test-utils.js';

const ES_0011 = /^0011_.+\.sql$/;

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

function directorioHasta0010(): string {
  const dir = mkdtempSync(join(tmpdir(), 'curichi-0011-'));
  for (const f of listarMigraciones()) {
    if (f < '0011') copyFileSync(join(DIRECTORIO_MIGRACIONES, f), join(dir, f));
  }
  return dir;
}

/** Valores viejos → esperados tras 0011. `null` en la entrada es «no contestó». */
const CASOS: Array<{
  tirante: string;
  cercano: string | null;
  estado: string | null;
  esperado: { cercano: string | null; estado: string | null };
}> = [
  {
    tirante: 'tobillo',
    cercano: 'si',
    estado: 'libre',
    esperado: { cercano: 'si', estado: 'no_tapado' },
  },
  {
    tirante: 'rodilla',
    cercano: 'si',
    estado: 'obstruido',
    esperado: { cercano: 'si', estado: 'tapado' },
  },
  {
    tirante: 'muslo',
    cercano: 'si',
    estado: 'danado',
    esperado: { cercano: 'si', estado: 'tapado' },
  },
  {
    tirante: 'mas_70',
    cercano: 'no_sabe',
    estado: 'no_sabe',
    esperado: { cercano: null, estado: null },
  },
  { tirante: 'rodilla', cercano: 'no', estado: null, esperado: { cercano: 'no', estado: null } },
  { tirante: 'tobillo', cercano: null, estado: null, esperado: { cercano: null, estado: null } },
];

let db: Awaited<ReturnType<typeof crearPglite>>;
let ex: Ejecutor;
let dirViejo: string;
const ids: string[] = [];
let resultado: ResultadoMigracion;

beforeAll(async () => {
  db = await crearPglite();
  ex = ejecutorPglite(db);
  dirViejo = directorioHasta0010();
  await aplicarMigraciones(ex, dirViejo);
  await cargarCapasDePrueba(ex);

  for (const [i, c] of CASOS.entries()) {
    const [fila] = await ex.consultar<{ id: string }>(
      `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
         ubicacion_tipo, descripcion, tirante_estimado, frecuencia, sumidero_cercano, sumidero_estado,
         severidad_calculada, severidad_puntaje, severidad_version, estado)
       VALUES (ST_SetSRID(ST_MakePoint($1, -17.799), 4326), 'distrito_municipal:01', 'unidad_vecinal:A',
         'manual', 'via_publica', 'Reporte previo a la migración 0011', $2::tirante_estimado,
         'ocasional', $3::sumidero_cercano, $4::sumidero_estado, 'media', 6, 2, 'nuevo')
       RETURNING id::text`,
      [-63.1995 + i * 0.0004, c.tirante, c.cercano, c.estado],
    );
    ids.push(fila!.id);
  }

  // Hasta 0011 inclusive: las posteriores (0012 en adelante) se prueban en su propio archivo. Sin
  // el límite, «0011 es la única pendiente» dejaba de ser cierto con la primera migración nueva.
  resultado = await aplicarMigraciones(ex, { hasta: '0011' });
}, 240_000);

afterAll(async () => {
  await db?.close();
  if (dirViejo) rmSync(dirViejo, { recursive: true, force: true });
});

async function etiquetas(tipo: string): Promise<string[]> {
  const filas = await ex.consultar<{ enumlabel: string }>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1 ORDER BY e.enumsortorder`,
    [tipo],
  );
  return filas.map((f) => f.enumlabel);
}

describe('migración 0011: profundidad, sumidero y rol ejecutivo', () => {
  it('se aplica sobre una base con 0001–0010 y es la única pendiente', () => {
    expect(resultado.aplicadas).toHaveLength(1);
    expect(resultado.aplicadas[0]).toMatch(ES_0011);
  });

  it('renombra la columna y el tipo a profundidad_estimada conservando los valores', async () => {
    const columnas = (
      await ex.consultar<{ column_name: string; udt_name: string }>(
        `SELECT column_name, udt_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'`,
      )
    ).map((c) => `${c.column_name}:${c.udt_name}`);
    expect(columnas).toContain('profundidad_estimada:profundidad_estimada');
    expect(columnas.some((c) => c.startsWith('tirante_estimado:'))).toBe(false);
    expect(await etiquetas('profundidad_estimada')).toEqual([
      'tobillo',
      'rodilla',
      'muslo',
      'mas_70',
    ]);
    expect(await etiquetas('tirante_estimado')).toEqual([]);

    const filas = await ex.consultar<{ id: string; p: string }>(
      'SELECT id::text, profundidad_estimada::text AS p FROM reporte_inundacion',
    );
    const porId = new Map(filas.map((f) => [f.id, f.p]));
    for (const [i, id] of ids.entries()) expect(porId.get(id)).toBe(CASOS[i]!.tirante);
  });

  it('mapea el sumidero: no_sabe → NULL; libre → no_tapado; obstruido y danado → tapado', async () => {
    expect(await etiquetas('sumidero_cercano')).toEqual(['si', 'no']);
    expect(await etiquetas('sumidero_estado')).toEqual(['tapado', 'no_tapado']);
    expect(await etiquetas('sumidero_cercano_v2')).toEqual([]);
    expect(await etiquetas('sumidero_estado_v2')).toEqual([]);

    const filas = await ex.consultar<{ id: string; cercano: string | null; estado: string | null }>(
      `SELECT id::text, sumidero_cercano::text AS cercano, sumidero_estado::text AS estado
         FROM reporte_inundacion`,
    );
    const porId = new Map(filas.map((f) => [f.id, { cercano: f.cercano, estado: f.estado }]));
    for (const [i, id] of ids.entries())
      expect(porId.get(id), `caso ${i}`).toStrictEqual(CASOS[i]!.esperado);
  });

  it('añade el rol ejecutivo después de tecnico y admite un usuario con ese rol', async () => {
    expect(await etiquetas('rol')).toEqual(['ciudadano', 'tecnico', 'ejecutivo', 'admin']);
    const [u] = await ex.consultar<{ rol: string }>(
      `INSERT INTO usuario (email, nombre, rol, password_hash)
       VALUES ('ejecutivo-0011@test.local', 'Ejecutivo 0011', 'ejecutivo', 'scrypt$x$y')
       RETURNING rol::text`,
    );
    expect(u!.rol).toBe('ejecutivo');
  });

  it('volver a ejecutar el archivo a mano no falla ni cambia nada (idempotente)', async () => {
    const archivo = listarMigraciones().find((f) => ES_0011.test(f))!;
    const antes = await ex.consultar(
      `SELECT id::text, profundidad_estimada::text, sumidero_cercano::text, sumidero_estado::text
         FROM reporte_inundacion ORDER BY id`,
    );
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, archivo), 'utf8')),
    );
    const despues = await ex.consultar(
      `SELECT id::text, profundidad_estimada::text, sumidero_cercano::text, sumidero_estado::text
         FROM reporte_inundacion ORDER BY id`,
    );
    expect(despues).toStrictEqual(antes);
    expect(await etiquetas('rol')).toEqual(['ciudadano', 'tecnico', 'ejecutivo', 'admin']);
  });
});
