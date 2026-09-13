'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UbicacionUsuario {
  lat: number;
  lon: number;
  /** Geolocation.coords.accuracy en metros. */
  precisionM: number | null;
}

export type EstadoUbicacion = 'inactivo' | 'buscando' | 'lista' | 'denegada' | 'error';

/**
 * Ubicación del navegador para calcular "a N m de vos". No molesta al vecino: solo pide la
 * posición sola si el permiso ya fue concedido antes; si no, espera a que llame a `pedir()`.
 */
export function useUbicacionUsuario(automatica = true) {
  const [ubicacion, setUbicacion] = useState<UbicacionUsuario | null>(null);
  const [estado, setEstado] = useState<EstadoUbicacion>('inactivo');

  const pedir = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('error');
      return;
    }
    setEstado('buscando');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUbicacion({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          precisionM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
        setEstado('lista');
      },
      (err) => setEstado(err.code === err.PERMISSION_DENIED ? 'denegada' : 'error'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    if (!automatica || typeof navigator === 'undefined' || !navigator.permissions) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (p.state === 'granted') pedir();
      })
      .catch(() => {
        /* navegadores sin Permissions API: se espera al gesto del vecino */
      });
  }, [automatica, pedir]);

  return { ubicacion, estado, pedir };
}
