/**
 * El cliente de TanStack Query de la app pública.
 *
 * La página pública no hace tráfico automático (decisión del plan de producción, S31): los datos
 * se piden al abrir una pantalla, al mover el mapa o cuando la propia app sabe que cambiaron —la
 * invalidación que sigue a enviar un reporte—, nunca porque la pestaña recuperó el foco, volvió la
 * red o pasó un rato. Con muchos vecinos mirando el mapa a la vez, cada refresco automático se
 * multiplica por todas las pestañas abiertas y no le muestra a nadie nada que necesite ya: los
 * reportes aparecen con demora de publicación y las cifras de geo-service tienen hasta 2 minutos.
 *
 * Por eso:
 *  - Nada de `refetchOnWindowFocus`, `refetchOnReconnect` ni `refetchInterval` en ninguna consulta.
 *  - `staleTime: Infinity` en los reportes, los agregados y el detalle: volver a una pantalla usa
 *    lo que ya estaba en memoria. Solo una opción `staleTime` escrita en el propio `useQuery` pisa
 *    esta; por eso las pantallas no deben ponerla para estas claves.
 *  - El resto conserva 30 s: la sesión y las capas ponen el suyo.
 */
import { QueryClient, type QueryKey } from '@tanstack/react-query';

/** Prefijos de clave de los datos públicos que no se vuelven a pedir solos. */
export const CLAVES_SIN_CADUCIDAD: readonly QueryKey[] = [['reportes'], ['agregados'], ['reporte']];

export function crearClienteDeConsultas(): QueryClient {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
      },
    },
  });
  for (const clave of CLAVES_SIN_CADUCIDAD)
    cliente.setQueryDefaults(clave, { staleTime: Number.POSITIVE_INFINITY });
  return cliente;
}
