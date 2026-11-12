/**
 * La configuración de la instalación para los componentes de servidor (layout raíz y metadatos): la
 * ciudad y las categorías activas.
 *
 * `connection()` va ANTES de leer y fuera de cualquier try/catch, a propósito. Sin él, `next build`
 * prerenderizaría las páginas y dejaría escrita en su HTML la ciudad que contestara al compilar
 * —o el respaldo, porque al compilar api-core no está—: exactamente lo que no puede pasar con una
 * imagen que se instala en cualquier ciudad. Con él, cada página se genera al pedirla, y la
 * consulta a api-core se ahorra igual gracias a la caché de `configuracion.ts` (cinco minutos).
 *
 * `cache` de React junta en una sola lectura las del layout y las de `generateMetadata` de una
 * misma petición; `obtenerCiudad` y las categorías salen de esa misma lectura.
 */
import type { Ciudad, SlugCategoria } from 'contracts';
import { connection } from 'next/server';
import { cache } from 'react';
import { type ConfiguracionResuelta, crearLectorDeConfiguracion } from './configuracion';
import { urlDeApiCore } from './servicios';

const leerConfiguracion = crearLectorDeConfiguracion({
  // En cada consulta, no al cargar el módulo: la misma imagen sirve en cualquier despliegue.
  urlBase: () => urlDeApiCore(process.env),
  registrar: (mensaje, causa) => console.error(mensaje, causa),
});

export const obtenerConfiguracion = cache(async (): Promise<ConfiguracionResuelta> => {
  await connection();
  return leerConfiguracion();
});

export const obtenerCiudad = cache(async (): Promise<Ciudad> => {
  return (await obtenerConfiguracion()).ciudad;
});

export const obtenerCategoriasActivas = cache(async (): Promise<readonly SlugCategoria[]> => {
  return (await obtenerConfiguracion()).categoriasActivas;
});
