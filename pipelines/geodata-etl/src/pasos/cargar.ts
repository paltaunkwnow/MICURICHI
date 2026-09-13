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
}

export async function cargarCapa(
  ex: Ejecutor,
  version: string,
  capa: TipoCapa,
  opciones: { activar?: boolean; fuente?: string; fechaVigencia?: string | null } = {},
): Promise<ResultadoCarga> {
  const dir = join(dirProcessed(version), capa);
  const ruta = join(dir, `${capa}.full.geojson`);
  if (!existsSync(ruta))
    throw new Error(`No existe ${ruta}. Ejecutá primero: pnpm etl:run --version ${version}`);
  const fc = JSON.parse(readFileSync(ruta, 'utf8')) as FeatureCollection;
  const meta = existsSync(join(dir, 'metadata.json'))
    ? (JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as Record<string, unknown>)
    : {};

  await ex.ejecutar('BEGIN');
  try {
    await ex.consultar(`DELETE FROM geo.${capa} WHERE version_capa = $1`, [version]);
    for (const f of fc.features) {
      const p = f.properties ?? {};
      const geom = JSON.stringify(f.geometry);
      if (capa === 'distrito_municipal') {
        await ex.consultar(
          `INSERT INTO geo.distrito_municipal (id, codigo, nombre, geom, version_capa, fuente, fecha_vigencia)
           VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, $6, $7)`,
          [
            p.id,
            p.codigo,
            p.nombre,
            geom,
            version,
            p.fuente ?? opciones.fuente ?? null,
            p.fecha_vigencia ?? opciones.fechaVigencia ?? null,
          ],
        );
      } else if (capa === 'unidad_vecinal') {
        await ex.consultar(
          `INSERT INTO geo.unidad_vecinal (id, codigo, nombre, geom, version_capa, fuente, fecha_vigencia, distrito_id, distrito_inferido)
           VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, $6, $7, $8, $9)`,
          [
            p.id,
            p.codigo,
            p.nombre,
            geom,
            version,
            p.fuente ?? null,
            p.fecha_vigencia ?? null,
            p.distrito_id ?? 'sin_distrito',
            !!p.distrito_inferido,
          ],
        );
      } else {
        await ex.consultar(
          `INSERT INTO geo.manzana (id, codigo, nombre, geom, version_capa, fuente, fecha_vigencia, distrito_id, unidad_vecinal_id)
           VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)), $5, $6, $7, $8, $9)`,
          [
            p.id,
            p.codigo,
            p.nombre ?? '',
            geom,
            version,
            p.fuente ?? null,
            p.fecha_vigencia ?? null,
            p.distrito_id ?? null,
            p.unidad_vecinal_id ?? null,
          ],
        );
      }
    }
    // Verificaciones del contrato §6.9
    const [inv] = await ex.consultar<{ n: string }>(
      `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1 AND NOT ST_IsValid(geom)`,
      [version],
    );
    if (Number(inv?.n) > 0)
      throw new Error(`${capa} ${version}: ${inv?.n} geometrías inválidas tras la carga`);
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
    return { capa, version, n: fc.features.length, vigente: activar };
  } catch (e) {
    await ex.ejecutar('ROLLBACK');
    throw e;
  }
}
