/**
 * Migración 0018: integridad de moderación en la base (CLAUDE.md §7.1 y §7.3).
 *
 * Hasta aquí solo la API garantizaba que un `rechazado` o un `duplicado` llevaran motivo y que
 * `fusionado_en_id` apareciera solo en un `duplicado`. La 0018 lo graba como dos CHECK:
 *  - `motivo_en_rechazo_y_duplicado`: `rechazado`/`duplicado` exigen `estado_motivo` no vacío;
 *  - `fusion_solo_en_duplicado`: `fusionado_en_id` solo en `duplicado`.
 * Y quita el índice redundante `reporte_estado` (lo cubre `reporte_estado_creado` de la 0002).
 *
 * Lo que se comprueba:
 *  - desde cero deja las dos restricciones validadas, el índice compuesto y sin el índice viejo;
 *  - acepta las escrituras válidas y rechaza las inválidas (INSERT y UPDATE);
 *  - una segunda pasada (runner y archivo a mano) no cambia nada;
 *  - con filas viejas que violan las reglas la migración NO falla: las restricciones quedan
 *    `NOT VALID` (convalidated = false) y no se toca ningún dato (un despliegue no se traba);
 *  - con datos limpios las restricciones quedan validadas (convalidated = true).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import {
  aplicarMigraciones,
  DIRECTORIO_MIGRACIONES,
  listarMigraciones,
  type ResultadoMigracion,
} from '../src/migrar.js';

const ARCHIVO_0018 = '0018_integridad_moderacion.sql';
const numero = (f: string) => f.slice(0, 4);
const CODIGO_CHECK = '23514';

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

/** Definición y estado de validación de una restricción de `reporte_inundacion`. */
const restriccion = (ex: Ejecutor, nombre: string) =>
  ex.consultar<{ definicion: string; validada: boolean }>(
    `SELECT pg_get_constraintdef(oid) AS definicion, convalidated AS validada FROM pg_constraint
      WHERE conrelid = 'public.reporte_inundacion'::regclass AND conname = $1`,
    [nombre],
  );

const indiceExiste = async (ex: Ejecutor, nombre: string) => {
  const [r] = await ex.consultar<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [nombre],
  );
  return r!.n > 0;
};

/**
 * INSERT mínimo de un reporte con estado, motivo y canónico a elección. `publicar_en` es NOT NULL
 * sin DEFAULT desde la 0016, así que se fija siempre (60 s, dentro del CHECK `publicar_en_rango`).
 */
function insertarReporte(
  ex: Ejecutor,
  opciones: {
    estado?: string;
    estadoMotivo?: string | null;
    fusionadoEnId?: string | null;
    descripcion?: string;
  } = {},
) {
  const {
    estado = 'nuevo',
    estadoMotivo = null,
    fusionadoEnId = null,
    descripcion = 'Reporte para la migración 0018 de integridad de moderación',
  } = opciones;
  return ex.consultar<{ id: string }>(
    `INSERT INTO reporte_inundacion (geom, distrito_id, unidad_vecinal_id, ubicacion_metodo,
       ubicacion_tipo, descripcion, profundidad_estimada, frecuencia, severidad_calculada,
       severidad_puntaje, estado, estado_motivo, fusionado_en_id, publicar_en)
     VALUES (ST_SetSRID(ST_MakePoint(-63.18, -17.78), 4326), 'distrito_municipal:01',
       'unidad_vecinal:A', 'gps', 'via_publica', $1, 'rodilla', 'ocasional', 'media', 6,
       $2::estado_reporte, $3, $4::uuid, now() + interval '60 seconds')
     RETURNING id::text`,
    [descripcion, estado, estadoMotivo, fusionadoEnId],
  );
}

/** Instantánea comparable de las columnas de moderación de cada reporte. */
const leerReportes = (ex: Ejecutor) =>
  ex.consultar(
    `SELECT id::text, estado::text, estado_motivo, fusionado_en_id::text, descripcion
       FROM reporte_inundacion ORDER BY id::text`,
  );

