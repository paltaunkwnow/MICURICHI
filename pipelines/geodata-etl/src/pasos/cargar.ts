/** Carga a PostGIS (CLAUDE.md §6.9): staging → tabla definitiva con version_capa → fila en capa_version (vigente=false). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TipoCapa } from 'contracts';
import type { Ejecutor } from 'db';
import type { FeatureCollection } from 'geojson';
import { dirProcessed } from '../config.js';

export interface ResultadoCarga {
  capa: TipoCapa;
  version: string;
  n: number;
  vigente: boolean;
  /** Geometrías que PostGIS declaró inválidas y se repararon con ST_MakeValid al cargar. */
  reparadas: number;
}

export async function cargarCapa(
  ex: Ejecutor,
  version: string,
  capa: TipoCapa,
  opciones: {
    activar?: boolean;
    fuente?: string;
    fechaVigencia?: string | null;
    log?: (m: string) => void;
  } = {},
): Promise<ResultadoCarga> {
  const dir = join(dirProcessed(version), capa);
  const ruta = join(dir, `${capa}.full.geojson`);
  if (!existsSync(ruta))
    throw new Error(`No existe ${ruta}. Ejecutá primero: pnpm etl:run --version ${version}`);
  const fc = JSON.parse(readFileSync(ruta, 'utf8')) as FeatureCollection;
  const meta = existsSync(join(dir, 'metadata.json'))
    ? (JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as Record<string, unknown>)
    : {};

  const reparadas: Array<{ id: string; motivo: string; area_despues_m2: number }> = [];
  await ex.ejecutar('BEGIN');
  try {
    await ex.consultar(`DELETE FROM geo.${capa} WHERE version_capa = $1`, [version]);

    // Inserción por lotes: una sentencia por feature sobre 27 000 manzanas tardaría minutos.
    const columnas =
      capa === 'distrito_municipal'
        ? ['id', 'codigo', 'nombre', 'geom', 'version_capa', 'fuente', 'fecha_vigencia']
        : capa === 'unidad_vecinal'
          ? [
              'id',
              'codigo',
              'nombre',
              'geom',
              'version_capa',
              'fuente',
              'fecha_vigencia',
              'distrito_id',
              'distrito_inferido',
            ]
          : [
              'id',
              'codigo',
              'nombre',
              'geom',
              'version_capa',
              'fuente',
              'fecha_vigencia',
              'distrito_id',
              'unidad_vecinal_id',
            ];

    const valoresDe = (f: (typeof fc.features)[number]): unknown[] => {
      const p = f.properties ?? {};
      const base = [
        p.id,
        p.codigo,
        p.nombre ?? '',
        JSON.stringify(f.geometry),
        version,
        p.fuente ?? opciones.fuente ?? null,
        p.fecha_vigencia ?? opciones.fechaVigencia ?? null,
      ];
      if (capa === 'distrito_municipal') return base;
      if (capa === 'unidad_vecinal')
        return [...base, p.distrito_id ?? 'sin_distrito', !!p.distrito_inferido];
      return [...base, p.distrito_id ?? null, p.unidad_vecinal_id ?? null];
    };

    const TAMANO_LOTE = 200;
    for (let i = 0; i < fc.features.length; i += TAMANO_LOTE) {
      const lote = fc.features.slice(i, i + TAMANO_LOTE);
      const params: unknown[] = [];
      const filas = lote.map((f) => {
        const valores = valoresDe(f);
        const marcadores = valores.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        // la columna geom (índice 3) llega como GeoJSON y se convierte en la base
        marcadores[3] = `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${marcadores[3]}), 4326))`;
        return `(${marcadores.join(', ')})`;
      });
      await ex.consultar(
        `INSERT INTO geo.${capa} (${columnas.join(', ')}) VALUES ${filas.join(', ')}`,
        params,
      );
      if (opciones.log && (i / TAMANO_LOTE) % 25 === 0)
        opciones.log(`    ${Math.min(i + TAMANO_LOTE, fc.features.length)}/${fc.features.length}`);
    }

    // Verificaciones del contrato §6.9.
    // PostGIS (GEOS) es más estricto que la validación previa: lo que quede inválido se repara acá
    // con ST_MakeValid y se reporta el cambio de área, en lugar de aceptarlo o descartarlo en silencio.
    const invalidas = await ex.consultar<{ id: string; motivo: string }>(
      `SELECT id, ST_IsValidReason(geom) AS motivo FROM geo.${capa} WHERE version_capa = $1 AND NOT ST_IsValid(geom)`,
      [version],
    );
    for (const f of invalidas) {
      const [r] = await ex.consultar<{ area_antes: string; area_despues: string }>(
        `UPDATE geo.${capa} SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3))
         WHERE id = $1 AND version_capa = $2
         RETURNING ST_Area(geom::geography)::text AS area_despues, $3::text AS area_antes`,
        [f.id, version, '0'],
      );
      reparadas.push({ id: f.id, motivo: f.motivo, area_despues_m2: Number(r?.area_despues ?? 0) });
    }
    const [aunInvalidas] = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1 AND NOT ST_IsValid(geom)`,
      [version],
    );
    if (Number(aunInvalidas?.n) > 0)
      throw new Error(
        `${capa} ${version}: ${aunInvalidas?.n} geometrías siguen inválidas después de ST_MakeValid`,
      );
    const [cnt] = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1`,
      [version],
    );
    if (Number(cnt?.n) !== fc.features.length)
      throw new Error(`${capa} ${version}: se cargaron ${cnt?.n} de ${fc.features.length}`);

    await ex.consultar('DELETE FROM geo.capa_version WHERE capa = $1 AND version = $2', [
      capa,
      version,
    ]);
    const [otras] = await ex.consultar<{ n: string }>(
      'SELECT count(*)::text AS n FROM geo.capa_version WHERE capa = $1 AND vigente',
      [capa],
    );
    const activar = opciones.activar === true || Number(otras?.n ?? 0) === 0;
    if (activar)
      await ex.consultar('UPDATE geo.capa_version SET vigente = false WHERE capa = $1', [capa]);
    await ex.consultar(
      `INSERT INTO geo.capa_version (capa, version, fuente, fecha_vigencia, crs_origen, sha256_manifiesto, n_features, vigente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        capa,
        version,
        opciones.fuente ?? (meta.fuente as string) ?? null,
        opciones.fechaVigencia ?? (meta.fecha_vigencia as string) ?? null,
        (meta.crs_origen as string) ?? null,
        (meta.sha256_manifiesto as string) ?? null,
        fc.features.length,
        activar,
      ],
    );
    await ex.ejecutar('COMMIT');
    if (reparadas.length)
      opciones.log?.(
        `    reparadas en PostGIS con ST_MakeValid: ${reparadas.length} (${reparadas
          .slice(0, 5)
          .map((r) => `${r.id}: ${r.motivo}`)
          .join('; ')})`,
      );
    return { capa, version, n: fc.features.length, vigente: activar, reparadas: reparadas.length };
  } catch (e) {
    await ex.ejecutar('ROLLBACK');
    throw e;
  }
}
