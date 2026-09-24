'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorApi, obtenerReporte } from '@/lib/api';
import {
  etiquetaDistrito,
  etiquetaSeveridad,
  etiquetaUnidadVecinal,
  fechaCorta,
  urlFotoRelativa,
} from '@/lib/formato';
import { leerMisReportes, type ReporteLocal } from '@/lib/misReportes';
import { Aviso } from './Aviso';
import { ChipEstado, ChipSeveridad } from './ChipSeveridad';
import { ErrorDeCarga } from './ErrorDeCarga';

interface Hito {
  titulo: string;
  detalle: string;
  hecho: boolean;
}

/**
 * Seguimiento de un reporte propio (C-17 del prototipo). La línea de tiempo es la devolución que
 * el municipio le debe al vecino: dice en qué punto del circuito está su reporte sin obligarlo a
 * entender la máquina de estados.
 */
export function SeguimientoReporte({ id }: { id: string }) {
  const [local, setLocal] = useState<ReporteLocal | null | undefined>(undefined);
  useEffect(() => setLocal(leerMisReportes().find((r) => r.id === id) ?? null), [id]);

  const consulta = useQuery({
    queryKey: ['reporte', id],
    queryFn: ({ signal }) => obtenerReporte(id, signal),
    enabled: !!id,
    retry: false,
  });

  const publico = consulta.data ?? null;
  const p = publico?.properties;
  const esFaltante = consulta.error instanceof ErrorApi && consulta.error.estado === 404;
  const cargando = consulta.isPending || local === undefined;
  /**
   * No hay nada que seguir: ni el navegador recuerda ese envío ni la API lo devuelve.
   *
   * Sin esta comprobación, `/mis-reportes/lo-que-sea` dibujaba la línea de tiempo entera —«Mi
   * reporte · En revisión · Lo enviaste ✓»— para un identificador inventado. El seguimiento se
   * apoya en dos fuentes y, cuando ninguna de las dos sabe nada, lo honesto es decirlo.
   */
  const desconocido = !cargando && !p && local === null && esFaltante;

  const titulo = p?.direccion_aprox ?? local?.titulo ?? 'Tu reporte';
  const estado = p?.estado ?? 'nuevo';
  const publicado = estado === 'validado' || estado === 'resuelto';

  const hitos: Hito[] = [
    {
      titulo: 'Lo enviaste',
      detalle: local ? fechaCorta(local.enviado_en) : p ? fechaCorta(p.creado_en) : '—',
      hecho: true,
    },
    {
      titulo: 'Un técnico lo revisó',
      detalle: publicado
        ? `Severidad ${etiquetaSeveridad(p?.severidad ?? 'baja').toLowerCase()} confirmada`
        : 'Pendiente',
      hecho: publicado,
    },
    {
      titulo: 'Se publicó en el mapa',
      detalle: publicado
        ? p?.n_reportes_punto && p.n_reportes_punto > 1
          ? `${p.n_reportes_punto} vecinos se sumaron a este punto`
          : 'Visible para todos'
        : 'Pendiente',
      hecho: publicado,
    },
    {
      titulo: 'El municipio lo resolvió',
      detalle: estado === 'resuelto' ? 'El punto quedó marcado como resuelto' : 'Pendiente',
      hecho: estado === 'resuelto',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-4 pb-10 md:px-6">
      <div className="cab px-0">
        <Link
          href="/mis-reportes"
          className="atras no-underline"
          aria-label="Volver a mis reportes"
        >
          <ChevronLeft size={19} aria-hidden="true" />
        </Link>
        <h1 className="titular text-xl">Mi reporte</h1>
      </div>

      {cargando ? (
        <p className="ayuda mt-4" aria-live="polite">
          Consultando el estado…
        </p>
      ) : desconocido ? (
        <div className="mt-4" data-testid="seguimiento-desconocido">
          <Aviso tono="alerta">
            <b className="mb-1 block text-[15px]">No encontramos ese reporte</b>
            Este dispositivo no recuerda haber enviado un reporte con ese código, y el mapa público
            tampoco lo tiene. Si lo enviaste desde otro teléfono o borraste los datos del navegador,
            la lista se pierde: el código de seguimiento sigue siendo válido, pero hace falta que un
            técnico lo busque.
          </Aviso>
          <Link href="/mis-reportes" className="btn btn-fantasma mt-3.5 no-underline">
            Volver a mis reportes
          </Link>
        </div>
      ) : (
        <>
          {p?.fotos.length ? (
            <div className="foto h-[148px]">
              {/* biome-ignore lint/performance/noImgElement: foto servida por api-core */}
              <img src={urlFotoRelativa(p.fotos[0] as string)} alt={`Foto en ${titulo}`} />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {/* Con la API caída no se sabe el estado, y «En revisión» sería una afirmación
                que nadie ha confirmado. */}
            {consulta.isError && !esFaltante ? (
              <span className="mini">Estado desconocido</span>
            ) : (
              <ChipEstado estado={estado} />
            )}
            {p ? <ChipSeveridad severidad={p.severidad} /> : null}
          </div>

          <h2 className="titular mt-2.5 text-[21px]">{titulo}</h2>
          <p className="mt-1 text-[14.5px] text-tinta-600">
            {etiquetaUnidadVecinal(p?.unidad_vecinal?.codigo ?? local?.unidad_vecinal)}
            {' · '}
            {etiquetaDistrito(p?.distrito?.codigo ?? local?.distrito)}
            {' · código '}
            {id.slice(0, 8).toUpperCase()}
          </p>

          <ol className="mt-4 grid list-none p-0">
            {hitos.map((h, i) => (
              <li key={h.titulo} className="grid grid-cols-[26px_minmax(0,1fr)] gap-3">
                <span className="flex flex-col items-center">
                  <i
                    className="mt-1 block h-[13px] w-[13px] flex-none rounded-full"
                    style={{ background: h.hecho ? 'var(--color-verde-500)' : '#D3DBD6' }}
                  />
                  {i < hitos.length - 1 ? (
                    <span className="block w-0.5 flex-1 bg-[#DCE3DF]" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="block pb-[18px]">
                  <b
                    className={`block text-[15.5px] font-semibold ${h.hecho ? '' : 'text-tinta-300'}`}
                  >
                    {h.titulo}
                  </b>
                  <span className="mt-0.5 block text-[14px] leading-[1.45] text-tinta-600">
                    {h.detalle}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {!publicado && esFaltante ? (
            <Aviso tono="info">
              Tu reporte no aparece todavía en el mapa público. Puede estar esperando revisión o
              haber sido rechazado o unido a otro punto; el mapa solo muestra los validados.
            </Aviso>
          ) : null}
          {!publicado && !esFaltante && consulta.isError ? (
            <ErrorDeCarga
              error={consulta.error}
              que="el estado de tu reporte"
              alReintentar={() => consulta.refetch()}
              reintentando={consulta.isFetching}
              testId="error-seguimiento"
            />
          ) : null}
          {publicado ? (
            <Link href={`/reporte/${id}`} className="btn btn-bloque mt-2 no-underline">
              Verlo en el mapa público
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