describe('migración 0018 desde cero (base limpia)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('existe un único 0018_*.sql y se llama 0018_integridad_moderacion.sql', () => {
    expect(listarMigraciones().filter((f) => numero(f) === '0018')).toEqual([ARCHIVO_0018]);
  });

  it('0018 es el número siguiente al mayor que había en disco (0017)', () => {
    const numeros = listarMigraciones().map(numero).sort();
    expect(numeros.at(-1)).toBe('0018');
    expect(numeros.at(-2)).toBe('0017');
  });

  it('crea las dos restricciones y, sin filas que las violen, las deja validadas', async () => {
    const [motivo] = await restriccion(ex, 'motivo_en_rechazo_y_duplicado');
    const [fusion] = await restriccion(ex, 'fusion_solo_en_duplicado');
    expect(motivo?.validada).toBe(true);
    expect(fusion?.validada).toBe(true);
    expect(motivo?.definicion).toMatch(/btrim\(estado_motivo\)/);
    expect(fusion?.definicion).toMatch(/fusionado_en_id IS NULL/);
  });

  it('quita el índice reporte_estado y conserva el compuesto reporte_estado_creado', async () => {
    expect(await indiceExiste(ex, 'reporte_estado')).toBe(false);
    expect(await indiceExiste(ex, 'reporte_estado_creado')).toBe(true);
  });

  it('acepta las escrituras válidas', async () => {
    await expect(insertarReporte(ex, { estado: 'validado' })).resolves.toHaveLength(1);
    await expect(
      insertarReporte(ex, { estado: 'rechazado', estadoMotivo: 'Fuera de cobertura' }),
    ).resolves.toHaveLength(1);
    // duplicado con motivo y sin canónico es válido a propósito: la FK es ON DELETE SET NULL.
    await expect(
      insertarReporte(ex, { estado: 'duplicado', estadoMotivo: 'El mismo charco' }),
    ).resolves.toHaveLength(1);
    const [canonico] = await insertarReporte(ex, { estado: 'validado' });
    await expect(
      insertarReporte(ex, {
        estado: 'duplicado',
        estadoMotivo: 'El mismo charco',
        fusionadoEnId: canonico!.id,
      }),
    ).resolves.toHaveLength(1);
  });

  it('rechaza un rechazado o un duplicado sin motivo o con motivo en blanco', async () => {
    await expect(insertarReporte(ex, { estado: 'rechazado' })).rejects.toMatchObject({
      code: CODIGO_CHECK,
    });
    await expect(
      insertarReporte(ex, { estado: 'rechazado', estadoMotivo: '   ' }),
    ).rejects.toMatchObject({ code: CODIGO_CHECK });
    await expect(insertarReporte(ex, { estado: 'duplicado' })).rejects.toMatchObject({
      code: CODIGO_CHECK,
    });
    // También en un UPDATE: un `nuevo` válido que pasa a `rechazado` sin motivo.
    const [r] = await insertarReporte(ex, { estado: 'nuevo' });
    await expect(
      ex.consultar(`UPDATE reporte_inundacion SET estado = 'rechazado' WHERE id = $1`, [r!.id]),
    ).rejects.toMatchObject({ code: CODIGO_CHECK });
  });

  it('rechaza fusionado_en_id en un estado que no es duplicado', async () => {
    const [canonico] = await insertarReporte(ex, { estado: 'validado' });
    await expect(
      insertarReporte(ex, { estado: 'validado', fusionadoEnId: canonico!.id }),
    ).rejects.toMatchObject({ code: CODIGO_CHECK });
    const [r] = await insertarReporte(ex, { estado: 'validado' });
    await expect(
      ex.consultar(`UPDATE reporte_inundacion SET fusionado_en_id = $2 WHERE id = $1`, [
        r!.id,
        canonico!.id,
      ]),
    ).rejects.toMatchObject({ code: CODIGO_CHECK });
  });

  it('volver a migrar no aplica nada y ejecutar el archivo a mano no cambia las restricciones', async () => {
    const otra = await aplicarMigraciones(ex);
    expect(otra.aplicadas).toEqual([]);
    await ex.transaccion((tx) =>
      tx.ejecutar(readFileSync(join(DIRECTORIO_MIGRACIONES, ARCHIVO_0018), 'utf8')),
    );
    const [motivo] = await restriccion(ex, 'motivo_en_rechazo_y_duplicado');
    const [fusion] = await restriccion(ex, 'fusion_solo_en_duplicado');
    expect(motivo?.validada).toBe(true);
    expect(fusion?.validada).toBe(true);
    expect(await indiceExiste(ex, 'reporte_estado')).toBe(false);
  });
});

