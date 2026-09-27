/**
 * La ciudad de esta instalación, tal como la manda api-core en `GET /api/v1/configuracion`.
 *
 * Mi Curichi se despliega una vez por ciudad con la misma imagen: nada de lo que cambia de una
 * ciudad a otra (nombre, centro del mapa, locale, zona horaria) puede quedar escrito en el código
 * ni fijado al compilar. El layout raíz la lee en el servidor (`ciudad-servidor.ts`) y la reparte
 * por contexto (`ciudad-contexto.tsx`); estas son las reglas puras, sin React ni red.
 */
import type { Ciudad } from 'contracts';

export type { Ciudad };

/** Lo que necesitan los formatos de fecha, hora y cifras: el locale y la zona de la ciudad. */
export type Regional = Pick<Ciudad, 'locale' | 'zona_horaria'>;

/** Centro de la ciudad en el orden de MapLibre y de GeoJSON: `[lon, lat]`. */
export function centroDeCiudad(ciudad: Pick<Ciudad, 'centro'>): [number, number] {
  return [ciudad.centro.lon, ciudad.centro.lat];
}

/** Título de la pantalla del mapa (lo leen los lectores de pantalla). */
export function tituloDelMapa(ciudad: Pick<Ciudad, 'nombre'>): string {
  return `Mapa de puntos de inundación de ${ciudad.nombre}`;
}

/** Descripción de la portada para buscadores y enlaces compartidos. */
export function descripcionDeInicio(ciudad: Pick<Ciudad, 'nombre'>): string {
  return `Mi Curichi: el mapa de los puntos donde se junta el agua en ${ciudad.nombre}, hecho por los vecinos.`;
}

/**
 * Fotografías de una ciudad concreta que viajan con el proyecto. La de la catedral es de Santa
 * Cruz: en otra instalación la lámina que la usa vuelve a la trama genérica de anillos.
 */
const FOTOS_DE_CIUDAD: ReadonlyArray<{ nombre: string; pais: string; foto: string }> = [
  { nombre: 'Santa Cruz de la Sierra', pais: 'BO', foto: '/santa-cruz-catedral.webp' },
];

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** La fotografía propia de esta ciudad, o `null` si el proyecto no trae ninguna suya. */
export function fotoDeCiudad(ciudad: Pick<Ciudad, 'nombre' | 'pais'>): string | null {
  const nombre = normalizar(ciudad.nombre);
  return (
    FOTOS_DE_CIUDAD.find((f) => f.pais === ciudad.pais && normalizar(f.nombre) === nombre)?.foto ??
    null
  );
}
