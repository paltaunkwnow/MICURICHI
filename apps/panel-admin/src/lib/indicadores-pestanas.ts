import { type Indicadores, SEVERIDADES, type Severidad } from 'contracts';
import type { ParametrosConsulta } from './api';
import { type EstadoTorta, paramsIndicadores } from './indicadores-torta';

/**
 * Las pestañas de «Por severidad» de /indicadores: «Todo» y las cuatro severidades. Lógica pura,
 * sin React ni red, para probarla sin navegador.
 *
 * El estado no vive acá: es el de la URL (`EstadoTorta`, `?severidad=…&distrito=…`), el mismo que
 * usa la fila «Filtrar por severidad» de arriba. Las pestañas solo lo leen para saber cuáles están
 * presionadas y proponen el siguiente, así las dos filas se reflejan entre sí sin sincronizarse.
 */

/** «Todo» (`todas`, como en las pestañas del ejecutivo) o una severidad. */
export type PestanaSeveridad = 'todas' | Severidad;

/**
 * Orden de los botones: «Todo» primero y después las severidades en el orden de `SEVERIDADES`, que
 * es el de las tarjetas «Por severidad» que estas pestañas reemplazan.
 */
export const PESTANAS_SEVERIDAD: readonly PestanaSeveridad[] = ['todas', ...SEVERIDADES];

/**
 * Estado que deja tocar una pestaña. Una severidad deja el filtro en solo esa (aunque hubiera
 * varias elegidas arriba) y «Todo» lo quita; el distrito elegido se conserva. Tocar lo que ya
 * está así devuelve el MISMO objeto, para que la pantalla no navegue por nada.
 */
export function elegirPestanaSeveridad(
  estado: EstadoTorta,
  pestana: PestanaSeveridad,
): EstadoTorta {
  if (pestana === 'todas') {
    return estado.severidades.length === 0 ? estado : { ...estado, severidades: [] };
  }
  const yaEstaSola = estado.severidades.length === 1 && estado.severidades[0] === pestana;
  return yaEstaSola ? estado : { ...estado, severidades: [pestana] };
}

/**
 * Si el botón de una pestaña va presionado. Con dos severidades elegidas arriba quedan presionadas
 * las dos y «Todo» no; «Todo» lo está solo cuando no hay ningún filtro de severidad.
 */
export function pestanaPresionada(
  seleccionadas: readonly Severidad[],
  pestana: PestanaSeveridad,
): boolean {
  return pestana === 'todas' ? seleccionadas.length === 0 : seleccionadas.includes(pestana);
}

/** Lo que las pestañas leen de los indicadores. */
export type ConteosPestanas = Pick<Indicadores, 'total' | 'por_severidad'>;

/**
 * El número de una pestaña: «Todo» es el total vigente y cada severidad su conteo (0 si api-core no
 * la trae). `null` mientras no hay datos: la pantalla pone «—» y no inventa un 0.
 */
export function conteoDePestana(
  conteos: ConteosPestanas | null | undefined,
  pestana: PestanaSeveridad,
): number | null {
  if (!conteos) return null;
  return pestana === 'todas' ? conteos.total : (conteos.por_severidad[pestana] ?? 0);
}

/**
 * Parámetros de la consulta que da los números de las pestañas: indicadores SIN filtro de
 * severidad (ni de distrito), así los números no cambian al filtrar. Sin filtro activo tiene la
 * misma clave que la consulta base de la pantalla y TanStack las junta en una sola petición; con
 * filtro sale una consulta más, que sigue el sondeo de 10 s como las demás.
 */
export const PARAMS_CONTEOS_PESTANAS: ParametrosConsulta = paramsIndicadores([]);
