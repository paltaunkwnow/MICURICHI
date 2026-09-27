/**
 * Caché de capas vigentes: GeoJSON web (para render) + índice geojson-vt (teselas al vuelo).
 * Prefiere data/processed/<version>/<capa>/<capa>.web.geojson generado por el ETL; si no existe,
 * simplifica en PostGIS con ST_SimplifyPreserveTopology.
 *
 * Cada capa en memoria lleva su huella (contrato 0.12.0): los primeros 16 hex del SHA-256 del
 * GeoJSON que se sirve, del que salen también las teselas. Va en la URL que da CapaInfo.url, así
 * que esa URL se puede cachear un año: si el contenido cambia, cambia la URL.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapaInfo, HuellaCapa, TipoCapa } from 'contracts';
import { rutaCapaConHuella, rutaTeselasConHuella, TIPOS_CAPA } from 'contracts';
import type { FeatureCollection } from 'geojson';
import geojsonvt, { type Indice } from 'geojson-vt';
import type pg from 'pg';
import { fromGeojsonVt } from 'vt-pbf';
import type { ConfigGeo } from './config.js';
import type { MetricasGeo } from './observabilidad.js';

/** Versión vigente de una capa y cuándo se cargó: el ETL puede recargar la misma versión. */
interface CapaVigente {
  version: string;
  cargadoEn: string;
}

export interface CapaEnCache {
  version: string;
  /** Versión y carga de las que salió: si el ETL recarga la misma versión, cambia y se reconstruye. */
  clave: string;
  huella: HuellaCapa;
  geojson: FeatureCollection;
  texto: string;
  bytes: number;
  indice: Indice;
  bbox: [number, number, number, number] | null;
}

export class CacheCapas {
  private cache = new Map<TipoCapa, CapaEnCache>();
  private vigentes: { valor: Record<TipoCapa, CapaVigente | null>; en: number } | null = null;
  /**
   * Cargas en vuelo, por capa y con la clave que están cargando. Sin esto, N peticiones
   * simultáneas de una capa fría lanzan N cargas completas a la vez (la de manzanas son ~27 MB de
   * GeoJSON más su índice de teselas): memoria multiplicada por N y N consultas pesadas a PostGIS
   * para el mismo resultado.
   */
  private cargando = new Map<TipoCapa, { clave: string; promesa: Promise<CapaEnCache> }>();

  constructor(
    private pool: pg.Pool,
    private cfg: ConfigGeo,
    private metricas?: MetricasGeo,
  ) {
    // Bytes retenidos por el GeoJSON en texto de cada capa. No es el consumo total del proceso
    // (el índice de teselas de geojson-vt pesa aparte y no se puede medir sin recorrerlo), pero
    // es la parte que crece con el tamaño de las capas y la que conviene vigilar.
    this.metricas?.medidor('curichi_geo_cache_capas_bytes', () => {
      let total = 0;
      for (const c of this.cache.values()) total += c.bytes;
      return total;
    });
    this.metricas?.medidor('curichi_geo_cache_capas_cargadas', () => this.cache.size);
  }

  async versionesVigentes(): Promise<Record<TipoCapa, string | null>> {
    const vigentes = await this.vigentesConCarga();
    return Object.fromEntries(TIPOS_CAPA.map((c) => [c, vigentes[c]?.version ?? null])) as Record<
      TipoCapa,
      string | null
    >;
  }

  /**
   * Versión vigente y `cargado_en` de cada capa. El ETL recarga una versión ya cargada con
   * `cargado_en = now()`: sin mirarlo, la caché seguía sirviendo la geometría anterior con la
   * misma versión. Se consulta como mucho cada 10 s.
   */
  private async vigentesConCarga(): Promise<Record<TipoCapa, CapaVigente | null>> {
    if (this.vigentes && Date.now() - this.vigentes.en < 10_000) return this.vigentes.valor;
    // En texto y no como Date: el Date de JavaScript pierde los microsegundos.
    const r = await this.pool.query<{ capa: TipoCapa; version: string; cargado_en: string }>(
      'SELECT capa, version, cargado_en::text AS cargado_en FROM geo.capa_version WHERE vigente',
    );
    const valor = Object.fromEntries(TIPOS_CAPA.map((c) => [c, null])) as Record<
      TipoCapa,
      CapaVigente | null
    >;
    for (const f of r.rows) valor[f.capa] = { version: f.version, cargadoEn: f.cargado_en };
    this.vigentes = { valor, en: Date.now() };
    return valor;
  }

  invalidar() {
    this.vigentes = null;
    this.cache.clear();
    this.cargando.clear();
  }

