'use client';

/**
 * Estado de sesión de la app pública.
 *
 * Aquí NO hay pantallas protegidas: el mapa, el detalle y «Cómo funciona» se ven sin cuenta y así
 * tiene que seguir siendo. Lo único que cambia con la sesión es poder **crear** un reporte. Por
 * eso esto no es un guardián que redirige, sino un dato que la interfaz consulta para decidir qué
 * enseñar; quien decide de verdad es el servidor, que responde 401 si la petición no trae sesión.
 *
 * El «no hay sesión» llega como 401 y es la respuesta NORMAL para la mayoría de visitantes, no un
 * error: por eso `retry: false` y por eso el componente que lo usa no pinta ningún aviso.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SesionActual } from 'contracts';
import { cerrarSesion as cerrarSesionApi, ErrorApi, obtenerYo } from '@/lib/api';

export const CLAVE_YO = ['yo'] as const;

export interface EstadoSesion {
  usuario: SesionActual | null;
  /** Todavía no se sabe: la primera consulta está en vuelo. */
  cargando: boolean;
  /** Momento en que la cuenta vuelve a poder reportar, o null si puede ahora. */
  puedeReportarDesde: Date | null;
}

export function useSesion(): EstadoSesion {
  const { data, isPending, error } = useQuery({
    queryKey: CLAVE_YO,
    queryFn: ({ signal }) => obtenerYo(signal),
    retry: false,
    // Un rato largo: el estado de sesión cambia poco y esta consulta sale en todas las pantallas.
    staleTime: 5 * 60_000,
    // 401 significa «sin cuenta», que es lo normal acá: no tiene sentido reintentar al enfocar.
    refetchOnWindowFocus: false,
  });
  const sinSesion = error instanceof ErrorApi && error.estado === 401;
  const usuario = sinSesion ? null : (data ?? null);
  return {
    usuario,
    cargando: isPending,
    puedeReportarDesde: usuario?.puede_reportar_desde
      ? new Date(usuario.puede_reportar_desde)
      : null,
  };
}

/** Cierra sesión y vacía la caché: puede tener datos que ya no corresponden a quien mira. */
export function useCerrarSesion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: cerrarSesionApi,
    onSettled: () => {
      cliente.setQueryData(CLAVE_YO, undefined);
      cliente.removeQueries({ queryKey: CLAVE_YO });
      void cliente.invalidateQueries();
    },
  });
}
