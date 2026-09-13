'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import type { ReporteFeature } from '@/lib/api';
import {
  etiquetaAfectacion,
  etiquetaCausa,
  etiquetaDuracion,
  etiquetaFrecuencia,
  etiquetaTirante,
  fechaCorta,
  subtituloReporte,
  tituloReporte,
  urlFotoRelativa,
} from '@/lib/formato';
import { ChipEstado, ChipSeveridad } from './ChipSeveridad';

interface Props {
  reporte: ReporteFeature;
  distanciaM?: number | null;
  onCerrar?: () => void;
  onVerPunto?: (puntoCriticoId: string) => void;
  /** En la página de detalle no hace falta el enlace "Ver detalle". */
  conEnlace?: boolean;
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-filete py-3 last:border-0">
      <dt className="text-tinta-600">{etiqueta}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}

/** Panel de detalle de un reporte: sube como hoja en móvil y se muestra en columna en escritorio. */
export function HojaDetalle({
  reporte,
  distanciaM,
  onCerrar,
  onVerPunto,
  conEnlace = true,
}: Props) {
  const p = reporte.properties;
  return (
    <section
      data-testid="hoja-detalle"
      aria-label={`Detalle del reporte en ${tituloReporte(p)}`}
      className="space-y-4 p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChipSeveridad severidad={p.severidad} grande />
        <ChipEstado estado={p.estado} />
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el detalle"
            className="btn-circular btn ml-auto"
          >
            <X aria-hidden="true" size={20} />
          </button>
        ) : null}
      </div>

      <div>
        <h2 className="titular text-2xl">{tituloReporte(p)}</h2>
        <p className="text-[13.5px] text-tinta-600">
          <span data-testid="detalle-uv">
            {p.unidad_vecinal ? `UV ${p.unidad_vecinal.codigo}` : 'Sin unidad vecinal'}
          </span>
          {' · '}
          <span data-testid="detalle-distrito">
            {p.distrito ? `Distrito ${p.distrito.codigo}` : 'Sin distrito'}
          </span>
          {distanciaM != null ? ` · ${subtituloReporte(p, distanciaM).split(' · ').pop()}` : ''}
        </p>
      </div>

      <p className="text-[18px] leading-7">{p.descripcion}</p>

      {p.fotos.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {p.fotos.map((f) => (
            // biome-ignore lint/performance/noImgElement: foto servida por api-core
            <img
              key={f}
              src={urlFotoRelativa(f)}
              alt={`Foto del vecino en ${tituloReporte(p)}`}
              className="h-32 rounded-2xl object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      <dl className="text-[16px]">
        <Fila etiqueta="Tirante" valor={etiquetaTirante(p.tirante_estimado)} />
        <Fila etiqueta="Duración" valor={etiquetaDuracion(p.duracion_estimada)} />
        <Fila etiqueta="Frecuencia" valor={etiquetaFrecuencia(p.frecuencia)} />
        <Fila etiqueta="Afectación" valor={etiquetaAfectacion(p.afectacion)} />
        <Fila etiqueta="Causa presunta" valor={etiquetaCausa(p.causa_presunta)} />
        <Fila etiqueta="Reportado" valor={fechaCorta(p.creado_en)} />
      </dl>

      {p.precision_degradada ? (
        <p className="ayuda rounded-2xl bg-agua-100 p-3">
          Ubicación aproximada: el punto está sobre una vivienda o predio, así que en el mapa
          público se muestra desplazado para cuidar la privacidad del vecino.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {p.punto_critico_id && p.n_reportes_punto && p.n_reportes_punto > 1 && onVerPunto ? (
          <button
            type="button"
            className="btn-secundario btn"
            onClick={() => onVerPunto(p.punto_critico_id as string)}
          >
            Ver los {p.n_reportes_punto} reportes de este punto
          </button>
        ) : null}
        {conEnlace ? (
          <Link href={`/reporte/${p.id}`} className="btn-tinta btn no-underline">
            Ver detalle
          </Link>
        ) : null}
      </div>
    </section>
  );
}
