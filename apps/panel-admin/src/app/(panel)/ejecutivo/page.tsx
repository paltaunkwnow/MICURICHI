'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { VentanaResumen } from 'contracts';
import { useEffect, useState } from 'react';
import { MapaDistritos } from '@/componentes/ejecutivo/MapaDistritos';
import { PanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { ErrorApi, obtenerResumenEjecutivo } from '@/lib/api';
import { crearOrigenConsultas, type PestanaEjecutiva } from '@/lib/ejecutivo';

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
  // Solo lo que pide la persona renueva la inactividad de la sesión; el refresco de cada 60 s y
  // el de volver a la pestaña del navegador salen marcados como sondeo.
  const [origen] = useState(crearOrigenConsultas);

  const consulta = useQuery({
    queryKey: ['ejecutivo', 'resumen', ventana],
    queryFn: ({ signal }) =>
      obtenerResumenEjecutivo(ventana, signal, { sondeo: origen.esSondeo() }),
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
    // Al cambiar de período se sigue viendo el anterior hasta que llega el nuevo, sin parpadeo,
    // pero atenuado y rotulado «Cargando el período…» (`cargandoPeriodo`).
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
      cargandoPeriodo={consulta.isPlaceholderData}
      error={consulta.isError ? mensajeDeError(consulta.error) : null}
      onReintentar={() => {
        origen.marcarAccion();
        void consulta.refetch();
      }}
      pestana={pestana}
      onCambiarPestana={setPestana}
      ventana={ventana}
      onCambiarVentana={(v) => {
        origen.marcarAccion();
        setVentana(v);
      }}
      ahora={ahora}
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
