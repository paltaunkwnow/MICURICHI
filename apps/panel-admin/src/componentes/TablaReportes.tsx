'use client';

import Link from 'next/link';
import { ChipEstado, ChipSeveridad } from '@/componentes/ChipSeveridad';
import type { ReporteTecnicoFeature } from '@/lib/api';
import {
  etiquetaDistrito,
  etiquetaFrecuencia,
  etiquetaTirante,
  etiquetaUnidadVecinal,
  fechaCorta,
  numero,
} from '@/lib/formato';

interface Props {
  reportes: ReporteTecnicoFeature[];
  /** Fila resaltada; su pastilla en el mapa se pinta en tinta (M-02 del prototipo). */
  seleccionado?: string | null;
  onSeleccionar?: (id: string | null) => void;
}

/**
 * Bandeja de triaje. La fila entera responde al puntero para sincronizarse con el mapa, pero el
 * enlace de la fecha sigue siendo lo que abre el reporte: así el teclado y los lectores de
 * pantalla tienen un control con nombre y destino, en vez de una fila «clicable» invisible.
 */
export function TablaReportes({ reportes, seleccionado, onSeleccionar }: Props) {
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
            <th scope="col">Tirante</th>
            <th scope="col">Frecuencia</th>
            <th scope="col" className="numero">
              N en el punto
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
                className={seleccionado === p.id ? 'on' : ''}
                onMouseEnter={() => onSeleccionar?.(p.id)}
                onMouseLeave={() => onSeleccionar?.(null)}
                onFocus={() => onSeleccionar?.(p.id)}
              >
                <td>
                  <Link
                    href={`/reportes/${p.id}`}
                    className="font-semibold text-agua-500 underline underline-offset-2"
                    data-testid="abrir-reporte"
                  >
                    {fechaCorta(p.creado_en)}
                    <span className="sr-only"> · abrir reporte</span>
                  </Link>
                </td>
                <td>{etiquetaUnidadVecinal(p.unidad_vecinal?.codigo)}</td>
                <td>{etiquetaDistrito(p.distrito?.codigo)}</td>
                <td>
                  <ChipSeveridad severidad={p.severidad} />
                </td>
                <td>
                  <ChipEstado estado={p.estado} />
                </td>
                <td>{etiquetaTirante(p.tirante_estimado)}</td>
                <td>{etiquetaFrecuencia(p.frecuencia)}</td>
                <td className="numero">
                  {p.n_reportes_punto === null ? '—' : numero(p.n_reportes_punto)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