describe('migración 0018 con filas inválidas previas (no traba el despliegue)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let resto: ResultadoMigracion;
  let reportesAntes: unknown[];

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex, { hasta: '0017' });
    // Filas que las reglas nuevas prohíben, insertadas cuando todavía se podía (antes de la 0018).
    const [canonico] = await insertarReporte(ex, { estado: 'validado' });
    await insertarReporte(ex, { estado: 'rechazado', estadoMotivo: null }); // motivo faltante
    await insertarReporte(ex, { estado: 'duplicado', estadoMotivo: '   ' }); // motivo en blanco
    await insertarReporte(ex, { estado: 'validado', fusionadoEnId: canonico!.id }); // fusión mal puesta
    reportesAntes = await leerReportes(ex);
    resto = await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('la 0018 se aplica igual, sin fallar por las filas viejas', () => {
    expect(resto.aplicadas).toContain(ARCHIVO_0018);
  });

  it('las dos restricciones existen pero quedan SIN VALIDAR (convalidated = false)', async () => {
    const [motivo] = await restriccion(ex, 'motivo_en_rechazo_y_duplicado');
    const [fusion] = await restriccion(ex, 'fusion_solo_en_duplicado');
    expect(motivo).toBeDefined();
    expect(fusion).toBeDefined();
    expect(motivo?.validada).toBe(false);
    expect(fusion?.validada).toBe(false);
  });

  it('no modifica ningún dato', async () => {
    expect(await leerReportes(ex)).toStrictEqual(reportesAntes);
  });

  it('las filas que violan cada regla siguen presentes', async () => {
    const [m] = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM reporte_inundacion
        WHERE estado IN ('rechazado', 'duplicado') AND (estado_motivo IS NULL OR btrim(estado_motivo) = '')`,
    );
    const [f] = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM reporte_inundacion
        WHERE fusionado_en_id IS NOT NULL AND estado <> 'duplicado'`,
    );
    expect(m?.n).toBe('2');
    expect(f?.n).toBe('1');
  });

  it('aunque sin validar, el CHECK sigue frenando escrituras nuevas inválidas', async () => {
    await expect(insertarReporte(ex, { estado: 'rechazado' })).rejects.toMatchObject({
      code: CODIGO_CHECK,
    });
  });
});

describe('migración 0018 con datos limpios previos (se valida)', () => {
  let db: Awaited<ReturnType<typeof crearPglite>>;
  let ex: Ejecutor;
  let reportesAntes: unknown[];

  beforeAll(async () => {
    db = await crearPglite();
    ex = ejecutorPglite(db);
    await aplicarMigraciones(ex, { hasta: '0017' });
    const [canonico] = await insertarReporte(ex, { estado: 'validado' });
    await insertarReporte(ex, { estado: 'rechazado', estadoMotivo: 'Fuera de cobertura' });
    await insertarReporte(ex, {
      estado: 'duplicado',
      estadoMotivo: 'El mismo charco',
      fusionadoEnId: canonico!.id,
    });
    reportesAntes = await leerReportes(ex);
    await aplicarMigraciones(ex);
  }, 240_000);

  afterAll(async () => {
    await db?.close();
  });

  it('con todas las filas válidas, las dos restricciones quedan validadas', async () => {
    const [motivo] = await restriccion(ex, 'motivo_en_rechazo_y_duplicado');
    const [fusion] = await restriccion(ex, 'fusion_solo_en_duplicado');
    expect(motivo?.validada).toBe(true);
    expect(fusion?.validada).toBe(true);
  });

  it('no modifica ningún dato', async () => {
    expect(await leerReportes(ex)).toStrictEqual(reportesAntes);
  });
});
