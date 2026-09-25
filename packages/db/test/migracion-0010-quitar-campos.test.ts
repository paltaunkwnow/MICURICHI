/**
 * Corrida SDD 2026-09-25 «quitar campos del reporte» — criterios CA-D1…CA-D7 (packages/db).
 *
 * El reporte deja de tener manzana_id, direccion_aprox, duracion_estimada y afectacion, y la
 * severidad pasa a la v2 (2·T + F). La migración 0010 quita las columnas y los tipos, y recalcula
 * la severidad de los reportes que ya existen (decisión P-1 = opción A de la puerta 1).
 *
 * Este archivo es el ÚNICO de packages/db que puede nombrar los cuatro campos en código: necesita
 * crear filas con ellos ANTES de 0010 para probar que la migración conserva el resto. Por eso
 * CA-D7 lo excluye de su búsqueda (ver el hallazgo en pruebas-db.md).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig, isPgEnum } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';
import { sembrarSamples } from '../src/seeds/samples.js';
import { cargarCapasDePrueba } from '../src/test-utils.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ_DB = resolve(aqui, '..');

const CUATRO_CAMPOS = ['manzana_id', 'direccion_aprox', 'duracion_estimada', 'afectacion'] as const;
const TIPOS_QUITADOS = ['duracion_estimada', 'afectacion'] as const;
const ES_0010 = /^0010_.+\.sql$/;

/** sha256 de 0001–0009 tal como estaban antes de la corrida (finales de línea normalizados a LF). */
const HASH_MIGRACIONES_ANTERIORES: Record<string, string> = {
  '0001_inicial.sql': '8c09f324db1ed0530c9eb5e3c85e104e9d77939169d3f3f94ad31692aa86547f',
  '0002_retencion_e_indices.sql':
    '130a4e2c385c28330c20d70dda9c41ae901152c09e16f80b3c47b8c9e0e0246b',
  '0003_login_y_sesiones.sql': '6ed92c4fa2803087e3b56f6083a14b02b70a2ea5ce565cdd35c04cfbf3881715',
  '0004_idempotencia.sql': '9071c758d6a545b74a1e5b3fe7982d96a1b1bc38574f56424fcfe5a268f484a1',
  '0005_geometria_publica.sql': '73e00302b994439f6d78b5561c1073b406e5a108c742968db6ef6a5c32173a99',
  '0006_indices_de_claves_foraneas.sql':
    '9cb5f91be2c5d4abead505f9e41c9229f6ffbc49e7533aebd35c211989f15565',
  '0007_agregado_por_unidad_vecinal.sql':
    'fda127eaf70a15974501dc7b8fb6bb433945d26bcb1a8967730694764471703f',
  '0008_privilegios_minimos.sql':
    'cc191d229fa3a2a7c4a5f0258102bce471f8540074cf50c1a608697b6326244b',
  '0009_cuentas_ciudadanas.sql': 'ae3368fb98095bdd3ecfdf414d11484eaddb44241d4537ca334282557f834993',
};

type Tirante = 'tobillo' | 'rodilla' | 'muslo' | 'mas_70';
type Frecuencia = 'primera_vez' | 'ocasional' | 'cada_lluvia_fuerte' | 'permanente';
type Banda = 'baja' | 'media' | 'alta' | 'critica';

const TIRANTES: readonly Tirante[] = ['tobillo', 'rodilla', 'muslo', 'mas_70'];
const FRECUENCIAS: readonly Frecuencia[] = [
  'primera_vez',
  'ocasional',
  'cada_lluvia_fuerte',
  'permanente',
];

/**
 * Tabla de CA-C5 (spec §4), copiada de la spec y NO derivada de contracts: la migración escribe
 * la fórmula en SQL y esta tabla es la referencia independiente con la que se compara.
 * Clave `${tirante}|${frecuencia}`.
 */
