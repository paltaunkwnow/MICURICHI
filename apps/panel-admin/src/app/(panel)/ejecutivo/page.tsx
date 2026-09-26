'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { VentanaResumen } from 'contracts';
import { useEffect, useState } from 'react';
import { MapaDistritos } from '@/componentes/ejecutivo/MapaDistritos';
import { PanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { ErrorApi, obtenerResumenEjecutivo } from '@/lib/api';
import { type PestanaEjecutiva, textoActualizado } from '@/lib/ejecutivo';

/** Cada cuánto se vuelve a pedir el resumen. El texto «hace N s» se refresca más seguido. */
const INTERVALO_MS = 60_000;
const TIC_MS = 10_000;

function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi && e.estado === 403) return 'Tu cuenta no tiene acceso a este resumen.';
  if (e instanceof ErrorApi) return e.estado >= 500 ? 'El servidor tuvo un problema.' : e.message;
  return 'No pudimos conectar con el servidor.';
}

export default function PaginaEjecutivo() {
  const [ventana, setVentana] = useState<VentanaResumen>('todo');
  const [pestana, setPestana] = useState<PestanaEjecutiva>('todas');
  const [ahora, setAhora] = useState(() => Date.now());

  const consulta = useQuery({
    queryKey: ['ejecutivo', 'resumen', ventana],
    queryFn: ({ signal }) => obtenerResumenEjecutivo(ventana, signal),
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    // Al cambiar de período se sigue viendo el anterior hasta que llega el nuevo: sin parpadeo.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), TIC_MS);
    return () => window.clearInterval(t);
  }, []);
  // Cada respuesta nueva reinicia el «hace N s» sin esperar al próximo tic.
  useEffect(() => {
    if (consulta.dataUpdatedAt) setAhora(Date.now());
  }, [consulta.dataUpdatedAt]);

  return (
    <PanelEjecutivo
      resumen={consulta.data}
      cargando={consulta.isPending}
      error={consulta.isError ? mensajeDeError(consulta.error) : null}
      onReintentar={() => void consulta.refetch()}
      pestana={pestana}
      onCambiarPestana={setPestana}
      ventana={ventana}
      onCambiarVentana={setVentana}
      textoActualizado={
        consulta.dataUpdatedAt ? textoActualizado(ahora - consulta.dataUpdatedAt) : ''
      }
      actualizando={consulta.isFetching}
      mapa={(relleno, ariaLabel) => (
        <MapaDistritos
          colores={relleno.colores}
          descripciones={relleno.descripciones}
          ariaLabel={ariaLabel}
        />
      )}
    />
  );
}
