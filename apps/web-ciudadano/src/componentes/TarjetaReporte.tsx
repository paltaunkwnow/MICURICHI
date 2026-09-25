'use client';

import { Image as IconoImagen } from 'lucide-react';
import type { ReporteFeature } from '@/lib/api';
import { etiquetaTirante, subtituloReporte, tituloReporte, urlFotoRelativa } from '@/lib/formato';
import { ChipSeveridad } from './ChipSeveridad';

interface Props {
  reporte: ReporteFeature;
  distanciaM?: number | null;
  seleccionado?: boolean;
  onSeleccionar?: (id: string) => void;
}

/**
 * Tarjeta de la lista lateral (`.res` del prototipo): miniatura a la izquierda, severidad,
 * calle, unidad vecinal y dos datos del agua. El vecino reconoce su calle antes que un punto,
 * así que la lista manda sobre el mapa en escritorio.
 */
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
      className="res"
    >
      <span className="ph">
        {foto ? (
          // biome-ignore lint/performance/noImgElement: foto servida por api-core, ya redimensionada
          <img
            src={urlFotoRelativa(foto)}
            alt={`Foto del vecino en ${tituloReporte(p)}`}
            loading="lazy"
          />
        ) : (
          <span className="placeholder-foto">
            <IconoImagen size={20} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <ChipSeveridad severidad={p.severidad} />
        <h3 className="titular mt-[7px] text-[15.5px]">{tituloReporte(p)}</h3>
        <span className="mt-1 block text-[13.5px] text-tinta-600">
          {subtituloReporte(p, distanciaM)}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <span className="mini">{etiquetaTirante(p.tirante_estimado).split(' · ')[0]}</span>
          <span className="mini">
            {p.n_reportes_punto && p.n_reportes_punto > 1
              ? `${p.n_reportes_punto} reportes`
              : '1 reporte'}
          </span>
        </span>
      </span>
    </button>
  );
}