const SEVERIDAD_V2: Record<string, { puntaje: number; banda: Banda }> = {
  'tobillo|primera_vez': { puntaje: 3, banda: 'baja' },
  'tobillo|ocasional': { puntaje: 4, banda: 'baja' },
  'tobillo|cada_lluvia_fuerte': { puntaje: 5, banda: 'media' },
  'tobillo|permanente': { puntaje: 6, banda: 'media' },
  'rodilla|primera_vez': { puntaje: 5, banda: 'media' },
  'rodilla|ocasional': { puntaje: 6, banda: 'media' },
  'rodilla|cada_lluvia_fuerte': { puntaje: 7, banda: 'media' },
  'rodilla|permanente': { puntaje: 8, banda: 'alta' },
  'muslo|primera_vez': { puntaje: 7, banda: 'media' },
  'muslo|ocasional': { puntaje: 8, banda: 'alta' },
  'muslo|cada_lluvia_fuerte': { puntaje: 9, banda: 'alta' },
  'muslo|permanente': { puntaje: 10, banda: 'alta' },
  'mas_70|primera_vez': { puntaje: 9, banda: 'critica' },
  'mas_70|ocasional': { puntaje: 10, banda: 'critica' },
  'mas_70|cada_lluvia_fuerte': { puntaje: 11, banda: 'critica' },
  'mas_70|permanente': { puntaje: 12, banda: 'critica' },
};

const DURACIONES_V1 = ['menos_30min', '30min_2h', '2h_12h', 'mas_12h'] as const;
const AFECTACIONES_V1 = ['peatonal', 'vehicular', 'ingreso_viviendas', 'corte_total_via'] as const;

/** Severidad v1 (2·T + D + F + A, bandas 5–8/9–12/13–16/17–20, E1–E3) para sembrar filas viejas. */
function severidadV1(
  t: number,
  d: number,
  f: number,
  a: number,
): { puntaje: number; banda: Banda } {
  const puntaje = 2 * t + d + f + a;
  const orden: Banda[] = ['baja', 'media', 'alta', 'critica'];
  let i = puntaje <= 8 ? 0 : puntaje <= 12 ? 1 : puntaje <= 16 ? 2 : 3;
  if (t === 4) i = 3;
  if (a >= 3 && f >= 3) i = Math.max(i, 2);
  if (f === 4) i = Math.max(i, 1);
  return { puntaje, banda: orden[i]! };
}

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

function sha256Lf(archivo: string): string {
  const texto = readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(texto).digest('hex');
}

/** Directorio temporal con copias de 0001–0009: el estado de una base de antes de la corrida. */
function directorioHasta0009(): string {
  const dir = mkdtempSync(join(tmpdir(), 'curichi-0010-'));
  for (const f of listarMigraciones()) {
    if (f < '0010') copyFileSync(join(DIRECTORIO_MIGRACIONES, f), join(dir, f));
  }
  return dir;
}

interface FilaAntes {
  id: string;
  tirante_estimado: Tirante;
  frecuencia: Frecuencia;
  severidad_manual: Banda | null;
  severidad_motivo: string | null;
}

interface Instantanea {
  id: string;
  geom: string;
  geom_publico: string | null;
  tirante_estimado: string;
  frecuencia: string;
  estado: string;
  severidad_manual: string | null;
  severidad_motivo: string | null;
  autor_id: string | null;
}

const SQL_INSTANTANEA = `SELECT id::text, ST_AsEWKT(geom) AS geom, ST_AsEWKT(geom_publico) AS geom_publico,
  tirante_estimado::text, frecuencia::text, estado::text, severidad_manual::text, severidad_motivo,
  autor_id::text
  FROM reporte_inundacion ORDER BY id`;

// ---------------------------------------------------------------------------------------------
// Base «vieja»: 0001–0009 aplicadas, reportes con los cuatro campos rellenos y severidad v1, y
// DESPUÉS se aplica el directorio real de migraciones (que debe traer 0010).
// ---------------------------------------------------------------------------------------------
let dbVieja: Awaited<ReturnType<typeof crearPglite>>;
let exVieja: Ejecutor;
let dirViejo: string;
const filasAntes: FilaAntes[] = [];
let instantaneaAntes: Instantanea[] = [];
let resultado0010: ResultadoMigracion;

// Base «nueva»: PostGIS vacío con todas las migraciones del directorio real (CA-D1, CA-D5, CA-D6).
let dbNueva: Awaited<ReturnType<typeof crearPglite>>;
let exNueva: Ejecutor;

