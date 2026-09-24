/**
 * Relleno de `reporte_inundacion.geom_publico` (migración 0005).
 *
 * El punto publicable de un reporte de vivienda lleva un jitter sembrado con `id|JITTER_SAL`, y
 * esa sal es un secreto del servidor que no puede vivir en la base. Por eso la migración deja en
 * NULL justo esas filas y las completa quien tiene la sal: api-core al arrancar, y los seeds
 * después de sembrar.
 *
 * Quedar en NULL es la opción segura, no un bache: las consultas públicas exigen
 * `geom_publico IS NOT NULL`, así que un reporte sin rellenar desaparece del mapa público en vez
 * de aparecer con su coordenada real. Lo que hace esta función es devolverlos al mapa, no
 * protegerlos.
 */
import { CONFIG_DOMINIO, coordenadaPublica, type UbicacionTipo } from 'contracts';
import type { Ejecutor } from './ejecutor.js';

/** Filas por vuelta. Acotado para no cargar la tabla entera en memoria ni hacer un UPDATE enorme. */
const LOTE = 500;

interface Pendiente {
  id: string;
  lon: number;
  lat: number;
  ubicacion_tipo: UbicacionTipo;
}

/**
 * Completa las filas pendientes y devuelve cuántas se actualizaron. 0 es el caso normal a partir
 * del segundo arranque, y cuesta una consulta que el índice parcial `reporte_sin_geom_publico`
 * resuelve sin tocar la tabla.
 */
export async function rellenarGeometriaPublica(
  ex: Ejecutor,
  salJitter: string,
  maxLotes = 10_000,
): Promise<number> {
  let total = 0;
  for (let vuelta = 0; vuelta < maxLotes; vuelta++) {
    const filas = await ex.consultar<Pendiente>(
      `SELECT id::text, ST_X(geom) AS lon, ST_Y(geom) AS lat, ubicacion_tipo::text
         FROM reporte_inundacion WHERE geom_publico IS NULL LIMIT $1`,
      [LOTE],
    );
    if (!filas.length) return total;
    const ids: string[] = [];
    const lons: number[] = [];
    const lats: number[] = [];
    for (const f of filas) {
      const p = coordenadaPublica(
        Number(f.lat),
        Number(f.lon),
        f.id,
        salJitter,
        f.ubicacion_tipo,
        CONFIG_DOMINIO.JITTER_PUBLICO_M,
        CONFIG_DOMINIO.PRECISION_PUBLICA_DECIMALES,
      );
      ids.push(f.id);
      lons.push(p.lon);
      lats.push(p.lat);
    }
    // Un solo UPDATE por lote: con unos miles de reportes, una consulta por fila convierte el
    // arranque en varios minutos de idas y vueltas a la base.
    const actualizadas = await ex.consultar<{ id: string }>(
      `UPDATE reporte_inundacion AS r
          SET geom_publico = ST_SetSRID(ST_MakePoint(v.lon, v.lat), 4326)
         FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::float8[]) AS lon, unnest($3::float8[]) AS lat) AS v
        WHERE r.id = v.id AND r.geom_publico IS NULL
      RETURNING r.id::text`,
      [ids, lons, lats],
    );
    total += actualizadas.length;
    if (filas.length < LOTE) return total;
  }
  return total;
}
