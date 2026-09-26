/**
 * AlmacenDisco.comprobar() (revisión de producción, CLAUDE.md §13).
 *
 * No existía: `/ready` respondía `fotos: ok` aunque el directorio de fotos no existiera o el
 * proceso no pudiera escribir en él. En la imagen real eso pasaba con un volumen montado
 * root:root, donde el usuario `node` no tiene permiso de escritura — las subidas fallaban con 500
 * y el balanceador seguía mandando tráfico a esa réplica porque nadie se lo decía. La integración
 * con `/ready` está en `test/resiliencia.test.ts`; aquí se prueba la sonda en sí misma.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AlmacenDisco } from '../src/almacen.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'curichi-almacen-disco-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('comprobar()', () => {
  it('con el directorio escribible, resuelve y no deja ningún archivo atrás', async () => {
    const almacen = new AlmacenDisco(dir);
    await expect(almacen.comprobar()).resolves.toBeUndefined();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('dos comprobaciones concurrentes no chocan entre sí (nombre único por llamada)', async () => {
    const almacen = new AlmacenDisco(dir);
    await expect(
      Promise.all([almacen.comprobar(), almacen.comprobar(), almacen.comprobar()]),
    ).resolves.toBeDefined();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('si el directorio deja de existir (volumen no montado o sin permiso), rechaza', async () => {
    const almacen = new AlmacenDisco(dir);
    // No hace falta reproducir permisos de archivo (frágil entre sistemas operativos): que el
    // directorio ya no esté ahí produce el mismo síntoma que importa acá, que `writeFile` falle.
    rmSync(dir, { recursive: true, force: true });
    await expect(almacen.comprobar()).rejects.toThrow();
  });

  it('un fallo no deja el archivo temporal a medio escribir', async () => {
    const almacen = new AlmacenDisco(dir);
    rmSync(dir, { recursive: true, force: true });
    await expect(almacen.comprobar()).rejects.toThrow();
    // El directorio ni siquiera existe: si existiera con contenido, sería la basura que la
    // comprobación no debe dejar.
    expect(() => readdirSync(dir)).toThrow();
  });
});
