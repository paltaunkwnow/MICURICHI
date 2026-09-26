/**
 * Carga a PostGIS (CLAUDE.md §6.9): por cada capa, filas en geo.<capa> con version_capa y su fila en
 * geo.capa_version. Todas las capas de una versión entran en UNA transacción: o queda la versión
 * entera o no queda nada.
 */
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
  /** La activó esta carga porque la capa no tenía ninguna versión vigente (arranque). */
  activadaEnArranque: boolean;
  /** Geometrías que PostGIS declaró inválidas y se repararon con ST_MakeValid al cargar. */
  reparadas: number;
}

export interface OpcionesCarga {
  fuente?: string;
  fechaVigencia?: string | null;
  /** Salida de `etl:run` de la versión; por defecto data/processed/<version>. */
  dirProcesado?: string;
  log?: (m: string) => void;
}

/** Queda en `auditoria.despues.motivo` de la única activación que hace el ETL. */
export const MOTIVO_ACTIVACION_ARRANQUE =
  'arranque del ETL: la capa no tenía ninguna versión vigente';

/**
 * Carga las capas de una versión en una sola transacción.
 *
 * Antes cada capa iba en la suya, emitida con `ejecutar('BEGIN')` sobre el Pool (solo era una
 * transacción porque el CLI creaba el pool con una conexión): si fallaba `manzana` después de
 * comprometer distritos y UV, la versión quedaba a medias en la base.
 *
 * Activar una versión es acción del administrador desde el panel (§6.9). La única excepción es el
 * arranque: si la capa no tiene NINGUNA versión vigente, el sistema no puede resolver reportes, así
 * que esta carga la activa y lo deja en `auditoria` sin actor. Cualquier otra versión se carga sin
 * activar.
 */
export async function cargarVersion(
  ex: Ejecutor,
  version: string,
  capas: TipoCapa[],
  opciones: OpcionesCarga = {},
): Promise<ResultadoCarga[]> {
  const dir = opciones.dirProcesado ?? dirProcessed(version);
  // Se comprueba antes de abrir la transacción: si falta una capa, la base no se toca.
  for (const capa of capas) {
    const ruta = rutaCapa(dir, capa);
    if (!existsSync(ruta))
      throw new Error(`No existe ${ruta}. Ejecutá primero: pnpm etl:run -- --version ${version}`);
  }
  return ex.transaccion(async (tx) => {
    const resultados: ResultadoCarga[] = [];
    for (const capa of capas) resultados.push(await cargarCapa(tx, version, capa, dir, opciones));
    return resultados;
  });
}

function rutaCapa(dir: string, capa: TipoCapa): string {
  return join(dir, capa, `${capa}.full.geojson`);
}

