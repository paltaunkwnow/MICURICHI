'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { ChipEstado, ChipSeveridad } from '@/componentes/ChipSeveridad';
import { FactoresSeveridad } from '@/componentes/FactoresSeveridad';
import { Mapa } from '@/componentes/Mapa';
import { PanelAcciones } from '@/componentes/PanelAcciones';
import { ErrorApi, obtenerCapasMapa, obtenerReporte } from '@/lib/api';
import {
  avisosResolucion,
  coordenadas,
  etiquetaAfectacion,
  etiquetaCausa,
  etiquetaDuracion,
  etiquetaFrecuencia,
  etiquetaMetodo,
  etiquetaSeveridad,
  etiquetaSiNo,
  etiquetaSumideroCercano,
  etiquetaSumideroEstado,
  etiquetaTirante,
  etiquetaUbicacionTipo,
  fechaHora,
  idCorto,
  numero,
  precisionGps,
} from '@/lib/formato';
import { useUsuarioActual } from '@/lib/sesion';

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd>{children ?? '—'}</dd>
    </>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="tarjeta p-5" aria-label={titulo}>
      <h2 className="mb-3 text-xl">{titulo}</h2>
      {children}
    </section>
  );
}

export default function PaginaDetalleReporte() {
  const { id } = useParams<{ id: string }>();
  const usuario = useUsuarioActual();
  const reporte = useQuery({
    queryKey: ['reporte', id],
    queryFn: ({ signal }) => obtenerReporte(id, signal),
  });
  const capas = useQuery({
    queryKey: ['geo', 'capas'],
    queryFn: ({ signal }) => obtenerCapasMapa(signal),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (reporte.isPending) {
    return (
      <p className="text-tinta-600" role="status">
        Cargando el reporte…
      </p>
    );
  }
  if (reporte.error || !reporte.data) {
    const noExiste = reporte.error instanceof ErrorApi && reporte.error.estado === 404;
    return (
      <div className="flex flex-col items-start gap-4">
        <Link href="/reportes" className="btn btn-secundario">
          <ArrowLeft size={18} aria-hidden="true" />
          Volver a la tabla
        </Link>
        <Aviso tipo="error">
          {noExiste
            ? 'El reporte no existe o fue eliminado.'
            : `No se pudo cargar el reporte: ${reporte.error?.message ?? 'error desconocido'}`}
        </Aviso>
      </div>
    );
  }

  const f = reporte.data;
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const avisos = avisosResolucion(p.resolucion_flags);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/reportes"
          className="inline-flex items-center gap-1 font-semibold text-agua-500"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Volver a la tabla
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl">
          Reporte <span className="font-mono text-2xl">{idCorto(p.id)}</span>
        </h1>
        <ChipSeveridad severidad={p.severidad} grande />
        <ChipEstado estado={p.estado} grande data-testid="estado-actual" />
        <p className="text-tinta-600">Creado el {fechaHora(p.creado_en)}</p>
      </header>

      {avisos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Avisos de resolución espacial">
          {avisos.map((a) => (
            <li key={a} className="aviso aviso-alerta inline-flex items-center gap-2">
              <TriangleAlert size={18} aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Bloque titulo="Ubicación">
            <dl className="lista-datos">
              <Dato etiqueta="Distrito">
                {p.distrito ? `${p.distrito.codigo} · ${p.distrito.nombre}` : null}
              </Dato>
              <Dato etiqueta="Unidad vecinal">
                {p.unidad_vecinal
                  ? `${p.unidad_vecinal.codigo} · ${p.unidad_vecinal.nombre}`
                  : null}
              </Dato>
              <Dato etiqueta="Manzana">{p.manzana_id}</Dato>
              <Dato etiqueta="Coordenadas (lat, lon)">
                <span className="font-mono">{coordenadas(lon, lat)}</span>
              </Dato>
              <Dato etiqueta="Método de ubicación">{etiquetaMetodo(p.ubicacion_metodo)}</Dato>
              <Dato etiqueta="Precisión GPS">{precisionGps(p.precision_gps_m)}</Dato>
              <Dato etiqueta="Tipo de lugar">{etiquetaUbicacionTipo(p.ubicacion_tipo)}</Dato>
              <Dato etiqueta="Dirección aproximada">{p.direccion_aprox}</Dato>
              <Dato etiqueta="Versión de capa">{p.version_capa}</Dato>
              {/*
                No se usa `precision_degradada`: ese campo describe la coordenada de ESTA
                respuesta, y la del técnico es siempre la exacta, así que acá valía "No" incluso
                para una vivienda cuyo punto público sí sale desplazado. Lo que el técnico
                necesita saber es qué ve el vecino, y eso lo decide `ubicacion_tipo` (§13).
              */}
              <Dato etiqueta="En el mapa público se ve">
                {p.ubicacion_tipo === 'vivienda_o_predio'
                  ? 'Desplazado hasta 30 m para no señalar la vivienda'
                  : 'En su sitio, redondeado a 5 decimales'}
              </Dato>
            </dl>
          </Bloque>

          <Bloque titulo="Evento reportado">
            <dl className="lista-datos">
              <Dato etiqueta="Fecha del evento">{fechaHora(p.evento_en)}</Dato>
              <Dato etiqueta="Tirante estimado">{etiquetaTirante(p.tirante_estimado)}</Dato>
              <Dato etiqueta="Duración estimada">{etiquetaDuracion(p.duracion_estimada)}</Dato>
              <Dato etiqueta="Frecuencia">{etiquetaFrecuencia(p.frecuencia)}</Dato>
              <Dato etiqueta="Afectación">{etiquetaAfectacion(p.afectacion)}</Dato>
              <Dato etiqueta="Causa presunta">{etiquetaCausa(p.causa_presunta)}</Dato>
              <Dato etiqueta="Sumidero cercano">
                {p.sumidero_cercano ? etiquetaSumideroCercano(p.sumidero_cercano) : 'Sin dato'}
              </Dato>
              <Dato etiqueta="Estado del sumidero">
                {p.sumidero_estado ? etiquetaSumideroEstado(p.sumidero_estado) : 'Sin dato'}
              </Dato>
              <Dato etiqueta="Agua brota del sumidero">{etiquetaSiNo(p.agua_brota_sumidero)}</Dato>
            </dl>
            <h3 className="mt-4 mb-1 text-lg">Descripción</h3>
            <p className="whitespace-pre-line">{p.descripcion}</p>
          </Bloque>

          <Bloque titulo="Fotos">
            {p.fotos.length === 0 ? (
              <p className="text-tinta-600">El reporte no tiene fotos.</p>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2">
                {p.fotos.map((url, i) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* biome-ignore lint/performance/noImgElement: fotos servidas por api-core, ya sin EXIF */}
                      <img
                        src={url}
                        alt={`Foto ${i + 1} del reporte`}
                        loading="lazy"
                        className="w-full rounded-[12px] bg-tinta-100 object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque titulo="Severidad y moderación">
            <dl className="lista-datos">
              <Dato etiqueta="Severidad efectiva">{etiquetaSeveridad(p.severidad)}</Dato>
              <Dato etiqueta="Severidad calculada">
                {etiquetaSeveridad(p.severidad_calculada)} · puntaje {p.severidad_puntaje}
              </Dato>
              <Dato etiqueta="Severidad manual">
                {p.severidad_manual ? etiquetaSeveridad(p.severidad_manual) : 'No aplicada'}
              </Dato>
              <Dato etiqueta="Motivo de reclasificación">{p.severidad_motivo}</Dato>
              <Dato etiqueta="Motivo del estado">{p.estado_motivo}</Dato>
              <Dato etiqueta="Fusionado en">
                {p.fusionado_en_id ? (
                  <Link href={`/reportes/${p.fusionado_en_id}`} className="text-agua-500 underline">
                    {p.fusionado_en_id}
                  </Link>
                ) : null}
              </Dato>
              <Dato etiqueta="Punto crítico">
                {p.punto_critico_id
                  ? `${idCorto(p.punto_critico_id)} · ${
                      p.n_reportes_punto === null ? '—' : numero(p.n_reportes_punto)
                    } reportes en el punto`
                  : 'No pertenece a un punto crítico'}
              </Dato>
              <Dato etiqueta="Validado por">{p.validado_por}</Dato>
              <Dato etiqueta="Validado el">{fechaHora(p.validado_en)}</Dato>
              <Dato etiqueta="Actualizado el">{fechaHora(p.actualizado_en)}</Dato>
              <Dato etiqueta="Autor">{p.autor_id ?? 'Anónimo'}</Dato>
              <Dato etiqueta="Identificador completo">
                <span className="font-mono">{p.id}</span>
              </Dato>
            </dl>
            <FactoresSeveridad reporte={p} />
          </Bloque>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
          <div className="mapa-panel">
            <Mapa
              reportes={[f]}
              capas={capas.data ?? []}
              centro={[lon, lat]}
              zoom={16}
              className="h-72 w-full"
              ariaLabel="Mapa con la ubicación exacta del reporte"
            />
          </div>
          <PanelAcciones reporte={f} rol={usuario.rol} />
        </div>
      </div>
    </div>
  );
}
