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
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SesionActual } from 'contracts';
import { useEffect, useSyncExternalStore } from 'react';
import { cerrarSesion as cerrarSesionApi, obtenerYo } from '@/lib/api';
import { olvidarBorrador } from '@/lib/borrador';
import { reportesRestantes } from '@/lib/cupo';
import { esSesionCaducada } from '@/lib/errores';
import { borrarListaVieja, olvidarDatosDeLaCuenta } from '@/lib/misReportes';
import { demoraDelProximo } from '@/lib/publicacion';

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
  /** Momento en que la cuenta vuelve a poder reportar (la medianoche), o null si puede ahora. */
  puedeReportarDesde: Date | null;
  /** Reportes que le quedan hoy a la cuenta, de 3; null si no se sabe. */
  reportesRestantesHoy: number | null;
  /** Segundos que tardaría en publicarse el próximo reporte (60 o 240); null si no se sabe. */
  demoraProximoS: number | null;
}

/** Lo que `/auth/yo` dice del cupo de la cuenta, en la forma que usa la pantalla. */
export function cupoDeLaSesion(
  usuario: SesionActual | null,
): Pick<EstadoSesion, 'puedeReportarDesde' | 'reportesRestantesHoy' | 'demoraProximoS'> {
  const reportesRestantesHoy = reportesRestantes(usuario);
  return {
    reportesRestantesHoy,
    // Con el cupo agotado no hay «próximo» hoy: la demora no aplica.
    demoraProximoS: reportesRestantesHoy === 0 ? null : demoraDelProximo(usuario),
    puedeReportarDesde: usuario?.puede_reportar_desde
      ? new Date(usuario.puede_reportar_desde)
      : null,
  };
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
  const cliente = useQueryClient();
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

  // La lista que el navegador guardaba hasta contracts 0.11.0 ya no se usa: «Mis reportes» la da
  // el servidor. Se borra en cualquier pantalla, sin esperar a que alguien abra esa.
  useEffect(() => borrarListaVieja(), []);

  // Sin sesión (401: nunca la hubo o venció), lo que era de la cuenta sale de la caché.
  const sinSesion = hidratado && !isPending && esSesionCaducada(error);
  useEffect(() => {
    if (sinSesion) olvidarDatosDeLaCuenta(cliente);
  }, [sinSesion, cliente]);

  return {
    usuario,
    cargando,
    errorDeCarga,
    reintentando: isFetching,
    reintentar: () => void refetch(),
    ...cupoDeLaSesion(usuario),
  };
}

/**
 * Vuelve a preguntar por la sesión. Al abrir el formulario, después de enviar un reporte y tras
 * un 429 de cuota, el cupo de la cuenta pudo cambiar en el servidor (también desde otro
 * teléfono), y el dato en caché podía tener cinco minutos.
 */
export function refrescarSesion(cliente: {
  invalidateQueries: (filtros: { queryKey: readonly unknown[] }) => Promise<void>;
}): Promise<void> {
  return cliente.invalidateQueries({ queryKey: CLAVE_YO });
}

/**
 * Lo que sigue a cerrar sesión a propósito: la caché puede tener datos que ya no corresponden a
 * quien mira, y el borrador del formulario es de quien se va. Quien entre después en la misma
 * pestaña (un teléfono prestado) no tiene que encontrarse el reporte a medias de otra persona. La
 * sesión que vence sola no pasa por acá: ese borrador sigue siendo de quien vuelve a entrar.
 */
export function limpiarTrasCerrarSesion(cliente: QueryClient): void {
  cliente.setQueryData(CLAVE_YO, undefined);
  cliente.removeQueries({ queryKey: CLAVE_YO });
  olvidarDatosDeLaCuenta(cliente);
  olvidarBorrador();
  void cliente.invalidateQueries();
}

export function useCerrarSesion() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: cerrarSesionApi,
    onSettled: () => limpiarTrasCerrarSesion(cliente),
  });
}
