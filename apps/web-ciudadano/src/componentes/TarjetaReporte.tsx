'use client';

import type { ReporteFeature } from '@/lib/api';
import {
  etiquetaFrecuencia,
  etiquetaTirante,
  subtituloReporte,
  tituloReporte,
  urlFotoRelativa,
} from '@/lib/formato';
import { ChipSeveridad } from './ChipSeveridad';

interface Props {
  reporte: ReporteFeature;
  distanciaM?: number | null;
  seleccionado?: boolean;
  onSeleccionar?: (id: string) => void;
}

/** Tarjeta de la lista lateral: foto, severidad, calle, UV/distrito y datos del agua. */
export function TarjetaReporte({ reporte, distanciaM, seleccionado, onSeleccionar }: Props) {
  const p = reporte.properties;
  const foto = p.fotos[0];
  return (
    <button
      type="button"
      data-testid="tarjeta-reporte"
      data-id={p.id}
      aria-pressed={seleccionado}
      onClick={() => onSeleccionar?.(p.id)}
      className={`tarjeta w-full overflow-hidden text-left transition ${
        seleccionado ? 'ring-2 ring-verde-500' : 'hover:shadow-lg'
      }`}
    >
      <div className="relative flex h-28 items-center justify-center bg-tinta-100">
        {foto ? (
          // biome-ignore lint/performance/noImgElement: foto servida por api-core, ya redimensionada
          <img
            src={urlFotoRelativa(foto)}
            alt={`Foto del vecino en ${tituloReporte(p)}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className="text-[13.5px] font-semibold tracking-wide text-tinta-300 uppercase"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(62,84,104,.08) 6px, rgba(62,84,104,.08) 12px)',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Foto del vecino
          </span>
        )}
        <span className="absolute top-2 left-2">
          <ChipSeveridad severidad={p.severidad} />
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="titular text-xl leading-tight">{tituloReporte(p)}</h3>
        <p className="text-[13.5px] text-tinta-600">{subtituloReporte(p, distanciaM)}</p>
        <div className="flex flex-wrap gap-2">
          <span className="chip-suave chip">
            {etiquetaTirante(p.tirante_estimado).split(' · ')[0]}
          </span>
          <span className="chip-suave chip">{etiquetaFrecuencia(p.frecuencia)}</span>
          {p.n_reportes_punto && p.n_reportes_punto > 1 ? (
            <span className="chip-suave chip">{p.n_reportes_punto} reportes</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
