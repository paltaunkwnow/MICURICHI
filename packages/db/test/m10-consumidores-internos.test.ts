import { createHash } from 'node:crypto';
import { CONFIG_DOMINIO, calcularSeveridad, coordenadaPublica } from 'contracts';
import { eq, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESPERADO } from '../src/cli/matriz-privilegios.mjs';
import { type Ejecutor, ejecutorPglite } from '../src/ejecutor.js';
import * as esquema from '../src/esquema/index.js';
import { ejecutarMantenimiento } from '../src/mantenimiento.js';
import { aplicarMigraciones } from '../src/migrar.js';
import { recalcularPuntosCriticos } from '../src/puntos-criticos.js';
import { sembrarSamples } from '../src/seeds/samples.js';
import * as utils from '../src/test-utils.js';

const CATEGORIAS = ['inundacion', 'bache', 'basura', 'area_verde'] as const;
const OPCIONES_SEED = {
  passwordAdmin: 'test-admin',
  passwordTecnico: 'test-tecnico',
  passwordVecina: 'test-vecina',
  passwordEjecutivo: 'test-ejecutivo',
};

async function crearPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { postgis } = await import('@electric-sql/pglite-postgis');
  return PGlite.create({ dataDir: 'memory://', extensions: { postgis } });
}

function registrar(base: Ejecutor) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const envolver = (ex: Ejecutor): Ejecutor => ({
    ejecutar: (sql) => ex.ejecutar(sql),
    consultar<T>(sql: string, params: unknown[] = []) {
      consultas.push({ sql, params });
      return ex.consultar<T>(sql, params);
    },
    transaccion: (fn) => ex.transaccion((tx) => fn(envolver(tx))),
  });
  return { consultas, ex: envolver(base) };
}