beforeAll(async () => {
  dbVieja = await crearPglite();
  exVieja = ejecutorPglite(dbVieja);
  dirViejo = directorioHasta0009();
  await aplicarMigraciones(exVieja, dirViejo);
  await cargarCapasDePrueba(exVieja);

  const [autor] = await exVieja.consultar<{ id: string }>(
    `INSERT INTO usuario (email, nombre, rol, password_hash)
     VALUES ('vecina-0010@test.local', 'Vecina 0010', 'ciudadano', 'scrypt$x$y') RETURNING id::text`,
  );

  // Las 16 combinaciones T × F, con duración, afectación, dirección y manzana rellenas y la
  // severidad v1 que habría guardado api-core. Varían estado, autor, tipo de ubicación y
  // reclasificación manual para que CA-D3 compare algo más que valores por defecto.
  const estados = ['nuevo', 'validado', 'resuelto', 'rechazado'] as const;
  let n = 0;
  for (const [ti, tirante] of TIRANTES.entries()) {
    for (const [fi, frecuencia] of FRECUENCIAS.entries()) {
      const t = ti + 1;
      const f = fi + 1;
      const d = ((n + 1) % 4) + 1;
      const a = ((n + 2) % 4) + 1;
      const v1 = severidadV1(t, d, f, a);
      const vivienda = n % 5 === 0;
      const conManual = n % 4 === 1;
      const lon = -63.1995 + n * 0.0004;
      const lat = -17.799 + (n % 3) * 0.0003;
      const [fila] = await exVieja.consultar<FilaAntes>(
        `INSERT INTO reporte_inundacion (geom, geom_publico, distrito_id, unidad_vecinal_id, manzana_id,
           ubicacion_metodo, ubicacion_tipo, direccion_aprox, descripcion, autor_id,
           tirante_estimado, duracion_estimada, frecuencia, afectacion,
           severidad_calculada, severidad_puntaje, severidad_version, severidad_manual, severidad_motivo, estado, estado_motivo)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326),
           CASE WHEN $3 THEN NULL ELSE ST_SetSRID(ST_MakePoint(round($1::numeric, 5)::float8, round($2::numeric, 5)::float8), 4326) END,
           'distrito_municipal:01', 'unidad_vecinal:A', 'manzana:A-1',
           'manual', CASE WHEN $3 THEN 'vivienda_o_predio' ELSE 'via_publica' END::ubicacion_tipo,
           'Calle de prueba ' || $4, 'Reporte previo a la migración 0010 número ' || $4, $5::uuid,
           $6::tirante_estimado, $7::duracion_estimada, $8::frecuencia, $9::afectacion,
           $10::severidad, $11, 1, $12::severidad, $13, $14::estado_reporte,
           CASE WHEN $14 = 'rechazado' THEN 'motivo de prueba' END)
         RETURNING id::text, tirante_estimado::text, frecuencia::text, severidad_manual::text, severidad_motivo`,
        [
          lon,
          lat,
          vivienda,
          String(n),
          n % 2 === 0 ? autor!.id : null,
          tirante,
          DURACIONES_V1[d - 1],
          frecuencia,
          AFECTACIONES_V1[a - 1],
          v1.banda,
          v1.puntaje,
          conManual ? 'critica' : null,
          conManual ? 'Reclasificada por el técnico antes de 0010' : null,
          estados[n % 4],
        ],
      );
      filasAntes.push(fila!);
      n++;
    }
  }
  instantaneaAntes = await exVieja.consultar<Instantanea>(SQL_INSTANTANEA);

  resultado0010 = await aplicarMigraciones(exVieja);

  dbNueva = await crearPglite();
  exNueva = ejecutorPglite(dbNueva);
  await aplicarMigraciones(exNueva);
}, 240_000);

afterAll(async () => {
  await dbVieja?.close();
  await dbNueva?.close();
  if (dirViejo) rmSync(dirViejo, { recursive: true, force: true });
});

/** La base vieja tiene que haber recibido exactamente una migración nueva, y es la 0010. */
function exigir0010Aplicada() {
  expect(
    resultado0010.aplicadas,
    'al migrar la base con 0001–0009 no se aplicó ninguna 0010_*.sql',
  ).toHaveLength(1);
  expect(resultado0010.aplicadas[0]).toMatch(ES_0010);
}

