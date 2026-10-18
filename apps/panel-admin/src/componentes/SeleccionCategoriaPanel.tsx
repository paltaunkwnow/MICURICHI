'use client';
import { useQueries } from '@tanstack/react-query';
import type { useCategoriaPanel } from '@/lib/categoria-panel';
import { consultaIndicadores, consultaResumenEjecutivo } from '@/lib/consultas';
import { type ConteoCategoria, consultasConteosCategorias } from '@/lib/seleccion-panel';
import { SelectorCategoria } from './SelectorCategoria';
export function SeleccionCategoriaPanel({
  ambito,
  tipo,
  onCambiar,
}: {
  ambito: ReturnType<typeof useCategoriaPanel>;
  tipo: 'reportes' | 'indicadores' | 'ejecutivo';
  onCambiar?: (categoria: string) => void;
}) {
  const slugs = ambito.disponibles.map((d) => d.slug);
  const categorias = slugs.length > 1 ? ['todas', ...slugs] : [];
  const listas = useQueries({
    queries: tipo === 'reportes' ? consultasConteosCategorias(tipo, slugs) : [],
  });
  const indicadores = useQueries({
    queries:
      tipo === 'indicadores' ? categorias.map((c) => consultaIndicadores({ categoria: c })) : [],
  });
  const ejecutivos = useQueries({
    queries: tipo === 'ejecutivo' ? categorias.map((c) => consultaResumenEjecutivo(c)) : [],
  });
  const conteos: Record<string, ConteoCategoria | undefined> = {};
  categorias.forEach((c, i) => {
    const lista = listas[i];
    const indicador = indicadores[i];
    const ejecutivo = ejecutivos[i];
    conteos[c] =
      tipo === 'reportes'
        ? lista?.data && !lista.error
          ? { valor: lista.data.total, exacto: lista.data.total_exacto !== false }
          : undefined
        : tipo === 'indicadores'
          ? indicador?.data && !indicador.error
            ? { valor: indicador.data.total, exacto: true }
            : undefined
          : ejecutivo?.data && !ejecutivo.error
            ? { valor: ejecutivo.data.activas.total, exacto: true }
            : undefined;
  });
  return (
    <SelectorCategoria
      disponibles={ambito.disponibles}
      categoria={ambito.categoria}
      conteos={conteos}
      onCambiar={onCambiar ?? ambito.cambiar}
      universo={
        tipo === 'reportes'
          ? 'Publicados, todos los estados, sin filtros de trabajo. «Todas» incluye el historial de categorías inactivas.'
          : tipo === 'indicadores'
            ? 'Reportes vigentes por categoría, sin filtros de severidad ni distrito.'
            : 'Reportes activos por categoría, en todo el historial. «Todas» incluye categorías inactivas.'
      }
    />
  );
}