let db: Awaited<ReturnType<typeof crearPglite>>;
let ex: Ejecutor;
beforeAll(async () => {
  db = await crearPglite();
  ex = ejecutorPglite(db);
  await aplicarMigraciones(ex, { autorizarContraccionCompatible: true }); // latest: los consumidores actuales no se congelan en 0021.
  await utils.cargarCapasDePrueba(ex);
}, 240_000);
beforeEach(async () => {
  // Exclusivamente esta fixture memory://, creada por este archivo, sin operadores externos.
  await ex.ejecutar(
    'DELETE FROM reporte_foto; DELETE FROM reporte; DELETE FROM punto_critico; DELETE FROM usuario;',
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db?.close();
});

describe('M10.4: consumidores internos sobre tabla física', () => {
  it.each(CATEGORIAS)(
    'helper: %s conserva IDs, defaults, geometrías, publicación y motivos',
    async (categoria) => {
      const espia = registrar(ex);
      const ids: string[] = [];
      for (const estado of ['nuevo', 'validado', 'resuelto', 'rechazado', 'duplicado']) {
        const id = await utils.insertarReporte(
          espia.ex,
          -63.195123456,
          -17.790123456,
          estado,
          'alta',
          categoria,
        );
        ids.push(id);
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        const [r] = await ex.consultar<Record<string, unknown>>(
          `SELECT r.*, detalle->>'profundidad_estimada' AS profundidad_estimada, detalle->>'frecuencia' AS frecuencia, detalle->>'causa_presunta' AS causa_presunta, detalle->>'sumidero_cercano' AS sumidero_cercano, detalle->>'sumidero_estado' AS sumidero_estado, (detalle->>'agua_brota_sumidero')::boolean AS agua_brota_sumidero, ST_X(geom) AS lon, ST_Y(geom) AS lat,
        ST_X(geom_publico) AS lon_publico, ST_Y(geom_publico) AS lat_publico,
        publicar_en = creado_en AS publicado_al_crear FROM reporte r WHERE id = $1`,
          [id],
        );
        expect(r).toMatchObject({
          id,
          categoria,
          estado,
          severidad_calculada: 'alta',
          severidad_puntaje: 6,
          severidad_version: categoria === 'inundacion' ? 2 : 1,
          detalle_version: 1,
          distrito_id: 'distrito_municipal:01',
          unidad_vecinal_id: 'unidad_vecinal:A',
          ubicacion_metodo: 'manual',
          ubicacion_tipo: 'via_publica',
          autor_id: null,
          descripcion: 'Reporte de prueba automatizada',
          distancia_dispositivo_m: null,
          precision_gps_m: null,
          publicado_al_crear: true,
          lon: -63.195123456,
          lat: -17.790123456,
          lon_publico: -63.19512,
          lat_publico: -17.79012,
          estado_motivo: ['rechazado', 'duplicado'].includes(estado)
            ? 'Motivo de prueba automatizada'
            : null,
        });
        expect(r!.detalle).toEqual(
          categoria === 'inundacion'
            ? {
                profundidad_estimada: 'rodilla',
                frecuencia: 'ocasional',
                causa_presunta: 'desconocida',
              }
            : { sintetico: true },
        ); // fixture DB genérica, no valida contratos de otras categorías.
        for (const campo of ['sumidero_cercano', 'sumidero_estado', 'agua_brota_sumidero'])
          expect(r![campo]).toBeNull();
        if (categoria !== 'inundacion') {
          for (const campo of ['profundidad_estimada', 'frecuencia', 'causa_presunta'])
            expect(r![campo]).toBeNull();
        }
      }
      expect(new Set(ids).size).toBe(5);
      expect(espia.consultas).toHaveLength(5);
      for (const { sql } of espia.consultas) {
        expect(sql).toMatch(/INSERT INTO reporte\s*\(/);
        expect(sql).not.toContain('reporte_inundacion');
        expect(sql).toContain('categoria');
      }
    },
  );

  it('helper: firma sin opcionales equivale a la escritura histórica y conserva false frente a ausencia', async () => {
    await ex.transaccion(async (tx) => {
      const id = await utils.insertarReporte(tx, -63.195, -17.79);
      // Referencia histórica explícita: mismas columnas/defaults, ahora contra latest.
      const [viejo] = await tx.consultar<{ id: string }>(`INSERT INTO reporte
        (geom, geom_publico, distrito_id, unidad_vecinal_id, ubicacion_metodo, ubicacion_tipo, descripcion, categoria,
         detalle, detalle_version, severidad_calculada, severidad_puntaje, severidad_version, estado, estado_motivo, publicar_en)
        VALUES (ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326), ST_SetSRID(ST_MakePoint(-63.195, -17.79), 4326),
          'distrito_municipal:01', 'unidad_vecinal:A', 'manual', 'via_publica', 'Reporte de prueba automatizada', 'inundacion',
          '{"profundidad_estimada":"rodilla","frecuencia":"ocasional","causa_presunta":"desconocida"}'::jsonb, 1, 'media', 6, 2, 'validado', NULL, now()) RETURNING id::text`);
      const filas = await tx.consultar<{ fila: Record<string, unknown> }>(
        `SELECT to_jsonb(r) - 'id' AS fila FROM reporte r WHERE categoria = 'inundacion' AND id = ANY($1::uuid[]) ORDER BY id`,
        [[id, viejo!.id]],
      );
      expect(filas).toHaveLength(2);
      expect(filas[0]!.fila).toStrictEqual(filas[1]!.fila);
      expect(filas[0]!.fila.detalle).not.toHaveProperty('agua_brota_sumidero');
      await tx.consultar(
        `UPDATE reporte SET detalle = detalle || '{"agua_brota_sumidero":false}'::jsonb
        WHERE categoria = 'inundacion' AND id = ANY($1::uuid[])`,
        [[id, viejo!.id]],
      );
      const despues = await tx.consultar<{ detalle: Record<string, unknown> }>(
        `SELECT detalle FROM reporte WHERE categoria = 'inundacion' AND id = ANY($1::uuid[])`,
        [[id, viejo!.id]],
      );
      expect(despues).toHaveLength(2);
      for (const r of despues)
        expect(r.detalle).toEqual({
          profundidad_estimada: 'rodilla',
          frecuencia: 'ocasional',
          causa_presunta: 'desconocida',
          agua_brota_sumidero: false,
        });
    });
  });

  it('seed: conserva la secuencia RNG completa, fechas, severidad y detalle coherente', async () => {
    const espia = registrar(ex);
    const resumen = await sembrarSamples(espia.ex, OPCIONES_SEED);
    const inserciones = espia.consultas.filter((c) =>
      /INSERT INTO reporte(?:_inundacion)?\s*\(/.test(c.sql),
    );
    const valores = inserciones.map((c) => c.params.slice(0, -1)); // UUID nuevo del técnico fuera del RNG.
    // Medido sobre el seed anterior al cambio y las tres UV sintéticas de cargarCapasDePrueba.
    expect(createHash('sha256').update(JSON.stringify(valores)).digest('hex')).toBe(
      '409522bd0209d681bcbbebeb82856d1a0a63746c0a968d65b9d9c9a18468bd42',
    );
    expect(resumen.reportes).toBeGreaterThan(0);
    const filas = await ex.consultar<
      Record<string, unknown>
    >(`SELECT r.*, detalle->>'profundidad_estimada' AS profundidad_estimada, detalle->>'frecuencia' AS frecuencia, detalle->>'causa_presunta' AS causa_presunta, detalle->>'sumidero_cercano' AS sumidero_cercano, detalle->>'sumidero_estado' AS sumidero_estado, (detalle->>'agua_brota_sumidero')::boolean AS agua_brota_sumidero, ST_X(geom) AS lon, ST_Y(geom) AS lat,
      ST_X(geom_publico) AS lon_publico, ST_Y(geom_publico) AS lat_publico,
      publicar_en = creado_en AS publicado_al_crear, creado_en <= now() AS pasado,
      extract(epoch FROM (evento_en - creado_en))::int AS evento_delta,
      extract(epoch FROM (validado_en - creado_en))::int AS validado_delta
      FROM reporte r WHERE categoria = 'inundacion' AND descripcion LIKE '%[muestra sintética]%'`);
    expect(filas).toHaveLength(resumen.reportes);
    for (const r of filas) {
      expect(r).toMatchObject({
        categoria: 'inundacion',
        detalle_version: 1,
        severidad_version: 2,
        publicado_al_crear: true,
        pasado: true,
        evento_delta: -10800,
        version_capa: 'test',
        sumidero_estado: null,
        agua_brota_sumidero: null,
      });
      const severidad = calcularSeveridad({
        profundidad_estimada: r.profundidad_estimada,
        frecuencia: r.frecuencia,
      } as Parameters<typeof calcularSeveridad>[0]);
      expect(r.severidad_calculada).toBe(severidad.banda);
      expect(r.severidad_puntaje).toBe(severidad.puntaje);
      const detalle = {
        profundidad_estimada: r.profundidad_estimada,
        frecuencia: r.frecuencia,
        causa_presunta: r.causa_presunta,
        ...(r.sumidero_cercano === null ? {} : { sumidero_cercano: r.sumidero_cercano }),
      };
      expect(r.detalle).toEqual(detalle);
      expect(r.validado_delta).toBe(
        ['validado', 'resuelto'].includes(String(r.estado)) ? 86400 : null,
      );
      const publico = coordenadaPublica(
        Number(r.lat),
        Number(r.lon),
        String(r.id),
        'jitter-local-cambiar-en-produccion',
        r.ubicacion_tipo as 'via_publica' | 'vivienda_o_predio',
        CONFIG_DOMINIO.JITTER_PUBLICO_M,
        CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
      );
      expect([r.lon_publico, r.lat_publico]).toEqual([publico.lon, publico.lat]);
    }
    for (const c of inserciones) expect(c.sql).toMatch(/INSERT INTO reporte\s*\(categoria,/);
  }, 120_000);

  it('seed: dos siembras conservan autores ajenos, fotos y otras categorías, aun con la misma marca y sin_uv', async () => {
    const [autor] = await ex.consultar<{
      id: string;
    }>(`INSERT INTO usuario (email, nombre, password_hash)
      VALUES ('externo-m10@test.local', 'Externo sintético', 'fixture') RETURNING id::text`);
    const protegidos: string[] = [];
    for (const categoria of CATEGORIAS) {
      const id = await utils.insertarReporte(ex, -63.195, -17.79, 'validado', 'media', categoria);
      protegidos.push(id);
      await ex.consultar(
        `UPDATE reporte SET autor_id = $2, descripcion = $3,
        unidad_vecinal_id = $4 WHERE id = $1`,
        [
          id,
          autor!.id,
          categoria === 'inundacion'
            ? 'Inundación ajena sin marca sintética'
            : 'Reporte ajeno [muestra sintética]',
          categoria === 'inundacion' ? 'unidad_vecinal:A' : 'sin_uv',
        ],
      );
      await ex.consultar(
        `INSERT INTO reporte_foto (reporte_id, objeto_key, mime, bytes, ancho, alto, exif_sanitizado)
        VALUES ($1, $2, 'image/webp', 123, 10, 10, true)`,
        [id, `protegida-${categoria}.webp`],
      );
    }
    await ex.consultar(
      `UPDATE reporte SET detalle = detalle || '{"agua_brota_sumidero":false}'::jsonb WHERE categoria = 'inundacion' AND id = $1`,
      [protegidos[0]],
    );
    const borrable = await utils.insertarReporte(ex, -63.195, -17.79);
    await ex.consultar(
      `UPDATE reporte SET descripcion = 'Vieja [muestra sintética]' WHERE categoria = 'inundacion' AND id = $1`,
      [borrable],
    );
    await ex.consultar(
      `INSERT INTO reporte_foto (reporte_id, objeto_key, mime, bytes, ancho, alto)
      VALUES ($1, 'borrable-m10.webp', 'image/webp', 1, 1, 1)`,
      [borrable],
    );
    await recalcularPuntosCriticos(ex);
    const guardar = () =>
      ex.consultar<{ fila: unknown }>(
        `SELECT to_jsonb(r) - 'punto_critico_id' - 'actualizado_en' AS fila
      FROM reporte r WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [protegidos],
      );
    const antes = await guardar();
    expect(antes).toHaveLength(4);
    const fotosAntes = await ex.consultar(
      `SELECT * FROM reporte_foto WHERE reporte_id = ANY($1::uuid[]) ORDER BY id`,
      [protegidos],
    );
    const espia = registrar(ex);
    const primera = await sembrarSamples(espia.ex, OPCIONES_SEED);
    const cuentasAntes = await ex.consultar<{ id: string }>(
      `SELECT id::text FROM usuario WHERE email LIKE '%@curichi.local' ORDER BY email`,
    );
    const segunda = await sembrarSamples(espia.ex, OPCIONES_SEED);
    expect(segunda.reportes).toBe(primera.reportes);
    expect(segunda.reportes).toBeGreaterThan(0);
    expect(await guardar()).toStrictEqual(antes);
    expect(
      await ex.consultar(
        `SELECT * FROM reporte_foto WHERE reporte_id = ANY($1::uuid[]) ORDER BY id`,
        [protegidos],
      ),
    ).toStrictEqual(fotosAntes);
    expect(await ex.consultar('SELECT id FROM reporte WHERE id = $1', [borrable])).toEqual([]);
    expect(
      await ex.consultar(`SELECT id FROM reporte_foto WHERE objeto_key = 'borrable-m10.webp'`),
    ).toEqual([]);
    const cuentasDespues = await ex.consultar<{ id: string; rol: string }>(
      `SELECT id::text, rol::text FROM usuario WHERE email LIKE '%@curichi.local' ORDER BY email`,
    );
    expect(cuentasAntes).toHaveLength(4);
    expect(cuentasDespues.map((c) => c.rol)).toEqual([
      'admin',
      'ejecutivo',
      'tecnico',
      'ciudadano',
    ]);
    expect(cuentasDespues.every((c) => !cuentasAntes.some((a) => a.id === c.id))).toBe(true);
    // Recálculo global: comprobamos membresía/categoría, no identidad de los puntos reconstruidos.
    const grupos = await ex.consultar<{ categoria: string; pc_categoria: string }>(
      `SELECT r.categoria, p.categoria AS pc_categoria
      FROM reporte r JOIN punto_critico p ON p.id = r.punto_critico_id WHERE r.id = ANY($1::uuid[]) ORDER BY r.categoria`,
      [protegidos],
    );
    expect(grupos).toHaveLength(4);
    for (const g of grupos) expect(g.pc_categoria).toBe(g.categoria);
    const operaciones = espia.consultas.filter((c) =>
      /(?:DELETE FROM|SELECT count\(\*\)::text AS n FROM) reporte(?:_inundacion)? WHERE/.test(
        c.sql,
      ),
    );
    expect(operaciones).toHaveLength(6); // dos DELETE y un conteo, dos veces.
    for (const { sql } of operaciones) {
      expect(sql).not.toContain('reporte_inundacion');
      expect(sql).toContain("categoria = 'inundacion'");
      expect(sql).toContain("descripcion LIKE '%[muestra sintética]%'");
    }
  }, 120_000);

  it('foto: FK tipada y catálogo apuntan a reporte; asociación y cascade selectivo en cuatro categorías', async () => {
    const orm = drizzle(db);
    const ids: string[] = [];
    for (const categoria of CATEGORIAS) {
      const id = await utils.insertarReporte(ex, -63.195, -17.79, 'validado', 'media', categoria);
      ids.push(id);
      await orm.insert(esquema.reporteFoto).values({
        reporteId: id,
        objetoKey: `${categoria}.webp`,
        mime: 'image/webp',
        bytes: 1,
        ancho: 1,
        alto: 1,
        exifSanitizado: true,
      });
    }
    await orm
      .insert(esquema.reporteFoto)
      .values({ objetoKey: 'huerfana-m10.webp', mime: 'image/webp', bytes: 1, ancho: 1, alto: 1 });
    const asociadas = await orm
      .select({ categoria: esquema.reporte.categoria, reporteId: esquema.reporteFoto.reporteId })
      .from(esquema.reporteFoto)
      .innerJoin(esquema.reporte, eq(esquema.reporte.id, esquema.reporteFoto.reporteId));
    expect(asociadas).toHaveLength(4);
    expect(asociadas.map((f) => f.categoria).sort()).toEqual([...CATEGORIAS].sort());
    expect(asociadas.map((f) => f.reporteId).sort()).toEqual([...ids].sort());
    for (const [i, id] of ids.entries()) {
      await orm.delete(esquema.reporte).where(eq(esquema.reporte.id, id));
      const fotos = await orm
        .select({ key: esquema.reporteFoto.objetoKey })
        .from(esquema.reporteFoto);
      expect(fotos.map((f) => f.key).sort()).toEqual(
        [...CATEGORIAS.slice(i + 1).map((c) => `${c}.webp`), 'huerfana-m10.webp'].sort(),
      );
    }
    const [huerfana] = await orm.select().from(esquema.reporteFoto);
    expect(huerfana!.reporteId).toBeNull();
    const fk = getTableConfig(esquema.reporteFoto).foreignKeys.find(
      (f) => f.reference().columns[0]?.name === 'reporte_id',
    );
    expect(fk).toBeDefined();
    expect(getTableName(fk!.reference().foreignTable)).toBe('reporte');
    expect(fk!.reference().foreignColumns.map((c) => c.name)).toEqual(['id']);
    expect(fk!.onDelete).toBe('cascade');
    const catalogo =
      await ex.consultar(`SELECT confrelid::regclass::text AS destino, confdeltype::text AS borrado
      FROM pg_constraint WHERE conrelid = 'reporte_foto'::regclass AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'reporte_foto'::regclass AND attname = 'reporte_id')]`);
    expect(catalogo).toEqual([{ destino: 'reporte', borrado: 'c' }]);
  });

  it('cuotas: conserva ACL/limpieza antigua y distingue las cinco claves actuales en medianoche local', async () => {
    const [u] = await ex.consultar<{
      id: string;
    }>(`INSERT INTO usuario (email, nombre, password_hash)
      VALUES ('cuota-m10@test.local', 'Cuota sintética', 'fixture') RETURNING id::text`);
    await ex.ejecutar(`SET TIME ZONE 'UTC'`);
    await ex.consultar(
      `INSERT INTO resguardo_m10.cuota_reporte_diaria (usuario_id, dia, reportes_n, fotos_n) VALUES
      ($1, '2026-09-25', 3, 12), ($1, '2026-09-26', 2, 7), ($1, '2026-09-27', 1, 4)`,
      [u!.id],
    );
    const claves = [...CATEGORIAS.map((c) => `reportes:${c}`), 'fotos:cuenta'];
    for (const clave of claves) {
      await ex.consultar(
        `INSERT INTO cupo_contador (usuario_id, clave, ventana_inicio, n) VALUES
        ($1, $2, '2026-09-26T03:59:59Z', 3), ($1, $2, '2026-09-26T04:00:00Z', 2),
        ($1, $2, '2026-09-27T03:59:59Z', 1), ($1, $2, '2026-09-27T04:00:00Z', 4)`,
        [u!.id, clave],
      );
    }
    const opciones = { zonaHoraria: 'America/La_Paz', ahora: new Date('2026-09-27T01:00:00Z') };
    const primera = await ejecutarMantenimiento(ex, opciones);
    expect(primera.cuotasDiariasBorradas).toBe(0);
    expect(primera.cupoContadorBorrado).toBe(5);
    const antiguos = () =>
      ex.consultar(
        `SELECT dia::text, reportes_n, fotos_n FROM resguardo_m10.cuota_reporte_diaria ORDER BY dia`,
      );
    const actuales = () =>
      ex.consultar<{ clave: string; n: number }>(
        `SELECT clave, n FROM cupo_contador ORDER BY clave, ventana_inicio`,
      );
    expect(await antiguos()).toEqual([
      { dia: '2026-09-25', reportes_n: 3, fotos_n: 12 },
      { dia: '2026-09-26', reportes_n: 2, fotos_n: 7 },
      { dia: '2026-09-27', reportes_n: 1, fotos_n: 4 },
    ]);
    expect(await actuales()).toEqual(
      [...claves].sort().flatMap((clave) => [2, 1, 4].map((n) => ({ clave, n }))),
    );
    const antes = { antiguos: await antiguos(), actuales: await actuales() };
    const segunda = await ejecutarMantenimiento(ex, opciones);
    expect([segunda.cuotasDiariasBorradas, segunda.cupoContadorBorrado]).toEqual([0, 0]);
    expect({ antiguos: await antiguos(), actuales: await actuales() }).toStrictEqual(antes);
    const medianoche = await ejecutarMantenimiento(ex, {
      ...opciones,
      ahora: new Date('2026-09-27T04:00:00Z'),
    });
    expect([medianoche.cuotasDiariasBorradas, medianoche.cupoContadorBorrado]).toEqual([0, 10]);
    expect(await actuales()).toEqual([...claves].sort().map((clave) => ({ clave, n: 4 })));
    for (const tabla of ['cupo_contador']) {
      expect(ESPERADO.curichi_api[`public.${tabla}`]).toEqual([
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
      ]);
      expect(ESPERADO.curichi_geo[`public.${tabla}`]).toEqual([]);
    }
    expect(ESPERADO.curichi_api['resguardo_m10.cuota_reporte_diaria']).toEqual([]);
    expect(ESPERADO.curichi_geo['resguardo_m10.cuota_reporte_diaria']).toEqual([]); // Matriz declarada: no certifica permisos efectivos de roles en PostgreSQL.
  });

  it('banco TS: importar no opera; su SQL conserva rejilla, volumen y semilla filtrada a inundación', async () => {
    const abrir = vi
      .spyOn(utils, 'levantarBaseEfimera')
      .mockRejectedValue(new Error('Banco real bloqueado por la prueba'));
    const banco = await import('../banco-puntos-criticos.js');
    expect(abrir).not.toHaveBeenCalled();
    const lote = banco.construirInsercionBanco(6, 0);
    expect(lote.params).toHaveLength(12);
    expect(lote.params.slice(0, 4)).toEqual([
      -63.1995,
      -17.7995,
      -63.1995 + 0.00002,
      -17.7995 + 0.00002,
    ]);
    expect(lote.sql).toMatch(/INSERT INTO reporte\s*\(categoria,/);
    await ex.consultar(lote.sql, lote.params);
    const siguiente = banco.construirInsercionBanco(3, 6);
    await ex.consultar(siguiente.sql, siguiente.params);
    const [n] = await ex.consultar<{ n: number }>(
      `SELECT count(*)::int AS n FROM reporte WHERE categoria = 'inundacion'`,
    );
    expect(n!.n).toBe(9);
    for (const categoria of CATEGORIAS.slice(1)) {
      const id = await utils.insertarReporte(
        ex,
        -63.1995,
        -17.7995,
        'validado',
        'media',
        categoria,
      );
      await ex.consultar(
        `UPDATE reporte SET creado_en = '2099-01-01', publicar_en = '2099-01-01' WHERE id = $1`,
        [id],
      );
    }
    const [semilla] = await ex.consultar<{ id: string }>(banco.SQL_SEMILLA_BANCO);
    const [fila] = await ex.consultar<{ categoria: string }>(
      'SELECT categoria FROM reporte WHERE id = $1',
      [semilla!.id],
    );
    expect(fila!.categoria).toBe('inundacion');
    const resumen = await recalcularPuntosCriticos(ex);
    expect(resumen.reportes).toBe(12);
    const grupos = await ex.consultar<{ n_reportes: number }>(
      `SELECT n_reportes FROM punto_critico WHERE categoria = 'inundacion' ORDER BY n_reportes`,
    );
    expect(grupos).toEqual([{ n_reportes: 3 }, { n_reportes: 3 }, { n_reportes: 3 }]);
    expect(abrir).not.toHaveBeenCalled();
  }, 120_000);
});
