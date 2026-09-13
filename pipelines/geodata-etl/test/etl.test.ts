import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Config, ConfigSchema, type VersionConfig } from '../src/config.js';
import { geojsonAShapefile } from '../src/mapshaper.js';
import { detectarHuecos, detectarSolapes, validarGeometrias } from '../src/pasos/calidad.js';
import { autodetectarCampo, snakeCase } from '../src/pasos/normalizar.js';
import { ErrorEtl, inspeccionar, procesarVersion, resolverCapas } from '../src/pipeline.js';
import { detectarCapa, leerCrs, listarShapefiles } from '../src/shapefile.js';

const poly = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
});

let dir: string;
let cfg: Config;
let version: VersionConfig;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'curichi-etl-'));
  // Distrito D1 con dos UV (A, B) que se SOLAPAN 10 m y dejan un HUECO al este; escritas en UTM 20S con .prj
  const distritos = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { COD_DM: 'D1', NOM_DM: 'Distrito Prueba' },
        geometry: poly(-63.2, -17.8, -63.17, -17.78),
      },
    ],
  };
  const uvs = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { COD_UV: 'A', NOM_UV: 'UV A', COD_DM: 'D1' },
        geometry: poly(-63.2, -17.8, -63.1899, -17.78),
      },
      {
        type: 'Feature' as const,
        properties: { COD_UV: 'B', NOM_UV: 'UV B', COD_DM: 'D1' },
        geometry: poly(-63.19, -17.8, -63.18, -17.78),
      },
    ],
  };
  for (const [nombre, fc] of [
    ['DM_PRUEBA', distritos],
    ['UV_PRUEBA', uvs],
  ] as const) {
    const salida = await geojsonAShapefile(fc, nombre, 'EPSG:32720');
    for (const [archivo, contenido] of Object.entries(salida))
      writeFileSync(join(dir, archivo), contenido);
  }
  cfg = ConfigSchema.parse({
    versiones: [
      {
        version: 'PRUEBA',
        carpeta: dir,
        fuente: 'test',
        capas: {
          distrito_municipal: { archivo: null, campos: {} },
          unidad_vecinal: { archivo: null, campos: {} },
        },
      },
    ],
    simplificacion: { distrito_municipal: 3, unidad_vecinal: 3, manzana: 2 },
    umbral_teselas_bytes: 5_000_000,
    tolerancia_cambio_area: 0.05,
  });
  version = cfg.versiones[0]!;
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('descubrimiento e inspección', () => {
  it('lista el conjunto completo y detecta la capa por nombre', () => {
    const c = listarShapefiles(dir);
    expect(c.map((x) => x.nombre)).toEqual(['DM_PRUEBA', 'UV_PRUEBA']);
    expect(c.every((x) => x.prj && x.dbf && x.shx)).toBe(true);
    expect(detectarCapa('DM_PRUEBA')).toBe('distrito_municipal');
    expect(detectarCapa('UV_PRUEBA')).toBe('unidad_vecinal');
    expect(detectarCapa('MZ_2025')).toBe('manzana');
    expect(detectarCapa('otra_cosa')).toBeNull();
  });
  it('lee el CRS del .prj sin adivinar y reproyecta a WGS84', async () => {
    const [dm] = resolverCapas(version);
    const crs = leerCrs(dm!.conjunto.prj);
    expect(crs.wkt).toContain('UTM');
    const i = await inspeccionar(version, dm!);
    expect(i.n_features).toBe(1);
    expect(i.bbox_4326?.[0]).toBeCloseTo(-63.2, 3);
    expect(i.campos_sugeridos.codigo).toBe('COD_DM');
    expect(i.campos_sugeridos.nombre).toBe('NOM_DM');
  });
  it('se detiene si falta el .prj y no hay crs_origen', async () => {
    const sinPrj = mkdtempSync(join(tmpdir(), 'curichi-sinprj-'));
    for (const ext of ['shp', 'shx', 'dbf'])
      writeFileSync(join(sinPrj, `UV_X.${ext}`), readFileSync(join(dir, `UV_PRUEBA.${ext}`)));
    const v: VersionConfig = {
      ...version,
      version: 'SINPRJ',
      carpeta: sinPrj,
      capas: {
        distrito_municipal: {
          archivo: 'UV_X.shp',
          campos: {
            codigo: null,
            nombre: null,
            distrito: null,
            unidad_vecinal: null,
            respaldo: null,
            plantilla_nombre: null,
          },
        },
        unidad_vecinal: {
          archivo: 'UV_X.shp',
          campos: {
            codigo: null,
            nombre: null,
            distrito: null,
            unidad_vecinal: null,
            respaldo: null,
            plantilla_nombre: null,
          },
        },
      },
    };
    await expect(procesarVersion(cfg, v, { log: () => {} })).rejects.toThrow(ErrorEtl);
    rmSync(sinPrj, { recursive: true, force: true });
  });
});

