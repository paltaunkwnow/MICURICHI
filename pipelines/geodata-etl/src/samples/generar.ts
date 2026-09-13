/**
 * Genera la ciudad SINTÉTICA de muestra (CLAUDE.md §6.10 regla 4): 3 distritos, 12 UV y 1152 manzanas en
 * una rejilla alrededor de Santa Cruz de la Sierra. Nada aquí es real.
 *   - data/samples/geo/*.geojson           (WGS84, para seeds de packages/db y tests)
 *   - data/samples/shp/DM_UV_MZ_SAMPLE/*   (shapefiles en EPSG:32720 para ejercitar el ETL completo)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { RAIZ_REPO } from '../config.js';
import { geojsonAShapefile } from '../mapshaper.js';

const LON0 = -63.18;
const LAT0 = -17.78;
const KM_LON = 1 / (111.32 * Math.cos((LAT0 * Math.PI) / 180)); // grados por km
const KM_LAT = 1 / 110.574;

function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return {
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
  };
}
const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
function rectR(x0: number, y0: number, x1: number, y1: number): Polygon {
  return rect(r7(x0), r7(y0), r7(x1), r7(y1));
}

export function generarCiudadSintetica() {
  const distritos: Feature[] = [];
  const uvs: Feature[] = [];
  const manzanas: Feature[] = [];
  const nombresD = ['Norte', 'Centro', 'Sur'];
  const anchoD = 2; // km
  const altoD = 3; // km
  // Desplazada medio bloque para que el centro (LON0, LAT0) caiga en el interior de una UV y no en un vértice compartido
  const xIni = LON0 - 1.5 * anchoD * KM_LON + 0.5 * KM_LON;
  const yIni = LAT0 - (altoD / 2) * KM_LAT + 0.75 * KM_LAT;
  let nUv = 100;
  for (let d = 0; d < 3; d++) {
    const codD = `D0${d + 1}`;
    const dx0 = xIni + d * anchoD * KM_LON;
    const dx1 = dx0 + anchoD * KM_LON;
    distritos.push({
      type: 'Feature',
      properties: { COD_DM: codD, NOM_DM: `Distrito ${nombresD[d]} (sintético)` },
      geometry: rectR(dx0, yIni, dx1, yIni + altoD * KM_LAT),
    });
    for (let ux = 0; ux < 2; ux++)
      for (let uy = 0; uy < 2; uy++) {
        nUv++;
        const codUv = `UV-${nUv}`;
        const x0 = dx0 + ux * 1 * KM_LON;
        const y0 = yIni + uy * 1.5 * KM_LAT;
        uvs.push({
          type: 'Feature',
          properties: { COD_UV: codUv, NOM_UV: `Unidad Vecinal ${nUv} (sintética)`, COD_DM: codD },
          geometry: rectR(x0, y0, x0 + 1 * KM_LON, y0 + 1.5 * KM_LAT),
        });
        // manzanas 100 m con calles de 25 m: 8 × 12
        for (let mx = 0; mx < 8; mx++)
          for (let my = 0; my < 12; my++) {
            const bx0 = x0 + (mx * 0.125 + 0.0125) * KM_LON;
            const by0 = y0 + (my * 0.125 + 0.0125) * KM_LAT;
            manzanas.push({
              type: 'Feature',
              properties: {
                COD_MZ: `${codUv}-${String(mx * 12 + my + 1).padStart(3, '0')}`,
                COD_UV: codUv,
                COD_DM: codD,
              },
              geometry: rectR(bx0, by0, bx0 + 0.1 * KM_LON, by0 + 0.1 * KM_LAT),
            });
          }
      }
  }
  return { distritos, uvs, manzanas };
}

/** Versión normalizada (como la deja el ETL) para los seeds. */
function normalizadoParaSeeds(
  fs: Feature[],
  tipo: 'distrito_municipal' | 'unidad_vecinal' | 'manzana',
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fs.map((f) => {
      const p = f.properties as Record<string, string>;
      const codigo =
        tipo === 'distrito_municipal'
          ? p.COD_DM!
          : tipo === 'unidad_vecinal'
            ? p.COD_UV!
            : p.COD_MZ!;
      const props: Record<string, unknown> = {
        id: `${tipo}:${codigo}`,
        codigo,
        nombre:
          tipo === 'distrito_municipal' ? p.NOM_DM : tipo === 'unidad_vecinal' ? p.NOM_UV : '',
        tipo,
        version_capa: 'samples-sinteticas',
        fuente: 'sintético',
      };
      if (tipo !== 'distrito_municipal') props.distrito_id = `distrito_municipal:${p.COD_DM}`;
      if (tipo === 'manzana') props.unidad_vecinal_id = `unidad_vecinal:${p.COD_UV}`;
      return { type: 'Feature', id: props.id as string, properties: props, geometry: f.geometry };
    }),
  };
}

async function main() {
  const { distritos, uvs, manzanas } = generarCiudadSintetica();
  const dirGeo = join(RAIZ_REPO, 'data/samples/geo');
  const dirShp = join(RAIZ_REPO, 'data/samples/shp/DM_UV_MZ_SAMPLE');
  mkdirSync(dirGeo, { recursive: true });
  mkdirSync(dirShp, { recursive: true });
  writeFileSync(
    join(dirGeo, 'distrito_municipal.geojson'),
    `${JSON.stringify(normalizadoParaSeeds(distritos, 'distrito_municipal'))}\n`,
  );
  writeFileSync(
    join(dirGeo, 'unidad_vecinal.geojson'),
    `${JSON.stringify(normalizadoParaSeeds(uvs, 'unidad_vecinal'))}\n`,
  );
  writeFileSync(
    join(dirGeo, 'manzana.geojson'),
    `${JSON.stringify(normalizadoParaSeeds(manzanas, 'manzana'))}\n`,
  );
  const conjuntos: Array<[string, Feature[]]> = [
    ['DM_SAMPLE', distritos],
    ['UV_SAMPLE', uvs],
    ['MZ_SAMPLE', manzanas],
  ];
  for (const [nombre, fs] of conjuntos) {
    const salida = await geojsonAShapefile(
      { type: 'FeatureCollection', features: fs },
      nombre,
      'EPSG:32720',
    );
    for (const [archivo, contenido] of Object.entries(salida))
      writeFileSync(join(dirShp, archivo), contenido);
  }
  writeFileSync(
    join(dirShp, 'MANIFEST.md'),
    `# MANIFEST — DM_UV_MZ_SAMPLE (SINTÉTICO)\n\n- Fuente: generado por pipelines/geodata-etl/src/samples/generar.ts\n- Nada de esta carpeta es real: rejilla de 3 distritos, 12 UV y ${manzanas.length} manzanas.\n- CRS: EPSG:32720 (WGS 84 / UTM 20S), escrito por mapshaper con su .prj\n`,
  );
  console.log(
    `samples: ${distritos.length} distritos, ${uvs.length} UV, ${manzanas.length} manzanas → ${dirGeo} y ${dirShp}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
