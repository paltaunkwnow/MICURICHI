'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { ErrorApi } from '@/lib/api';
import { consultaResumenEjecutivo } from '@/lib/consultas';
import type { PestanaEjecutiva } from '@/lib/ejecutivo';

function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi && e.estado === 403) return 'Tu cuenta no tiene acceso a este resumen.';
  if (e instanceof ErrorApi) return e.estado >= 500 ? 'El servidor tuvo un problema.' : e.message;
  return 'No pudimos conectar con el servidor.';
}

export default function PaginaEjecutivo() {
  const [pestana, setPestana] = useState<PestanaEjecutiva>('todas');
  // Se refresca sola cada 10 s, marcada como sondeo: una pantalla abierta en la oficina no
  // mantiene viva la sesión (`lib/consultas.ts`).
  const consulta = useQuery(consultaResumenEjecutivo());

  return (
    <PanelEjecutivo
      resumen={consulta.data}
      cargando={consulta.isPending}
      error={consulta.isError ? mensajeDeError(consulta.error) : null}
      onReintentar={() => void consulta.refetch()}
      pestana={pestana}
      onCambiarPestana={setPestana}
    />
  );
}
