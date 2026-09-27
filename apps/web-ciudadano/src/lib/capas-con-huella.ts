/**
 * Capas y teselas con la huella del contenido en la URL (contracts 0.12.0).
 *
 * geo-service pone en `CapaInfo.url` una ruta con la huella de lo que sirve
 * (`/geo/v1/capas/{capa}/v/{huella}` o `/geo/v1/teselas/{capa}/{huella}/{z}/{x}/{y}.mvt`) y la
 * responde `immutable` por un año: el navegador y el service worker no vuelven a preguntar. Cuando
 * un administrador activa otra versión, o se recarga la misma con otra geometría, la huella vieja
 * responde `410 CAPA_CAMBIO`. Entonces el mapa vuelve a pedir `/geo/v1/capas` (la lista es
 * `no-cache`) y apunta su fuente a la URL nueva, sin recargar la página.
 */
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { CapaInfo } from 'contracts';
import { useCallback } from 'react';

/** La clave de la lista de capas vigentes en TanStack Query. */
export const CLAVE_CAPAS = ['capas'] as const;

const CAPA_CON_HUELLA = /\/geo\/v1\/capas\/([a-z_]+)\/v\/([0-9a-f]{16})$/;
const TESELA_CON_HUELLA =
  /\/geo\/v1\/teselas\/([a-z_]+)\/([0-9a-f]{16})\/[^/]+\/[^/]+\/[^/]+\.mvt$/;

/** Capa y huella de una URL de capa o de tesela (o de su plantilla); `null` si no lleva huella. */
export function huellaDeUrl(url: string): { capa: string; huella: string } | null {
  const ruta = url.split(/[?#]/)[0] ?? '';
  const m = CAPA_CON_HUELLA.exec(ruta) ?? TESELA_CON_HUELLA.exec(ruta);
  return m?.[1] && m[2] ? { capa: m[1], huella: m[2] } : null;
}

/**
 * ¿Este error del mapa es el 410 de una capa cuya huella el mapa todavía cree vigente?
 *
 * MapLibre avisa de cada petición fallida con un `AJAXError` (`status` y `url`) en el evento
 * `error` del mapa. Una pantalla de teselas viejas da una ráfaga de 410: solo los que llevan la
 * huella que el mapa está usando piden recargar. Los rezagados, que llegan cuando la lista ya
 * trae la huella nueva, no vuelven a pedirla.
 */
export function capaCambiadaEnError(error: unknown, capas: readonly CapaInfo[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, url } = error as { status?: unknown; url?: unknown };
  if (status !== 410 || typeof url !== 'string') return false;
  const fallida = huellaDeUrl(url);
  if (!fallida) return false;
  const vigente = capas.find((c) => c.capa === fallida.capa);
  return !!vigente && huellaDeUrl(vigente.url)?.huella === fallida.huella;
}

/**
 * Vuelve a pedir `/geo/v1/capas`. `cancelRefetch: false` junta la ráfaga de 410 en una sola
 * petición: si ya hay una en vuelo, se espera esa en vez de cortarla y empezar otra.
 */
export function recargarCapas(cliente: QueryClient): Promise<void> {
  return cliente.invalidateQueries({ queryKey: CLAVE_CAPAS }, { cancelRefetch: false });
}

/** `recargarCapas` con el cliente de la app, para el mapa. */
export function useRecargaDeCapas(): () => void {
  const cliente = useQueryClient();
  return useCallback(() => void recargarCapas(cliente), [cliente]);
}

/** Lo que el mapa necesita de una fuente de MapLibre para cambiarle la URL. */
type Fuente = {
  type: string;
  setData?: (datos: string) => unknown;
  setTiles?: (t: string[]) => unknown;
};

/** URL de `CapaInfo` (relativa, con huella) con la que se creó o se apuntó cada fuente. */
const urlPorFuente = new WeakMap<object, string>();

/** Anota la URL con la que se acaba de crear la fuente de una capa. */
export function anotarUrlDeFuente(fuente: object | undefined, url: string): void {
  if (fuente) urlPorFuente.set(fuente, url);
}

export function urlDeFuente(fuente: object | undefined): string | undefined {
  return fuente ? urlPorFuente.get(fuente) : undefined;
}

/**
 * Apunta la fuente de una capa a la URL que trae `CapaInfo`. `'otro-modo'` si la capa pasó de
 * GeoJSON a teselas o al revés: MapLibre no cambia el tipo de una fuente, hay que rehacerla.
 */
export function apuntarFuenteA(
  fuente: Fuente,
  c: CapaInfo,
  origen: string,
): 'igual' | 'cambiada' | 'otro-modo' {
  const tipo = c.modo === 'teselas' ? 'vector' : 'geojson';
  if (fuente.type !== tipo) return 'otro-modo';
  if (urlPorFuente.get(fuente) === c.url) return 'igual';
  if (tipo === 'vector') fuente.setTiles?.([`${origen}${c.url}`]);
  else fuente.setData?.(`${origen}${c.url}`);
  urlPorFuente.set(fuente, c.url);
  return 'cambiada';
}
