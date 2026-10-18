'use client';

import { useQuery } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { PanelEjecutivo } from '@/componentes/ejecutivo/PanelEjecutivo';
import { SeleccionCategoriaPanel } from '@/componentes/SeleccionCategoriaPanel';
import { ErrorApi } from '@/lib/api';
import { useCategoriaPanel } from '@/lib/categoria-panel';
import {
  consultaAgregadosCompuestos,
  consultaAgregadosUv,
  consultaCapasMapa,
  consultaMapaEjecutivo,
  consultaResumenEjecutivo,
} from '@/lib/consultas';
import type { PestanaEjecutiva } from '@/lib/ejecutivo';
import { nombreCategoria } from '@/lib/seleccion-panel';

function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi && e.estado === 403) return 'Tu cuenta no tiene acceso a este resumen.';
  if (e instanceof ErrorApi) return e.estado >= 500 ? 'El servidor tuvo un problema.' : e.message;
  return 'No pudimos conectar con el servidor.';
}

export default function PaginaEjecutivo() {
  return (
    <Suspense fallback={<p role="status">Cargando el resumen…</p>}>
      <ContenidoEjecutivo />
    </Suspense>
  );
}

function ContenidoEjecutivo() {
  const ambito = useCategoriaPanel();
  const categoria = ambito.categoria;
  const habilitada = categoria !== null;
  const [seleccion, setSeleccion] = useState<{
    categoria: string | null;
    pestana: PestanaEjecutiva;
  }>({ categoria, pestana: 'todas' });
  if (seleccion.categoria !== categoria) setSeleccion({ categoria, pestana: 'todas' });
  const pestana = seleccion.categoria === categoria ? seleccion.pestana : 'todas';
  const slugs = !categoria
    ? []
    : categoria === 'todas'
      ? ambito.disponibles.map((d) => d.slug)
      : [categoria];
  const consulta = useQuery(consultaResumenEjecutivo(categoria ?? undefined, habilitada));
  const capas = useQuery(consultaCapasMapa());
  // Cada participante usa exclusivamente vista pública, con límite 300 y señal de cancelación.
  const reportes = useQuery(consultaMapaEjecutivo(slugs));
  const agregados = useQuery(consultaAgregadosCompuestos(categoria === 'todas' ? slugs : []));
  const agregadoSimple = useQuery(
    consultaAgregadosUv(categoria ?? undefined, habilitada && categoria !== 'todas'),
  );
  const agregadosUv = !habilitada
    ? []
    : categoria === 'todas'
      ? (agregados.data?.agregados ?? [])
      : (agregadoSimple.data ?? []);
  const avisoMapa = !habilitada
    ? null
    : reportes.error
      ? 'No se pudo actualizar el mapa público. Se muestran los últimos puntos disponibles.'
      : !reportes.data
        ? 'Cargando puntos públicos del mapa…'
        : !reportes.data.completa
          ? `Mapa parcial: faltan categorías (${reportes.data.faltantes.join(', ')}).`
          : null;
  const avisoUvs = !habilitada
    ? null
    : categoria === 'todas'
      ? agregados.error || (agregados.data && !agregados.data.completa)
        ? 'UV no disponibles: faltan respuestas o las capas son incompatibles; no se presentan sumas parciales.'
        : !agregados.data
          ? 'Cargando conteos de UV…'
          : null
      : agregadoSimple.error
        ? 'No se pudieron actualizar los conteos de UV.'
        : !agregadoSimple.data
          ? 'Cargando conteos de UV…'
          : null;

  return (
    <div className="space-y-6">
      <SeleccionCategoriaPanel ambito={ambito} tipo="ejecutivo" />
      <Aviso tipo="alerta">{ambito.aviso}</Aviso>
      {categoria === 'todas' && (
        <p className="aviso aviso-info">
          El resumen incluye el historial completo, también categorías inactivas. El mapa y las UV
          solo abarcan categorías disponibles; sus universos pueden diferir.
        </p>
      )}
      {habilitada && (
        <p className="ayuda">
          El mapa muestra hasta 300 puntos públicos por categoría disponible; es una muestra
          limitada y no el inventario completo.
        </p>
      )}
      <PanelEjecutivo
        categoria={categoria ?? ''}
        nombreCategoria={categoria ? nombreCategoria(categoria, ambito.disponibles) : ''}
        registro={ambito.registro}
        resumen={habilitada ? consulta.data : undefined}
        cargando={habilitada && consulta.isPending}
        error={
          !habilitada
            ? 'No hay categorías disponibles para consultar.'
            : consulta.isError
              ? mensajeDeError(consulta.error)
              : null
        }
        onReintentar={() => {
          if (habilitada) void consulta.refetch();
        }}
        puedeReintentar={habilitada}
        pestana={pestana}
        onCambiarPestana={(p) => setSeleccion({ categoria, pestana: p })}
        capas={capas.data ?? []}
        reportes={habilitada ? (reportes.data?.features ?? []) : []}
        agregadosUv={agregadosUv}
        avisoMapa={avisoMapa}
        avisoUvs={avisoUvs}
      />
    </div>
  );
}
