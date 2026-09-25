/**
 * Caché de capas vigentes: GeoJSON web (para render) + índice geojson-vt (teselas al vuelo).
 * Prefiere data/processed/<version>/<capa>/<capa>.web.geojson generado por el ETL; si no existe,
 * simplifica en PostGIS con ST_SimplifyPreserveTopology.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CapaInfo, TipoCapa } from 'contracts';
import { TIPOS_CAPA } from 'contracts';
import type { FeatureCollection } from 'geojson';
import geojsonvt, { type Indice } from 'geojson-vt';
import type pg from 'pg';
import { fromGeojsonVt } from 'vt-pbf';
import type { ConfigGeo } from './config.js';
import type { MetricasGeo } from './observabilidad.js';

interface CapaEnCache {
  version: string;
  geojson: FeatureCollection;
  texto: string;
  bytes: number;
  indice: Indice;
  bbox: [number, number, number, number] | null;
}

export class CacheCapas {
  private cache = new Map<TipoCapa, CapaEnCache>();
  private vigentes: { valor: Record<TipoCapa, string | null>; en: number } | null = null;
  /**
   * Cargas en vuelo. Sin esto, N peticiones simultáneas de una capa fría lanzan N cargas
   * completas a la vez (la de manzanas son ~27 MB de GeoJSON más su índice de teselas):
   * memoria multiplicada por N y N consultas pesadas a PostGIS para el mismo resultado.
   */
  private cargando = new Map<TipoCapa, Promise<CapaEnCache>>();

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
    if (this.vigentes && Date.now() - this.vigentes.en < 10_000) return this.vigentes.valor;
    const r = await this.pool.query<{ capa: TipoCapa; version: string }>(
      'SELECT capa, version FROM geo.capa_version WHERE vigente',
    );
    const valor = Object.fromEntries(TIPOS_CAPA.map((c) => [c, null])) as Record<
      TipoCapa,
      string | null
    >;
    for (const f of r.rows) valor[f.capa] = f.version;
    this.vigentes = { valor, en: Date.now() };
    return valor;
  }

  invalidar() {
    this.vigentes = null;
    this.cache.clear();
    this.cargando.clear();
  }

  async obtener(capa: TipoCapa): Promise<CapaEnCache | null> {
    const version = (await this.versionesVigentes())[capa];
    if (!version) return null;
    const c = this.cache.get(capa);
    if (c && c.version === version) {
      this.metricas?.contar('curichi_geo_cache_aciertos_total', { cache: 'capas' });
      return c;
    }
    // Un fallo aquí no es "una consulta más": obliga a releer la capa entera y a reconstruir su
    // índice de teselas. Si este contador no es prácticamente plano, algo está invalidando de más.
    this.metricas?.contar('curichi_geo_cache_fallos_total', { cache: 'capas' });
    const enVuelo = this.cargando.get(capa);
    if (enVuelo) {
      this.metricas?.contar('curichi_geo_cache_en_vuelo_total', { cache: 'capas' });
      return enVuelo;
    }
    const promesa = this.construir(capa, version).finally(() => this.cargando.delete(capa));
    this.cargando.set(capa, promesa);
    return promesa;
  }

  private async construir(capa: TipoCapa, version: string): Promise<CapaEnCache> {
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
    const nuevo = { version, geojson, texto, bytes: Buffer.byteLength(texto), indice, bbox };
    this.cache.set(capa, nuevo);
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
        url: teselas ? `/geo/v1/teselas/${capa}/{z}/{x}/{y}.mvt` : `/geo/v1/capas/${capa}`,
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
