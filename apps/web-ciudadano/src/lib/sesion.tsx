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
import { useSyncExternalStore } from 'react';
import { cerrarSesion as cerrarSesionApi, obtenerYo } from '@/lib/api';
import { esSesionCaducada } from '@/lib/errores';

export const CLAVE_YO = ['yo'] as const;

export interface EstadoSesion {
  usuario: SesionActual | null;
  /** Todavía no se sabe: la primera consulta está en vuelo. */
  cargando: boolean;
  /**
   * No se pudo preguntar (plazo, API caída) y no hay respuesta anterior. NO es «sin cuenta»: a
   * quien tiene sesión no se le puede decir que necesita una solo porque el servidor no contestó.
   */
  errorDeCarga: unknown;
  /** Se está volviendo a preguntar tras un fallo. */
  reintentando: boolean;
  reintentar: () => void;
  /** Momento en que la cuenta vuelve a poder reportar, o null si puede ahora. */
  puedeReportarDesde: Date | null;
}

/**
 * Lo que dice la consulta de `/auth/yo`, traducido a lo que la pantalla necesita. Un 401 es «sin
 * cuenta»; cualquier otro fallo es un error de carga, salvo que ya hubiera una respuesta buena
 * (un refresco fallido no le borra la sesión a nadie).
 *
 * `hidratado: false` (en el servidor y mientras React hidrata) es siempre «todavía no se sabe».
 * El servidor nunca conoce la sesión —la cookie es HttpOnly y `/auth/yo` se pregunta desde el
 * navegador—, así que la hidratación tiene que decir lo mismo que él. Lo que va dentro de un
 * `<Suspense>` se hidrata después del resto, y si para entonces `/auth/yo` ya había contestado,
 * el formulario de `/reportar` se dibujaba entero donde el servidor puso «Un momento…».
 */
export function interpretarSesion(consulta: {
  data: SesionActual | undefined;
  error: unknown;
  isPending: boolean;
  hidratado?: boolean;
}): Pick<EstadoSesion, 'usuario' | 'cargando' | 'errorDeCarga'> {
  const { data, error, isPending, hidratado = true } = consulta;
  if (!hidratado) return { usuario: null, cargando: true, errorDeCarga: null };
  const sinSesion = esSesionCaducada(error);
  return {
    usuario: sinSesion ? null : (data ?? null),
    cargando: isPending,
    errorDeCarga: !sinSesion && !data && error ? error : null,
  };
}

const sinSuscripcion = () => () => {};

/**
 * `false` en el servidor y durante la hidratación; `true` después, y desde el primer render en
 * lo que se monta por navegación. Es el patrón de `useSyncExternalStore`: React usa la instantánea
 * «de servidor» mientras hidrata y vuelve a pintar con la del cliente al terminar.
 */
function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}

export function useSesion(): EstadoSesion {
  const hidratado = useHidratado();
  const { data, isPending, error, isFetching, refetch } = useQuery({
    queryKey: CLAVE_YO,
    queryFn: ({ signal }) => obtenerYo(signal),
    retry: false,
    // Un rato largo: el estado de sesión cambia poco y esta consulta sale en todas las pantallas.
    staleTime: 5 * 60_000,
    // 401 significa «sin cuenta», que es lo normal acá: no tiene sentido reintentar al enfocar.
    refetchOnWindowFocus: false,
  });
  const { usuario, cargando, errorDeCarga } = interpretarSesion({
    data,
    error,
    isPending,
    hidratado,
  });
  return {
    usuario,
    cargando,
    errorDeCarga,
    reintentando: isFetching,
    reintentar: () => void refetch(),
    puedeReportarDesde: usuario?.puede_reportar_desde
      ? new Date(usuario.puede_reportar_desde)
      : null,
  };
}

/**
 * Vuelve a preguntar por la sesión. Después de enviar un reporte (o de un 429 de cuota) el turno
 * de la cuenta cambió en el servidor, y sin esto `puede_reportar_desde` seguía con el valor de
 * hasta cinco minutos antes: el aviso de «ya enviaste uno hace poco» no salía.
 */
export function refrescarSesion(cliente: {
  invalidateQueries: (filtros: { queryKey: readonly unknown[] }) => Promise<void>;
}): Promise<void> {
  return cliente.invalidateQueries({ queryKey: CLAVE_YO });
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
