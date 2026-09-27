/**
 * El worker de MapLibre y los glifos se sirven con `immutable` por un año (`next.config.ts`), así
 * que su URL tiene que cambiar cuando cambia el contenido: si no, el navegador seguiría usando la
 * copia vieja después de actualizar MapLibre o de cambiar la fuente de las etiquetas.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { getVersion } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { URL_GLIFOS, VERSION_GLIFOS } from './recursos-mapa';
import { RUTA_WORKER } from './worker-maplibre';

const APP = resolve(import.meta.dirname, '../..');

/** Huella de `public/glifos/`: rutas y contenidos, en orden. */
function huellaDeLosGlifos(): string {
  const raiz = join(APP, 'public', 'glifos');
  const archivos: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir).sort()) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else archivos.push(ruta);
    }
  };
  recorrer(raiz);
  const h = createHash('sha256');
  for (const ruta of archivos.sort()) {
    h.update(relative(raiz, ruta).split(sep).join('/'));
    h.update('\0');
    h.update(readFileSync(ruta));
  }
  return h.digest('hex').slice(0, 12);
}

describe('recursos del mapa con versión en la URL', () => {
  it('el worker lleva ?v= con la versión instalada de MapLibre', () => {
    expect(RUTA_WORKER).toBe(`/maplibre/maplibre-gl-worker.mjs?v=${getVersion()}`);
  });

  it('los glifos llevan ?v= con la huella de public/glifos: cambiarlos sin cambiarla falla aquí', () => {
    expect(VERSION_GLIFOS).toBe(huellaDeLosGlifos());
    expect(URL_GLIFOS).toBe(`/glifos/{fontstack}/{range}.pbf?v=${VERSION_GLIFOS}`);
  });

  it('el worker copiado importa el módulo compartido con la misma versión', () => {
    // Sin esto el worker nuevo cargaría el módulo compartido viejo, guardado como immutable.
    execFileSync(process.execPath, [join(APP, 'scripts', 'copiar-worker-maplibre.mjs')], {
      cwd: APP,
      stdio: 'pipe',
    });
    const worker = readFileSync(join(APP, 'public', 'maplibre', 'maplibre-gl-worker.mjs'), 'utf8');
    const importaciones = [...worker.matchAll(/from\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(importaciones).toEqual([`./maplibre-gl-shared.mjs?v=${getVersion()}`]);
  });
});
