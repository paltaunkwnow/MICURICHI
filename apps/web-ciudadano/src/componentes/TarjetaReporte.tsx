'use client';

import { Image as IconoImagen } from 'lucide-react';
import type { ReporteFeature } from '@/lib/api';
import { categoriaDeReporte } from '@/lib/categoria';
import { useCategoriasOpcional } from '@/lib/categorias-contexto';
import { subtituloReporte, tituloReporte, urlFotoRelativa } from '@/lib/formato';
import { ChipEstado, ChipSeveridad } from './ChipSeveridad';
import { presentadorDe } from './categorias/registro';

interface Props {
  reporte: ReporteFeature;
  distanciaM?: number | null;
  seleccionado?: boolean;
  onSeleccionar?: (id: string) => void;
}

/**
 * Tarjeta de la lista lateral (`.res` del prototipo): miniatura a la izquierda, severidad,
 * unidad vecinal y dos datos del punto. El vecino reconoce su barrio antes que un punto, así que
 * la lista manda sobre el mapa en escritorio. El primer dato es de la categoría del reporte: lo dibuja
 * su presentador (`categorias/`), no esta tarjeta.
 */
export function TarjetaReporte({ reporte, distanciaM, seleccionado, onSeleccionar }: Props) {
  const p = reporte.properties;
  const foto = p.fotos[0];
  const { definicionDe } = useCategoriasOpcional();
  const slug = categoriaDeReporte(p);
  const { PastillaTarjeta } = presentadorDe(slug);
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
        {/* Severidad y verificación juntas: un punto grave sin revisar no se lee como uno
            confirmado (contracts 0.11.0). */}
        <span className="flex flex-wrap items-center gap-1.5">
          <ChipSeveridad severidad={p.severidad} />
          <ChipEstado estado={p.estado} />
        </span>
        <h3 className="titular mt-[7px] text-[15.5px]">{tituloReporte(p)}</h3>
        <span className="mt-1 block text-[13.5px] text-tinta-600">
          {subtituloReporte(p, distanciaM)}
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <PastillaTarjeta reporte={reporte} definicion={definicionDe(slug)} />
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
