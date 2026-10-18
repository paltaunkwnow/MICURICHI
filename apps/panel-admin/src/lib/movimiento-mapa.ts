import { focusManager } from '@tanstack/react-query';
import type { ParametrosConsulta } from './api';
import { type FiltrosReportes, parametrosExportacion, serializarFiltros } from './filtros';

export function pestanaVisible() {
  return typeof document === 'undefined'
    ? focusManager.isFocused()
    : document.visibilityState !== 'hidden';
}

/** Conserva el origen automático incluso entre navegar y el commit posterior de React/Next. */
export function crearControlMovimientoMapa({
  leerFiltros,
  navegar,
  activo,
}: {
  leerFiltros: () => FiltrosReportes;
  navegar: (filtros: FiltrosReportes) => void;
  activo: () => boolean;
}) {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let pendiente: string | null = null;
  let destino: FiltrosReportes | null = null;
  let destruido = false;
  let confirmado: string | null = null;
  let generacionManual = 0;
  const manuales = new Map<string, number>();
  const limpiar = () => {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  };
  function aplicar() {
    limpiar();
    if (destruido || !activo() || !pestanaVisible() || pendiente === null) return;
    const bbox = pendiente;
    pendiente = null;
    if (bbox === leerFiltros().bbox) return;
    destino = { ...leerFiltros(), bbox, pagina: 1 };
    navegar(destino);
  }
  function filtrosEsperados() {
    return pendiente === null ? destino : { ...leerFiltros(), bbox: pendiente };
  }
  function coincide(params: ParametrosConsulta, filtros: FiltrosReportes) {
    const esperados = parametrosExportacion(filtros);
    return (
      ['bbox', 'estado', 'severidad', 'distrito_id', 'unidad_vecinal_id', 'desde', 'hasta'].every(
        (campo) => params[campo] === esperados[campo],
      ) && (params.categoria || 'inundacion') === (esperados.categoria || 'inundacion')
    );
  }
  function cancelar() {
    limpiar();
    pendiente = null;
    destino = null;
    generacionManual++;
    manuales.clear();
  }
  return {
    iniciar() {
      destruido = false;
    },
    confirmar(filtros: FiltrosReportes) {
      const firma = serializarFiltros(filtros).toString();
      if (
        confirmado !== null &&
        confirmado !== firma &&
        (!destino || serializarFiltros(destino).toString() !== firma)
      )
        cancelar();
      confirmado = firma;
    },
    mover(bbox: string) {
      if (destruido || !activo()) return;
      limpiar();
      if (bbox === leerFiltros().bbox) {
        pendiente = null;
        return;
      }
      pendiente = bbox;
      if (pestanaVisible()) temporizador = setTimeout(aplicar, 400);
    },
    cambiarVisibilidad() {
      if (!pestanaVisible()) limpiar();
      else aplicar();
    },
    permiteConsulta(params: ParametrosConsulta) {
      const esperados = filtrosEsperados();
      return pestanaVisible() && (esperados === null || coincide(params, esperados));
    },
    esAutomatica(params: ParametrosConsulta) {
      return destino !== null && coincide(params, destino);
    },
    esPeticionManual(params: ParametrosConsulta) {
      const clave = JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
      if (generacionManual === 0 || manuales.get(clave) === generacionManual) return false;
      manuales.set(clave, generacionManual);
      return true;
    },
    cancelar,
    destruir() {
      limpiar();
      pendiente = null;
      destino = null;
      destruido = true;
    },
  };
}
export type ControlMovimientoMapa = ReturnType<typeof crearControlMovimientoMapa>;
