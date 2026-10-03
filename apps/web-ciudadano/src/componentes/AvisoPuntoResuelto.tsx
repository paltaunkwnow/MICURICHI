'use client';

import { useQuery } from '@tanstack/react-query';
import type { MiReporteFeature } from 'contracts';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { obtenerMisReportes } from '@/lib/api';
import { etiquetaDistrito, etiquetaUnidadVecinal } from '@/lib/formato';
import { claveMisReportes } from '@/lib/misReportes';
import { useSesion } from '@/lib/sesion';

function obtenerStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function claveStorageResueltos(usuarioId: string): string {
  return `curichi.resueltos_vistos.${usuarioId}`;
}

export function obtenerResueltosVistos(usuarioId: string): Set<string> {
  const s = obtenerStorage();
  if (!s) return new Set();
  try {
    const raw = s.getItem(claveStorageResueltos(usuarioId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function marcarResueltoVisto(usuarioId: string, reporteId: string): void {
  const s = obtenerStorage();
  if (!s) return;
  try {
    const vistos = obtenerResueltosVistos(usuarioId);
    vistos.add(reporteId);
    s.setItem(claveStorageResueltos(usuarioId), JSON.stringify(Array.from(vistos)));
  } catch {
    // Modo privado o cuota excedida: ignorar
  }
}

export function marcarTodosResueltosVistos(usuarioId: string, reporteIds: string[]): void {
  const s = obtenerStorage();
  if (!s) return;
  try {
    const vistos = obtenerResueltosVistos(usuarioId);
    for (const id of reporteIds) vistos.add(id);
    s.setItem(claveStorageResueltos(usuarioId), JSON.stringify(Array.from(vistos)));
  } catch {
    // Modo privado o cuota excedida: ignorar
  }
}

export function AvisoPuntoResuelto() {
  const { usuario } = useSesion();
  const usuarioId = usuario?.id ?? null;

  const consulta = useQuery({
    queryKey: claveMisReportes(usuarioId ?? ''),
    queryFn: ({ signal }) => obtenerMisReportes(signal),
    enabled: usuarioId !== null,
    retry: false,
    staleTime: 60_000,
  });

  const [resueltosNuevos, setResueltosNuevos] = useState<MiReporteFeature[]>([]);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    if (!usuarioId || !consulta.data?.features) return;
    const vistos = obtenerResueltosVistos(usuarioId);
    const noVistos = consulta.data.features.filter(
      (f) => f.properties.estado === 'resuelto' && !vistos.has(f.properties.id),
    );
    setResueltosNuevos(noVistos);
  }, [usuarioId, consulta.data]);

  if (!usuarioId || descartado || resueltosNuevos.length === 0) {
    return null;
  }

  const principal = resueltosNuevos[0] as MiReporteFeature;
  const p = principal.properties;
  const lugar =
    p.unidad_vecinal?.nombre ||
    p.distrito?.nombre ||
    etiquetaUnidadVecinal(p.unidad_vecinal?.codigo) ||
    etiquetaDistrito(p.distrito?.codigo) ||
    'tu barrio';

  const cerrarYMarcar = () => {
    marcarTodosResueltosVistos(
      usuarioId,
      resueltosNuevos.map((f) => f.properties.id),
    );
    setDescartado(true);
  };

  const verReporteYMarcar = () => {
    marcarResueltoVisto(usuarioId, p.id);
    setDescartado(true);
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="aviso-punto-resuelto"
      className="fixed top-4 right-4 left-4 z-50 mx-auto max-w-md rounded-2xl border border-verde-600/30 bg-white p-4 shadow-2xl transition-all sm:left-auto sm:right-6 sm:top-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-verde-100 text-verde-800">
          <CheckCircle2 size={24} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-block rounded-full bg-verde-100 px-2 py-0.5 text-xs font-semibold text-verde-900">
              Punto resuelto
            </span>
            <button
              type="button"
              onClick={cerrarYMarcar}
              aria-label="Cerrar notificación"
              className="rounded-lg p-1 text-tinta-500 hover:bg-tinta-100"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <h2 className="mt-1 text-base font-bold text-tinta-900">
            ¡Tu punto reportado ha sido resuelto!
          </h2>
          <p className="mt-1 text-sm text-tinta-600">
            {resueltosNuevos.length > 1
              ? `El municipio ha marcado ${resueltosNuevos.length} puntos que reportaste como resueltos.`
              : `El reporte en ${lugar} fue marcado como resuelto por el municipio.`}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href={`/mis-reportes/${p.id}`}
              onClick={verReporteYMarcar}
              className="btn btn-primario btn-sm inline-flex items-center gap-1.5 no-underline"
            >
              <span>Ver seguimiento</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
            <button type="button" onClick={cerrarYMarcar} className="btn btn-fantasma btn-sm">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
