'use client';

import { useCallback, useState } from 'react';
import { ubicacionSiHayPermiso } from './ubicacion-dispositivo';

export interface UbicacionUsuario {
  lat: number;
  lon: number;
  /** Geolocation.coords.accuracy en metros. */
  precisionM: number | null;
}

export type ResultadoCentrar =
  | { tipo: 'lista'; ubicacion: UbicacionUsuario }
  | { tipo: 'sin-permiso' }
  | { tipo: 'error' };

/**
 * Ubicación de quien mira el mapa, para «Ir a mi ubicación» y el «a N m de vos» de las tarjetas.
 *
 * No pide ni lee nada por su cuenta (plan 2026-09-26, pedido F): antes, al montar, consultaba el
 * permiso y leía la posición si ya estaba dado. Ahora solo `centrarSiHayPermiso()`, que se llama
 * al tocar el botón, y que tampoco dispara el aviso del navegador: la ubicación se pide solo
 * dentro de un reporte.
 */
export function useUbicacionUsuario() {
  const [ubicacion, setUbicacion] = useState<UbicacionUsuario | null>(null);

  const centrarSiHayPermiso = useCallback(async (): Promise<ResultadoCentrar> => {
    const r = await ubicacionSiHayPermiso();
    if (r.tipo !== 'lista') return r;
    const u = { lat: r.lectura.lat, lon: r.lectura.lon, precisionM: r.lectura.precisionM };
    setUbicacion(u);
    return { tipo: 'lista', ubicacion: u };
  }, []);

  return { ubicacion, centrarSiHayPermiso };
}
