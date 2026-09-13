/** Point-in-polygon con las reglas de CLAUDE.md §7.4. */
import { CONFIG_DOMINIO, type ResolverRespuesta } from 'contracts';
import type pg from 'pg';

interface FilaUv {
  id: string;
  codigo: string;
  nombre: string;
  distrito_id: string;
  version_capa: string;
  distancia_m: number | null;
}

export async function resolverPunto(
  pool: pg.Pool,
  lat: number,
  lon: number,
): Promise<ResolverRespuesta> {
  const pt = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)';
  // 1–2) UV que contienen el punto (ST_Intersects incluye el borde). Índice GIST vía && implícito.
  const uvs = await pool.query<FilaUv>(
    `SELECT id, codigo, nombre, distrito_id, version_capa, NULL::float AS distancia_m
     FROM geo.unidad_vecinal_vigente WHERE ST_Intersects(geom, ${pt}) ORDER BY id`,
    [lon, lat],
  );
  let uv: FilaUv | null = uvs.rows[0] ?? null;
  const enLimite = uvs.rows.length > 1;
  let asignadoPorProximidad = false;
  let distanciaM: number | null = null;

  // 3) hueco: UV más cercana dentro de la tolerancia (geography → metros, sin PROJ)
  if (!uv) {
    const cerca = await pool.query<FilaUv>(
      `SELECT id, codigo, nombre, distrito_id, version_capa, ST_Distance(geom::geography, ${pt}::geography) AS distancia_m
       FROM geo.unidad_vecinal_vigente
       WHERE ST_DWithin(geom::geography, ${pt}::geography, $3)
       ORDER BY distancia_m ASC, id ASC LIMIT 1`,
      [lon, lat, CONFIG_DOMINIO.TOLERANCIA_HUECO_M],
    );
    if (cerca.rows[0]) {
      uv = cerca.rows[0];
      asignadoPorProximidad = true;
      distanciaM = Math.round(Number(uv.distancia_m) * 10) / 10;
    }
  }

  // Distrito por PIP (cruce) y por la UV
  const distritoPip = await pool.query<{ id: string; codigo: string; nombre: string }>(
    `SELECT id, codigo, nombre FROM geo.distrito_municipal_vigente WHERE ST_Intersects(geom, ${pt}) ORDER BY id LIMIT 1`,
    [lon, lat],
  );
  let distrito: ResolverRespuesta['distrito'] = distritoPip.rows[0] ?? null;
  let distritoDiscrepante = false;
  if (uv) {
    const deUv = await pool.query<{ id: string; codigo: string; nombre: string }>(
      'SELECT id, codigo, nombre FROM geo.distrito_municipal_vigente WHERE id = $1',
      [uv.distrito_id],
    );
    const d = deUv.rows[0] ?? {
      id: uv.distrito_id,
      codigo: uv.distrito_id.split(':').pop() ?? uv.distrito_id,
      nombre: uv.distrito_id,
    };
    if (distrito && distrito.id !== d.id) distritoDiscrepante = true;
    distrito = d;
  }

  // Manzana (informativa)
  const mz = await pool.query<{ id: string; codigo: string }>(
    `SELECT id, codigo FROM geo.manzana_vigente WHERE ST_Contains(geom, ${pt}) ORDER BY id LIMIT 1`,
    [lon, lat],
  );

  // 4) fuera de cobertura: sin UV (ni contenida ni a la tolerancia)
  const dentro = uv !== null;
  return {
    dentro_cobertura: dentro,
    distrito: dentro ? distrito : distrito,
    unidad_vecinal: uv ? { id: uv.id, codigo: uv.codigo, nombre: uv.nombre } : null,
    manzana: mz.rows[0] ?? null,
    version_capa: uv?.version_capa ?? null,
    en_limite: enLimite,
    asignado_por_proximidad: asignadoPorProximidad,
    distancia_m: distanciaM,
    distrito_discrepante: distritoDiscrepante,
  };
}
