'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HojaDetalle } from '@/componentes/HojaDetalle';
import { MapaDiferido } from '@/componentes/MapaDiferido';
import { ErrorApi, obtenerReporte } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { tituloReporte } from '@/lib/formato';

/**
 * Detalle de un punto con enlace propio (C-02 en móvil, W-02 en escritorio): el mapa nunca queda
 * tapado —en escritorio el detalle ocupa la columna izquierda y en móvil sube como hoja—, que es
 * lo que el prototipo resuelve con `eSplit(detalle)`.
 */
export default function DetalleReporte() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const consulta = useQuery({
    queryKey: ['reporte', id],
    queryFn: ({ signal }) => obtenerReporte(id, signal),
    enabled: !!id,
    retry: false,
  });

  if (consulta.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <h1 className="titular text-2xl">Cargando el reporte…</h1>
        <p aria-live="polite" className="ayuda mt-2">
          Un momento.
        </p>
      </div>
    );
  }

  if (consulta.isError) {
    const esFaltante = consulta.error instanceof ErrorApi && consulta.error.estado === 404;
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <div className="tarjeta space-y-3 p-6" aria-live="polite">
          <h1 className="titular text-3xl">
            {esFaltante
              ? 'Este reporte no existe o todavía está en revisión'
              : 'No pudimos mostrar el reporte'}
          </h1>
          <p className="text-tinta-600">
            {esFaltante
              ? 'Los reportes nuevos se publican recién cuando un técnico municipal los valida.'
              : mensajeDeError(consulta.error)}
          </p>
          <Link href="/" className="btn no-underline">
            Volver al mapa
          </Link>
        </div>
      </div>
    );
  }

  const reporte = consulta.data;
  const detalle = (testId: string) => (
    <HojaDetalle reporte={reporte} conEnlace={false} testId={testId} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Punto de inundación en {tituloReporte(reporte.properties)}</h1>
      <div className="split min-h-0 flex-1 md:grid-cols-[400px_minmax(0,1fr)]">
        <div className="lado">
          <div className="lista pt-[18px]">
            <Link href="/" className="btn btn-fantasma btn-sm mb-4 no-underline">
              <ChevronLeft size={16} aria-hidden="true" />
              Volver al mapa
            </Link>
            {detalle('hoja-detalle')}
          </div>
        </div>
        <div className="mapcol">
          <MapaDiferido
            className="map"
            ariaLabel="Ubicación del reporte en el mapa"
            reportes={[reporte]}
            seleccionado={reporte.properties.id}
            centro={reporte.geometry.coordinates as [number, number]}
            zoom={16}
          />
          <div className="flot top-3 left-3 md:hidden">
            <Link href="/" className="atras no-underline" aria-label="Volver al mapa">
              <ChevronLeft size={19} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      <div className="hoja md:hidden">{detalle('hoja-detalle-movil')}</div>
    </div>
  );
}
