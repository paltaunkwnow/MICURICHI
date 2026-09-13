/**
 * Descubrimiento e inspección de shapefiles: conjunto completo (.shp .shx .dbf .prj .cpg),
 * CRS declarado en el .prj (sin adivinar), autodetección de capa por nombre.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { TipoCapa } from 'contracts';

export interface ConjuntoShapefile {
  nombre: string; // sin extensión
  shp: string;
  shx: string | null;
  dbf: string | null;
  prj: string | null;
  cpg: string | null;
  bytes: number;
}

export function listarShapefiles(carpeta: string): ConjuntoShapefile[] {
  if (!existsSync(carpeta)) return [];
  const archivos = readdirSync(carpeta);
  const porNombre = new Map<string, Record<string, string>>();
  for (const a of archivos) {
    const ext = extname(a).toLowerCase();
    if (!['.shp', '.shx', '.dbf', '.prj', '.cpg'].includes(ext)) continue;
    const base = a.slice(0, -ext.length);
    const m = porNombre.get(base) ?? {};
    m[ext.slice(1)] = join(carpeta, a);
    porNombre.set(base, m);
  }
  return [...porNombre.entries()]
    .filter(([, m]) => m.shp)
    .map(([nombre, m]) => ({
      nombre,
      shp: m.shp!,
      shx: m.shx ?? null,
      dbf: m.dbf ?? null,
      prj: m.prj ?? null,
      cpg: m.cpg ?? null,
      bytes: statSync(m.shp!).size + (m.dbf ? statSync(m.dbf).size : 0),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const PATRONES: Record<TipoCapa, RegExp[]> = {
  distrito_municipal: [/(^|[_\-\s])dm([_\-\s.]|$)/i, /distrito/i],
  unidad_vecinal: [/(^|[_\-\s])uv([_\-\s.]|$)/i, /vecinal/i],
  manzana: [/(^|[_\-\s])mz([_\-\s.]|$)/i, /manzan/i],
};

export function detectarCapa(nombreArchivo: string): TipoCapa | null {
  const n = basename(nombreArchivo);
  for (const [capa, res] of Object.entries(PATRONES) as [TipoCapa, RegExp[]][]) {
    if (res.some((re) => re.test(n))) return capa;
  }
  return null;
}

/** Tabla mínima WKT → EPSG para mostrar un código conocido. Si no coincide, se informa el nombre del .prj sin adivinar. */
const CONOCIDOS: Array<{ re: RegExp; epsg: string }> = [
  // acepta el estilo OGC ("WGS 84 / UTM zone 20S") y el estilo ESRI ("WGS_1984_UTM_Zone_20S")
  { re: /WGS[_ ]?(19)?84.*UTM.*zone[_ ]?20\s?S/i, epsg: 'EPSG:32720' },
  { re: /WGS[_ ]?(19)?84.*UTM.*zone[_ ]?21\s?S/i, epsg: 'EPSG:32721' },
  { re: /PSAD[_ ]?56.*UTM.*zone[_ ]?20\s?S/i, epsg: 'EPSG:24880' },
  { re: /^GEOGCS\["GCS_WGS_1984"|^GEOGCS\["WGS 84"/i, epsg: 'EPSG:4326' },
];

export interface CrsDeclarado {
  wkt: string | null;
  nombre: string | null;
  epsg_probable: string | null;
}

export function leerCrs(prj: string | null): CrsDeclarado {
  if (!prj || !existsSync(prj)) return { wkt: null, nombre: null, epsg_probable: null };
  const wkt = readFileSync(prj, 'utf8').trim();
  const nombre = wkt.match(/^[A-Z]+\["([^"]+)"/)?.[1] ?? null;
  const epsg =
    CONOCIDOS.find((c) => c.re.test(wkt) || (nombre ? c.re.test(nombre) : false))?.epsg ?? null;
  return { wkt, nombre, epsg_probable: epsg };
}

export function leerEncoding(cpg: string | null): string | null {
  if (!cpg || !existsSync(cpg)) return null;
  return readFileSync(cpg, 'utf8').trim() || null;
}
