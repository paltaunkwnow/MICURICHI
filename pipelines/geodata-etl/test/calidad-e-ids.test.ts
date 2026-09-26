/**
 * Reporte de calidad e ids de salida sobre shapefiles sintéticos escritos al vuelo (EPSG:32720).
 * Todo se escribe en carpetas temporales: nunca en data/.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Config, ConfigSchema } from '../src/config.js';
import { geojsonAShapefile } from '../src/mapshaper.js';
import type { Hallazgo } from '../src/pasos/calidad.js';
import { normalizar, type OpcionesNormalizacion } from '../src/pasos/normalizar.js';
import { procesarVersion, type ResultadoCapa } from '../src/pipeline.js';

const poly = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
  type: 'Polygon',
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

const feature = (properties: Record<string, unknown>, geometry: Polygon): Feature => ({
  type: 'Feature',
  properties,
  geometry,
});

describe('reporte de calidad de una capa con claves repetidas', () => {
  let dir: string;
  let salida: string;
  const mensajes: string[] = [];
  let resultado: ResultadoCapa[];

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'curichi-calidad-'));
    salida = mkdtempSync(join(tmpdir(), 'curichi-calidad-salida-'));
    // Como la entrega real: la UV trae código (UV), respaldo (OBJECTID) y distrito (DM), y la
    // combinación se repite (OBJECTID = 0 en miles de manzanas reales).
    const distritos: FeatureCollection = {
      type: 'FeatureCollection',
      features: [feature({ DIS: 'D1' }, poly(-63.2, -17.8, -63.17, -17.78))],
    };
    const uvs: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        // A y A se solapan ~10 m: dispara la reparación, y su clave (A|0|D1) está repetida
        feature({ UV: 'A', OBJECTID: 0, DM: 'D1' }, poly(-63.2, -17.8, -63.1899, -17.79)),
        feature({ UV: 'A', OBJECTID: 0, DM: 'D1' }, poly(-63.19, -17.8, -63.18, -17.79)),
        // B y su copia exacta: la segunda es un duplicado que se excluye, la primera se queda
        feature({ UV: 'B', OBJECTID: 5, DM: 'D1' }, poly(-63.2, -17.79, -63.19, -17.78)),
        feature({ UV: 'B', OBJECTID: 5, DM: 'D1' }, poly(-63.2, -17.79, -63.19, -17.78)),
        // sin código: se identifica por el respaldo
        feature({ UV: '', OBJECTID: 9, DM: 'D1' }, poly(-63.1901, -17.79, -63.18, -17.78)),
      ],
    };
    for (const [nombre, fc] of [
      ['DM_T', distritos],
      ['UV_T', uvs],
    ] as const) {
      const archivos = await geojsonAShapefile(fc, nombre, 'EPSG:32720');
      for (const [archivo, contenido] of Object.entries(archivos))
        writeFileSync(join(dir, archivo), contenido);
    }
    const cfg: Config = ConfigSchema.parse({
      versiones: [
        {
          version: 'CALIDAD',
          carpeta: dir,
          fuente: 'sintético (test)',
          capas: {
            distrito_municipal: {
              archivo: 'DM_T.shp',
              campos: { codigo: 'DIS', plantilla_nombre: 'Distrito {codigo}' },
            },
            unidad_vecinal: {
              archivo: 'UV_T.shp',
              campos: {
                codigo: 'UV',
                distrito: 'DM',
                respaldo: 'OBJECTID',
                plantilla_nombre: 'Unidad Vecinal {codigo}',
              },
            },
          },
        },
      ],
      simplificacion: { distrito_municipal: 3, unidad_vecinal: 3, manzana: 2 },
      umbral_teselas_bytes: 5_000_000,
      tolerancia_cambio_area: 0.05,
    });
    resultado = await procesarVersion(cfg, cfg.versiones[0]!, {
      forzar: true,
      log: (m) => mensajes.push(m),
      dirSalida: salida,
    });
  }, 60_000);

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(salida, { recursive: true, force: true });
  });

  const archivo = (capa: string, nombre: string) =>
    readFileSync(join(salida, capa, nombre), 'utf8');
  const reporte = (capa: string) =>
    JSON.parse(archivo(capa, 'reporte_calidad.json')) as {
      hallazgos: Hallazgo[];
      avisos: string[];
    };

  it('avisa en consola y destacado en el reporte cuando el control por feature queda inactivo', () => {
    const avisoConsola = mensajes.find((m) => /AVISO/.test(m) && /unidad_vecinal/.test(m));
    expect(avisoConsola).toMatch(/tolerancia_cambio_area_feature/);

    const md = archivo('unidad_vecinal', 'reporte_calidad.md');
    const aviso = md.indexOf('**AVISO');
    expect(aviso).toBeGreaterThan(-1);
    // destacado: antes de la inspección, no enterrado en «Proceso»
    expect(aviso).toBeLessThan(md.indexOf('## Inspección'));
    expect(reporte('unidad_vecinal').avisos).toHaveLength(1);

    // la capa de distritos tiene claves únicas: sin aviso
    expect(archivo('distrito_municipal', 'reporte_calidad.md')).not.toMatch(/AVISO/);
    expect(reporte('distrito_municipal').avisos).toEqual([]);
    expect(resultado.find((r) => r.capa === 'unidad_vecinal')?.avisos).toHaveLength(1);
  });

  it('identifica cada hallazgo por el código configurado o su respaldo, no por la posición', () => {
    const { hallazgos } = reporte('unidad_vecinal');
    const previos = hallazgos.filter((h) => h.tipo === 'solape' || h.tipo === 'duplicada');
    expect(previos.length).toBeGreaterThan(0);
    const ids = new Set(previos.flatMap((h) => h.ids));
    expect([...ids].sort()).toEqual(['unidad_vecinal:9', 'unidad_vecinal:A', 'unidad_vecinal:B']);
  });

  it('con códigos repetidos excluye solo la copia duplicada, no todas las que comparten código', () => {
    const uv = resultado.find((r) => r.capa === 'unidad_vecinal');
    expect(uv?.n_entrada).toBe(5);
    expect(uv?.n_salida).toBe(4);
  });
});

describe('ids estables', () => {
  const opciones: OpcionesNormalizacion = {
    capa: 'manzana',
    version: 'V',
    fuente: 'sintético (test)',
    fecha_vigencia: null,
    campoCodigo: 'COD',
    campoNombre: null,
    campoRespaldo: 'OBJECTID',
  };
  const cuadro = (x: number) => poly(x, 0, x + 0.001, 0.001);
  const entrada: Feature[] = [
    feature({ COD: '12', OBJECTID: 1 }, cuadro(0)),
    feature({ COD: '12', OBJECTID: 2 }, cuadro(0.01)),
    feature({ COD: '12', OBJECTID: 3 }, cuadro(0.02)),
    feature({ COD: '12-2', OBJECTID: 4 }, cuadro(0.03)), // un código real con forma de sufijo
    feature({ COD: '7', OBJECTID: 5 }, cuadro(0.04)),
    feature({ COD: '', OBJECTID: null }, cuadro(0.05)), // sin código ni respaldo
    feature({ COD: '', OBJECTID: null }, cuadro(0.06)),
  ];
  const idsPorGeometria = (features: Feature[]) =>
    new Map(
      normalizar({ type: 'FeatureCollection', features }, opciones).features.map((f) => [
        JSON.stringify(f.geometry),
        f.properties?.id as string,
      ]),
    );

  it('la misma entrada en otro orden produce exactamente los mismos ids', () => {
    const original = idsPorGeometria(entrada);
    for (const orden of [
      [6, 5, 4, 3, 2, 1, 0],
      [3, 0, 6, 2, 5, 1, 4],
      [1, 2, 0, 4, 6, 3, 5],
    ])
      expect(idsPorGeometria(orden.map((i) => entrada[i]!))).toEqual(original);
  });

  it('los ids no chocan entre sí ni con un código real que ya tenga forma de sufijo', () => {
    const ids = [...idsPorGeometria(entrada).values()];
    expect(new Set(ids).size).toBe(entrada.length);
    expect(ids).toContain('manzana:12');
    expect(ids).toContain('manzana:7');
    // el 12-2 del municipio conserva su código; los repetidos de 12 no lo pisan
    expect(idsPorGeometria(entrada).get(JSON.stringify(cuadro(0.03)))).toBe('manzana:12-2');
  });
});
