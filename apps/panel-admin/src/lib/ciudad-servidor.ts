/**
 * La ciudad para los componentes de servidor (layout raíz y la página del plano). Mismo módulo
 * que `apps/web-ciudadano/src/lib/ciudad-servidor.ts`.
 *
 * `connection()` va ANTES de leer, a propósito. Sin él, `next build` prerenderizaría las páginas
 * y dejaría escrita en su HTML la ciudad que contestara al compilar —o el respaldo, porque al
 * compilar api-core no está—: justo lo que no puede pasar con una imagen que se instala en
 * cualquier ciudad. Con él, cada página se genera al pedirla, y la consulta a api-core se ahorra
 * igual gracias a la caché de `configuracion.ts` (cinco minutos).
 *
 * `cache` de React junta en una sola lectura las del layout y las de la página de una petición.
 */
import type { Ciudad } from 'contracts';
import { connection } from 'next/server';
import { cache } from 'react';
import { crearLectorDeCiudad } from './configuracion';
import { urlDeApiCore } from './servicios';

const leerCiudad = crearLectorDeCiudad({
  // En cada consulta, no al cargar el módulo: la misma imagen sirve en cualquier despliegue.
  urlBase: () => urlDeApiCore(process.env),
  registrar: (mensaje, causa) => console.error(mensaje, causa),
});

export const obtenerCiudad = cache(async (): Promise<Ciudad> => {
  await connection();
  return leerCiudad();
});
