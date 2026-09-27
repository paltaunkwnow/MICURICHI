/**
 * Guarda de espacio del disco de fotos (contracts 0.13.0). En la VPS las fotos van al mismo disco
 * que PostgreSQL: si las fotos lo llenan, cae la base y con ella todo el servicio. Por debajo de
 * `FOTOS_MIN_LIBRE_BYTES` se dejan de aceptar fotos (507 SIN_ESPACIO), los reportes sin foto siguen
 * entrando, `/ready` sale degradado y las alertas `DiscoDeFotos*` avisan antes.
 *
 * Solo con el almacén en disco (`Almacen.espacioLibre`). Con S3 no hay guarda ni métricas de disco.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Almacen, EspacioDisco } from './almacen.js';
import type { Metricas } from './observabilidad.js';

export type EstadoEspacio =
  /** Hay espacio, o el almacén no es de disco, o no se pudo leer (lo dirá `guardar`). */
  'ok' | 'poco_espacio';

export async function revisarEspacio(
  almacen: Almacen,
  minimoBytes: number,
  log?: FastifyBaseLogger,
): Promise<EstadoEspacio> {
  if (!almacen.espacioLibre || minimoBytes <= 0) return 'ok';
  let espacio: EspacioDisco;
  try {
    espacio = await almacen.espacioLibre();
  } catch (err) {
    // Sin dato no se frena: rechazar todas las fotos porque falló una lectura de statfs sería peor
    // que dejarlas pasar. Si el disco de verdad no responde, `guardar` y `/ready` lo dicen.
    log?.warn({ err }, 'no se pudo leer el espacio libre del disco de fotos');
    return 'ok';
  }
  return espacio.libre < minimoBytes ? 'poco_espacio' : 'ok';
}

/**
 * `curichi_fotos_disco_libre_bytes` y `curichi_fotos_disco_total_bytes` (nombres que usan las
 * alertas de infra/observabilidad/alertas.yml, no se tocan) y el umbral configurado en
 * `curichi_fotos_disco_min_libre_bytes`, para que un tablero pueda dibujar la línea sin copiar el
 * número del .env. `statfs` se lee en cada scrape.
 */
export function instalarMetricasDeDisco(
  metricas: Metricas,
  almacen: Almacen,
  minimoBytes: number,
): void {
  const leer = almacen.espacioLibre?.bind(almacen);
  if (!leer) return;
  let ultimo: EspacioDisco | null = null;
  metricas.alExponer(async () => {
    ultimo = await leer();
  });
  metricas.medidor('curichi_fotos_disco_libre_bytes', () => ultimo?.libre ?? Number.NaN);
  metricas.medidor('curichi_fotos_disco_total_bytes', () => ultimo?.total ?? Number.NaN);
  metricas.medidor('curichi_fotos_disco_min_libre_bytes', () => minimoBytes);
}