describe('calidad', () => {
  it('detecta solapes y huecos', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, id: 'a', properties: {}, geometry: poly(0, 0, 0.001, 0.001) },
        {
          type: 'Feature' as const,
          id: 'b',
          properties: {},
          geometry: poly(0.0009, 0, 0.002, 0.001),
        },
      ],
    };
    const s = detectarSolapes(fc);
    expect(s).toHaveLength(1);
    expect(s[0]?.area_m2).toBeGreaterThan(100);
    const padre = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, id: 'P', properties: {}, geometry: poly(0, 0, 0.003, 0.001) },
      ],
    };
    const hijos = {
      type: 'FeatureCollection' as const,
      features: fc.features.map((f) => ({ ...f, properties: { distrito_id: 'P' } })),
    };
    const h = detectarHuecos(padre, hijos, 'distrito_id');
    expect(h).toHaveLength(1);
    expect(h[0]?.area_m2).toBeGreaterThan(1000);
  });
  it('detecta geometrías inválidas y duplicadas', () => {
    const pajarita = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [0, 0],
          [0.001, 0.001],
          [0.001, 0],
          [0, 0.001],
          [0, 0],
        ],
      ],
    };
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, id: 'x', properties: {}, geometry: pajarita },
        { type: 'Feature' as const, id: 'y', properties: {}, geometry: poly(0, 0, 0.001, 0.001) },
        { type: 'Feature' as const, id: 'z', properties: {}, geometry: poly(0, 0, 0.001, 0.001) },
      ],
    };
    const h = validarGeometrias(fc);
    expect(h.map((x) => x.tipo)).toEqual(['invalida', 'duplicada']);
  });
  it('normaliza nombres de campo y autodetecta roles', () => {
    expect(snakeCase('Nombre UV Ñandú')).toBe('nombre_uv_nandu');
    expect(
      autodetectarCampo(['OBJECTID', 'COD_UV', 'NOM_UV', 'COD_DIST'], 'codigo', 'unidad_vecinal'),
    ).toBe('COD_UV');
    expect(
      autodetectarCampo(['OBJECTID', 'COD_UV', 'NOM_UV', 'COD_DIST'], 'distrito', 'unidad_vecinal'),
    ).toBe('COD_DIST');
  });
});

describe('pipeline completo sobre shapefiles de prueba', () => {
  it('reproyecta, repara el solape (reportado), normaliza, simplifica y escribe salidas', async () => {
    const r = await procesarVersion(cfg, version, { forzar: true, log: () => {} });
    expect(r.map((x) => x.capa)).toEqual(['distrito_municipal', 'unidad_vecinal']);
    const uv = r[1]!;
    expect(uv.n_salida).toBe(2);
    expect(uv.reparada).toBe(true);
    const full = JSON.parse(
      readFileSync(join(uv.salida_dir, 'unidad_vecinal.full.geojson'), 'utf8'),
    );
    expect(full.features[0].properties.id).toBe('unidad_vecinal:A');
    expect(full.features[0].properties.distrito_id).toBe('distrito_municipal:D1');
    expect(full.features[0].properties.tipo).toBe('unidad_vecinal');
    const reporte = JSON.parse(readFileSync(join(uv.salida_dir, 'reporte_calidad.json'), 'utf8'));
    expect(reporte.resumen.solape).toBeGreaterThanOrEqual(1);
    expect(reporte.resumen.hueco).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(uv.salida_dir, 'reporte_calidad.md'), 'utf8')).toContain(
      'Reporte de calidad',
    );
    const meta = JSON.parse(readFileSync(join(uv.salida_dir, 'metadata.json'), 'utf8'));
    expect(meta.crs_salida).toBe('EPSG:4326');
    expect(meta.crs_origen).toBe('EPSG:32720');
  }, 60_000);
});
