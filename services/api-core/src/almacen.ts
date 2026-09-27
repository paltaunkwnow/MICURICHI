/** Almacenamiento de fotos ya sanitizadas. En local: disco. En Fase 2: adaptador S3 (MinIO) con la misma interfaz. */
import { randomUUID } from 'node:crypto';
import { promises as fs, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Almacen {
  guardar(key: string, datos: Buffer, mime: string): Promise<void>;
  leer(key: string): Promise<{ datos: Buffer; mime: string } | null>;
  /** Borra el objeto si existe. No falla si ya no está (mantenimiento, §13). */
  borrar(key: string): Promise<void>;
  /**
   * Sonda barata para la readiness. Lanza si el almacén no responde. Opcional: `AlmacenMemoria`
   * no la implementa (vive en la memoria del propio proceso: no hay nada externo que comprobar).
   * `AlmacenDisco` sí, porque el volumen montado puede tener otros permisos que el proceso que
   * escribe en él (revisión de producción: un volumen mal montado quedaba root:root y el usuario
   * `node` no podía escribir, y sin esta sonda `/ready` decía `fotos: ok` igual).
   */
  comprobar?(): Promise<void>;
  /**
   * Espacio del disco donde quedan las fotos. Solo lo implementa `AlmacenDisco`: en la VPS ese disco
   * es también el de PostgreSQL, y si se llena cae la base. Con S3 el espacio no es asunto de esta
   * réplica y no hay guarda (ni métricas de disco).
   */
  espacioLibre?(): Promise<EspacioDisco>;
}

export interface EspacioDisco {
  /** Bytes que puede usar un proceso sin privilegios (`bavail`, no `bfree`). */
  libre: number;
  total: number;
}

/** Lo que se usa de `fs.statfs`: se inyecta en las pruebas para simular un disco casi lleno. */
export type LectorStatfs = (
  ruta: string,
) => Promise<{ bsize: number; bavail: number; blocks: number }>;

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export class AlmacenDisco implements Almacen {
  private statfs: LectorStatfs;
  constructor(
    private dir: string,
    opciones: { statfs?: LectorStatfs } = {},
  ) {
    mkdirSync(dir, { recursive: true });
    this.statfs = opciones.statfs ?? ((ruta) => fs.statfs(ruta));
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
  /**
   * Escribe y borra un archivo temporal en el propio directorio. No pasa por `ruta()` (esa exige
   * el formato de clave de una foto real): el nombre lleva un uuid para que dos réplicas o dos
   * llamadas concurrentes no se pisen. Si `writeFile` falla (directorio no escribible, volumen no
   * montado), no queda nada que borrar; si tiene éxito, el `finally` lo borra siempre, así que un
   * fallo no deja basura ni una comprobación repetida la acumula.
   */
  async comprobar(): Promise<void> {
    const ruta = join(this.dir, `.comprobacion-${randomUUID()}`);
    try {
      await fs.writeFile(ruta, '');
    } finally {
      await fs.rm(ruta, { force: true }).catch(() => {});
    }
  }
  /** `bavail` y no `bfree`: los bloques reservados para root no los puede usar el proceso. */
  async espacioLibre(): Promise<EspacioDisco> {
    const s = await this.statfs(this.dir);
    return { libre: s.bavail * s.bsize, total: s.blocks * s.bsize };
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
