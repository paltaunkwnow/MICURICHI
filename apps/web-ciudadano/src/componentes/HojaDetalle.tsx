'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import type { ReporteFeature } from '@/lib/api';
import {
  etiquetaAfectacion,
  etiquetaCausa,
  etiquetaDistrito,
  etiquetaDuracion,
  etiquetaFrecuencia,
  etiquetaTirante,
  etiquetaUnidadVecinal,
  fechaCorta,
  subtituloReporte,
  tituloReporte,
  urlFotoRelativa,
} from '@/lib/formato';
import { Aviso } from './Aviso';
import { ChipEstado, ChipSeveridad } from './ChipSeveridad';

interface Props {
  reporte: ReporteFeature;
  distanciaM?: number | null;
  onCerrar?: () => void;
  onVerPunto?: (puntoCriticoId: string) => void;
  /** En la página de detalle no hace falta el enlace "Ver detalle". */
  conEnlace?: boolean;
  /**
   * El detalle se dibuja dos veces —columna en escritorio, hoja en móvil— y solo una está
   * visible en cada tamaño. El identificador de prueba distingue cuál es cuál para que un test
   * no tenga que adivinar contra la copia oculta.
   */
  testId?: string;
}

/**
 * Detalle de un punto. En móvil sube como hoja sobre el mapa (C-02); en escritorio ocupa la
 * columna izquierda sin tapar el mapa (W-02). Es el mismo componente: lo que cambia es dónde
 * lo coloca la pantalla y lo que hace `.hoja` en cada tamaño.
 */
export function HojaDetalle({
  reporte,
  distanciaM,
  onCerrar,
  onVerPunto,
  conEnlace = true,
  testId = 'hoja-detalle',
}: Props) {
  const p = reporte.properties;
  const [lon, lat] = reporte.geometry.coordinates;
  return (
    <section data-testid={testId} aria-label={`Detalle del reporte en ${tituloReporte(p)}`}>
      <div className="asa" aria-hidden="true" />

      {p.fotos.length ? (
        <div className="foto h-32 md:h-44">
          {/* biome-ignore lint/performance/noImgElement: foto servida por api-core, ya sin EXIF */}
          <img
            src={urlFotoRelativa(p.fotos[0] as string)}
            alt={`Foto del vecino en ${tituloReporte(p)}`}
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ChipSeveridad severidad={p.severidad} grande />
        <ChipEstado estado={p.estado} />
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el detalle"
            className="bico bico-sm ml-auto"
          >
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}
      </div>

      <h2 className="titular mt-2.5 text-xl">{tituloReporte(p)}</h2>
      <p className="mt-1 text-[14.5px] text-tinta-600">
        <span data-testid="detalle-uv">{etiquetaUnidadVecinal(p.unidad_vecinal?.codigo)}</span>
        {' · '}
        <span data-testid="detalle-distrito">{etiquetaDistrito(p.distrito?.codigo)}</span>
        {distanciaM != null ? ` · ${subtituloReporte(p, distanciaM).split(' · ').pop()}` : ''}
      </p>

      <p className="mt-3 text-[16px] leading-[1.55]">{p.descripcion}</p>

      <dl className="kv">
        <div>
          <dt>Tirante</dt>
          <dd>{etiquetaTirante(p.tirante_estimado)}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{etiquetaDuracion(p.duracion_estimada)}</dd>
        </div>
        <div>
          <dt>Frecuencia</dt>
          <dd>{etiquetaFrecuencia(p.frecuencia)}</dd>
        </div>
        <div>
          <dt>Afectación</dt>
          <dd>{etiquetaAfectacion(p.afectacion)}</dd>
        </div>
        <div>
          <dt>Causa presunta</dt>
          <dd>{etiquetaCausa(p.causa_presunta)}</dd>
        </div>
        <div>
          <dt>Reportes</dt>
          <dd>
            {p.n_reportes_punto && p.n_reportes_punto > 1
              ? `${p.n_reportes_punto} vecinos`
              : '1 vecino'}
          </dd>
        </div>
        <div>
          <dt>Reportado</dt>
          <dd>{fechaCorta(p.creado_en)}</dd>
        </div>
      </dl>

      {p.precision_degradada ? (
        <Aviso tono="alerta" className="mt-3">
          Ubicación aproximada: el punto está sobre una vivienda o predio, así que en el mapa
          público se muestra desplazado para cuidar la privacidad del vecino.
        </Aviso>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2.5">
        {/* «Me pasa a mí»: arranca un reporte nuevo ya ubicado acá. Si cae dentro del radio de
            recurrencia, el sistema lo agrupa solo en el mismo punto crítico (CLAUDE.md §9.2). */}
        <Link
          href={`/reportar?lat=${lat}&lon=${lon}`}
          className="btn btn-tinta btn-sm flex-1 no-underline"
        >
          Me pasa a mí
        </Link>
        {conEnlace ? (
          <Link href={`/reporte/${p.id}`} className="btn btn-fantasma btn-sm flex-1 no-underline">
            Ver detalle
          </Link>
        ) : null}
      </div>

      {p.punto_critico_id && p.n_reportes_punto && p.n_reportes_punto > 1 && onVerPunto ? (
        <button
          type="button"
          className="btn btn-fantasma btn-sm btn-bloque mt-2.5"
          onClick={() => onVerPunto(p.punto_critico_id as string)}
        >
          Ver los {p.n_reportes_punto} reportes de este punto
        </button>
      ) : null}

      <Aviso tono="tinta" className="mt-3.5">
        Dato de percepción, no medido: el tirante es estimado y la ubicación tiene el error del GPS.
      </Aviso>
    </section>
  );
}
