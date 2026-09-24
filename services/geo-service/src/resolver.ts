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
  // El PIP de distrito y el de manzana no dependen del resultado de la UV: van en paralelo
  // para no encadenar cuatro idas y vueltas a la base en cada resolución.
  const [uvs, distritoPip, mz] = await Promise.all([
    pool.query<FilaUv>(
      `SELECT id, codigo, nombre, distrito_id, version_capa, NULL::float AS distancia_m
       FROM geo.unidad_vecinal_vigente WHERE ST_Intersects(geom, ${pt}) ORDER BY id`,
      [lon, lat],
    ),
    pool.query<{ id: string; codigo: string; nombre: string }>(
      `SELECT id, codigo, nombre FROM geo.distrito_municipal_vigente WHERE ST_Intersects(geom, ${pt}) ORDER BY id LIMIT 1`,
      [lon, lat],
    ),
    pool.query<{ id: string; codigo: string }>(
      `SELECT id, codigo FROM geo.manzana_vigente WHERE ST_Contains(geom, ${pt}) ORDER BY id LIMIT 1`,
      [lon, lat],
    ),
  ]);
  let uv: FilaUv | null = uvs.rows[0] ?? null;
  const enLimite = uvs.rows.length > 1;
  let asignadoPorProximidad = false;
  let distanciaM: number | null = null;

  // 3) hueco: UV más cercana dentro de la tolerancia (geography → metros, sin PROJ)
  if (!uv) {
    // Dos condiciones para lo mismo, a propósito. El índice GIST está sobre `geom` (geometry,
    // 4326): en cuanto se escribe `geom::geography` el planificador ya no puede usarlo y recorre
    // la capa entera. Medido con EXPLAIN ANALYZE sobre las 576 unidades vecinales reales:
    // 38,9 ms de barrido secuencial contra 0,2 ms de los otros PIP de esta misma función.
    //
    // Así que primero se filtra en grados con `ST_DWithin(geom, punto, …)`, que sí entra por el
    // índice, y después se comprueba la distancia exacta en metros sobre las pocas que quedan.
    // El prefiltro tiene que ser un SUPERCONJUNTO: un grado de longitud mide
    // `111320·cos(lat)` metros, así que dividir por 55 000 en vez de por 111 320 da margen de
    // sobra hasta los 60° de latitud (Santa Cruz está a 17,8° S).
    const cerca = await pool.query<FilaUv>(
      `SELECT id, codigo, nombre, distrito_id, version_capa, ST_Distance(geom::geography, ${pt}::geography) AS distancia_m
       FROM geo.unidad_vecinal_vigente
       WHERE ST_DWithin(geom, ${pt}, $3 / 55000.0)
         AND ST_DWithin(geom::geography, ${pt}::geography, $3)
       ORDER BY distancia_m ASC, id ASC LIMIT 1`,
      [lon, lat, CONFIG_DOMINIO.TOLERANCIA_HUECO_M],
    );
    if (cerca.rows[0]) {
      uv = cerca.rows[0];
      asignadoPorProximidad = true;
      distanciaM = Math.round(Number(uv.distancia_m) * 10) / 10;
    }
  }

  // Distrito: el del PIP se cruza con el que declara la UV; manda el de la UV (§7.4 regla 1).
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

  // 4) fuera de cobertura: sin UV (ni contenida ni a la tolerancia)
  const dentro = uv !== null;
  return {
    dentro_cobertura: dentro,
    // Se devuelve el distrito aunque el punto quede fuera de cobertura: ayuda a explicar
    // en la UI si el punto cayó en el municipio pero sin UV asignable.
    distrito,
    unidad_vecinal: uv ? { id: uv.id, codigo: uv.codigo, nombre: uv.nombre } : null,
    manzana: mz.rows[0] ?? null,
    version_capa: uv?.version_capa ?? null,
    en_limite: enLimite,
    asignado_por_proximidad: asignadoPorProximidad,
    distancia_m: distanciaM,
    distrito_discrepante: distritoDiscrepante,
  };
}
