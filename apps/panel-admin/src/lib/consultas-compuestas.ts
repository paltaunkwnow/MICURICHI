import { queryOptions } from '@tanstack/react-query';
import type { AgregadoUv } from 'contracts';
import { obtenerAgregadosUv, obtenerReportesPublicos, type ParametrosConsulta } from './api';
import { pestanaVisible } from './movimiento-mapa';
import { esSondeo, opcionesSondeo } from './sondeo';

export type ConteoUv = Pick<
  AgregadoUv,
  | 'unidad_vecinal_id'
  | 'codigo'
  | 'nombre'
  | 'distrito_id'
  | 'n_reportes'
  | 'n_verificados'
  | 'n_puntos_criticos'
>;

function participantes(categorias: readonly string[]) {
  return [...new Set(categorias.filter((categoria) => categoria !== '' && categoria !== 'todas'))];
}

export function consultaMapaEjecutivo(
  categorias: readonly string[],
  params: ParametrosConsulta = {},
) {
  const slugs = participantes(categorias);
  return queryOptions({
    queryKey: ['ejecutivo', 'mapa-publico', slugs, params],
    queryFn: async (ctx) => {
      const { signal } = ctx;
      const resultados = await Promise.allSettled(
        slugs.map((categoria) =>
          obtenerReportesPublicos({ ...params, categoria, limite: '300' }, signal, {
            sondeo: esSondeo(ctx),
          }),
        ),
      );
      signal.throwIfAborted();
      const faltantes = slugs.filter((_, i) => resultados[i]?.status !== 'fulfilled');
      const cumplidos = resultados.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const completa = slugs.length > 0 && faltantes.length === 0;
      return {
        completa,
        faltantes,
        features: cumplidos.flatMap((r) => r.features),
        total: completa ? cumplidos.reduce((suma, r) => suma + r.total, 0) : null,
      };
    },
    ...opcionesSondeo(),
    enabled: () => slugs.length > 0 && pestanaVisible(),
  });
}

export function consultaAgregadosCompuestos(categorias: readonly string[]) {
  const slugs = participantes(categorias);
  return queryOptions({
    queryKey: ['geo', 'agregados-compuestos', slugs],
    queryFn: async ({ signal }) => {
      const resultados = await Promise.allSettled(
        slugs.map((categoria) => obtenerAgregadosUv(signal, categoria)),
      );
      signal.throwIfAborted();
      const faltantes = slugs.filter((_, i) => resultados[i]?.status !== 'fulfilled');
      const completa = slugs.length > 0 && faltantes.length === 0;
      const porUv = new Map<string, ConteoUv>();
      if (completa)
        for (const resultado of resultados) {
          if (resultado.status !== 'fulfilled') continue;
          for (const fila of resultado.value) {
            const anterior = porUv.get(fila.unidad_vecinal_id);
            if (
              anterior &&
              (anterior.distrito_id !== fila.distrito_id ||
                anterior.codigo !== fila.codigo ||
                anterior.nombre !== fila.nombre)
            )
              return { completa: false, faltantes: slugs, agregados: [] as ConteoUv[] };
            porUv.set(fila.unidad_vecinal_id, {
              unidad_vecinal_id: fila.unidad_vecinal_id,
              codigo: fila.codigo,
              nombre: fila.nombre,
              distrito_id: fila.distrito_id,
              n_reportes: (anterior?.n_reportes ?? 0) + fila.n_reportes,
              n_verificados: (anterior?.n_verificados ?? 0) + fila.n_verificados,
              n_puntos_criticos: (anterior?.n_puntos_criticos ?? 0) + fila.n_puntos_criticos,
            });
          }
        }
      return {
        completa,
        faltantes,
        agregados: [...porUv.values()].sort(
          (a, b) =>
            b.n_reportes - a.n_reportes || a.unidad_vecinal_id.localeCompare(b.unidad_vecinal_id),
        ),
      };
    },
    enabled: () => slugs.length > 0 && pestanaVisible(),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