describe('migración 0010: quitar los cuatro campos del reporte', () => {
  it('CA-D1: existe 0010_*.sql y, migrando desde vacío, quita las cuatro columnas y los dos tipos', async () => {
    const nuevas = listarMigraciones().filter((f) => ES_0010.test(f));
    expect(nuevas, 'no hay ningún archivo migraciones/0010_*.sql').toHaveLength(1);

    const columnas = (
      await exNueva.consultar<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'`,
      )
    ).map((c) => c.column_name);
    for (const campo of CUATRO_CAMPOS) expect(columnas, `columna ${campo}`).not.toContain(campo);
    for (const campo of ['tirante_estimado', 'frecuencia', 'severidad_version'])
      expect(columnas, `columna ${campo}`).toContain(campo);

    const tipos = await exNueva.consultar<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typname = ANY($1::text[])`,
      [[...TIPOS_QUITADOS]],
    );
    expect(tipos.map((t) => t.typname)).toEqual([]);
  });

  it('CA-D2: 0001–0009 intactas, 0010 es el único archivo nuevo y volver a migrar no aplica nada', async () => {
    const archivos = listarMigraciones();
    expect(archivos).toEqual([
      ...Object.keys(HASH_MIGRACIONES_ANTERIORES),
      expect.stringMatching(ES_0010),
    ]);
    for (const [archivo, hash] of Object.entries(HASH_MIGRACIONES_ANTERIORES))
      expect(sha256Lf(join(DIRECTORIO_MIGRACIONES, archivo)), `${archivo} cambió`).toBe(hash);

    const registradas = await exNueva.consultar<{ nombre: string }>(
      'SELECT nombre FROM _migraciones ORDER BY nombre',
    );
    expect(registradas.map((r) => r.nombre)).toEqual(archivos);
    const otraVez = await aplicarMigraciones(exNueva);
    expect(otraVez.aplicadas).toEqual([]);
    expect(otraVez.omitidas).toEqual(archivos);
  });

  it('CA-D3: sobre una base con reportes, 0010 conserva filas, id, geometrías, tirante, frecuencia, estado, severidad_manual y autor', async () => {
    exigir0010Aplicada();
    expect(instantaneaAntes.length).toBeGreaterThanOrEqual(3);
    const despues = await exVieja.consultar<Instantanea>(SQL_INSTANTANEA);
    expect(despues).toHaveLength(instantaneaAntes.length);
    expect(despues).toStrictEqual(instantaneaAntes);
    // Las columnas quitadas ya no están en la base migrada con datos (no solo en la vacía).
    const columnas = (
      await exVieja.consultar<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'reporte_inundacion'`,
      )
    ).map((c) => c.column_name);
    for (const campo of CUATRO_CAMPOS) expect(columnas).not.toContain(campo);
  });

  it('CA-D4: 0010 recalcula la severidad de los reportes existentes con la v2 (16 combinaciones) y no toca la manual', async () => {
    exigir0010Aplicada();
    const filas = await exVieja.consultar<{
      id: string;
      tirante_estimado: Tirante;
      frecuencia: Frecuencia;
      severidad_calculada: Banda;
      severidad_puntaje: number;
      severidad_version: number;
      severidad_manual: Banda | null;
      severidad_motivo: string | null;
    }>(
      `SELECT id::text, tirante_estimado::text, frecuencia::text, severidad_calculada::text,
         severidad_puntaje, severidad_version, severidad_manual::text, severidad_motivo
       FROM reporte_inundacion`,
    );
    expect(filas).toHaveLength(16);
    const combinaciones = new Set(filas.map((f) => `${f.tirante_estimado}|${f.frecuencia}`));
    expect(combinaciones.size).toBe(16);

    const antesPorId = new Map(filasAntes.map((f) => [f.id, f]));
    for (const f of filas) {
      const clave = `${f.tirante_estimado}|${f.frecuencia}`;
      const esperado = SEVERIDAD_V2[clave]!;
      expect(
        {
          version: f.severidad_version,
          banda: f.severidad_calculada,
          puntaje: Number(f.severidad_puntaje),
        },
        clave,
      ).toStrictEqual({ version: 2, banda: esperado.banda, puntaje: esperado.puntaje });
      const antes = antesPorId.get(f.id)!;
      expect(f.severidad_manual, `${clave} severidad_manual`).toBe(antes.severidad_manual);
      expect(f.severidad_motivo, `${clave} severidad_motivo`).toBe(antes.severidad_motivo);
    }
  });

  it('CA-D5: el esquema Drizzle de reporteInundacion no declara los cuatro campos ni sus enums; manzana sigue exportada', () => {
    const nombres = Object.values(getTableColumns(esquema.reporteInundacion)).map((c) => c.name);
    for (const campo of CUATRO_CAMPOS) expect(nombres, `columna ${campo}`).not.toContain(campo);
    for (const campo of ['tirante_estimado', 'frecuencia', 'severidad_version'])
      expect(nombres).toContain(campo);

    const enums = Object.values(esquema)
      .filter((v) => isPgEnum(v))
      .map((e) => (e as { enumName: string }).enumName);
    for (const tipo of TIPOS_QUITADOS) expect(enums, `pgEnum ${tipo}`).not.toContain(tipo);

    expect(getTableName(esquema.manzana)).toBe('manzana');
    expect(getTableConfig(esquema.manzana).schema).toBe('geo');
  });

  it('CA-D5: tras 0010 geo.manzana y geo.manzana_vigente existen y verificar-privilegios sigue exigiendo SELECT sobre geo.manzana', async () => {
    const [aplicada] = await exNueva.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM _migraciones WHERE nombre ~ '^0010_.+\\.sql$'`,
    );
    expect(aplicada!.n, 'la base nueva no registra ninguna 0010').toBe(1);
    const [rel] = await exNueva.consultar<{ tabla: string | null; vista: string | null }>(
      `SELECT to_regclass('geo.manzana')::text AS tabla, to_regclass('geo.manzana_vigente')::text AS vista`,
    );
    expect(rel).toStrictEqual({ tabla: 'geo.manzana', vista: 'geo.manzana_vigente' });
    const verificador = readFileSync(resolve(RAIZ_DB, 'src/cli/verificar-privilegios.mjs'), 'utf8');
    expect(
      verificador.match(/'geo\.manzana':\s*\['SELECT'\]/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
  });

  it('CA-D6: el seed sintético termina, deja todos los reportes con severidad v2 y sigue cargando la capa manzana', async () => {
    const r = await sembrarSamples(exNueva, {
      passwordAdmin: 'x-admin-test',
      passwordTecnico: 'x-tecnico-test',
      passwordVecina: 'x-vecina-test',
    });
    expect(r.reportes).toBeGreaterThan(0);
    const filas = await exNueva.consultar<{
      tirante_estimado: Tirante;
      frecuencia: Frecuencia;
      severidad_calculada: Banda;
      severidad_puntaje: number;
      severidad_version: number;
    }>(
      `SELECT tirante_estimado::text, frecuencia::text, severidad_calculada::text, severidad_puntaje,
         severidad_version FROM reporte_inundacion`,
    );
    expect(filas.length).toBe(r.reportes);
    for (const f of filas) {
      const clave = `${f.tirante_estimado}|${f.frecuencia}`;
      const esperado = SEVERIDAD_V2[clave]!;
      expect(
        {
          version: f.severidad_version,
          banda: f.severidad_calculada,
          puntaje: Number(f.severidad_puntaje),
        },
        clave,
      ).toStrictEqual({ version: 2, banda: esperado.banda, puntaje: esperado.puntaje });
    }
    const [mz] = await exNueva.consultar<{ n: number }>(
      'SELECT count(*)::int AS n FROM geo.manzana',
    );
    expect(mz!.n).toBeGreaterThan(0);
  }, 120_000);

  it('CA-D7: ni src, ni test, ni banco-puntos-criticos.ts nombran los cuatro campos en código', () => {
    const patron = /duracion_estimada|afectacion|direccion_aprox|manzana_id/i;
    const este = fileURLToPath(import.meta.url);
    const archivos: string[] = [resolve(RAIZ_DB, 'banco-puntos-criticos.ts')];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.(ts|tsx|mts|js|mjs|cjs|sql)$/.test(nombre) && resolve(ruta) !== resolve(este))
          archivos.push(ruta);
      }
    };
    recorrer(resolve(RAIZ_DB, 'src'));
    recorrer(resolve(RAIZ_DB, 'test'));

    const hallazgos: string[] = [];
    for (const archivo of archivos) {
      // Se permiten comentarios que expliquen el cambio: se quitan antes de buscar.
      const sinBloques = readFileSync(archivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) =>
        m.replace(/[^\n]/g, ' '),
      );
      sinBloques.split('\n').forEach((linea, i) => {
        const codigo = linea.replace(/(^|\s)\/\/.*$/, '$1').replace(/(^|\s)--\s.*$/, '$1');
        if (patron.test(codigo))
          hallazgos.push(`${relative(RAIZ_DB, archivo)}:${i + 1}: ${linea.trim()}`);
      });
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([]);
  });
});
