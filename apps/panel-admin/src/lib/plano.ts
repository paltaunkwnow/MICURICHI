import type { Ciudad } from 'contracts';

/**
 * El plano de `public/plano-zonificacion.jpg` y el texto de `/plano` son del Gobierno Autónomo
 * Municipal de Santa Cruz de la Sierra: contenido de esa instalación, no del producto. La misma
 * imagen del panel se despliega en otras ciudades, y ahí ese plano sería el de otro municipio.
 */
export const CIUDAD_DEL_PLANO = { nombre: 'Santa Cruz de la Sierra', pais: 'BO' } as const;

/**
 * ¿La ciudad del despliegue es la del plano? Se compara el nombre sin distinguir mayúsculas ni
 * tildes, y el país. Para que aparezca, api-core tiene que declarar ese nombre completo.
 */
export function hayPlanoDeReferencia(ciudad: Pick<Ciudad, 'nombre' | 'pais'>): boolean {
  return (
    ciudad.pais === CIUDAD_DEL_PLANO.pais &&
    ciudad.nombre.localeCompare(CIUDAD_DEL_PLANO.nombre, 'es', { sensitivity: 'base' }) === 0
  );
}
