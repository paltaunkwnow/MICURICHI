'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Mapa, type RellenoCapa } from '@/componentes/Mapa';
import { obtenerCapasMapa } from '@/lib/api';
import { COLOR_SIN_REPORTES, OPACIDAD_COROPLETA } from '@/lib/ejecutivo';

/**
 * Coropleta de distritos del panel ejecutivo. Solo la capa de distritos, sin puntos: quien mira
 * este mapa decide por zonas, no modera reportes uno por uno. Encuadra sobre el bbox de la capa
 * vigente para que se vean todos los distritos.
 */
export function MapaDistritos({
  colores,
  descripciones,
  ariaLabel,
}: {
  colores: Record<string, string>;
  descripciones: Record<string, string>;
  ariaLabel: string;
}) {
  const capas = useQuery({
    queryKey: ['geo', 'capas'],
    queryFn: ({ signal }) => obtenerCapasMapa(signal),
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Estable entre renders: el mapa vuelve a aplicar las capas cada vez que cambia esta referencia.
  const soloDistritos = useMemo(
    () => (capas.data ?? []).filter((c) => c.capa === 'distrito_municipal'),
    [capas.data],
  );
  // Estable entre renders: el mapa repinta la capa cada vez que cambia esta referencia.
  const relleno = useMemo<RellenoCapa>(
    () => ({
      capa: 'distrito_municipal',
      colores,
      colorPorDefecto: COLOR_SIN_REPORTES,
      opacidad: OPACIDAD_COROPLETA,
      descripciones,
    }),
    [colores, descripciones],
  );
  return (
    <div className="mapa-panel" data-testid="ejecutivo-mapa">
      <Mapa
        capas={soloDistritos}
        relleno={relleno}
        encuadrarACapas
        className="h-[380px] w-full lg:h-[460px]"
        ariaLabel={ariaLabel}
      />
      {capas.isError ? (
        <p className="error absolute inset-x-3 top-3 rounded-xl bg-white p-3" role="alert">
          No se pudo cargar la capa de distritos.
        </p>
      ) : null}
    </div>
  );
}
