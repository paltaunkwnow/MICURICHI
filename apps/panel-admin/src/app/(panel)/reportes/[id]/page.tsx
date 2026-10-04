'use client';

import { useQuery } from '@tanstack/react-query';
import { ETIQUETAS } from 'contracts';
import { ArrowLeft, Check, Copy, FileText, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useRef, useState } from 'react';
import { Aviso } from '@/componentes/Aviso';
import { ChipEstado, ChipSeveridad } from '@/componentes/ChipSeveridad';
import { Dato } from '@/componentes/Dato';
import { DatosUbicacion } from '@/componentes/DatosUbicacion';
import { FactoresSeveridad } from '@/componentes/FactoresSeveridad';
import { Mapa } from '@/componentes/Mapa';
import { PanelAcciones } from '@/componentes/PanelAcciones';
import { ReporteUnitarioModal } from '@/componentes/ReporteUnitarioModal';
import { VisibilidadPublica } from '@/componentes/VisibilidadPublica';
import { ErrorApi } from '@/lib/api';
import { useFormato } from '@/lib/ciudad-contexto';
import { consultaCapasMapa, consultaReporte } from '@/lib/consultas';
import {
  avisosResolucion,
  etiquetaCausa,
  etiquetaFrecuencia,
  etiquetaProfundidad,
  etiquetaSeveridad,
  etiquetaSiNo,
  etiquetaSumideroCercano,
  etiquetaSumideroEstado,
  idCorto,
} from '@/lib/formato';
import { useUsuarioActual } from '@/lib/sesion';

function BotonCopiar({ texto, etiqueta = 'Copiar' }: { texto: string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Ignorar si el navegador bloquea portapapeles
    }
  };
  return (
    <button
      type="button"
      onClick={copiar}
      className="btn btn-sm btn-secundario inline-flex items-center gap-1 text-xs py-0.5 px-2 font-normal"
      title={`Copiar ${texto}`}
    >
      {copiado ? <Check size={14} className="text-verde-600" /> : <Copy size={14} />}
      <span>{copiado ? '¡Copiado!' : etiqueta}</span>
    </button>
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
  const { fechaHora, numero } = useFormato();
  const [mostrarUnitario, setMostrarUnitario] = useState(false);
  // El botón que abre la ficha: al cerrarla, el foco vuelve a él (accesibilidad del diálogo).
  const botonUnitario = useRef<HTMLButtonElement>(null);
  // Se refresca solo cada 10 s: si otro técnico lo modera, el estado se ve sin recargar.
  const reporte = useQuery(consultaReporte(id));
  const capas = useQuery(consultaCapasMapa());

  if (reporte.isPending) {
    return (
      <p className="text-tinta-600" role="status">
        Cargando el reporte…
      </p>
    );
  }
  // Un refresco que falla no tapa el reporte ni el formulario de moderación a medio escribir:
  // la pantalla de error es solo para cuando no hay nada que mostrar.
  if (!reporte.data) {
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

      <Aviso tipo="alerta" testId="detalle-sin-actualizar">
        {reporte.error
          ? `No se pudo actualizar el reporte (${reporte.error.message}). Se muestran los últimos datos recibidos.`
          : null}
      </Aviso>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl flex items-center gap-2">
          Reporte <span className="font-mono text-2xl">{idCorto(p.id)}</span>
          <BotonCopiar texto={p.id} etiqueta="Copiar ID" />
        </h1>
        <ChipSeveridad severidad={p.severidad} grande />
        <ChipEstado estado={p.estado} grande data-testid="estado-actual" />
        <p className="text-tinta-600">Creado el {fechaHora(p.creado_en)}</p>

        <button
          ref={botonUnitario}
          type="button"
          onClick={() => setMostrarUnitario(true)}
          className="btn btn-primario ml-auto flex items-center gap-2"
          data-testid="btn-abrir-reporte-unitario"
          title="Generar e imprimir o descargar ficha técnica unitaria"
        >
          <FileText size={18} aria-hidden="true" />
          <span>Reporte unitario</span>
        </button>
      </header>

      <VisibilidadPublica estado={p.estado} />

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
            <DatosUbicacion reporte={f} />
          </Bloque>

          <Bloque titulo="Evento reportado">
            <dl className="lista-datos">
              <Dato etiqueta="Fecha del evento">{fechaHora(p.evento_en)}</Dato>
              <Dato etiqueta={ETIQUETAS.campos.profundidad_estimada}>
                {etiquetaProfundidad(p.profundidad_estimada)}
              </Dato>
              <Dato etiqueta="Frecuencia">{etiquetaFrecuencia(p.frecuencia)}</Dato>
              <Dato etiqueta="Causa presunta">{etiquetaCausa(p.causa_presunta)}</Dato>
              <Dato etiqueta={ETIQUETAS.campos.sumidero_cercano}>
                {p.sumidero_cercano ? etiquetaSumideroCercano(p.sumidero_cercano) : 'Sin dato'}
              </Dato>
              <Dato etiqueta={ETIQUETAS.campos.sumidero_estado}>
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
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{p.id}</span>
                  <BotonCopiar texto={p.id} etiqueta="Copiar UUID" />
                </div>
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

      {mostrarUnitario && (
        <ReporteUnitarioModal
          reporte={f}
          onCerrar={() => setMostrarUnitario(false)}
          retorno={botonUnitario}
        />
      )}
    </div>
  );
}