  async obtener(capa: TipoCapa): Promise<CapaEnCache | null> {
    const vigente = (await this.vigentesConCarga())[capa];
    if (!vigente) return null;
    const clave = `${vigente.version}|${vigente.cargadoEn}`;
    const c = this.cache.get(capa);
    if (c && c.clave === clave) {
      this.metricas?.contar('curichi_geo_cache_aciertos_total', { cache: 'capas' });
      return c;
    }
    // Un fallo aquí no es "una consulta más": obliga a releer la capa entera y a reconstruir su
    // índice de teselas. Si este contador no es prácticamente plano, algo está invalidando de más.
    this.metricas?.contar('curichi_geo_cache_fallos_total', { cache: 'capas' });
    const enVuelo = this.cargando.get(capa);
    if (enVuelo && enVuelo.clave === clave) {
      this.metricas?.contar('curichi_geo_cache_en_vuelo_total', { cache: 'capas' });
      return enVuelo.promesa;
    }
    const promesa: Promise<CapaEnCache> = this.construir(capa, vigente.version, clave).finally(
      () => {
        // Solo si sigue siendo la carga en curso: una recarga más nueva pudo reemplazarla.
        if (this.cargando.get(capa)?.promesa === promesa) this.cargando.delete(capa);
      },
    );
    this.cargando.set(capa, { clave, promesa });
    return promesa;
  }

  private async construir(capa: TipoCapa, version: string, clave: string): Promise<CapaEnCache> {
    const inicio = process.hrtime.bigint();
    const geojson = await this.cargar(capa, version);
    const texto = JSON.stringify(geojson);
    const indice = geojsonvt(geojson, {
      maxZoom: 16,
      indexMaxZoom: 10,
      indexMaxPoints: 100_000,
      tolerance: 3,
      extent: 4096,
      buffer: 64,
      promoteId: 'id',
    });
    const bbox = calcularBbox(geojson);
    const nuevo: CapaEnCache = {
      version,
      clave,
      huella: createHash('sha256').update(texto).digest('hex').slice(0, 16),
      geojson,
      texto,
      bytes: Buffer.byteLength(texto),
      indice,
      bbox,
    };
    // Una carga vieja que termina tarde no pisa a una más nueva ni revive lo invalidado.
    if (this.cargando.get(capa)?.clave === clave) this.cache.set(capa, nuevo);
    this.metricas?.observar(
      'curichi_geo_cache_construccion_segundos',
      { capa },
      Number(process.hrtime.bigint() - inicio) / 1e9,
    );
    return nuevo;
  }

  private async cargar(capa: TipoCapa, version: string): Promise<FeatureCollection> {
    const archivo = this.cfg.dirProcessed
      ? join(this.cfg.dirProcessed, version, capa, `${capa}.web.geojson`)
      : '';
    if (archivo && existsSync(archivo))
      return JSON.parse(readFileSync(archivo, 'utf8')) as FeatureCollection;
    const columnas =
      capa === 'distrito_municipal'
        ? ''
        : capa === 'unidad_vecinal'
          ? ', distrito_id'
          : ', distrito_id, unidad_vecinal_id';
    const r = await this.pool.query<{
      id: string;
      codigo: string;
      nombre: string;
      geom: string;
      distrito_id?: string;
      unidad_vecinal_id?: string;
    }>(
      `SELECT id, codigo, nombre${columnas}, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, $2), 6) AS geom
       FROM geo.${capa} WHERE version_capa = $1 ORDER BY id`,
      [version, this.cfg.toleranciaSimplificacion],
    );
    return {
      type: 'FeatureCollection',
      features: r.rows.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: JSON.parse(f.geom),
        properties: {
          id: f.id,
          codigo: f.codigo,
          nombre: f.nombre,
          tipo: capa,
          version_capa: version,
          distrito_id: f.distrito_id ?? null,
          unidad_vecinal_id: f.unidad_vecinal_id ?? null,
        },
      })),
    };
  }

  async info(): Promise<CapaInfo[]> {
    const salida: CapaInfo[] = [];
    for (const capa of TIPOS_CAPA) {
      const c = await this.obtener(capa);
      if (!c) continue;
      const teselas = c.bytes > this.cfg.umbralTeselasBytes;
      salida.push({
        capa,
        version: c.version,
        n_features: c.geojson.features.length,
        bytes_web: c.bytes,
        modo: teselas ? 'teselas' : 'geojson',
        url: teselas ? rutaTeselasConHuella(capa, c.huella) : rutaCapaConHuella(capa, c.huella),
        bbox: c.bbox,
      });
    }
    return salida;
  }

  tesela(c: CapaEnCache, capa: TipoCapa, z: number, x: number, y: number): Uint8Array | null {
    const t = c.indice.getTile(z, x, y);
    if (!t?.features.length) return null;
    return fromGeojsonVt({ [capa]: t }, { version: 2 });
  }
}

function calcularBbox(fc: FeatureCollection): [number, number, number, number] | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const rec = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x! < minX) minX = x!;
      if (x! > maxX) maxX = x!;
      if (y! < minY) minY = y!;
      if (y! > maxY) maxY = y!;
    } else for (const s of c) rec(s);
  };
  for (const f of fc.features)
    if (f.geometry) rec((f.geometry as { coordinates?: unknown }).coordinates);
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}
