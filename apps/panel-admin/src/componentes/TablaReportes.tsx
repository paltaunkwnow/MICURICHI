'use client';

import { ETIQUETAS, type ReporteTecnicoFeature } from 'contracts';
import { LocateOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChipEstado, ChipSeveridad } from '@/componentes/ChipSeveridad';
import { useFormato } from '@/lib/ciudad-contexto';
import {
  etiquetaDistrito,
  etiquetaFrecuencia,
  etiquetaMetodo,
  etiquetaProfundidad,
  etiquetaUnidadVecinal,
} from '@/lib/formato';

interface Props {
  reportes: ReporteTecnicoFeature[];
  /** Fila resaltada; su pastilla en el mapa se pinta en tinta (M-02 del prototipo). */
  seleccionado?: string | null;
  onSeleccionar?: (id: string | null) => void;
}

/**
 * Marca de un reporte de ubicación aproximada (ADR 0007: el punto lo puso la persona a mano y no se
 * comprobó contra el dispositivo). Va junto a la unidad vecinal, la celda de la ubicación. Texto con
 * icono, nunca solo color (CLAUDE.md §14.1).
 *
 * Pegada a «UV 123», «Aproximada» sola se leería como que la unidad vecinal es aproximada: el
 * tooltip trae la etiqueta completa y los lectores de pantalla oyen «Ubicación: Aproximada, sin
 * comprobar con el dispositivo». Ese contexto queda fuera de la pastilla para que su texto sea
 * exactamente «Aproximada», el que fijan las pruebas de extremo a extremo.
 */
function InsigniaUbicacionAproximada() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="sr-only">Ubicación:</span>
      <span
        className="mini"
        data-testid="insignia-ubicacion-aproximada"
        title={etiquetaMetodo('aproximada', null)}
        style={{
          background: 'var(--color-sev-media-fondo)',
          color: 'var(--color-sev-media-texto)',
          fontWeight: 700,
        }}
      >
        <LocateOff size={13} aria-hidden="true" />
        Aproximada
      </span>
      <span className="sr-only">, sin comprobar con el dispositivo</span>
    </span>
  );
}

/**
 * Bandeja de triaje. La fila entera es clicable y navega al detalle del reporte.
 * Además incluye un botón explícito de acción para accesibilidad y claridad.
 */
export function TablaReportes({ reportes, seleccionado, onSeleccionar }: Props) {
  const router = useRouter();
  const { fechaCorta, numero } = useFormato();
  return (
    <div className="overflow-x-auto">
      <table className="tabla">
        <caption className="sr-only">Reportes de inundación filtrados</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Unidad vecinal</th>
            <th scope="col">Distrito</th>
            <th scope="col">Severidad</th>
            <th scope="col">Estado</th>
            <th scope="col">{ETIQUETAS.campos.profundidad}</th>
            <th scope="col">Frecuencia</th>
            <th scope="col" className="numero">
              N en el punto
            </th>
            <th scope="col" className="text-right">
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {reportes.map((f) => {
            const p = f.properties;
            return (
              <tr
                key={p.id}
                data-testid="fila-reporte"
                data-id={p.id}
                className={`${seleccionado === p.id ? 'on' : ''} cursor-pointer hover:bg-agua-50/50 transition-colors`}
                onClick={() => router.push(`/reportes/${p.id}`)}
                onMouseEnter={() => onSeleccionar?.(p.id)}
                onMouseLeave={() => onSeleccionar?.(null)}
                onFocus={() => onSeleccionar?.(p.id)}
              >
                <td>
                  <Link
                    href={`/reportes/${p.id}`}
                    className="font-semibold text-agua-500 underline underline-offset-2"
                    data-testid="abrir-reporte"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fechaCorta(p.creado_en)}
                    <span className="sr-only"> · abrir reporte</span>
                  </Link>
                </td>
                <td>
                  {etiquetaUnidadVecinal(p.unidad_vecinal?.codigo)}
                  {p.ubicacion_metodo === 'aproximada' ? (
                    <>
                      {' '}
                      <InsigniaUbicacionAproximada />
                    </>
                  ) : null}
                </td>
                <td>{etiquetaDistrito(p.distrito?.codigo)}</td>
                <td>
                  <ChipSeveridad severidad={p.severidad} />
                </td>
                <td>
                  <ChipEstado estado={p.estado} />
                </td>
                <td>{etiquetaProfundidad(p.profundidad_estimada)}</td>
                <td>{etiquetaFrecuencia(p.frecuencia)}</td>
                <td className="numero">
                  {p.n_reportes_punto === null ? '—' : numero(p.n_reportes_punto)}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Link
                    href={`/reportes/${p.id}`}
                    className="btn btn-sm btn-secundario inline-flex items-center gap-1 text-xs py-1 px-2.5 font-normal"
                    data-testid="boton-ver-detalle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Ver detalle →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
