/** Envoltorio fino sobre la API de mapshaper (applyCommands en memoria). */
import { readFileSync } from 'node:fs';
import type { FeatureCollection } from 'geojson';
import mapshaper from 'mapshaper';
import type { ConjuntoShapefile } from './shapefile.js';

type Entradas = Record<string, Buffer | string>;

function entradasDe(c: ConjuntoShapefile): Entradas {
  const e: Entradas = { [`${c.nombre}.shp`]: readFileSync(c.shp) };
  if (c.shx) e[`${c.nombre}.shx`] = readFileSync(c.shx);
  if (c.dbf) e[`${c.nombre}.dbf`] = readFileSync(c.dbf);
  if (c.prj) e[`${c.nombre}.prj`] = readFileSync(c.prj, 'utf8');
  if (c.cpg) e[`${c.nombre}.cpg`] = readFileSync(c.cpg, 'utf8');
  return e;
}

export async function correr(
  comandos: string,
  entradas: Entradas,
): Promise<Record<string, Buffer | string>> {
  // biome-ignore lint/suspicious/noExplicitAny: mapshaper no publica tipos
  const salida = await (mapshaper as any).applyCommands(comandos, entradas);
  return salida as Record<string, Buffer | string>;
}

function aGeoJson(salida: Record<string, Buffer | string>, nombre: string): FeatureCollection {
  const v = salida[nombre];
  if (!v)
    throw new Error(`mapshaper no produjo ${nombre}. Salidas: ${Object.keys(salida).join(', ')}`);
  const texto = typeof v === 'string' ? v : v.toString('utf8');
  const g = JSON.parse(texto) as FeatureCollection | { type: string };
  if (g.type === 'FeatureCollection') return g as FeatureCollection;
  // mapshaper puede devolver GeometryCollection si no hay atributos
  return { type: 'FeatureCollection', features: [] };
}

/** Lee un shapefile y lo devuelve reproyectado a WGS84 como GeoJSON (precisión completa). */
export async function shapefileAWgs84(
  c: ConjuntoShapefile,
  opciones: { crsOrigen?: string | null; encoding?: string | null },
): Promise<FeatureCollection> {
  const enc = opciones.encoding ? ` encoding=${opciones.encoding}` : '';
  const from = opciones.crsOrigen ? ` from=${opciones.crsOrigen}` : '';
  const cmd = `-i ${c.nombre}.shp${enc} -proj wgs84${from} -o salida.json format=geojson precision=0.0000001 rfc7946`;
  const salida = await correr(cmd, entradasDe(c));
  return aGeoJson(salida, 'salida.json');
}

/** Repara topología con -clean (elimina solapes y micro-huecos entre polígonos vecinos, corrige errores de geometría). */
export async function limpiar(fc: FeatureCollection): Promise<FeatureCollection> {
  const salida = await correr(
    '-i entrada.json -clean -o salida.json format=geojson precision=0.0000001',
    { 'entrada.json': JSON.stringify(fc) },
  );
  return aGeoJson(salida, 'salida.json');
}

/** Simplifica preservando bordes compartidos (Visvalingam, intervalo en metros) y evitando que desaparezcan polígonos pequeños. */
export async function simplificar(
  fc: FeatureCollection,
  intervaloM: number,
): Promise<FeatureCollection> {
  const salida = await correr(
    `-i entrada.json -simplify visvalingam interval=${intervaloM} keep-shapes -clean -o salida.json format=geojson precision=0.000001`,
    { 'entrada.json': JSON.stringify(fc) },
  );
  return aGeoJson(salida, 'salida.json');
}

/** Escribe un shapefile (conjunto completo) a partir de GeoJSON WGS84, opcionalmente proyectado (p. ej. EPSG:32720). */
export async function geojsonAShapefile(
  fc: FeatureCollection,
  nombre: string,
  crsDestino?: string,
): Promise<Record<string, Buffer | string>> {
  const proj = crsDestino ? ` -proj ${crsDestino}` : '';
  return correr(`-i entrada.json${proj} -o ${nombre}.shp format=shapefile encoding=utf8`, {
    'entrada.json': JSON.stringify(fc),
  });
}
