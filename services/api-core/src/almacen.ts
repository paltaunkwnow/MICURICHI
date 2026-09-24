/** Almacenamiento de fotos ya sanitizadas. En local: disco. En Fase 2: adaptador S3 (MinIO) con la misma interfaz. */
import { promises as fs, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Almacen {
  guardar(key: string, datos: Buffer, mime: string): Promise<void>;
  leer(key: string): Promise<{ datos: Buffer; mime: string } | null>;
  /** Borra el objeto si existe. No falla si ya no está (mantenimiento, §13). */
  borrar(key: string): Promise<void>;
  /**
   * Sonda barata para la readiness. Lanza si el almacén no responde. Opcional: el disco y la
   * memoria están donde está el proceso, así que para ellos no hay nada que comprobar.
   */
  comprobar?(): Promise<void>;
}

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export class AlmacenDisco implements Almacen {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  private ruta(key: string) {
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) throw new Error('clave de objeto inválida');
    return join(this.dir, key);
  }
  async guardar(key: string, datos: Buffer) {
    await fs.writeFile(this.ruta(key), datos);
  }
  async leer(key: string) {
    try {
      const datos = await fs.readFile(this.ruta(key));
      return {
        datos,
        mime: MIME_POR_EXT[key.split('.').pop() ?? 'jpg'] ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }
  async borrar(key: string) {
    await fs.rm(this.ruta(key), { force: true });
  }
}

export class AlmacenMemoria implements Almacen {
  private mapa = new Map<string, { datos: Buffer; mime: string }>();
  async guardar(key: string, datos: Buffer, mime: string) {
    this.mapa.set(key, { datos, mime });
  }
  async leer(key: string) {
    return this.mapa.get(key) ?? null;
  }
  async borrar(key: string) {
    this.mapa.delete(key);
  }
}
