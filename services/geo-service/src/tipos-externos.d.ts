declare module 'geojson-vt' {
  import type { FeatureCollection } from 'geojson';
  export interface Tile {
    features: unknown[];
    numPoints: number;
    numSimplified: number;
    numFeatures: number;
    source: unknown;
    x: number;
    y: number;
    z: number;
    transformed: boolean;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  export interface Indice {
    getTile(z: number, x: number, y: number): Tile | null;
  }
  export default function geojsonvt(
    data: FeatureCollection,
    options?: {
      maxZoom?: number;
      indexMaxZoom?: number;
      indexMaxPoints?: number;
      tolerance?: number;
      extent?: number;
      buffer?: number;
      promoteId?: string;
      generateId?: boolean;
    },
  ): Indice;
}
declare module 'vt-pbf' {
  export function fromGeojsonVt(
    layers: Record<string, unknown>,
    options?: { version?: number; extent?: number },
  ): Uint8Array;
}