/** Una capa. Solo se llama dentro de la transacción de `cargarVersion`: `tx` es esa conexión. */
async function cargarCapa(
  tx: Ejecutor,
  version: string,
  capa: TipoCapa,
  dir: string,
  opciones: OpcionesCarga,
): Promise<ResultadoCarga> {
  const fc = JSON.parse(readFileSync(rutaCapa(dir, capa), 'utf8')) as FeatureCollection;
  const rutaMeta = join(dir, capa, 'metadata.json');
  const meta = existsSync(rutaMeta)
    ? (JSON.parse(readFileSync(rutaMeta, 'utf8')) as Record<string, unknown>)
    : {};

  await tx.consultar(`DELETE FROM geo.${capa} WHERE version_capa = $1`, [version]);

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
    await tx.consultar(
      `INSERT INTO geo.${capa} (${columnas.join(', ')}) VALUES ${filas.join(', ')}`,
      params,
    );
    if (opciones.log && (i / TAMANO_LOTE) % 25 === 0)
      opciones.log(`    ${Math.min(i + TAMANO_LOTE, fc.features.length)}/${fc.features.length}`);
  }

  // Verificaciones del contrato §6.9.
  // PostGIS (GEOS) es más estricto que la validación previa: lo que quede inválido se repara acá
  // con ST_MakeValid y se reporta el cambio de área, en lugar de aceptarlo o descartarlo en silencio.
  const reparadas: Array<{ id: string; motivo: string; area_despues_m2: number }> = [];
  const invalidas = await tx.consultar<{ id: string; motivo: string }>(
    `SELECT id, ST_IsValidReason(geom) AS motivo FROM geo.${capa} WHERE version_capa = $1 AND NOT ST_IsValid(geom)`,
    [version],
  );
  for (const f of invalidas) {
    const [r] = await tx.consultar<{ area_antes: string; area_despues: string }>(
      `UPDATE geo.${capa} SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3))
       WHERE id = $1 AND version_capa = $2
       RETURNING ST_Area(geom::geography)::text AS area_despues, $3::text AS area_antes`,
      [f.id, version, '0'],
    );
    reparadas.push({ id: f.id, motivo: f.motivo, area_despues_m2: Number(r?.area_despues ?? 0) });
  }
  const [aunInvalidas] = await tx.consultar<{ n: string }>(
    `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1 AND NOT ST_IsValid(geom)`,
    [version],
  );
  if (Number(aunInvalidas?.n) > 0)
    throw new Error(
      `${capa} ${version}: ${aunInvalidas?.n} geometrías siguen inválidas después de ST_MakeValid`,
    );
  const [cnt] = await tx.consultar<{ n: string }>(
    `SELECT count(*)::text AS n FROM geo.${capa} WHERE version_capa = $1`,
    [version],
  );
  if (Number(cnt?.n) !== fc.features.length)
    throw new Error(`${capa} ${version}: se cargaron ${cnt?.n} de ${fc.features.length}`);

  // Se actualiza la fila en su sitio en vez de borrarla y recrearla: su id es el que referencia
  // auditoria.entidad_id, y recrearla perdía la activación del admin (vigente, activado_por/_en).
  const [fila] = await tx.consultar<{ id: string; vigente: boolean }>(
    `INSERT INTO geo.capa_version (capa, version, fuente, fecha_vigencia, crs_origen, sha256_manifiesto, n_features)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (capa, version) DO UPDATE SET
       fuente = EXCLUDED.fuente, fecha_vigencia = EXCLUDED.fecha_vigencia,
       crs_origen = EXCLUDED.crs_origen, sha256_manifiesto = EXCLUDED.sha256_manifiesto,
       n_features = EXCLUDED.n_features, cargado_en = now()
     RETURNING id::text, vigente`,
    [
      capa,
      version,
      opciones.fuente ?? (meta.fuente as string) ?? null,
      opciones.fechaVigencia ?? (meta.fecha_vigencia as string) ?? null,
      (meta.crs_origen as string) ?? null,
      (meta.sha256_manifiesto as string) ?? null,
      fc.features.length,
    ],
  );
  if (!fila) throw new Error(`${capa} ${version}: no se pudo registrar en geo.capa_version`);

  const [vigentes] = await tx.consultar<{ n: string }>(
    'SELECT count(*)::text AS n FROM geo.capa_version WHERE capa = $1 AND vigente',
    [capa],
  );
  const activadaEnArranque = Number(vigentes?.n ?? 0) === 0;
  if (activadaEnArranque) {
    await tx.consultar(
      'UPDATE geo.capa_version SET vigente = true, activado_por = NULL, activado_en = now() WHERE id = $1',
      [fila.id],
    );
    // Misma forma que la activación del panel (api-core, POST /admin/capas/:id/activar), sin actor.
    await tx.consultar(
      'INSERT INTO auditoria (entidad, entidad_id, accion, actor_id, despues) VALUES ($1, $2, $3, NULL, $4)',
      [
        'capa_version',
        fila.id,
        'activar',
        JSON.stringify({ capa, version, motivo: MOTIVO_ACTIVACION_ARRANQUE }),
      ],
    );
  }

  if (reparadas.length)
    opciones.log?.(
      `    reparadas en PostGIS con ST_MakeValid: ${reparadas.length} (${reparadas
        .slice(0, 5)
        .map((r) => `${r.id}: ${r.motivo}`)
        .join('; ')})`,
    );
  return {
    capa,
    version,
    n: fc.features.length,
    vigente: fila.vigente || activadaEnArranque,
    activadaEnArranque,
    reparadas: reparadas.length,
  };
}
