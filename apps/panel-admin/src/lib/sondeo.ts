import type { QueryFunctionContext } from '@tanstack/react-query';
import type { ParametrosConsulta } from './api';
import { type ControlMovimientoMapa, pestanaVisible } from './movimiento-mapa';

export function opcionesSondeo(habilitada = true) {
  return {
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    enabled: () => habilitada && pestanaVisible(),
    meta: { sondeo: true, ...(!pestanaVisible() ? { iniciadaOculta: true } : {}) },
  } as const;
}

export function esSondeo(ctx: Pick<QueryFunctionContext, 'client' | 'queryKey' | 'meta'>): boolean {
  if (ctx.meta?.sondeo !== true) return false;
  if (ctx.meta.iniciadaOculta === true) return true;
  const control = ctx.meta.controlMapa as ControlMovimientoMapa | undefined;
  const params = ctx.queryKey[1] as ParametrosConsulta;
  if (control?.esAutomatica(params)) return true;
  if (control?.esPeticionManual(params)) return false;
  const estado = ctx.client.getQueryState(ctx.queryKey);
  return !!estado && (estado.dataUpdatedAt > 0 || estado.errorUpdatedAt > 0);
}
