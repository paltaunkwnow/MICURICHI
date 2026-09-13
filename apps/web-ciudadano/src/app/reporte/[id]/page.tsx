'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Cabecera } from '@/componentes/Cabecera';
import { HojaDetalle } from '@/componentes/HojaDetalle';
import { MapaDiferido } from '@/componentes/MapaDiferido';
import { ErrorApi, obtenerReporte } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';

export default function DetalleReporte() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const consulta = useQuery({
    queryKey: ['reporte', id],
    queryFn: () => obtenerReporte(id),
    enabled: !!id,
    retry: false,
  });

  return (
    <>
      <Cabecera />
      <main id="contenido" className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        {consulta.isPending ? (
          <p aria-live="polite">Cargando el reporte…</p>
        ) : consulta.isError ? (
          <div className="tarjeta space-y-3 p-6" aria-live="polite">
            <h1 className="titular text-3xl">
              {consulta.error instanceof ErrorApi && consulta.error.estado === 404
                ? 'Este reporte no existe o todavía está en revisión'
                : 'No pudimos mostrar el reporte'}
            </h1>
            <p className="text-tinta-600">
              {consulta.error instanceof ErrorApi && consulta.error.estado === 404
                ? 'Los reportes nuevos se publican recién cuando un técnico municipal los valida.'
                : mensajeDeError(consulta.error)}
            </p>
            <Link href="/" className="btn-primario btn no-underline">
              Volver al mapa
            </Link>
          </div>
        ) : (
          <>
            <div className="relative h-64 overflow-hidden rounded-3xl">
              <MapaDiferido
                className="h-full w-full"
                ariaLabel="Ubicación del reporte en el mapa"
                reportes={[consulta.data]}
                seleccionado={consulta.data.properties.id}
                centro={consulta.data.geometry.coordinates as [number, number]}
                zoom={16}
              />
            </div>
            <div className="tarjeta">
              <HojaDetalle reporte={consulta.data} conEnlace={false} />
            </div>
            <Link href="/" className="btn-secundario btn no-underline">
              Volver al mapa
            </Link>
          </>
        )}
      </main>
    </>
  );
}
